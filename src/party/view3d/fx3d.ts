// Look-finish parts for the boards, all cheap and mostly animated on the GPU (no per-frame
// allocations, few draw calls):
// - water: one shader plane with waves, sun/moon glitter, sky reflection, shoreline foam (from
//   a rounded-box distance), reflections of the board's lights at night and rain rings;
// - air: one Points mesh per board for fireflies, dust motes, chimney smoke and confetti;
// - weather: rain streaks (line segments around the camera), snow, puddles on the paths and
//   shooting stars;
// - lamp cones and light pools under lamps (additive, they show in the haze);
// - contact shadows: soft dark blobs under buildings and props (one instanced mesh).

import * as THREE from 'three';
import { TAU } from '../util';
import { ctex } from './kit';
import { keepMask } from './shaderfx';

const fogU = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ===================================================================== water
export interface WaterOpts {
  y: number;
  /** Island as a rounded box: centre, half size, corner radius (shoreline foam and shallows). */
  shore: { c: [number, number]; b: [number, number]; r: number };
  /** Optional cut-out (a canal): water inside it counts as near the shore too. */
  cut?: { c: [number, number]; b: [number, number] };
  /** Lights that mirror in the water at night (world position, colour, sharpness). */
  lights: { p: [number, number, number]; c: string; k?: number }[];
  /** Glow of the trim along the shore at night (reflected neon). */
  rim?: string;
}

const WATER_V = `#include <common>
#include <fog_pars_vertex>
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4( position, 1.0 );
  vW = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const WATER_F = `#include <common>
#include <fog_pars_fragment>
uniform float uT, uGlit, uNight, uRain, uFoam, uRim;
uniform vec3 uDeep, uShal, uZen, uHor, uSun, uSunC, uFoamC, uRimC;
uniform vec4 uShore, uCut;
uniform float uShoreR;
varying vec3 vW;
float sdB( vec2 p, vec2 b, float r ) { vec2 q = abs( p ) - b + r; return length( max( q, 0.0 ) ) + min( max( q.x, q.y ), 0.0 ) - r; }
float h21( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
void main() {
  vec2 p = vW.xz;
  float t = uT;
  // wave slope from two crossing swells (the plane stays flat; only the normal moves)
  vec2 cw = cos( vec2( dot( p, vec2( 0.5, 0.22 ) ) + t * 1.3, dot( p, vec2( -0.5, 0.9 ) ) + t * 1.9 ) ) * vec2( 0.55, 0.42 );
  vec2 g = vec2( 0.9, 0.4 ) * cw.x + vec2( -0.5, 0.85 ) * cw.y;
  if ( uRain > 0.0 ) {
    vec2 cell = floor( p * 0.7 ), f = fract( p * 0.7 ) - 0.5;
    float h = h21( cell ), q = fract( t * 0.9 + h );
    vec2 d = f - ( vec2( h, fract( h * 7.3 ) ) - 0.5 ) * 0.5;
    float r = length( d ), ring = sin( clamp( ( r - q * 0.5 ) * 40.0, -3.1416, 3.1416 ) ) * ( 1.0 - q ) * step( abs( r - q * 0.5 ), 0.08 );
    g += d / max( r, 0.001 ) * ring * uRain * 0.9;
  }
  vec3 n = normalize( vec3( -g.x * 0.16, 1.0, -g.y * 0.16 ) );
  vec3 v = normalize( vW - cameraPosition );
  float d = sdB( p - uShore.xy, uShore.zw, uShoreR );
  if ( uCut.z > 0.0 ) d = max( d, -sdB( p - uCut.xy, uCut.zw, 0.0 ) );
  vec3 col = mix( uShal, uDeep, smoothstep( 0.0, 10.0, d ) );
  vec3 r = reflect( v, n );
  float fr = 1.0 + dot( v, n );
  col = mix( col, mix( uHor, uZen, clamp( r.y * 1.4, 0.0, 1.0 ) ), 0.16 + 0.5 * fr * fr * fr );
  // sun / moon: a soft sheen and sharp sparkles
  float s = dot( r, uSun ), mask = 0.0;
  if ( s > 0.86 ) {
    float sp = smoothstep( 0.986, 0.999, s ) * ( 1.0 + 2.5 * step( 0.55, h21( floor( p * 4.0 ) + floor( t * 3.0 ) ) ) ) + smoothstep( 0.86, 1.0, s ) * 0.18;
    col += uSunC * sp * uGlit;
    mask = min( sp * uGlit * 0.4, 1.0 );
  }
  // near the shore: the neon trim mirrored at night, the foam lip and bands rolling in
  if ( d < 4.5 ) {
    col += uRimC * ( uRim * uNight * 0.22 * exp( -max( d, 0.0 ) * 0.7 ) );
    float lip = 1.0 - smoothstep( 0.1, 0.9, d + sin( p.x * 0.7 + t ) * 0.15 );
    float band = smoothstep( 0.86, 0.99, sin( d * 2.4 - t * 1.4 + sin( p.x * 0.3 + p.y * 0.2 ) * 1.5 ) ) * ( 1.0 - smoothstep( 0.8, 4.0, d ) );
    col = mix( col, uFoamC, clamp( ( lip * 0.85 + band * 0.4 ) * uFoam, 0.0, 1.0 ) );
  }
  gl_FragColor = vec4( col, mask );
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export interface Water { mesh: THREE.Mesh; u: Record<string, THREE.IUniform>; streaks: Streaks | null }

export function makeWater(sc: THREE.Scene, o: WaterOpts): Water {
  const u: Record<string, THREE.IUniform> = {
    ...fogU(),
    uT: { value: 0 }, uGlit: { value: 1 }, uNight: { value: 0 }, uRain: { value: 0 }, uFoam: { value: 1 }, uRim: { value: o.rim ? 1 : 0 },
    uDeep: { value: new THREE.Color('#2aa8e0') }, uShal: { value: new THREE.Color('#5fe0f5') }, uZen: { value: new THREE.Color('#9fd8ff') }, uHor: { value: new THREE.Color('#ffffff') },
    uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunC: { value: new THREE.Color('#ffffff') }, uFoamC: { value: new THREE.Color('#ffffff') }, uRimC: { value: new THREE.Color(o.rim ?? '#000000') },
    uShore: { value: new THREE.Vector4(o.shore.c[0], o.shore.c[1], o.shore.b[0], o.shore.b[1]) }, uShoreR: { value: o.shore.r },
    uCut: { value: o.cut ? new THREE.Vector4(o.cut.c[0], o.cut.c[1], o.cut.b[0], o.cut.b[1]) : new THREE.Vector4() },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: WATER_V, fragmentShader: WATER_F, uniforms: u, fog: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), mat);
  mesh.position.y = o.y;
  // drawn after everything opaque: the depth test then skips the water hidden under the island
  mesh.renderOrder = 10;
  sc.add(mesh);
  return { mesh, u, streaks: makeStreaks(sc, o) };
}

// The board's lights mirrored in the water at night: one streak per light where the camera sees
// its mirror image (placed on the CPU each frame, a handful of instances, one draw call).
const STREAK_V = `uniform float uT;
varying vec2 vUv;
varying vec3 vC;
varying float vS;
void main() {
  vUv = uv;
  vC = instanceColor;
  vS = instanceMatrix[ 3 ].x * 0.37 + instanceMatrix[ 3 ].z * 0.71;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4( position, 1.0 );
}`;
const STREAK_F = `uniform float uT, uA;
varying vec2 vUv;
varying vec3 vC;
varying float vS;
void main() {
  float a = 1.0 - abs( vUv.x * 2.0 - 1.0 ), l = vUv.y;
  float wob = sin( l * 38.0 - uT * 2.6 + vS ) * 0.5 + 0.5;
  float k = a * a * smoothstep( 0.0, 0.25, l ) * smoothstep( 1.0, 0.55, l ) * ( 0.35 + 0.65 * wob * step( 0.25, fract( l * 7.0 + vS ) ) ) * uA;
  gl_FragColor = vec4( vC * k, k * 0.5 );
  #include <colorspace_fragment>
}`;

export interface Streaks { mesh: THREE.InstancedMesh; u: Record<string, THREE.IUniform>; lights: WaterOpts['lights']; y: number; shore: WaterOpts['shore']; cut?: WaterOpts['cut'] }
function makeStreaks(sc: THREE.Scene, o: WaterOpts): Streaks | null {
  if (!o.lights.length) return null;
  const u: Record<string, THREE.IUniform> = { uT: { value: 0 }, uA: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ vertexShader: STREAK_V, fragmentShader: STREAK_F, uniforms: u, transparent: true, depthWrite: false });
  mat.blending = THREE.CustomBlending;
  mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneFactor; mat.blendSrcAlpha = THREE.OneFactor; mat.blendDstAlpha = THREE.OneFactor;
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, o.lights.length);
  const c = new THREE.Color();
  o.lights.forEach((l, i) => mesh.setColorAt(i, c.set(l.c)));
  mesh.frustumCulled = false;
  mesh.renderOrder = 11;
  mesh.visible = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sc.add(mesh);
  return { mesh, u, lights: o.lights, y: o.y + 0.02, shore: o.shore, cut: o.cut };
}
const _sd = new THREE.Object3D();
const sdBox = (x: number, z: number, cx: number, cz: number, bx: number, bz: number, r: number) => {
  const qx = Math.abs(x - cx) - bx + r, qz = Math.abs(z - cz) - bz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
};
/** Moves the streaks under the camera's view of each light (k = brightness 0..1). */
export function placeStreaks(S: Streaks, cam: THREE.Camera, t: number, k: number) {
  S.mesh.visible = k > 0.01;
  if (!S.mesh.visible) return;
  S.u.uT.value = t;
  S.u.uA.value = k;
  const C = cam.position, wy = S.y;
  S.lights.forEach((l, i) => {
    const my = 2 * wy - l.p[1], s = (C.y - wy) / Math.max(0.01, C.y - my);
    const px = C.x + (l.p[0] - C.x) * s, pz = C.z + (l.p[2] - C.z) * s;
    let d = sdBox(px, pz, S.shore.c[0], S.shore.c[1], S.shore.b[0], S.shore.b[1], S.shore.r);
    if (S.cut) d = Math.max(d, -sdBox(px, pz, S.cut.c[0], S.cut.c[1], S.cut.b[0], S.cut.b[1], 0));
    const h = l.p[1] - wy, len = 2.2 + h * 0.9, w = 0.7 + h * 0.06 + 4 / (l.k ?? 40);
    _sd.position.set(px, wy, pz);
    _sd.rotation.set(0, Math.atan2(C.x - px, C.z - pz), 0);
    _sd.scale.set(d > 0.4 ? w : 0, 1, len);
    _sd.updateMatrix();
    S.mesh.setMatrixAt(i, _sd.matrix);
  });
  S.mesh.instanceMatrix.needsUpdate = true;
}

// ===================================================================== air particles
/** An area where particles of one kind live: centre, radius, count, height range. */
export interface AirArea { kind: 'firefly' | 'dust' | 'smoke' | 'confetti'; x: number; z: number; r: number; n: number; y0?: number; y1?: number; size?: number }
const KIND = { firefly: 0, dust: 1, smoke: 2, confetti: 3 } as const;

const AIR_V = `uniform float uT, uScale;
uniform vec4 uAmt;
uniform vec3 uFireC, uDustC, uSmokeC;
attribute vec4 aP;
varying vec4 vC;
varying float vK;
vec3 hue( float h ) { return clamp( abs( mod( h * 6.0 + vec3( 0.0, 4.0, 2.0 ), 6.0 ) - 3.0 ) - 1.0, 0.0, 1.0 ); }
void main() {
  float k = aP.x, s = aP.y, size = aP.z;
  vec3 p = position;
  float a; vec3 col;
  if ( k < 0.5 ) {
    p += vec3( sin( uT * 0.55 + s * 17.0 ) * 1.4, sin( uT * 0.9 + s * 7.0 ) * 0.5, cos( uT * 0.47 + s * 11.0 ) * 1.4 );
    a = uAmt.x * ( 0.25 + 0.75 * pow( 0.5 + 0.5 * sin( uT * 2.1 + s * 40.0 ), 4.0 ) );
    col = uFireC;
  } else if ( k < 1.5 ) {
    float l = fract( uT * 0.025 + s );
    p += vec3( sin( uT * 0.15 + s * 9.0 ) * 2.5, l * 3.5, cos( uT * 0.13 + s * 5.0 ) * 2.5 );
    a = uAmt.y * sin( l * 3.1416 );
    col = uDustC;
  } else if ( k < 2.5 ) {
    float l = fract( uT * 0.08 + s );
    p += vec3( l * l * 3.2 + sin( s * 20.0 ) * 0.25, l * 6.5, l * 1.4 );
    size *= 0.35 + l * 1.9;
    a = uAmt.z * smoothstep( 0.0, 0.12, l ) * ( 1.0 - l ) * 0.6;
    col = uSmokeC;
  } else {
    float l = fract( uT * 0.045 + s );
    p.y += ( 1.0 - l ) * aP.w;
    p.x += sin( uT * 1.7 + s * 30.0 ) * 0.5;
    p.z += cos( uT * 1.3 + s * 20.0 ) * 0.5;
    a = uAmt.w * smoothstep( 0.0, 0.06, l ) * smoothstep( 1.0, 0.85, l );
    col = hue( fract( s * 7.13 ) ) * 0.85 + 0.15;
    size *= 0.45 + 0.55 * abs( sin( uT * 5.0 + s * 50.0 ) );
  }
  vec4 mv = modelViewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mv;
  gl_PointSize = a > 0.004 ? size * uScale / -mv.z : 0.0;
  vC = vec4( col, a );
  vK = k;
}`;
const AIR_F = `varying vec4 vC;
varying float vK;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot( c, c ) * 4.0, m;
  if ( vK < 0.5 ) { m = exp( -r2 * 5.0 ) * 0.6 + exp( -r2 * 40.0 ) * 1.6; gl_FragColor = vec4( vC.rgb * m * vC.a, 0.0 ); }
  else if ( vK < 1.5 ) { m = exp( -r2 * 6.0 ); gl_FragColor = vec4( vC.rgb * m * vC.a, 0.0 ); }
  else if ( vK < 2.5 ) { m = smoothstep( 1.0, 0.15, r2 ) * vC.a; gl_FragColor = vec4( vC.rgb * m, m ); }
  else {
  m = step( max( abs( c.x ), abs( c.y * 1.6 ) ), 0.32 ) * vC.a;
  gl_FragColor = vec4( vC.rgb * m, m );
  }
  #include <colorspace_fragment>
}`;

export interface Air { mesh: THREE.Points; u: Record<string, THREE.IUniform> }

export function makeAir(sc: THREE.Scene, areas: AirArea[]): Air {
  const P: number[] = [], A: number[] = [];
  for (const ar of areas) {
    const y0 = ar.y0 ?? 0.6, y1 = ar.y1 ?? 3;
    for (let i = 0; i < ar.n; i++) {
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * ar.r;
      P.push(ar.x + Math.cos(a) * r, ar.kind === 'smoke' ? y0 : rnd(y0, y1), ar.z + Math.sin(a) * r);
      const def = { firefly: 0.32, dust: 0.12, smoke: 1.5, confetti: 0.22 }[ar.kind];
      A.push(KIND[ar.kind], ar.kind === 'smoke' ? i / ar.n + Math.random() * 0.05 : Math.random(), ar.size ?? def, ar.kind === 'confetti' ? y1 - y0 : 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('aP', new THREE.Float32BufferAttribute(A, 4));
  g.computeBoundingSphere();
  const u: Record<string, THREE.IUniform> = {
    uT: { value: 0 }, uScale: { value: 600 }, uAmt: { value: new THREE.Vector4() },
    uFireC: { value: new THREE.Color('#d8ff6a') }, uDustC: { value: new THREE.Color('#fff0c8') }, uSmokeC: { value: new THREE.Color('#e8e2f0') },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: AIR_V, fragmentShader: AIR_F, uniforms: u, transparent: true, depthWrite: false });
  premulBlend(mat);
  const mesh = new THREE.Points(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  sc.add(mesh);
  return { mesh, u };
}

/** Premultiplied colour (alpha 0 = additive, 1 = over) that leaves the bloom mask alone. */
function premulBlend(m: THREE.Material) {
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendEquationAlpha = THREE.AddEquation;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneFactor;
}

// ===================================================================== weather
const RAIN_V = `uniform float uT, uAmt, uB;
uniform vec3 uC;
attribute vec2 aR;
varying float vA;
void main() {
  float B = uB;
  const float H = 26.0;
  vec3 p = position;
  float sp = 21.0 + aR.y * 9.0;
  p.y = mod( p.y - uT * sp, H ) - 1.5;
  p.xz = mod( p.xz - uC.xz + B, 2.0 * B ) - B + uC.xz;
  p.x += p.y * 0.1;
  p += vec3( 0.1, 1.0, 0.0 ) * aR.x * 1.1;
  vA = aR.y < uAmt ? 0.32 * ( 0.5 + aR.x * 0.5 ) : 0.0;
  vec4 mv = modelViewMatrix * vec4( p, 1.0 );
  gl_Position = vA > 0.0 ? projectionMatrix * mv : vec4( 2.0, 2.0, 2.0, 1.0 );
}`;
const RAIN_F = `uniform vec3 uCol;
varying float vA;
void main() { gl_FragColor = vec4( uCol, vA ); }`;

const SNOW_V = `uniform float uT, uAmt, uScale, uB;
uniform vec3 uC;
attribute vec2 aR;
varying float vA;
void main() {
  float B = uB;
  const float H = 24.0;
  vec3 p = position;
  p.y = mod( p.y - uT * ( 1.1 + aR.y * 0.8 ), H ) - 1.0;
  p.x += sin( uT * 0.8 + aR.x * 30.0 ) * 0.8;
  p.z += cos( uT * 0.6 + aR.x * 20.0 ) * 0.6;
  p.xz = mod( p.xz - uC.xz + B, 2.0 * B ) - B + uC.xz;
  vA = aR.y < uAmt ? 0.9 : 0.0;
  vec4 mv = modelViewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mv;
  gl_PointSize = vA > 0.0 ? ( 0.1 + aR.x * 0.09 ) * uScale / -mv.z : 0.0;
}`;
const SNOW_F = `varying float vA;
void main() { vec2 c = gl_PointCoord - 0.5; float m = smoothstep( 0.25, 0.1, dot( c, c ) ) * vA; gl_FragColor = vec4( vec3( 0.97, 0.98, 1.0 ) * m, m ); }`;

const STAR_V = `uniform vec3 uHead, uDir;
uniform float uLen, uW;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 side = normalize( cross( uDir, cameraPosition - uHead ) );
  vec3 p = uHead - uDir * uLen * uv.x + side * ( uv.y - 0.5 ) * uW * ( 1.0 - uv.x * 0.85 );
  gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
}`;
const STAR_F = `uniform float uA;
varying vec2 vUv;
void main() {
  float k = pow( 1.0 - vUv.x, 2.2 ) * ( 1.0 - abs( vUv.y - 0.5 ) * 2.0 ) * uA;
  gl_FragColor = vec4( mix( vec3( 0.6, 0.75, 1.0 ), vec3( 1.0 ), 1.0 - vUv.x ) * k, k );
}`;

const PUD_V = `varying vec2 vUv;
varying vec2 vI;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * instanceMatrix * vec4( position, 1.0 );
  vI = instanceMatrix[ 3 ].xz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const PUD_F = `uniform float uT, uWet;
uniform vec3 uZen, uHor;
varying vec2 vUv;
varying vec2 vI;
void main() {
  vec2 c = vUv - 0.5;
  float e = length( c * vec2( 1.0, 1.0 ) ) * 2.0;
  float wob = sin( atan( c.y, c.x ) * 3.0 + vI.x ) * 0.08;
  float m = smoothstep( 1.0, 0.8, e + wob );
  float ph = fract( uT * 0.8 + fract( vI.x * 0.37 + vI.y * 0.71 ) );
  float ring = smoothstep( 0.05, 0.0, abs( e - ph * 0.9 ) ) * ( 1.0 - ph );
  vec3 col = mix( uHor, uZen, smoothstep( 0.0, 0.9, e ) ) + ring * 0.35;
  float a = m * uWet * ( 0.42 + ring * 0.3 );
  gl_FragColor = vec4( col, a );
  #include <colorspace_fragment>
}`;

export interface WeatherFx {
  rain: THREE.LineSegments; snow: THREE.Points; star: THREE.Mesh; puddles: THREE.InstancedMesh;
  ru: Record<string, THREE.IUniform>; su: Record<string, THREE.IUniform>; mu: Record<string, THREE.IUniform>; pu: Record<string, THREE.IUniform>;
}

/** Rain streaks, snow, puddles on the given spots and a shooting star (all hidden until used). */
export function makeWeather(sc: THREE.Scene, puddleSpots: { x: number; y: number; z: number; ry: number; sx: number; sz: number }[]): WeatherFx {
  // rain: 1600 streaks in a box that follows the camera target
  const RN = 1600, rp: number[] = [], ra: number[] = [];
  for (let i = 0; i < RN; i++) {
    const x = rnd(-60, 60), y = rnd(0, 26), z = rnd(-60, 60), s = Math.random();
    rp.push(x, y, z, x, y, z);
    ra.push(0, s, 1, s);
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  rg.setAttribute('aR', new THREE.Float32BufferAttribute(ra, 2));
  const ru: Record<string, THREE.IUniform> = { uT: { value: 0 }, uAmt: { value: 0 }, uB: { value: 34 }, uC: { value: new THREE.Vector3() }, uCol: { value: new THREE.Color('#dfe9ff') } };
  const rm = keepMask(new THREE.ShaderMaterial({ vertexShader: RAIN_V, fragmentShader: RAIN_F, uniforms: ru, transparent: true, depthWrite: false }));
  const rain = new THREE.LineSegments(rg, rm);
  rain.frustumCulled = false;
  rain.visible = false;
  rain.renderOrder = 4;
  sc.add(rain);
  // snow
  const SN = 1100, sp: number[] = [], sa: number[] = [];
  for (let i = 0; i < SN; i++) { sp.push(rnd(-60, 60), rnd(0, 24), rnd(-60, 60)); sa.push(Math.random(), Math.random()); }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  sg.setAttribute('aR', new THREE.Float32BufferAttribute(sa, 2));
  const su: Record<string, THREE.IUniform> = { uT: { value: 0 }, uAmt: { value: 0 }, uB: { value: 34 }, uScale: { value: 600 }, uC: { value: new THREE.Vector3() } };
  const smat = new THREE.ShaderMaterial({ vertexShader: SNOW_V, fragmentShader: SNOW_F, uniforms: su, transparent: true, depthWrite: false });
  premulBlend(smat);
  const snow = new THREE.Points(sg, smat);
  snow.frustumCulled = false;
  snow.visible = false;
  snow.renderOrder = 4;
  sc.add(snow);
  // shooting star (the glow mask follows its brightness: it blooms)
  const mu: Record<string, THREE.IUniform> = { uHead: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(1, 0, 0) }, uLen: { value: 9 }, uW: { value: 0.35 }, uA: { value: 0 } };
  const mm = new THREE.ShaderMaterial({ vertexShader: STAR_V, fragmentShader: STAR_F, uniforms: mu, transparent: true, depthWrite: false });
  mm.blending = THREE.CustomBlending;
  mm.blendSrc = THREE.OneFactor; mm.blendDst = THREE.OneFactor; mm.blendSrcAlpha = THREE.OneFactor; mm.blendDstAlpha = THREE.OneFactor;
  const star = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 1).translate(0.5, 0.5, 0), mm);
  star.frustumCulled = false;
  star.visible = false;
  star.renderOrder = 5;
  sc.add(star);
  // puddles
  const pu: Record<string, THREE.IUniform> = { uT: { value: 0 }, uWet: { value: 0 }, uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() } };
  const pm = keepMask(new THREE.ShaderMaterial({ vertexShader: PUD_V, fragmentShader: PUD_F, uniforms: pu, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const puddles = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), pm, Math.max(1, puddleSpots.length));
  const d = new THREE.Object3D();
  puddleSpots.forEach((s, i) => { d.position.set(s.x, s.y, s.z); d.rotation.set(0, s.ry, 0); d.scale.set(s.sx, 1, s.sz); d.updateMatrix(); puddles.setMatrixAt(i, d.matrix); });
  puddles.count = puddleSpots.length;
  puddles.visible = false;
  puddles.renderOrder = 1;
  sc.add(puddles);
  return { rain, snow, star, puddles, ru, su, mu, pu };
}

// ===================================================================== lamp cones and pools
let coneTex: THREE.Texture | null = null, poolTex: THREE.Texture | null = null;
/** Vertical fade for light beams and cones (bright at the lamp, v = 1). */
export const coneMap = () => (coneTex ??= ctex(8, 64, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}, false, 1));
const poolMap = () => (poolTex ??= ctex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
}, false, 1));

export interface Lamps { cones: THREE.InstancedMesh; pools: THREE.InstancedMesh; cm: THREE.MeshBasicMaterial; pm: THREE.MeshBasicMaterial; base: number }
/** Soft light cones from lamp heads down to the ground plus light pools on the ground. */
export function makeLamps(sc: THREE.Scene, pts: [number, number, number][], color: string, o: { r?: number; pool?: number; ground?: number; base?: number } = {}): Lamps {
  const r = o.r ?? 1.5, gy = o.ground ?? 0.03;
  const cm = new THREE.MeshBasicMaterial({ color, map: coneMap(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const pm = new THREE.MeshBasicMaterial({ color, map: poolMap(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const cones = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 14, 1, true).translate(0, -0.5, 0), cm, Math.max(1, pts.length));
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), pm, Math.max(1, pts.length));
  const d = new THREE.Object3D();
  pts.forEach(([x, y, z], i) => {
    const h = y - gy;
    d.position.set(x, y, z); d.rotation.set(0, 0, 0); d.scale.set(r, h, r); d.updateMatrix(); cones.setMatrixAt(i, d.matrix);
    d.position.set(x, gy, z); d.scale.setScalar(o.pool ?? r * 1.35); d.updateMatrix(); pools.setMatrixAt(i, d.matrix);
  });
  cones.count = pools.count = pts.length;
  cones.renderOrder = 2;
  cones.visible = pools.visible = false;
  sc.add(cones, pools);
  return { cones, pools, cm, pm, base: o.base ?? 1 };
}

// ===================================================================== contact shadows
const aoReg = new WeakMap<THREE.Scene, number[]>();
/** A soft contact shadow (w × d footprint, turned by ry) under something at ground level. */
export function aoAdd(sc: THREE.Scene, x: number, z: number, w: number, d: number, ry = 0, k = 0.5) {
  let l = aoReg.get(sc);
  if (!l) aoReg.set(sc, (l = []));
  l.push(x, z, w, d, ry, k);
}
let aoTex: THREE.Texture | null = null;
const aoMap = () => (aoTex ??= (() => {
  const S = 64, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!, img = g.createImageData(S, S);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    // rounded-box distance in the unit square: solid inside, soft fall-off outside
    const px = Math.abs((i + 0.5) / S - 0.5) * 2, py = Math.abs((j + 0.5) / S - 0.5) * 2;
    const qx = Math.max(px - 0.45, 0), qy = Math.max(py - 0.45, 0), dd = Math.hypot(qx, qy) / 0.55;
    const a = Math.max(0, 1 - dd);
    const v = Math.round(a * a * (3 - 2 * a) * 255), o = (j * S + i) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
    img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  return t;
})());
/** Builds the scene's contact shadows (one instanced mesh); call once after the decor. */
export function aoFlush(sc: THREE.Scene, color = '#1a0b33', opacity = 0.42) {
  const l = aoReg.get(sc);
  if (!l?.length) return null;
  const n = l.length / 6;
  const mat = keepMask(new THREE.MeshBasicMaterial({ color, alphaMap: aoMap(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  mat.onBeforeCompile = (s) => {
    // per-instance strength in the instance colour's red channel
    s.fragmentShader = s.fragmentShader.replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n#ifdef USE_INSTANCING_COLOR\n diffuseColor.a *= vColor.r; diffuseColor.rgb = diffuse;\n#endif');
  };
  mat.opacity = opacity;
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, n);
  const d = new THREE.Object3D(), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const [x, z, w, dd, ry, k] = l.slice(i * 6, i * 6 + 6);
    d.position.set(x, 0.02, z); d.rotation.set(0, ry, 0); d.scale.set(w, 1, dd); d.updateMatrix();
    im.setMatrixAt(i, d.matrix);
    im.setColorAt(i, c.setRGB(k, k, k));
  }
  im.renderOrder = -2;
  im.computeBoundingSphere();
  sc.add(im);
  aoReg.delete(sc);
  return im;
}
