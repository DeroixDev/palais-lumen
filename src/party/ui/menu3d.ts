// The live 3D around the menus: a board at night (shooting stars) with a slow camera drift as
// the backdrop of the title and the lobby, and the small figure stage (the four figures idle on
// a round platform; the picked one hops) drawn into a DOM slot of the menu.
// Performance: the backdrop renders at pixel ratio 1 and 30 frames a second (60 while the page
// scrolls, so the figure stage keeps up with its slot); the stage's governor does not judge
// these frames. Nothing renders while the tab is hidden, and the backdrop is only the active view
// while a menu is on screen. The board of the backdrop is handed to the game when an evening
// starts on that board (no second build, no second shader compile).

import { getBoard } from '../boards';
import { newGame } from '../engine/engine';
import { COLORS, DEFAULT_RULES, FEATS, type Feat, type Seat } from '../types';
import { TAU, clamp, rand, reduced } from '../util';
import { BoardView } from '../view3d/boardview';
import { hopFig, makeFigure, updateFigure, type Fig } from '../view3d/figures';
import { CYL, GRAD, THREE, TOR_THIN, VC, ctex, disposeScene, getRenderer } from '../view3d/kit';
import { quality } from '../view3d/quality';
import { FX_G, resetShared } from '../view3d/shaderfx';
import { VH, VW, getView, setView, type View } from '../view3d/stage';

const CAST: Seat[] = FEATS.map((f, i) => ({ id: 'cast' + i, name: f.name, color: COLORS[[1, 0, 2, 3][i]], feat: f.id, acc: f.acc, kind: 'bot', bot: 'normal' }));

let lastScroll = 0;
addEventListener('scroll', () => { lastScroll = performance.now(); }, { capture: true, passive: true });

// =====================================================================
// figure stage
// =====================================================================
type StageMode = 'cast' | 'pick';
// the stage's own plain materials: the board's shared ones carry its haze and colour tricks
const toonM = (color: string) => new THREE.MeshToonMaterial({ color, gradientMap: GRAD });
const FIG_MAT = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD });
const FIG_OUT = new THREE.MeshBasicMaterial({ color: '#1a0b33', side: THREE.BackSide });
let blobT: THREE.Texture | null = null;
const blobTex = () => (blobT ??= ctex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(11,6,20,.75)');
  gr.addColorStop(0.6, 'rgba(11,6,20,.4)');
  gr.addColorStop(1, 'rgba(11,6,20,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
}, false, 1));

/**
 * Sets the alpha of the drawn pixels to 1 without touching their colour. The shared shader patch
 * (view3d/shaderfx) writes alpha 0 for opaque surfaces (the bloom mask); the post pass makes the
 * board opaque again, this small stage is drawn straight to the screen, so it does it itself
 * (else the page behind the canvas shines through).
 */
class AlphaFix {
  scene = new THREE.Scene();
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  constructor() {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }',
      depthTest: false, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.ZeroFactor,
    }));
    m.frustumCulled = false;
    this.scene.add(m);
  }
}
const alphaFix = new AlphaFix();
/** Makes what was drawn so far opaque (inside the current viewport / scissor). */
export function fixAlpha() {
  const R = getRenderer(), ac = R.autoClear;
  R.autoClear = false;
  R.render(alphaFix.scene, alphaFix.cam);
  R.autoClear = ac;
}

class FigStage {
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(30, 1, 0.5, 80);
  figs: Fig[] = [];
  private blobs: THREE.Mesh[] = [];
  private spot: THREE.Mesh;
  private plat: THREE.Group;
  slot: HTMLElement | null = null;
  mode: StageMode = 'cast';
  sel = 0;
  private color = '';
  private next = 2;
  /** A pick happened before (the first selection shown does not hop). */
  private picked = false;
  private t = 0;
  onPick: ((feat: Feat) => void) | null = null;

  constructor() {
    const sc = this.scene;
    // a far fog that never shows: it makes three refresh the shared fog/output uniforms of
    // ./shaderfx for this scene (else the board's values from its post pass would stick)
    sc.fog = new THREE.Fog('#0b0614', 900, 1000);
    sc.add(new THREE.HemisphereLight('#fff3fb', '#5b3ab0', 1.0));
    const sun = new THREE.DirectionalLight('#fff0d8', 1.6);
    sun.position.set(-4, 9, 7);
    sc.add(sun);
    const rim = new THREE.DirectionalLight('#ff5fae', 0.8);
    rim.position.set(6, 3, -6);
    sc.add(rim);
    this.plat = new THREE.Group();
    const top = new THREE.Mesh(CYL, toonM('#6a3ae8'));
    top.scale.set(5.6, 0.35, 2.3);
    top.position.y = -0.18;
    const edge = new THREE.Mesh(CYL, toonM('#3d14a0'));
    edge.scale.set(5.75, 0.3, 2.42);
    edge.position.y = -0.42;
    const out = new THREE.Mesh(CYL, FIG_OUT);
    out.scale.set(5.9, 0.62, 2.55);
    out.position.y = -0.3;
    const ring = new THREE.Mesh(TOR_THIN, new THREE.MeshBasicMaterial({ color: '#dcff1f' }));
    ring.rotation.x = Math.PI / 2;
    ring.scale.set(5.55, 2.25, 1);
    ring.position.y = 0.0;
    this.plat.add(top, edge, out, ring);
    sc.add(this.plat);
    this.spot = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: '#dcff1f', transparent: true, opacity: 0.55, depthWrite: false }));
    this.spot.rotation.x = -Math.PI / 2;
    this.spot.position.y = 0.01;
    this.spot.scale.setScalar(0.95);
    sc.add(this.spot);
  }

  /** Builds the four figures: the cast (four colours) or the four looks in the player's colour. */
  setLook(mode: StageMode, color: string, feat: Feat | null) {
    const key = mode + color;
    const sel = feat ? Math.max(0, FEATS.findIndex((f) => f.id === feat)) : -1;
    const rebuilt = key !== this.color && this.color !== '';
    if (key !== this.color) {
      this.color = key;
      for (const f of this.figs) this.scene.remove(f.root);
      for (const b of this.blobs) this.scene.remove(b);
      this.figs = FEATS.map((f, i) => {
        const fig = makeFigure({ color: mode === 'cast' ? CAST[i].color : color, acc: f.acc, feat: f.id }, 1);
        fig.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = m.material === VC ? FIG_MAT : FIG_OUT; });
        fig.root.position.set(this.x(i), 0, 0);
        fig.yaw = fig.yawT = (1.5 - i) * 0.12;
        this.scene.add(fig.root);
        return fig;
      });
      this.blobs = this.figs.map(() => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.5), new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false }));
        m.rotation.x = -Math.PI / 2;
        m.position.y = 0.02;
        this.scene.add(m);
        return m;
      });
      this.mode = mode;
      this.sel = -1;
    }
    this.mode = mode;
    if (sel !== this.sel) {
      this.sel = sel;
      if (sel >= 0) { if (rebuilt || this.picked) this.hop(sel); else this.figs.forEach((o, k) => { o.yawT = k === sel ? 0 : clamp((sel - k) * 0.35, -0.7, 0.7); }); }
      this.picked = true;
    }
    this.spot.visible = mode === 'pick' && sel >= 0;
  }

  private x(i: number) { return (i - 1.5) * 2.35; }

  /** The picked figure hops (twice when it was just picked), the others turn to it. */
  hop(i: number, big = true) {
    const f = this.figs[i];
    if (!f) return;
    this.figs.forEach((o, k) => { o.yawT = k === i ? 0 : clamp((i - k) * 0.35, -0.7, 0.7); });
    if (reduced) return;
    const at = f.root.position.clone();
    void hopFig(f, at, 0.3, big ? 1.3 : 0.8).then(() => { if (big && this.sel === i) void hopFig(f, at, 0.26, 0.7); });
  }

  /** Index of the figure under a point of the slot (0..3), from the x position. */
  pickAt(clientX: number) {
    if (!this.slot) return -1;
    const r = this.slot.getBoundingClientRect();
    return clamp(Math.floor(((clientX - r.left) / Math.max(1, r.width)) * 4), 0, 3);
  }

  update(dt: number) {
    if (!this.slot) return;
    this.t += dt;
    const t = this.t;
    this.figs.forEach((f, i) => {
      const forward = this.mode === 'pick' && i === this.sel ? 0.7 : 0;
      f.root.position.z += (forward - f.root.position.z) * (1 - Math.exp(-dt * 8));
      updateFigure(f, dt, t);
      // a little sway while idle
      if (!f.busy) f.root.rotation.z = Math.sin(t * 1.7 + f.phase) * 0.04;
      const b = this.blobs[i], h = f.hop.position.y;
      b.position.set(f.root.position.x, 0.02, f.root.position.z);
      b.scale.setScalar(1 - Math.min(0.5, h * 0.3));
    });
    const s = this.figs[this.sel];
    if (s && this.spot.visible) { this.spot.position.x = s.root.position.x; this.spot.position.z = s.root.position.z; this.spot.scale.setScalar(0.95 + Math.sin(t * 4) * 0.05); }
    // the cast (title) hops now and then
    if (this.mode === 'cast' && !reduced) {
      this.next -= dt;
      if (this.next <= 0) {
        this.next = rand(1.2, 2.6);
        const i = Math.floor(Math.random() * 4), f = this.figs[i];
        if (f && !f.busy) { f.yawT = rand(-0.5, 0.5); void hopFig(f, f.root.position.clone(), 0.32, rand(0.6, 1.1)); }
      }
    }
  }

  render() {
    const el = this.slot;
    if (!el || !el.isConnected) return;
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 20 || r.bottom < 0 || r.top > VH || r.right < 0 || r.left > VW) return;
    const R = getRenderer();
    const aspect = r.width / r.height;
    const cam = this.cam;
    // fit the row of four (about 9.6 wide, 2.6 high) into the slot
    const halfV = Math.tan((cam.fov * Math.PI) / 360);
    const dist = Math.max(6.3 / (halfV * aspect), 1.9 / halfV) + 1.5;
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    cam.position.set(0, dist * 0.34 + 1.2, dist);
    cam.lookAt(0, 1.05, 0);
    const y = VH - r.bottom;
    R.setScissorTest(true);
    R.setScissor(r.left, y, r.width, r.height);
    R.setViewport(r.left, y, r.width, r.height);
    const ac = R.autoClear;
    R.autoClear = false;
    R.clearDepth();
    // the board's shared shader values (haze, ground shade, output into a target) must not apply here
    resetShared();
    FX_G[3] = 0;
    R.render(this.scene, cam);
    R.render(alphaFix.scene, alphaFix.cam);
    R.autoClear = ac;
    R.setScissorTest(false);
    R.setViewport(0, 0, VW, VH);
  }
}

// =====================================================================
// shade: the darkening behind the menu text, drawn in 3D (so the figure stage stays bright on top)
// =====================================================================
export type Shade = 'title' | 'titleNarrow' | 'lobby' | 'none';
const SHADE_ID: Record<Shade, number> = { none: 0, title: 1, titleNarrow: 2, lobby: 3 };
class ShadeQuad {
  scene = new THREE.Scene();
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  mat = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: { uMode: { value: 0 }, uK: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uMode; uniform float uK;
      void main() {
        float x = vUv.x, y = 1.0 - vUv.y, a = 0.0;
        if (uMode < 1.5) {
          float l = x < 0.32 ? mix(0.88, 0.62, x / 0.32) : mix(0.62, 0.0, clamp((x - 0.32) / 0.26, 0.0, 1.0));
          float v = y < 0.2 ? mix(0.5, 0.0, y / 0.2) : y > 0.75 ? mix(0.0, 0.6, (y - 0.75) / 0.25) : 0.0;
          a = 1.0 - (1.0 - l) * (1.0 - v);
        } else if (uMode < 2.5) {
          a = y < 0.3 ? mix(0.55, 0.2, y / 0.3) : y < 0.55 ? mix(0.2, 0.55, (y - 0.3) / 0.25) : mix(0.55, 0.9, (y - 0.55) / 0.45);
        } else {
          float r = length((vUv - vec2(0.5, 0.55)) * vec2(1.0, 1.3));
          a = mix(0.32, 0.72, smoothstep(0.25, 0.85, r));
        }
        gl_FragColor = vec4(0.043, 0.024, 0.078, a * uK);
      }`,
  });
  mode: Shade = 'none';
  private k = 0;
  constructor() { const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat); m.frustumCulled = false; this.scene.add(m); }
  update(dt: number) { this.k = Math.min(1, this.k + dt * 3); this.mat.uniforms.uK.value = this.k; }
  set(m: Shade) { if (m !== this.mode) { if (this.mode === 'none' || m === 'none') this.k = 0.2; this.mode = m; this.mat.uniforms.uMode.value = SHADE_ID[m]; } }
  render() {
    if (this.mode === 'none') return;
    const R = getRenderer(), ac = R.autoClear;
    R.autoClear = false;
    R.render(this.scene, this.cam);
    R.autoClear = ac;
  }
}
const shade = new ShadeQuad();

// =====================================================================
// backdrop
// =====================================================================
class Backdrop implements View {
  bv: BoardView;
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  dprCap = 1;
  /** Horizontal shift of the picture (fraction of the width; the title keeps the left free). */
  shift = 0;
  private a = rand(0, TAU);
  /** Tests / thumbnails: a fixed camera angle. */
  freeze: number | null = null;
  private shiftNow = 0;

  constructor(public boardId: string, private stage: FigStage) {
    const bv = new BoardView(getBoard(boardId));
    this.bv = bv;
    this.scene = bv.scene;
    this.cam = bv.cam;
    const st = newGame(CAST, { ...DEFAULT_RULES, board: boardId, types: { ...DEFAULT_RULES.types } }, 4242);
    bv.setSeats(CAST);
    bv.apply(st);
    bv.atmo.setTime(2, true);
    bv.atmo.setWeather('stars', true);
  }

  get fpsCap() { return performance.now() - lastScroll < 500 ? 60 : 30; }

  update(dt: number, t: number) {
    this.bv.update(dt, t);
    this.stage.update(dt);
    shade.update(dt);
    if (this.freeze !== null) this.a = this.freeze;
    else if (!reduced) this.a += dt * 0.045;
    const ov = this.bv.decor.overview, size = Math.max(ov.w, ov.d);
    const aspect = VW / VH;
    const dist = size * (aspect < 1 ? 1.25 : 0.82) + 14;
    const elev = 0.5 + Math.sin(t * 0.07) * 0.06;
    const c = this.cam;
    c.position.set(ov.x + Math.sin(this.a) * Math.cos(elev) * dist, Math.sin(elev) * dist + 4, ov.z + Math.cos(this.a) * Math.cos(elev) * dist);
    c.lookAt(ov.x, 0, ov.z);
    this.shiftNow += (this.shift - this.shiftNow) * (1 - Math.exp(-dt * 3));
    if (Math.abs(this.shiftNow) > 0.002) c.setViewOffset(VW, VH, -this.shiftNow * VW, 0, VW, VH);
    else if (c.view) c.clearViewOffset();
  }
  shadowNeeded() { return this.bv.shadowNeeded(); }
  warm() { return this.bv.warm(); }
  post() { return this.bv.post(); }
  afterRender() { if (quality.post === 0) fixAlpha(); shade.render(); this.stage.render(); }
}

// =====================================================================
// API
// =====================================================================
const stage = new FigStage();
let back: Backdrop | null = null;
let on = false;
let wantBoard = DEFAULT_RULES.board;

function ensure() {
  if (back && back.boardId === wantBoard) return back;
  const old = back;
  back = new Backdrop(wantBoard, stage);
  if (old) disposeScene(old.scene);
  return back;
}

export const menu3d = {
  /** Shows the backdrop (the menus are on screen). */
  show(boardId?: string) {
    if (boardId) wantBoard = boardId;
    on = true;
    const b = ensure();
    if (getView() !== b) setView(b);
  },
  /** Another view takes the screen (game, practice). */
  hide() {
    if (!on) return;
    on = false;
    stage.slot = null;
    if (back && getView() === back) setView(null);
  },
  /** The board behind the menu (switches with a short rebuild). */
  board(id: string) {
    wantBoard = id;
    if (on) this.show();
  },
  shift(f: number) { if (back) back.shift = f; },
  /** How the backdrop is darkened behind the menu (drawn in 3D, under the figure stage). */
  shade(m: Shade) { shade.set(m); },
  /** Puts the figure stage into a slot of the menu (null: no stage on this screen). */
  slot(el: HTMLElement | null, mode: StageMode, color: string, feat: Feat | null) {
    stage.slot = el;
    if (!el) return;
    stage.setLook(mode, color, feat);
  },
  pickAt: (x: number) => stage.pickAt(x),
  /**
   * The game takes the backdrop's board when it starts on the same board (built and compiled
   * already). The menu builds a fresh one next time.
   */
  take(boardId: string): BoardView | null {
    if (!back || back.boardId !== boardId) return null;
    const b = back;
    back = null;
    if (getView() === b) setView(null);
    b.cam.clearViewOffset();
    return b.bv;
  },
  get view() { return back; },
  /** Tests: the figure stage. */
  get stage() { return stage; },
};
