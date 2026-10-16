// Doppelgänger (Duell): a model turns on the middle pedestal. Then four look-alikes pop up
// around it, and exactly one is identical. Press its direction first to score; a wrong guess
// locks you out for that round. First to four points wins.

import { sfx } from '../sfx';
import { TAU } from '../util';
import { celebrate, squashLand, updateFigure } from '../view3d/figures';
import { BOX, Batch, CONE, CYL, GLOW, SPH, SPH_LO, STAR_EX, THREE, TOR, toon, skyTex } from '../view3d/kit';
import { floatText } from '../view3d/stage';
import { KBD, cloudsBelow, floatingArena, mgFigures, mgLights } from './common';
import { Rings, Sparks, TOUCH4, botPool, dir4, fitDist, gaussR, press4, signMesh, unCele, verb } from './mgbkit';
import { NO_INPUT, WIN_COINS, type MinigameDef } from './types';

const GOAL = 4;
const COLS = ['#ff4fb0', '#35d4ff', '#9dff3a', '#ffd23f', '#b07aff'];
const NSH = 6, NTOP = 3;
const PICK_MAX = 6;

interface Item { sh: number; co: number; top: number }
interface S {
  round: number;
  pts: number[];
  /** look = only the model, pick = look-alikes out, gap = round over. */
  ph: 'look' | 'pick' | 'gap';
  t: number;
  at: number;
  target: Item;
  cand: Item[];
  ans: number;
  lock: boolean[];
  pick: number[];
  roundWin: number;
  _py: number[];
  _ai: { at: number; dir: number }[];
}

const RT = { leicht: 1.75, normal: 1.15, stark: 0.8 } as const;
const ERR = { leicht: 0.2, normal: 0.1, stark: 0.05 } as const;
const bin = botPool();
const same = (a: Item, b: Item) => a.sh === b.sh && a.co === b.co && a.top === b.top;

function newRound(s: S, rng: () => number) {
  const hard = s.round >= 2;
  const ri = (n: number) => Math.floor(rng() * n);
  const target: Item = { sh: ri(NSH), co: ri(COLS.length), top: hard ? ri(NTOP) : 0 };
  const cand: Item[] = [];
  const attrs = hard ? 3 : 2;
  let tries = 0;
  const first = ri(attrs);
  while (cand.length < 3 && tries++ < 60) {
    const a = (first + cand.length) % attrs;
    const c = { ...target };
    if (a === 0) c.sh = (c.sh + 1 + ri(NSH - 1)) % NSH;
    else if (a === 1) c.co = (c.co + 1 + ri(COLS.length - 1)) % COLS.length;
    else c.top = (c.top + 1 + ri(NTOP - 1)) % NTOP;
    if (!cand.some((x) => same(x, c))) cand.push(c);
  }
  const ans = ri(4);
  cand.splice(ans, 0, { ...target });
  s.ph = 'look';
  s.t = 0;
  s.at = 0.9 + rng() * 1.1;
  s.target = target;
  s.cand = cand;
  s.ans = ans;
  s.lock[0] = s.lock[1] = false;
  s.pick[0] = s.pick[1] = -1;
  s.roundWin = -1;
  for (const a of s._ai) { a.at = -1; a.dir = -1; }
}

const doppelgaenger: MinigameDef<S> = {
  id: 'doppelgaenger',
  name: 'Doppelgänger',
  type: 'duell',
  seconds: 40,
  players: [2, 2],
  pro: true,
  online: 'gut',
  card: {
    sub: 'In der Mitte dreht sich ein Vorbild. Dann tauchen vier Doppelgänger auf, aber nur einer stimmt genau: Form, Farbe und später auch die Spitze. Drückt seine Richtung zuerst!',
    rules: () => [
      '<b>Richtig und zuerst</b> gibt einen Punkt. Wer zuerst 4 Punkte hat, gewinnt das Duell.',
      '<b>Falsch getippt?</b> Dann bist du in dieser Runde gesperrt, und der andere hat Zeit.',
      'Ab Runde 3 kommt ein drittes Merkmal dazu: die Spitze oben drauf.',
    ],
    controls: () => ({ keys: `${KBD('↑')} ${KBD('→')} ${KBD('↓')} ${KBD('←')} oder ${KBD('W')} ${KBD('D')} ${KBD('S')} ${KBD('A')}: Sockel in dieser Richtung`, touch: 'Vier Knöpfe unten rechts: ◀ ▲ ▼ ▶' }),
    touch: () => TOUCH4,
  },
  init(ctx) {
    const s: S = {
      round: 0, pts: [0, 0], ph: 'look', t: 0, at: 1, target: { sh: 0, co: 0, top: 0 }, cand: [], ans: 0, lock: [false, false], pick: [-1, -1], roundWin: -1,
      _py: [0, 0], _ai: [{ at: -1, dir: -1 }, { at: -1, dir: -1 }],
    };
    newRound(s, ctx.rng);
    return s;
  },
  step(s, dt, inputs, ctx) {
    s.t += dt;
    if (s.ph === 'gap') {
      if (s.t > 1.7 && s.pts[0] < GOAL && s.pts[1] < GOAL) { s.round++; newRound(s, ctx.rng); ctx.fx({ k: 'round' }); }
      return;
    }
    const d0 = inputs[0] ? dir4(inputs[0], s._py[0]) : -1, d1 = inputs[1] ? dir4(inputs[1], s._py[1]) : -1;
    s._py[0] = inputs[0]?.y ?? 0;
    s._py[1] = inputs[1]?.y ?? 0;
    if (s.ph === 'look') {
      if (s.t >= s.at) { s.ph = 'pick'; s.t = 0; ctx.fx({ k: 'show' }); }
      return;
    }
    // both on the same step: the host's coin decides who is looked at first
    const order = ctx.rng() < 0.5 ? 0 : 1;
    for (let q = 0; q < 2 && s.ph === 'pick'; q++) {
      const i = q === 0 ? order : 1 - order, dir = i === 0 ? d0 : d1;
      if (dir < 0 || s.lock[i]) continue;
      s.pick[i] = dir;
      if (dir === s.ans) {
        s.pts[i]++;
        s.roundWin = i;
        s.ph = 'gap';
        s.t = 0;
        ctx.fx({ k: 'right', p: i, v: dir });
      } else {
        s.lock[i] = true;
        ctx.fx({ k: 'wrong', p: i, v: dir });
      }
    }
    if (s.ph === 'pick' && ((s.lock[0] && s.lock[1]) || s.t > PICK_MAX)) { s.ph = 'gap'; s.t = 0; ctx.fx({ k: 'none', v: s.ans }); }
  },
  bot(s, i, ctx) {
    if (s.ph !== 'pick' || s.lock[i]) return NO_INPUT;
    const a = s._ai[i], lvl = ctx.setup.players[i].bot ?? 'normal';
    if (a.at < 0) {
      a.at = Math.max(0.35, RT[lvl] * (1 + gaussR(ctx.rng) * 0.18) + (s.round >= 2 ? 0.25 : 0));
      a.dir = ctx.rng() < ERR[lvl] ? (s.ans + 1 + Math.floor(ctx.rng() * 3)) % 4 : s.ans;
    }
    if (s.t < a.at) return NO_INPUT;
    // after a wrong guess a bot is locked anyway; a second try is never needed
    a.at = 1e9;
    return press4(bin(i), a.dir);
  },
  over: (s) => s.ph === 'gap' && s.t > 1.3 && (s.pts[0] >= GOAL || s.pts[1] >= GOAL),
  result(s, ctx) {
    const win = s.pts[0] === s.pts[1] ? -1 : s.pts[0] > s.pts[1] ? 0 : 1;
    const rows = ctx.setup.players.map((_, i) => ({ i, win: i === win, coins: i === win ? WIN_COINS : 0, score: s.pts[i] * 10 + (i === win ? 100 : 0), note: `${s.pts[i]} ${s.pts[i] === 1 ? 'Punkt' : 'Punkte'}` }));
    return { rows, title: win < 0 ? 'Unentschieden!' : `${ctx.setup.players[win].name} ${verb(ctx.setup.players[win].name, 'hat', 'hast')} den Blick!` };
  },
  score: (s, i) => ({ v: `${s.pts[i] ?? 0}`, out: s.ph === 'pick' && !!s.lock[i] }),
  view(setup) {
    const scene = new THREE.Scene();
    scene.background = skyTex(['#2c7bff', '#9fd4ff', '#ffe6f6']);
    scene.fog = new THREE.Fog('#ffe6f6', 45, 110);
    mgLights(scene, 11);
    const cam = new THREE.PerspectiveCamera(42, 1, 0.5, 300);
    const R = 8.6;
    // the look-alikes in a diamond in front, the model on a tall stand behind them
    const spots = [[0, -1.9], [3.4, 0.7], [0, 3.3], [-3.4, 0.7]] as const;
    const CZ = -5.4, CY = 2.1;
    const b = new Batch(), g = new Batch();
    floatingArena(b, R, [[1, '#b07aff'], [0.82, '#fff3c4'], [0.66, '#b07aff'], [0.3, '#fff3c4']], '#6a3fd0');
    for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; g.add(SPH_LO, k % 2 ? '#fff3a6' : '#7af0ff', Math.cos(a) * (R + 0.1), 0.25, Math.sin(a) * (R + 0.1), 0, 0, 0, 0.24); }
    // middle pedestal (taller) and the four look-alike pedestals with arrows
    b.add(CYL, '#1a0b33', 0, CY / 2, CZ, 0, 0, 0, 1.25, CY, 1.25);
    b.add(CYL, '#ffd23f', 0, CY + 0.08, CZ, 0, 0, 0, 1.45, 0.16, 1.45);
    b.add(BOX, '#2a1258', 0, 2.3, CZ - 1.6, 0, 0, 0, 5.6, 4.6, 0.4);
    for (let k = 0; k < 9; k++) g.add(SPH_LO, k % 2 ? '#ffd23f' : '#ff7ad0', -2.6 + k * 0.65, 4.4, CZ - 1.35, 0, 0, 0, 0.18);
    for (let k = 0; k < 4; k++) {
      const [x, z] = spots[k];
      b.add(CYL, '#2a1258', x, 0.35, z, 0, 0, 0, 1.0, 0.7, 1.0);
      b.add(CYL, '#ffffff', x, 0.74, z, 0, 0, 0, 1.08, 0.1, 1.08);
      const dx = [0, 1, 0, -1][k], dz = [-1, 0, 1, 0][k];
      // arrow on the floor next to the stand, pointing in its direction
      b.beam([x + dx * 1.3, 0.1, z + dz * 1.3], [x + dx * 2.05, 0.1, z + dz * 2.05], 0.38, '#ff4fb0', CONE);
    }
    scene.add(b.mesh(), g.mesh(GLOW, false, false));
    cloudsBelow(scene);
    const lbl = signMesh('VORBILD', 2.6, 0.62, '#1a0b33', '#ffd23f', '#1a0b33');
    lbl.position.set(0, CY + 2.75, CZ + 0.6);
    scene.add(lbl);
    // shapes: one instanced mesh per shape (centre + 4), coloured per instance
    const ringGeo = new THREE.TorusGeometry(0.62, 0.26, 10, 24);
    const geos: THREE.BufferGeometry[] = [SPH, BOX, CONE, CYL, STAR_EX, ringGeo];
    const base = [0.72, 1.15, 0.85, 0.75, 0.85, 1] as const;
    const mat = toon('#ffffff');
    const shapes = geos.map((geo) => { const m = new THREE.InstancedMesh(geo, mat, 5); m.castShadow = true; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; scene.add(m); return m; });
    const topBall = new THREE.InstancedMesh(SPH, toon('#ffffff'), 5), topCone = new THREE.InstancedMesh(CONE, toon('#1a0b33'), 5);
    for (const m of [topBall, topCone]) { m.frustumCulled = false; m.count = 0; scene.add(m); }
    const glowRing = new THREE.InstancedMesh(TOR, new THREE.MeshBasicMaterial({ color: '#ffffff' }), 4);
    glowRing.frustumCulled = false;
    scene.add(glowRing);
    const cols = COLS.map((c) => new THREE.Color(c));
    const cWhite = new THREE.Color('#ffffff'), cRed = new THREE.Color('#ff3d6e'), pc = setup.players.map((p) => new THREE.Color(p.color));
    const figs = mgFigures(scene, setup, 1.1);
    const fpos = [[-6.2, 3.6], [6.2, 3.6]] as const;
    const sparks = new Sparks(scene, 120, 0.18);
    const shock = new Rings(scene, 4, false);
    const d = new THREE.Object3D();
    const cnt = new Int32Array(NSH);
    let cele: boolean[] | null = null, popK = 0, lockShake0 = 0, lockShake1 = 0;
    const put = (it: Item, x: number, y: number, z: number, sc: number, spin: number) => {
      const k = it.sh;
      const im = shapes[k], sz = base[k] * sc;
      d.position.set(x, y + sz * (k === 2 ? 0.5 : k === 1 ? 0.5 : k === 3 ? 0.5 : 0.75), z);
      d.rotation.set(k === 5 ? 0 : 0, spin, k === 4 ? 0 : 0);
      if (k === 1) d.rotation.set(0.0, spin + 0.6, 0);
      d.scale.set(sz, sz, k === 4 ? sz * 1.2 : sz);
      d.updateMatrix();
      im.setMatrixAt(cnt[k], d.matrix);
      im.setColorAt(cnt[k], cols[it.co]);
      cnt[k]++;
      if (it.top > 0) {
        const tm = it.top === 1 ? topBall : topCone, ty = y + sz * (k === 0 || k === 4 || k === 5 ? 1.45 : 1.0) + 0.18 * sc;
        d.position.set(x, ty + (it.top === 2 ? 0.12 * sc : 0), z); d.rotation.set(0, 0, 0); d.scale.set(0.26 * sc, (it.top === 2 ? 0.5 : 0.26) * sc, 0.26 * sc); d.updateMatrix();
        tm.setMatrixAt(tm.count++, d.matrix);
      }
    };
    return {
      scene, cam,
      frame(s, dt, t) {
        cnt.fill(0);
        topBall.count = 0; topCone.count = 0;
        const spin = t * 1.1;
        put(s.target, 0, CY + 0.16, CZ, 1.5, spin);
        const showC = s.ph === 'pick' || s.ph === 'gap';
        popK = showC ? Math.min(1, popK + dt * 5) : 0;
        const pq = popK - 1, pop = 1 + 2.7 * pq * pq * pq + 1.7 * pq * pq;
        if (showC) for (let k = 0; k < 4 && k < s.cand.length; k++) {
          const [x, z] = spots[k];
          const dim = s.ph === 'gap' && k !== s.ans ? 0.7 : 1;
          put(s.cand[k], x, 0.8, z, Math.max(0.01, pop * dim * 1.2), spin + k);
        }
        for (let k = 0; k < NSH; k++) { shapes[k].count = cnt[k]; shapes[k].instanceMatrix.needsUpdate = true; if (shapes[k].instanceColor) shapes[k].instanceColor!.needsUpdate = true; }
        topBall.instanceMatrix.needsUpdate = true; topCone.instanceMatrix.needsUpdate = true;
        // pedestal rings: who picked what; the answer glows in the gap
        for (let k = 0; k < 4; k++) {
          const [x, z] = spots[k];
          let c: THREE.Color | null = null;
          if (s.ph === 'gap' && k === s.ans) c = s.roundWin >= 0 ? pc[s.roundWin] : cWhite;
          else if (s.pick[0] === k || s.pick[1] === k) c = cRed;
          d.position.set(x, 0.82, z); d.rotation.set(Math.PI / 2, 0, 0);
          d.scale.setScalar(c ? 1.15 + Math.sin(t * 9) * 0.04 : 0.0001);
          d.updateMatrix();
          glowRing.setMatrixAt(k, d.matrix);
          glowRing.setColorAt(k, c ?? cWhite);
        }
        glowRing.instanceMatrix.needsUpdate = true;
        if (glowRing.instanceColor) glowRing.instanceColor.needsUpdate = true;
        lbl.visible = s.ph === 'look';
        lbl.scale.setScalar(1 + Math.sin(t * 6) * 0.03);
        lockShake0 = Math.max(0, lockShake0 - dt); lockShake1 = Math.max(0, lockShake1 - dt);
        for (let i = 0; i < figs.length; i++) {
          const f = figs[i], x = fpos[i][0], z = fpos[i][1];
          const sh = (i ? lockShake1 : lockShake0) * Math.sin(t * 50) * 0.25;
          f.root.position.set(x + sh, 0, z);
          if (!cele) f.yawT = Math.atan2(-x, 0.7 - z) + (s.ph === 'pick' && s.lock[i] ? Math.sin(t * 14) * 0.5 : 0);
        }
        if (cele) celebrate(figs, cele, t, cam);
        for (let q = 0; q < figs.length; q++) updateFigure(figs[q], dt, t);
        sparks.update(dt);
        shock.update(dt);
        const dist = fitDist(cam, 16, 14.5);
        cam.position.set(0, 2.0 + dist * 0.6, 0.6 + dist * 0.8);
        cam.lookAt(0, 2.0, -0.6);
      },
      fx(e, me) {
        if (e.k === 'show') { sfx.whoosh(); sfx.pop(); }
        else if (e.k === 'round') sfx.pop();
        else if (e.k === 'right') {
          const [x, z] = spots[e.v!], i = e.p!;
          if (i === me || me < 0) sfx.star(); else sfx.hit();
          sparks.emit(x, 1.6, z, setup.players[i].color, 26, 5, 7);
          shock.emit(x, 0.9, z, setup.players[i].color, 3);
          floatText(new THREE.Vector3(x, 3.1, z), 'Punkt!', '#dcff1f', scene);
          void squashLand(figs[i], 0.3);
        } else if (e.k === 'wrong') {
          const [x, z] = spots[e.v!], i = e.p!;
          sfx.bonk();
          if (i) lockShake1 = 0.35; else lockShake0 = 0.35;
          floatText(new THREE.Vector3(x, 2.9, z), i === me ? 'Falsch! Gesperrt' : 'Falsch!', '#ff8fb0', scene);
        } else if (e.k === 'none') { sfx.lose(); const [x, z] = spots[e.v!]; floatText(new THREE.Vector3(x, 2.9, z), 'Der war es', '#ffffff', scene); }
      },
      celebrate(w) { cele = w; if (!w) unCele(figs); },
    };
  },
};

export default doppelgaenger;
