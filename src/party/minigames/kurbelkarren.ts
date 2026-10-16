// Kurbelkarren (2 gegen 2): each team cranks its mine cart to the finish. Press ← and → in turn:
// every clean alternation pushes the cart, the same key twice slips. Both team members crank.

import { sfx } from '../sfx';
import { clamp } from '../util';
import { celebrate, squashLand, updateFigure } from '../view3d/figures';
import { BOX, Batch, CONE, CYL, CYL8, FONT, GLOW, OUT, SPH_LO, THREE, ctex, skyTex } from '../view3d/kit';
import { VH, VW, floatText } from '../view3d/stage';
import { KBD, mgFigures, mgLights, names, teamOf } from './common';
import { NO_INPUT, WIN_COINS, type MinigameDef } from './types';

const GOAL = 60;
const PUSH = 0.62;
const LANE_Z = [-2.6, 2.6];

interface S {
  cart: [number, number];
  vel: [number, number];
  last: ('l' | 'r' | null)[];
  cranks: number[];
  winner: number;
  winT: number;
  _ai: { next: number; side: 'l' | 'r' }[];
}

const RATE = { leicht: [3.6, 0.18], normal: [5.4, 0.1], stark: [6.8, 0.05] } as const;

const kurbelkarren: MinigameDef<S> = {
  id: 'kurbelkarren',
  name: 'Kurbelkarren',
  type: '2v2',
  seconds: 25,
  players: [4, 4],
  pro: true,
  online: 'gut',
  card: {
    sub: 'Kurbelt im Team eure Lore ins Ziel. Abwechselnd links und rechts drücken: Jeder saubere Wechsel schiebt die Lore an.',
    rules: (setup) => [
      `<b>Team Pink (${names(setup, teamOf(setup, 0))})</b> gegen <b>Team Cyan (${names(setup, teamOf(setup, 1))})</b>.`,
      '<b>Abwechseln!</b> Zweimal dieselbe Seite rutscht durch und bringt nichts.',
      'Wer zuerst im Ziel ist, gewinnt. Sonst gewinnt die Lore, die am weitesten gekommen ist. Jedes Gewinner-Mitglied bekommt 10 Münzen.',
    ],
    controls: () => ({ keys: `${KBD('←')} ${KBD('→')} oder ${KBD('A')} ${KBD('D')} abwechselnd drücken`, touch: 'Die zwei großen Knöpfe abwechselnd tippen' }),
    touch: () => ({ joy: false, buttons: [{ key: 'l', label: '← Links' }, { key: 'r', label: 'Rechts →' }] }),
  },
  init(ctx) {
    return {
      cart: [0, 0], vel: [0, 0], last: ctx.setup.players.map(() => null), cranks: ctx.setup.players.map(() => 0), winner: -1, winT: 0,
      _ai: ctx.setup.players.map(() => ({ next: 0.2 + ctx.rng() * 0.3, side: 'l' as const })),
    };
  },
  step(s, dt, inputs, ctx) {
    const P = ctx.setup.players;
    P.forEach((p, i) => {
      const t = p.team === 1 ? 1 : 0;
      for (const side of ['l', 'r'] as const) {
        if (!(side === 'l' ? inputs[i].lP : inputs[i].rP)) continue;
        if (s.winner >= 0) continue;
        if (s.last[i] !== side) { s.vel[t] += PUSH; s.cranks[i]++; ctx.fx({ k: 'crank', p: i }); }
        else ctx.fx({ k: 'slip', p: i });
        s.last[i] = side;
      }
    });
    for (const t of [0, 1]) {
      s.vel[t] *= Math.exp(-dt * 1.6);
      s.cart[t] = Math.min(GOAL, s.cart[t] + s.vel[t] * dt * 2.2);
      if (s.cart[t] >= GOAL && s.winner < 0) { s.winner = t; s.winT = ctx.time; ctx.fx({ k: 'goal', v: t }); }
    }
  },
  bot(s, i, ctx) {
    const ai = s._ai[i];
    const [rate, miss] = RATE[ctx.setup.players[i].bot ?? 'normal'];
    ai.next -= 1 / 60;
    if (ai.next > 0) return NO_INPUT;
    ai.next = (1 / rate) * (0.8 + ctx.rng() * 0.4);
    const slip = ctx.rng() < miss;
    const side = slip ? ai.side : ai.side === 'l' ? 'r' : 'l';
    ai.side = side;
    return { ...NO_INPUT, lP: side === 'l', rP: side === 'r' };
  },
  over: (s, ctx) => s.winner >= 0 && ctx.time > s.winT + 0.6,
  result(s, ctx) {
    const win = s.winner >= 0 ? s.winner : s.cart[0] === s.cart[1] ? -1 : s.cart[0] > s.cart[1] ? 0 : 1;
    const rows = ctx.setup.players.map((p, i) => {
      const t = p.team === 1 ? 1 : 0, w = t === win;
      return { i, win: w, coins: w ? WIN_COINS : 0, score: (w ? 1000 : 0) + s.cranks[i], note: `${s.cranks[i]} saubere Kurbeln · Lore bei ${Math.round((s.cart[t] / GOAL) * 100)} %` };
    });
    return { rows, title: win < 0 ? 'Unentschieden!' : `Team ${win === 0 ? 'Pink' : 'Cyan'} gewinnt!` };
  },
  score: (s, i) => ({ v: String(s.cranks[i] ?? 0) }),
  view(setup) {
    const scene = new THREE.Scene();
    scene.background = skyTex(['#2a0d6e', '#7a3fd0', '#ff9ac8']);
    scene.fog = new THREE.Fog('#c27ad8', 60, 160);
    const L = mgLights(scene, 30);
    const cam = new THREE.PerspectiveCamera(42, 1, 0.5, 300);
    const st = new Batch(), gl = new Batch();
    // canyon floor, rails and sleepers
    st.add(BOX, '#5b2bd6', GOAL / 2, -0.8, 0, 0, 0, 0, GOAL + 30, 1.4, 14);
    st.add(BOX, '#8e6be0', GOAL / 2, -0.12, 0, 0, 0, 0, GOAL + 30, 0.1, 13.4);
    for (const z of LANE_Z) {
      for (const dz of [-0.75, 0.75]) st.add(BOX, '#d8d0ff', GOAL / 2, 0.12, z + dz, 0, 0, 0, GOAL + 26, 0.16, 0.16);
      for (let x = -12; x <= GOAL + 12; x += 1.4) st.add(BOX, '#8a4e2e', x, 0, z, 0, 0, 0, 0.4, 0.14, 2.1);
    }
    // finish arch
    st.add(BOX, '#2a1258', GOAL + 1.5, 2.4, -5.2, 0, 0, 0, 0.5, 4.8, 0.5); st.add(BOX, '#2a1258', GOAL + 1.5, 2.4, 5.2, 0, 0, 0, 0.5, 4.8, 0.5);
    for (let k = 0; k < 12; k++) gl.add(SPH_LO, k % 2 ? '#dcff1f' : '#ff3d9a', GOAL + 1.5, 4.9, -5 + k * 0.9, 0, 0, 0, 0.26);
    // side rocks and neon posts
    for (let x = -10; x <= GOAL + 12; x += 6) for (const z of [-7.2, 7.2]) { st.add(SPH_LO, '#6a3fd0', x + (z > 0 ? 2 : 0), 0.6, z, 0, 0, 0, 2.2, 1.8, 1.4); gl.add(CYL8, x % 12 === 2 ? '#2fe6ff' : '#ff4fb0', x + 1, 1.6, z * 0.9, 0, 0, 0, 0.12, 2.6, 0.12); }
    scene.add(st.mesh(), gl.mesh(GLOW, false, false));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.6), new THREE.MeshBasicMaterial({ map: ctex(384, 100, (g) => { g.fillStyle = '#1a0b33'; g.fillRect(0, 0, 384, 100); g.strokeStyle = '#dcff1f'; g.lineWidth = 8; g.strokeRect(4, 4, 376, 92); g.font = `italic 900 70px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#dcff1f'; g.fillText('ZIEL', 192, 54); }) }));
    sign.position.set(GOAL + 1.5, 5.8, 0);
    sign.rotation.y = -Math.PI / 2;
    scene.add(sign);
    // two carts with a crank wheel
    const carts = [0, 1].map((t) => {
      const b = new Batch(), col = t === 0 ? '#ff5fae' : '#35d4ff';
      b.add(BOX, col, 0, 0.9, 0, 0, 0, 0, 3, 1, 2); b.add(BOX, '#1a0b33', 0, 1.42, 0, 0, 0, 0, 3.1, 0.1, 2.1);
      for (const x of [-1, 1]) for (const z of [-0.8, 0.8]) b.add(CYL, '#2a1258', x, 0.38, z, Math.PI / 2, 0, 0, 0.36, 0.2, 0.36);
      b.add(CONE, '#ffd23f', 1.7, 0.9, 0, 0, 0, -Math.PI / 2, 0.4, 0.5, 0.4);
      const grp = new THREE.Group();
      const m = b.mesh();
      grp.add(m, new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.15, 2.2).translate(0, 0.9, 0), OUT));
      const crank = new THREE.Group();
      crank.position.set(0, 2, 0);
      const cb = new Batch();
      cb.add(CYL, '#ffd23f', 0, 0, 0, 0, 0, Math.PI / 2, 0.15, 2.4, 0.15);
      for (const s of [-1, 1]) cb.add(BOX, '#ffffff', s * 1.2, 0.35, 0, 0, 0, 0, 0.12, 0.7, 0.12);
      crank.add(cb.mesh());
      grp.add(crank);
      grp.position.z = LANE_Z[t];
      scene.add(grp);
      return { grp, crank };
    });
    const figs = mgFigures(scene, setup, 0.8);
    const slot = setup.players.map((p, i) => teamOf(setup, p.team).indexOf(i));
    let cele: boolean[] | null = null;
    const crankA = [0, 0];
    return {
      scene, cam,
      frame(s, dt, t) {
        for (const tm of [0, 1]) {
          const c = carts[tm];
          c.grp.position.x = s.cart[tm];
          crankA[tm] += s.vel[tm] * dt * 4;
          c.crank.rotation.x = crankA[tm];
        }
        figs.forEach((f, i) => {
          const tm = setup.players[i].team === 1 ? 1 : 0;
          f.root.position.set(s.cart[tm] + (slot[i] === 0 ? -0.8 : 0.8), 1.45, LANE_Z[tm] + (slot[i] === 0 ? -0.2 : 0.2));
          if (!cele) f.yawT = tm === 0 ? Math.PI * 0.85 : Math.PI * 0.15 + 0;
        });
        if (cele) celebrate(figs, cele, t, cam);
        figs.forEach((f) => updateFigure(f, dt, t));
        // both carts stay in view: centre between them, step back when they drift apart
        const gap = Math.abs(s.cart[0] - s.cart[1]);
        const aspect = VW / VH, dist = (aspect < 1 ? 34 : 24) + gap * (aspect < 1 ? 1.1 : 0.55);
        const cx = clamp((s.cart[0] + s.cart[1]) / 2, 6, GOAL - 2);
        cam.position.set(cx - 3, dist * 0.62, dist);
        cam.lookAt(cx + 2, 0.5, 0);
        L.sun.target.position.set(cx, 0, 0);
        L.sun.position.set(cx - 10, 26, 14);
        L.sun.target.updateMatrixWorld();
      },
      fx(e, me) {
        if (e.k === 'crank') { if (e.p === me || me < 0) sfx.crank(); const f = figs[e.p!]; if (f && !f.busy) void squashLand(f, 0.12); }
        else if (e.k === 'slip') { if (e.p === me) { sfx.bonk(); floatText(figs[e.p!].root.position.clone().setY(3.6), 'Abwechseln!', '#ff8fb0', scene); } }
        else if (e.k === 'goal') { sfx.fanfare(); floatText(new THREE.Vector3(GOAL, 4, LANE_Z[e.v!]), 'Ziel!', '#dcff1f', scene); }
      },
      celebrate(w) { cele = w; if (!w) figs.forEach((f) => { f.busy = false; f.hop.position.y = 0; f.sq.scale.set(1, 1, 1); }); },
    };
  },
};

export default kurbelkarren;
