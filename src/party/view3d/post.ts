// Post-processing for the board, in as few full-screen passes as possible:
//   scene → multisampled 8-bit target (full resolution, display-space colours as on the screen,
//           the glow mask in alpha; see shaderfx FX_G[3])
//   1 bright pass + downsample to half resolution (colour × glow mask, 4 bilinear taps)
//   2/3 separable blur at half resolution (9 taps each via 5 linear fetches)
//   4 one composite pass to the screen: scene + bloom, exposure, lift/gain colour grade,
//     saturation and contrast, a soft vignette, an alarm/flash tint and a little dither.
// Level 1 (bloom off) skips passes 1–3. (sRGB targets would be simpler but cost a third more in
// software rendering.)

import * as THREE from 'three';
import { FX_G } from './shaderfx';

export interface PostParams {
  /** Bloom strength (0 = no bloom passes). */
  bloom: number;
  exposure: number;
  contrast: number;
  saturation: number;
  /** Lift (added to the shadows) and gain (multiplies the highlights), linear colours. */
  lift: THREE.Color;
  gain: THREE.Color;
  vignette: number;
  /** Tint over everything (rgb) with strength a (alarm light, lightning). */
  tint: THREE.Vector4;
}

export function newPostParams(): PostParams {
  return { bloom: 0.6, exposure: 1, contrast: 1, saturation: 1, lift: new THREE.Color(0, 0, 0), gain: new THREE.Color(1, 1, 1), vignette: 0.25, tint: new THREE.Vector4(0, 0, 0, 0) };
}

const VERT = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

const BRIGHT = `uniform sampler2D tSrc; uniform vec2 texel; varying vec2 vUv;
void main() {
  vec4 a = texture2D( tSrc, vUv + texel * vec2( -1.0, -1.0 ) );
  vec4 b = texture2D( tSrc, vUv + texel * vec2( 1.0, -1.0 ) );
  vec4 c = texture2D( tSrc, vUv + texel * vec2( -1.0, 1.0 ) );
  vec4 d = texture2D( tSrc, vUv + texel * vec2( 1.0, 1.0 ) );
  gl_FragColor = vec4( ( a.rgb * a.a + b.rgb * b.a + c.rgb * c.a + d.rgb * d.a ) * 0.25, 1.0 );
}`;

const BLUR = `uniform sampler2D tSrc; uniform vec2 dir; varying vec2 vUv;
void main() {
  vec3 s = texture2D( tSrc, vUv ).rgb * 0.227027;
  vec2 o1 = dir * 1.384615, o2 = dir * 3.230769;
  s += ( texture2D( tSrc, vUv + o1 ).rgb + texture2D( tSrc, vUv - o1 ).rgb ) * 0.316216;
  s += ( texture2D( tSrc, vUv + o2 ).rgb + texture2D( tSrc, vUv - o2 ).rgb ) * 0.070270;
  gl_FragColor = vec4( s, 1.0 );
}`;

const COMP = `uniform sampler2D tScene; uniform sampler2D tBloom;
uniform float bloom, exposure, contrast, saturation, vignette, aspect, seed;
uniform vec3 lift, gain; uniform vec4 tint;
varying vec2 vUv;
void main() {
  vec3 c = texture2D( tScene, vUv ).rgb;
  #ifdef BLOOM
  c += texture2D( tBloom, vUv ).rgb * bloom;
  #endif
  c *= exposure;
  c = c * gain + lift * ( 1.0 - clamp( c, 0.0, 1.0 ) );
  c = mix( c, tint.rgb, tint.a );
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  c = mix( vec3( l ), c, saturation );
  c = ( c - 0.5 ) * contrast + 0.5;
  vec2 q = ( vUv - 0.5 ) * vec2( aspect, 1.0 );
  c *= 1.0 - vignette * smoothstep( 0.25, 0.95, length( q ) * 1.1 );
  c += ( fract( sin( dot( gl_FragCoord.xy + seed, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) - 0.5 ) / 255.0;
  gl_FragColor = vec4( clamp( c, 0.0, 1.0 ), 1.0 );
}`;

export class Post {
  private scene: THREE.WebGLRenderTarget;
  private half: THREE.WebGLRenderTarget[];
  private quad: THREE.Mesh;
  private qScene = new THREE.Scene();
  private qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mBright: THREE.ShaderMaterial;
  private mBlur: THREE.ShaderMaterial;
  private mComp: THREE.ShaderMaterial;
  private mCompB: THREE.ShaderMaterial;
  private w = 0;
  private h = 0;
  private size = new THREE.Vector2();
  private clear = new THREE.Color();
  /** Draw calls and triangles of the last scene render (the passes not counted). */
  calls = 0;
  tris = 0;

  constructor(r: THREE.WebGLRenderer) {
    const samples = Math.min(4, r.capabilities.maxSamples || 0);
    const opt = { type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.scene = new THREE.WebGLRenderTarget(1, 1, { ...opt, depthBuffer: true, samples });
    this.half = [new THREE.WebGLRenderTarget(1, 1, opt), new THREE.WebGLRenderTarget(1, 1, opt)];
    const mat = (frag: string, uniforms: Record<string, THREE.IUniform>, defines: Record<string, string> = {}) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, defines, depthTest: false, depthWrite: false });
    this.mBright = mat(BRIGHT, { tSrc: { value: null }, texel: { value: new THREE.Vector2() } });
    this.mBlur = mat(BLUR, { tSrc: { value: null }, dir: { value: new THREE.Vector2() } });
    const cu = () => ({
      tScene: { value: null }, tBloom: { value: null }, bloom: { value: 0 }, exposure: { value: 1 }, contrast: { value: 1 }, saturation: { value: 1 },
      vignette: { value: 0 }, aspect: { value: 1 }, seed: { value: 0 }, lift: { value: new THREE.Color() }, gain: { value: new THREE.Color(1, 1, 1) }, tint: { value: new THREE.Vector4() },
    });
    this.mComp = mat(COMP, cu());
    this.mCompB = mat(COMP, cu(), { BLOOM: '' });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mComp);
    this.quad.frustumCulled = false;
    this.qScene.add(this.quad);
  }

  /** Compiles the pass shaders (no hitch when the board first shows). */
  warm(r: THREE.WebGLRenderer) {
    for (const m of [this.mBright, this.mBlur, this.mComp, this.mCompB]) { this.quad.material = m; r.compile(this.qScene, this.qCam); }
  }

  private fit(r: THREE.WebGLRenderer) {
    r.getDrawingBufferSize(this.size);
    const w = Math.max(1, this.size.x), h = Math.max(1, this.size.y);
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.scene.setSize(w, h);
    for (const t of this.half) t.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
  }

  private pass(r: THREE.WebGLRenderer, m: THREE.ShaderMaterial, to: THREE.WebGLRenderTarget | null) {
    this.quad.material = m;
    r.setRenderTarget(to);
    r.render(this.qScene, this.qCam);
  }

  /** Renders the scene through the post chain to the screen. `bloomOn` false: grade only. */
  render(r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera, p: PostParams, bloomOn: boolean) {
    this.fit(r);
    const prevAlpha = r.getClearAlpha();
    r.getClearColor(this.clear);
    r.setClearAlpha(0);
    r.setRenderTarget(this.scene);
    FX_G[3] = 1;
    r.render(scene, cam);
    FX_G[3] = 0;
    this.calls = r.info.render.calls;
    this.tris = r.info.render.triangles;
    r.setClearColor(this.clear, prevAlpha);
    const auto = r.autoClear;
    r.autoClear = false;
    const bloom = bloomOn && p.bloom > 0.01;
    if (bloom) {
      const [A, B] = this.half;
      this.mBright.uniforms.tSrc.value = this.scene.texture;
      (this.mBright.uniforms.texel.value as THREE.Vector2).set(1 / this.w, 1 / this.h);
      this.pass(r, this.mBright, A);
      const sp = 1.7;
      this.mBlur.uniforms.tSrc.value = A.texture;
      (this.mBlur.uniforms.dir.value as THREE.Vector2).set(sp / A.width, 0);
      this.pass(r, this.mBlur, B);
      this.mBlur.uniforms.tSrc.value = B.texture;
      (this.mBlur.uniforms.dir.value as THREE.Vector2).set(0, sp / A.height);
      this.pass(r, this.mBlur, A);
    }
    const m = bloom ? this.mCompB : this.mComp, u = m.uniforms;
    u.tScene.value = this.scene.texture;
    u.tBloom.value = this.half[0].texture;
    u.bloom.value = p.bloom;
    u.exposure.value = p.exposure;
    u.contrast.value = p.contrast;
    u.saturation.value = p.saturation;
    u.vignette.value = p.vignette;
    u.aspect.value = this.w / this.h;
    u.seed.value = (u.seed.value + 17.13) % 1000;
    // the grade works on display-space colours: lift, gain and tint as they look on screen
    (u.lift.value as THREE.Color).copy(p.lift).convertLinearToSRGB();
    (u.gain.value as THREE.Color).copy(p.gain).convertLinearToSRGB();
    (u.tint.value as THREE.Vector4).copy(p.tint);
    this.pass(r, m, null);
    r.autoClear = auto;
  }

  dispose() {
    this.scene.dispose();
    for (const t of this.half) t.dispose();
  }
}
