// Torwand (1 gegen 3): the team shoots in turns at a wall with three holes. A target ring
// swings across the wall; press to shoot where it is. The single player slides a big cushion in
// front of the holes and tries to block. The team needs a set number of goals to win.
// Also runs as 1 gegen 2 and 1 gegen 1.

import { sfx } from '../sfx';
import { clamp, lerp } from '../util';
import { celebrate, squashLand, updateFigure } from '../view3d/figures';
import { BOX, Batch, CYL, CYL8, GLOW, SPH, SPH_LO, THREE, TOR, skyTex, toon } from '../view3d/kit';
import { floatText } from '../view3d/stage';
import { KBD, mgFigures, mgLights, names, teamOf } from './common';
import { Rings, Seg, Sparks, botPool, fitDist, gaussR, signMesh, unCele, verb } from './mgbkit';
import { NO_INPUT, WIN_COINS, type MgSetup, type MinigameDef } from './types';

const HOLES = [-3, 0, 3];
const HOLE_Y = 1.3, HOLE_H = 0.75, GOAL_TOL = 0.62;
const WALL_Z = -6, BLOCK_Z = -5.15, SPOT_Z = 3.2;
const AMP = 4.6, KMAX = 4.3, KSPEED = 6.8, BLOCK_HALF = 1.05;
const FLY = 0.5, AIM_MAX = 2.6, RES = 1.1;

interface S {
  shot: number;
  ph: 'aim' | 'fly' | 'res' | 'end';
  t: number;
  phase: number;
  w: number;
  aimX: number;
  kx: number;
  kv: number;
  goals: number;
  saves: number;
  /** Per shot: 0 open, 1 goal, 2 saved, 3 wall. */
  log: number[];
  /** Goals per player. */
  pg: number[];
  need: number;
  _ai: { e: number; h: number; kt: number; react: number; seen: number; ks: number; lean: number };
}

const SHOOT_SD = { leicht: 0.085, normal: 0.05, stark: 0.032 } as const;
const KEEP = { leicht: [0.36, 0.45, 0.1], normal: [0.26, 0.28, 0.25], stark: [0.265, 0.2, 0.26] } as const;
const bin = botPool();

const shooterCache = new WeakMap<MgSetup, number[]>();
/** Everybody but the single player (index 0), cached per setup (no allocation per step). */
function shooters(setup: MgSetup) {
  let r = shooterCache.get(setup);
  if (!r) { r = []; for (let i = 1; i < setup.players.length; i++) r.push(i); shooterCache.set(setup, r); }
  return r;
}
function plan(setup: MgSetup) {
  const m = Math.max(1, setup.players.length - 1);
  const total = m === 3 ? 9 : m === 2 ? 8 : 6;
  return { total, need: Math.ceil(total * 0.45) };
}
const cursorX = (phase: number) => AMP * Math.sin(phase);
const shooterOf = (s: S, setup: MgSetup) => { const sh = shooters(setup); return sh[s.shot % sh.length] ?? 1; };

function newShot(s: S, rng: () => number) {
  s.ph = 'aim';
  s.t = 0;
  s.phase = rng() * Math.PI * 2;
  s.w = 1.65 + s.shot * 0.1;
  s._ai.e = -9;
  s._ai.seen = 0;
}

const torwand: MinigameDef<S> = {
  id: 'torwand',
  name: 'Torwand',
  type: '1v3',
  seconds: 40,
  players: [2, 4],
  pro: true,
  online: 'ok',
  card: {
    sub: 'Das Team schießt abwechselnd auf die Torwand mit drei Löchern. Einer schiebt das große Kissen davor und hält.',
    rules: (setup) => {
      const { total, need } = plan(setup);
      return [
        `<b>Team (${names(setup, teamOf(setup, 1))}):</b> Der Zielring wandert über die Wand. Drück, wenn er auf einem Loch ist. ${need} Tore aus ${total} Schüssen gewinnen.`,
        `<b>Allein (${setup.players[0].name}):</b> Schieb das Kissen vor das Loch, auf das geschossen wird. Weniger als ${need} Tore, und du gewinnst allein 10 Münzen.`,
        'Der Ring wird mit jedem Schuss schneller. Nach gut 2,5 Sekunden geht der Schuss von selbst los.',
      ];
    },
    controls: (_setup, me) => (me === 0
      ? { keys: `${KBD('←')} ${KBD('→')} oder ${KBD('A')} ${KBD('D')}: Kissen schieben`, touch: 'Daumen-Stick unten links: Kissen schieben' }
      : { keys: `${KBD('Leertaste')}: schießen, wenn du dran bist`, touch: 'Großer Knopf unten rechts: Schuss!' }),
    touch: (_setup, me) => (me === 0 ? { joy: true, buttons: [] } : { joy: false, buttons: [{ key: 'a', label: 'Schuss!' }] }),
  },
  init(ctx) {
    const { total, need } = plan(ctx.setup);
    const s: S = {
      shot: 0, ph: 'aim', t: 0, phase: 0, w: 1.6, aimX: 0, kx: 0, kv: 0, goals: 0, saves: 0, log: new Array(total).fill(0), pg: ctx.setup.players.map(() => 0), need,
      _ai: { ks: -1, lean: 0, e: -9, h: 0, kt: 0, react: 0.3, seen: 0 },
    };
    newShot(s, ctx.rng);
    return s;
  },
  step(s, dt, inputs, ctx) {
    if (s.ph === 'end') return;
    s.t += dt;
    // keeper: velocity follows the stick
    const kin = inputs[0];
    const want = clamp(kin?.x ?? 0, -1, 1) * KSPEED;
    s.kv += (want - s.kv) * (1 - Math.exp(-dt * 18));
    s.kx = clamp(s.kx + s.kv * dt, -KMAX, KMAX);
    if (Math.abs(s.kx) >= KMAX) s.kv = 0;
    if (s.ph === 'aim') {
      s.phase += s.w * dt;
      const who = shooterOf(s, ctx.setup);
      if (inputs[who]?.aP || s.t >= AIM_MAX) {
        s.aimX = cursorX(s.phase);
        s.ph = 'fly';
        s.t = 0;
        ctx.fx({ k: 'kick', p: who, x: s.aimX });
      }
    } else if (s.ph === 'fly') {
      if (s.t >= FLY) {
        const who = shooterOf(s, ctx.setup);
        let hole = -1;
        for (let h = 0; h < 3; h++) if (Math.abs(s.aimX - HOLES[h]) <= GOAL_TOL) hole = h;
        const blocked = Math.abs(s.aimX - s.kx) < BLOCK_HALF + 0.22;
        const res = blocked ? 2 : hole >= 0 ? 1 : 3;
        s.log[s.shot] = res;
        if (res === 1) { s.goals++; s.pg[who]++; }
        if (res === 2) s.saves++;
        s.ph = 'res';
        s.t = 0;
        ctx.fx({ k: res === 1 ? 'goal' : res === 2 ? 'save' : 'wall', p: who, x: s.aimX });
      }
    } else if (s.ph === 'res' && s.t >= RES) {
      const left = s.log.length - s.shot - 1;
      const decided = s.goals >= s.need || s.goals + left < s.need;
      if ((ctx.setup.mode === 'play' && decided) || left <= 0) {
        if (ctx.setup.mode !== 'play' && left <= 0) { s.shot = 0; s.goals = 0; s.saves = 0; s.log.fill(0); s.pg.fill(0); newShot(s, ctx.rng); return; }
        s.ph = 'end';
        ctx.fx({ k: 'end', v: s.goals >= s.need ? 1 : 0 });
        return;
      }
      s.shot++;
      newShot(s, ctx.rng);
      ctx.fx({ k: 'next', p: shooterOf(s, ctx.setup) });
    }
  },
  bot(s, i, ctx) {
    const lvl = ctx.setup.players[i].bot ?? 'normal';
    const a = s._ai;
    if (i === 0) {
      // keeper: per shot a little lean towards the ring (random amount), then reacts to the shot
      const [react, err, lean] = KEEP[lvl];
      if (a.ks !== s.shot) { a.ks = s.shot; a.lean = ctx.rng() * lean; a.react = react * (0.75 + ctx.rng() * 0.5); }
      let target = s.ph === 'aim' ? cursorX(s.phase) * a.lean : s.kx;
      if (s.ph === 'fly') {
        if (a.seen === 0) { a.seen = 1; a.kt = s.aimX + gaussR(ctx.rng) * err; }
        target = s.t >= a.react ? a.kt : s.kx;
      }
      const dx = target - s.kx;
      const o = bin(0);
      o.x = Math.abs(dx) < 0.08 ? 0 : clamp(dx * 3, -1, 1);
      return o;
    }
    if (s.ph !== 'aim' || shooterOf(s, ctx.setup) !== i || s.t < 0.45) return NO_INPUT;
    // timing error of this shot (drawn once; -9 = not drawn yet)
    if (a.e < -5) {
      a.e = gaussR(ctx.rng) * SHOOT_SD[lvl];
      // target hole: away from the keeper (a coin decides when he stands in the middle)
      a.h = ctx.rng() < 0.5 ? 0 : 2;
      if (ctx.rng() < 0.2) a.h = 1;
    }
    const e = a.e;
    // strong shooters switch when the keeper has moved onto their hole
    if (lvl !== 'leicht' && Math.abs(HOLES[a.h] - s.kx) < (lvl === 'stark' ? 1.6 : 1.1)) a.h = s.kx > 0 ? 0 : 2;
    const hx = HOLES[a.h];
    const c1 = cursorX(s.phase - s.w * e), c0 = cursorX(s.phase - s.w * (e + 1 / 60));
    if ((c0 - hx) * (c1 - hx) <= 0) {
      const o = bin(i);
      o.a = true; o.aP = true;
      return o;
    }
    return NO_INPUT;
  },
  over: (s) => s.ph === 'end',
  result(s, ctx) {
    const teamWins = s.goals >= s.need;
    const rows = ctx.setup.players.map((_, i) => {
      const solo = i === 0, win = solo ? !teamWins : teamWins;
      return { i, win, coins: win ? WIN_COINS : 0, score: (win ? 100 : 0) + (solo ? s.saves : s.pg[i]), note: solo ? `${s.saves} gehalten · ${s.goals} von ${s.need} Toren` : `${s.pg[i]} ${s.pg[i] === 1 ? 'Tor' : 'Tore'}` };
    });
    return { rows, title: teamWins ? 'Das Team trifft!' : `${ctx.setup.players[0].name} ${verb(ctx.setup.players[0].name, 'hält', 'hältst')} dicht!` };
  },
  score: (s, i) => (i === 0 ? { v: `${s.saves} gehalten` } : { v: `${s.pg[i] ?? 0} ${s.pg[i] === 1 ? 'Tor' : 'Tore'}` }),
  view(setup) {
    const scene = new THREE.Scene();
    scene.background = skyTex(['#1a8cff', '#8fd8ff', '#e9fff4']);
    scene.fog = new THREE.Fog('#d8f6ff', 50, 120);
    const L = mgLights(scene, 14);
    void L;
    const cam = new THREE.PerspectiveCamera(42, 1, 0.5, 300);
    const { total, need } = plan(setup);
    const st = new Batch(), gl = new Batch();
    // pitch with stripes
    st.add(BOX, '#1f8f6a', 0, -0.5, 0, 0, 0, 0, 30, 1, 30);
    for (let k = -7; k <= 7; k++) st.add(BOX, k % 2 ? '#2fb07f' : '#28a374', 0, 0.005, k * 2, 0, 0, 0, 30, 0.02, 2);
    st.add(BOX, '#ffffff', 0, 0.03, SPOT_Z, 0, 0, 0, 0.9, 0.02, 0.9);
    st.add(BOX, '#ffffff', 0, 0.03, -3.4, 0, 0, 0, 12, 0.02, 0.12);
    // the wall with three square holes
    const W2 = 5.6, H = 3.1, y0 = HOLE_Y - HOLE_H, y1 = HOLE_Y + HOLE_H, wc = '#ff4fb0';
    st.add(BOX, wc, 0, y0 / 2, WALL_Z, 0, 0, 0, W2 * 2, y0, 0.4);
    st.add(BOX, wc, 0, (y1 + H) / 2, WALL_Z, 0, 0, 0, W2 * 2, H - y1, 0.4);
    const xs = [-W2, HOLES[0] - HOLE_H, HOLES[0] + HOLE_H, HOLES[1] - HOLE_H, HOLES[1] + HOLE_H, HOLES[2] - HOLE_H, HOLES[2] + HOLE_H, W2];
    for (let k = 0; k < 8; k += 2) st.add(BOX, wc, (xs[k] + xs[k + 1]) / 2, HOLE_Y, WALL_Z, 0, 0, 0, xs[k + 1] - xs[k], y1 - y0, 0.4);
    for (const hx of HOLES) {
      for (const sy of [-1, 1]) gl.add(BOX, '#dcff1f', hx, HOLE_Y + sy * (HOLE_H + 0.05), WALL_Z + 0.22, 0, 0, 0, HOLE_H * 2 + 0.2, 0.1, 0.06);
      for (const sx of [-1, 1]) gl.add(BOX, '#dcff1f', hx + sx * (HOLE_H + 0.05), HOLE_Y, WALL_Z + 0.22, 0, 0, 0, 0.1, HOLE_H * 2 + 0.2, 0.06);
    }
    for (let x = -5; x <= 5; x += 1) gl.add(SPH_LO, x % 2 ? '#ffffff' : '#ffd23f', x, H + 0.12, WALL_Z, 0, 0, 0, 0.14);
    st.add(BOX, '#1a0b33', 0, 1.6, WALL_Z - 1.2, 0, 0, 0, W2 * 2 + 1, 3.6, 0.3);
    for (const sx of [-1, 1]) { st.add(CYL8, '#2a1258', sx * (W2 + 0.3), 2.2, WALL_Z, 0, 0, 0, 0.18, 4.4, 0.18); }
    // keeper rail
    st.add(BOX, '#2a1258', 0, 0.06, BLOCK_Z, 0, 0, 0, KMAX * 2 + BLOCK_HALF * 2 + 0.4, 0.12, 0.5);
    // scoreboard above the wall
    st.add(BOX, '#1a0b33', 0, H + 1.0, WALL_Z - 0.1, 0, 0, 0, 6.2, 1.3, 0.3);
    scene.add(st.mesh(), gl.mesh(GLOW, false, false));
    const seg = new Seg(1, 0.8, '#dcff1f');
    seg.mesh.position.set(-0.4, H + 1.05, WALL_Z + 0.08);
    scene.add(seg.mesh);
    const lblL = signMesh('TORE', 1.9, 0.6, '#ffffff', '', '');
    lblL.position.set(-1.9, H + 1.05, WALL_Z + 0.1);
    const lblR = signMesh(`VON ${need}`, 1.9, 0.6, '#ffffff', '', '');
    lblR.position.set(1.5, H + 1.05, WALL_Z + 0.1);
    scene.add(lblL, lblR);
    // shot log: small balls under the scoreboard
    const logIm = new THREE.InstancedMesh(SPH, new THREE.MeshBasicMaterial({ color: '#ffffff' }), total);
    const d = new THREE.Object3D();
    for (let k = 0; k < total; k++) { d.position.set((k - (total - 1) / 2) * 0.5, H + 0.42, WALL_Z + 0.25); d.scale.setScalar(0.17); d.updateMatrix(); logIm.setMatrixAt(k, d.matrix); }
    scene.add(logIm);
    const LOGC = [new THREE.Color('#ffffff'), new THREE.Color('#9dff3a'), new THREE.Color('#ff3d6e'), new THREE.Color('#7a6a9a')];
    // keeper cushion
    const cushion = new THREE.Group();
    const cb = new Batch();
    cb.add(BOX, setup.players[0].color, 0, 1.15, 0, 0, 0, 0, BLOCK_HALF * 2, 2.0, 0.55);
    cb.add(BOX, '#ffffff', 0, 1.15, 0.29, 0, 0, 0, BLOCK_HALF * 1.4, 1.4, 0.02);
    for (const sx of [-1, 1]) cb.add(CYL, '#1a0b33', sx * 0.7, 0.12, 0, Math.PI / 2, 0, 0, 0.12, 0.6, 0.12);
    cushion.add(cb.mesh());
    cushion.position.z = BLOCK_Z;
    scene.add(cushion);
    // aim ring, ball, its shadow
    const aim = new THREE.Mesh(TOR, new THREE.MeshBasicMaterial({ color: '#dcff1f' }));
    aim.scale.setScalar(0.5);
    const aimDot = new THREE.Mesh(SPH_LO, aim.material);
    aimDot.scale.setScalar(0.09);
    scene.add(aim, aimDot);
    const ballB = new Batch();
    ballB.add(SPH, '#ffffff', 0, 0, 0, 0, 0, 0, 1);
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; ballB.add(SPH_LO, '#1a0b33', Math.cos(a) * 0.86, Math.sin(a) * 0.5, 0.0 + Math.sin(a) * 0.3, 0, 0, 0, 0.32, 0.32, 0.32); }
    const ball = new THREE.Mesh(ballB.geometry(), toon('#ffffff', { vertexColors: true }));
    ball.castShadow = true;
    ball.scale.setScalar(0.3);
    scene.add(ball);
    const figs = mgFigures(scene, setup, 1.0);
    figs[0].root.scale.setScalar(0.85);
    const sparks = new Sparks(scene, 140, 0.18);
    const rings = new Rings(scene, 4, true);
    const sh = shooters(setup);
    let cele: boolean[] | null = null;
    return {
      scene, cam,
      frame(s, dt, t) {
        cushion.position.x = s.kx;
        cushion.rotation.z = -s.kv * 0.012;
        const fk = figs[0];
        fk.root.position.set(s.kx, 2.15, BLOCK_Z);
        if (!cele) { fk.yawT = -s.kv * 0.05; fk.idle = Math.abs(s.kv) < 0.5; if (!fk.idle && !fk.busy) { const q = Math.sin(t * 22) * 0.05; fk.sq.scale.set(1 + q, 1 - q, 1 + q); } }
        // aim ring
        const cx = cursorX(s.phase);
        aim.visible = aimDot.visible = s.ph === 'aim';
        aim.position.set(cx, HOLE_Y, WALL_Z + 0.35);
        aimDot.position.copy(aim.position);
        let onHole = false;
        for (const h of HOLES) if (Math.abs(cx - h) <= GOAL_TOL) onHole = true;
        aim.scale.setScalar(onHole ? 0.62 + Math.sin(t * 20) * 0.03 : 0.5);
        // ball
        const res = s.log[s.shot] ?? 0;
        if (s.ph === 'aim') ball.position.set(0, 0.3, SPOT_Z);
        else if (s.ph === 'fly') {
          const u = Math.min(1, s.t / FLY);
          ball.position.set(lerp(0, s.aimX, u), lerp(0.3, HOLE_Y, u) + Math.sin(u * Math.PI) * 0.9, lerp(SPOT_Z, WALL_Z, u));
          ball.rotation.x -= dt * 20;
        } else if (s.ph === 'res') {
          const u = s.t;
          if (res === 1) ball.position.set(s.aimX, HOLE_Y - u * 0.8, WALL_Z - 0.6 - u * 1.2);
          else { const zb = (res === 2 ? BLOCK_Z + 0.35 : WALL_Z + 0.3) + u * 5; ball.position.set(s.aimX + (s.aimX - s.kx) * u * 1.5, Math.max(0.3, HOLE_Y + u * 3 - u * u * 9), zb); }
        }
        ball.visible = s.ph !== 'end' && !(s.ph === 'res' && s.t > 0.9);
        // shooters: the current one at the spot, the others wait at the side
        const cur = s.ph === 'end' ? -1 : sh[s.shot % sh.length];
        let wq = 0;
        for (const i of sh) {
          const f = figs[i];
          if (cele) continue;
          if (i === cur) {
            f.root.position.set(-0.75, 0, SPOT_Z + 0.9);
            f.yawT = Math.PI + 0.5;
          } else {
            f.root.position.set(-5.6 - wq * 1.2, 0, 1.2 + wq * 1.1);
            f.yawT = Math.PI * 0.8;
            wq++;
          }
        }
        for (let k = 0; k < s.log.length; k++) logIm.setColorAt(k, LOGC[s.log[k]] ?? LOGC[0]);
        if (logIm.instanceColor) logIm.instanceColor.needsUpdate = true;
        seg.num(s.goals, 0, s.goals >= s.need ? '#9dff3a' : '#dcff1f');
        if (cele) celebrate(figs, cele, t, cam);
        for (let q = 0; q < figs.length; q++) updateFigure(figs[q], dt, t);
        sparks.update(dt);
        rings.update(dt);
        const dist = fitDist(cam, 14.5, 13);
        cam.position.set(0, 2.0 + dist * 0.55, -1.4 + dist * 0.83);
        cam.lookAt(0, 2.0, -1.4);
      },
      fx(e, me) {
        if (e.k === 'kick') { sfx.hit(); void squashLand(figs[e.p!], 0.3); }
        else if (e.k === 'goal') {
          if (me !== 0) sfx.coin(); else sfx.lose();
          sfx.fanfare();
          sparks.emit(e.x!, HOLE_Y, WALL_Z + 0.3, '#9dff3a', 28, 5, 6);
          rings.emit(e.x!, HOLE_Y, WALL_Z + 0.3, '#9dff3a', 3);
          floatText(new THREE.Vector3(e.x!, HOLE_Y + 2.4, WALL_Z), 'Tor!', '#9dff3a', scene);
        } else if (e.k === 'save') {
          sfx.bonk();
          void squashLand(figs[0], 0.4);
          sparks.emit(e.x!, HOLE_Y, BLOCK_Z + 0.4, setup.players[0].color, 20, 4, 5);
          floatText(new THREE.Vector3(e.x!, HOLE_Y + 2.6, BLOCK_Z), 'Gehalten!', '#ff8fb0', scene);
        } else if (e.k === 'wall') {
          sfx.land();
          floatText(new THREE.Vector3(e.x!, HOLE_Y + 2.4, WALL_Z), 'Daneben!', '#ffffff', scene);
        } else if (e.k === 'next') sfx.pop();
        else if (e.k === 'end') sfx.whistle();
      },
      celebrate(w) { cele = w; if (!w) unCele(figs); },
    };
  },
};

export default torwand;
