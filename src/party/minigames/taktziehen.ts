// Tauziehen im Takt (Duell): two figures hold one rope over a neon pit. Beat balls roll from
// the middle out to each player's ring; press exactly when a ball reaches your ring. Only
// presses on the beat pull, a stray press lets the rope slip. Drag the other one to the pit.

import { sfx } from '../sfx';
import { clamp } from '../util';
import { celebrate, squashLand, updateFigure } from '../view3d/figures';
import { BOX, Batch, CYL, CYL8, GLOW, SPH, SPH_LO, THREE, TOR, skyTex, toon } from '../view3d/kit';
import { floatText } from '../view3d/stage';
import { KBD, mgFigures, mgLights } from './common';
import { Rings, Sparks, akk, botPool, fitDist, gaussR, portrait, unCele, verb } from './mgbkit';
import { NO_INPUT, WIN_COINS, type MinigameDef } from './types';

const L = 7;
const LEAD = 2.2;
const PERF = 0.055, GOOD = 0.125, CATCH = 0.17;
const RING_X = 6.2;
const SONG_END = 27.2;

interface Note { id: number; t: number; h: number[] }
interface S {
  /** Song time. */
  t: number;
  rope: number;
  combo: number[];
  /** Per player: perfekt, gut, daneben. */
  stat: number[][];
  notes: Note[];
  nextId: number;
  winner: number;
  winT: number;
  end: boolean;
  _pat: number[];
  _pi: number;
  _ai: { id: number; at: number }[];
}

const SD = { leicht: 0.075, normal: 0.046, stark: 0.028 } as const;
const SKIP = { leicht: 0.08, normal: 0.03, stark: 0.01 } as const;
const bin = botPool();
const BARS = [[0, 1, 2, 3], [0, 1, 2, 2.5, 3], [0, 1, 2], [0, 0.5, 1, 2, 3], [0, 1, 1.5, 2, 3], [0, 1, 2, 3], [0, 2, 2.5, 3]];

function pattern(rng: () => number) {
  const out: number[] = [];
  let t = 1.4, bar = 0;
  while (t < SONG_END) {
    const bpm = 102 + (34 * t) / SONG_END, beat = 60 / bpm;
    const tpl = bar < 2 ? BARS[0] : BARS[Math.floor(rng() * BARS.length)];
    for (const b of tpl) { const nt = t + b * beat; if (nt < SONG_END) out.push(nt); }
    t += 4 * beat;
    bar++;
  }
  return out;
}

function judge(s: S, i: number, ctx: { fx: (e: { k: string; p?: number; v?: number }) => void }) {
  let best: Note | null = null, bd = CATCH;
  for (const n of s.notes) { if (n.h[i] !== 0) continue; const d = Math.abs(n.t - s.t); if (d < bd) { bd = d; best = n; } }
  const dir = i === 0 ? -1 : 1;
  if (best && bd <= GOOD) {
    const perf = bd <= PERF;
    best.h[i] = perf ? 2 : 1;
    s.combo[i]++;
    s.stat[i][perf ? 0 : 1]++;
    s.rope += dir * (perf ? 1 : 0.6) * (1 + Math.min(8, s.combo[i]) * 0.04);
    ctx.fx({ k: 'hit', p: i, v: perf ? 2 : 1 });
  } else {
    if (best) best.h[i] = 3;
    s.combo[i] = 0;
    s.stat[i][2]++;
    s.rope -= dir * 0.35;
    ctx.fx({ k: 'stray', p: i });
  }
}

const taktziehen: MinigameDef<S> = {
  id: 'taktziehen',
  name: 'Tauziehen im Takt',
  type: 'duell',
  seconds: 30,
  players: [2, 2],
  pro: true,
  online: 'ok',
  card: {
    sub: 'Taktkugeln rollen aus der Mitte zu eurem Ring. Drückt genau dann, wenn eine Kugel im Ring ist: Jeder Treffer zieht am Seil. Zieht den anderen in den Neongraben!',
    rules: () => [
      '<b>Perfekt</b> zieht stark, <b>Gut</b> zieht etwas. Treffer am Stück geben noch mehr Zug.',
      '<b>Daneben gedrückt</b> lässt das Seil zum anderen rutschen. Nicht wild drücken!',
      'Wer den anderen über den Graben zieht, gewinnt sofort. Sonst gewinnt, auf wessen Seite das Seil am Ende steht.',
    ],
    controls: () => ({ keys: `${KBD('Leertaste')} im Takt drücken`, touch: 'Großer Knopf unten rechts, im Takt tippen' }),
    touch: () => ({ joy: false, buttons: [{ key: 'a', label: 'Zieh!' }] }),
  },
  init(ctx) {
    return {
      t: 0, rope: 0, combo: [0, 0], stat: [[0, 0, 0], [0, 0, 0]], notes: [], nextId: 1, winner: -1, winT: 0, end: false,
      _pat: pattern(ctx.rng), _pi: 0, _ai: [{ id: -1, at: 1e9 }, { id: -1, at: 1e9 }],
    };
  },
  step(s, dt, inputs, ctx) {
    if (s.end) return;
    const t0 = s.t;
    s.t += dt;
    // spawn notes that come into view
    while (s._pi < s._pat.length && s._pat[s._pi] < s.t + LEAD) { s.notes.push({ id: s.nextId++, t: s._pat[s._pi], h: [0, 0] }); s._pi++; }
    for (const n of s.notes) if (n.t > t0 && n.t <= s.t) ctx.fx({ k: 'beat' });
    if (s.winner < 0) {
      for (let i = 0; i < 2; i++) if (inputs[i]?.aP) judge(s, i, ctx);
      // missed notes
      for (const n of s.notes) for (let i = 0; i < 2; i++) if (n.h[i] === 0 && n.t < s.t - GOOD) { n.h[i] = 3; s.combo[i] = 0; s.stat[i][2]++; ctx.fx({ k: 'miss', p: i }); }
      if (Math.abs(s.rope) >= L) {
        // practice and demo go on: the rope jumps back to the middle
        if (ctx.setup.mode !== 'play') { ctx.fx({ k: 'ko', p: s.rope < 0 ? 0 : 1 }); s.rope = 0; }
        else { s.winner = s.rope < 0 ? 0 : 1; s.winT = s.t; s.rope = clamp(s.rope, -L, L); ctx.fx({ k: 'ko', p: s.winner }); }
      }
    }
    // drop old notes (in place, no new array)
    let w = 0;
    for (let r = 0; r < s.notes.length; r++) if (s.notes[r].t > s.t - 0.6) s.notes[w++] = s.notes[r];
    s.notes.length = w;
    if (s.winner >= 0 ? s.t > s.winT + 1.4 : s._pi >= s._pat.length && !s.notes.length && s.t > SONG_END) s.end = true;
  },
  bot(s, i, ctx) {
    if (s.winner >= 0) return NO_INPUT;
    const a = s._ai[i], lvl = ctx.setup.players[i].bot ?? 'normal';
    let nx: Note | null = null;
    for (const n of s.notes) if (n.h[i] === 0 && n.t > s.t - GOOD) { nx = n; break; }
    if (!nx) return NO_INPUT;
    if (a.id !== nx.id) { a.id = nx.id; a.at = ctx.rng() < SKIP[lvl] ? 1e9 : nx.t + gaussR(ctx.rng) * SD[lvl]; }
    if (s.t < a.at) return NO_INPUT;
    a.at = 1e9;
    const o = bin(i);
    o.a = true; o.aP = true;
    return o;
  },
  over: (s) => s.end,
  result(s, ctx) {
    const win = s.winner >= 0 ? s.winner : Math.abs(s.rope) < 0.05 ? -1 : s.rope < 0 ? 0 : 1;
    const rows = ctx.setup.players.map((_, i) => {
      const [p, g, m] = s.stat[i];
      return { i, win: i === win, coins: i === win ? WIN_COINS : 0, score: (i === win ? 1000 : 0) + p * 2 + g, note: `${p} perfekt · ${g} gut · ${m} daneben` };
    });
    const P = ctx.setup.players;
    return { rows, title: win < 0 ? 'Unentschieden!' : s.winner >= 0 ? `${P[win].name} ${verb(P[win].name, 'zieht', 'ziehst')} ${akk(P[1 - win].name)} in den Graben!` : `${P[win].name} ${verb(P[win].name, 'gewinnt', 'gewinnst')} nach Punkten!` };
  },
  score: (s, i) => ({ v: `${s.stat[i]?.[0] ?? 0}★ ${s.combo[i] ?? 0}x` }),
  view(setup) {
    const scene = new THREE.Scene();
    scene.background = skyTex(['#1b0b52', '#7a2fd0', '#ff9ad0']);
    scene.fog = new THREE.Fog('#9a4fd8', 40, 120);
    const Lt = mgLights(scene, 14);
    void Lt;
    const cam = new THREE.PerspectiveCamera(40, 1, 0.5, 300);
    const c0 = setup.players[0]?.color ?? '#ff4fb0', c1 = setup.players[1]?.color ?? '#35d4ff';
    const st = new Batch(), gl = new Batch();
    // two platforms with the pit between
    for (const sd of [-1, 1]) {
      st.add(BOX, '#3a1690', sd * 6.4, -0.6, 0, 0, 0, 0, 11, 1.2, 8);
      st.add(BOX, sd < 0 ? '#ffd6ec' : '#d2f4ff', sd * 6.4, 0.02, -0.4, 0, 0, 0, 11, 0.06, 4.4);
      st.add(BOX, sd < 0 ? c0 : c1, sd * 1.15, 0.06, -0.4, 0, 0, 0, 0.3, 0.1, 4.4);
      for (let k = 0; k < 4; k++) st.add(BOX, '#ffffff', sd * (3 + k * 2.2), 0.07, -0.4, 0, 0, 0, 0.12, 0.04, 4.0);
    }
    st.add(BOX, '#12062e', 0, -1.6, -0.6, 0, 0, 0, 1.9, 2.4, 6.4);
    gl.add(BOX, '#ff3d9a', 0, -0.55, -0.6, 0, 0, 0, 1.7, 0.1, 6.2);
    for (let z = -3.5; z <= 2.2; z += 1) gl.add(SPH_LO, '#ff9ad0', (z * 0.37) % 0.6, -0.48, z, 0, 0, 0, 0.18, 0.1, 0.18);
    // note lane in front
    st.add(BOX, '#1a0b33', 0, 0.35, 2.6, 0, 0, 0, 2 * RING_X + 1.6, 0.18, 0.9);
    gl.add(BOX, '#7af0ff', 0, 0.46, 2.6, 0, 0, 0, 2 * RING_X + 1.6, 0.03, 0.08);
    gl.add(CYL8, '#ffffff', 0, 0.55, 2.6, 0, 0, 0, 0.32, 0.2, 0.32);
    // backdrop: speaker towers
    for (const sd of [-1, 1]) for (let k = 0; k < 2; k++) {
      const x = sd * (9 + k * 3), h = 4.2 - k;
      st.add(BOX, '#2a1258', x, h / 2, -4.6, 0, 0, 0, 2.4, h, 1.6);
      for (let q = 0; q < 2; q++) { st.add(CYL, '#1a0b33', x, 0.9 + q * 1.6, -3.78, Math.PI / 2, 0, 0, 0.75, 0.1, 0.75); gl.add(CYL, sd < 0 ? '#ff4fb0' : '#35d4ff', x, 0.9 + q * 1.6, -3.74, Math.PI / 2, 0, 0, 0.3, 0.1, 0.3); }
    }
    scene.add(st.mesh(), gl.mesh(GLOW, false, false));
    // hit rings (one per player) and the beat balls (instanced, coloured per judgement)
    const rings = [c0, c1].map((c, i) => { const m = new THREE.Mesh(TOR, toon(c)); m.scale.setScalar(0.55); m.position.set((i ? 1 : -1) * RING_X, 0.75, 2.6); scene.add(m); return m; });
    const balls = new THREE.InstancedMesh(SPH, toon('#ffffff'), 64);
    balls.frustumCulled = false;
    balls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(balls);
    const COL = [new THREE.Color('#ffffff'), new THREE.Color('#35d4ff'), new THREE.Color('#ffe14a'), new THREE.Color('#6a5a8a')];
    for (let k = 0; k < 64; k++) balls.setColorAt(k, COL[0]);
    // rope + flag
    const rope = new THREE.Mesh(CYL8, toon('#f3d9a8'));
    rope.rotation.z = Math.PI / 2;
    rope.castShadow = true;
    scene.add(rope);
    const flag = new THREE.Mesh(BOX, toon('#ff3d6e'));
    flag.scale.set(0.12, 0.7, 0.5);
    scene.add(flag);
    const figs = mgFigures(scene, setup, 1.0);
    const sparks = new Sparks(scene, 120, 0.16);
    const shock = new Rings(scene, 4, true);
    const d = new THREE.Object3D();
    let cele: boolean[] | null = null;
    let pulse0 = 0, pulse1 = 0, fallT = 0, shownWin = -1, rx = RING_X;
    return {
      scene, cam,
      frame(s, dt, t) {
        const big = portrait() ? 1.45 : 1;
        rx = big > 1 ? 4.4 : RING_X;
        const off = (clamp(s.rope, -L, L) / L) * (big > 1 ? 2.4 : 3.5);
        // balls
        let k = 0;
        for (const n of s.notes) {
          const u = (n.t - s.t) / LEAD;
          for (let i = 0; i < 2 && k < 64; i++) {
            const h = n.h[i];
            if (h === 1 || h === 2) continue;
            const x = (i ? 1 : -1) * rx * (1 - u);
            const sc = (h === 3 ? Math.max(0.01, 0.22 - (s.t - n.t) * 0.3) : 0.22 * Math.min(1, (1 - u) * 4 + 0.15)) * big;
            d.position.set(x, 0.75, 2.6); d.rotation.set(0, 0, 0); d.scale.setScalar(sc); d.updateMatrix();
            balls.setMatrixAt(k, d.matrix);
            balls.setColorAt(k, COL[h === 3 ? 3 : 0]);
            k++;
          }
        }
        balls.count = k;
        balls.instanceMatrix.needsUpdate = true;
        if (balls.instanceColor) balls.instanceColor.needsUpdate = true;
        pulse0 = Math.max(0, pulse0 - dt * 4); pulse1 = Math.max(0, pulse1 - dt * 4);
        rings[0].position.x = -rx; rings[1].position.x = rx;
        rings[0].scale.setScalar((0.55 + pulse0 * 0.25) * big);
        rings[1].scale.setScalar((0.55 + pulse1 * 0.25) * big);
        // figures pulled along by the rope
        if (s.winner !== shownWin) { shownWin = s.winner; fallT = 0; }
        if (s.winner >= 0) fallT += dt;
        for (let i = 0; i < 2; i++) {
          const f = figs[i];
          if (!f) continue;
          let x = (i ? 1 : -1) * (big > 1 ? 3.3 : 4.4) + off, y = 0;
          if (s.winner >= 0 && s.winner !== i) { const q = Math.min(1, fallT * 1.6); x = (i ? 1 : -1) * (0.9 - q * 0.9) + (i ? 0.2 : -0.2); y = -fallT * fallT * 7 * (q >= 1 ? 1 : q); }
          f.root.position.set(x, y, -0.4);
          f.root.visible = y > -6;
          if (!cele) { f.yawT = i ? -Math.PI / 2 : Math.PI / 2; f.root.rotation.z = (i ? -1 : 1) * 0.18 * (s.winner >= 0 && s.winner !== i ? -1.5 : 1); } else f.root.rotation.z = 0;
        }
        const xa = figs[0].root.position.x + 0.65, xb = figs[1].root.position.x - 0.65;
        rope.position.set((xa + xb) / 2, 1.05, -0.4);
        rope.scale.set(0.07, Math.max(0.1, xb - xa), 0.07);
        flag.position.set((xa + xb) / 2, 0.75, -0.4);
        flag.rotation.z = Math.sin(t * 5) * 0.15;
        if (cele) celebrate(figs, cele, t, cam);
        for (let q = 0; q < figs.length; q++) updateFigure(figs[q], dt, t);
        sparks.update(dt);
        shock.update(dt);
        const dist = fitDist(cam, 2 * rx + (big > 1 ? 1.8 : 4.5), 9);
        cam.position.set(0, 2.5 + dist * 0.42, 2.5 + dist * 0.92);
        cam.lookAt(0, 0.9, 0.4);
      },
      fx(e, me) {
        if (e.k === 'beat') sfx.wheel();
        else if (e.k === 'hit') {
          const i = e.p!, x = (i ? 1 : -1) * rx;
          if (i) pulse1 = 1; else pulse0 = 1;
          if (i === me || me < 0) sfx.crank();
          sparks.emit(x, 0.8, 2.6, e.v === 2 ? '#ffe14a' : '#35d4ff', e.v === 2 ? 12 : 6, 3, 4);
          if (e.v === 2) shock.emit(x, 0.75, 2.62, '#ffe14a', 1.4);
          floatText(new THREE.Vector3(x * 0.82, 1.9, 2.6), e.v === 2 ? 'Perfekt!' : 'Gut', e.v === 2 ? '#ffe14a' : '#7af0ff', scene);
          const f = figs[i]; if (f && !f.busy) void squashLand(f, 0.14);
        } else if (e.k === 'stray' || e.k === 'miss') {
          const i = e.p!;
          if (e.k === 'stray' && (i === me || me < 0)) sfx.bonk();
          if (i === me || e.k === 'stray') floatText(new THREE.Vector3((i ? 1 : -1) * rx * 0.82, 1.9, 2.6), e.k === 'stray' ? 'Daneben!' : 'Verpasst', '#ff8fb0', scene);
        } else if (e.k === 'ko') {
          sfx.boom();
          window.setTimeout(() => sfx.fanfare(), 350);
          sparks.emit(0, 0.2, 0, '#ff3d9a', 30, 4, 8);
        }
      },
      celebrate(w) { cele = w; if (!w) { unCele(figs); for (const f of figs) f.root.rotation.z = 0; } },
    };
  },
};

export default taktziehen;
