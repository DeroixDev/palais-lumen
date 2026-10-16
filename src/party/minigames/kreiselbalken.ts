// Kreiselbalken (1 gegen 3): one player in the middle steers a spinning beam (reverse, turbo),
// the others hop over it. After 10 seconds a second arm joins. Also runs as 1 gegen 2 / 1 gegen 1.

import { sfx } from '../sfx';
import { TAU, clamp, gauss, wrapA } from '../util';
import { celebrate, squashLand, updateFigure } from '../view3d/figures';
import { BOX, Batch, CYL, GLOW, OUT, SPH, SPH_LO, THREE, TOR_THIN, VC, skyTex, toon } from '../view3d/kit';
import { floatText } from '../view3d/stage';
import { KBD, arenaCam, cloudsBelow, floatingArena, mgFigures, mgLights, names, teamOf } from './common';
import { NO_INPUT, WIN_COINS, type MgCtx, type MinigameDef, type MgSetup } from './types';

const R = 8.8, D = 25, TR = 5.4, JUMP_V = 7.4;
const SPOTS = [Math.PI / 2, Math.PI / 2 + 2.094, Math.PI / 2 - 2.094];

interface Pl { a: number; y: number; vy: number; out: boolean; outT: number; cd: number; prev: [number, number]; fx: number; fy: number; fz: number; vx: number; vyf: number; vz: number }
interface S {
  ang: number;
  dir: number;
  dirC: number;
  energy: number;
  turbo: boolean;
  arm2: number;
  revCd: number;
  hits: number;
  pl: Pl[];
  _ai: { rev: number; turbo: number; react: number[] };
}

/** Index 0 is the single player (team 0); everybody else hops. */
const team = (s: S) => s.pl.map((_, i) => i).filter((i) => i > 0);
const baseW = (time: number) => 1.6 + 2.1 * Math.min(1, time / D);
const SOLO_SKILL = { leicht: 0.6, normal: 1, stark: 1.25 } as const;
const REACT = { leicht: [0.36, 0.07], normal: [0.31, 0.045], stark: [0.29, 0.03] } as const;

function soloIdx(setup: MgSetup) { return Math.max(0, setup.players.findIndex((p) => p.team === 0)); }

const kreiselbalken: MinigameDef<S> = {
  id: 'kreiselbalken',
  name: 'Kreiselbalken',
  type: '1v3',
  seconds: D,
  players: [2, 4],
  pro: true,
  online: 'gut',
  card: {
    sub: 'Einer steht in der Mitte und lenkt den Kreiselbalken. Die anderen hüpfen drüber, bis die Zeit um ist. Ab 10 Sekunden kommt ein zweiter Balken dazu.',
    rules: (setup) => [
      `<b>Allein (${setup.players[soloIdx(setup)].name}):</b> Balken umkehren und Turbo geben. Wer alle erwischt, gewinnt allein 10 Münzen.`,
      `<b>Team (${names(setup, teamOf(setup, 1))}):</b> rechtzeitig hüpfen. Ist am Ende noch jemand drin, bekommt das ganze Team je 10 Münzen.`,
    ],
    controls: (setup, me) => (me === soloIdx(setup)
      ? { keys: `${KBD('←')} ${KBD('→')} Balken umkehren<br>${KBD('Leertaste')} halten: Turbo`, touch: 'Knöpfe unten rechts: Umkehren, Turbo halten' }
      : { keys: `${KBD('Leertaste')} oder ${KBD('↑')} hüpfen`, touch: 'Großer Knopf unten rechts: Hüpfen' }),
    touch: (setup, me) => (me === soloIdx(setup)
      ? { joy: false, buttons: [{ key: 'l', label: 'Um­kehren', small: true }, { key: 'a', label: 'Turbo' }] }
      : { joy: false, buttons: [{ key: 'a', label: 'Hüpfen' }] }),
    meter: (setup, me) => (me === soloIdx(setup) ? 'Turbo' : null),
  },
  init(ctx) {
    const n = ctx.setup.players.length;
    const ang = -Math.PI / 2;
    return {
      ang, dir: 1, dirC: 1, energy: 1, turbo: false, arm2: 0, revCd: 0, hits: 0,
      pl: ctx.setup.players.map((_, i) => {
        const a = i === 0 ? 0 : SPOTS[(i - 1) % 3] + (n === 2 ? 0 : 0);
        return { a, y: 0, vy: 0, out: false, outT: 0, cd: 0, prev: [wrapA(a - ang), wrapA(a - ang - Math.PI)] as [number, number], fx: 0, fy: 0, fz: 0, vx: 0, vyf: 0, vz: 0 };
      }),
      _ai: { rev: 1.6 + ctx.rng() * 1.4, turbo: 0, react: ctx.setup.players.map(() => 0.24 + ctx.rng() * 0.14) },
    };
  },
  step(s, dt, inputs, ctx) {
    const time = ctx.time, mode = ctx.setup.mode;
    s.revCd -= dt;
    const solo = inputs[0];
    if ((solo.lP || solo.rP || solo.bP) && s.revCd <= 0) { s.dir = -s.dir; s.revCd = 1.2; ctx.fx({ k: 'rev' }); }
    s.turbo = solo.a && s.energy > 0.02;
    s.energy = clamp(s.energy + (s.turbo ? -0.55 : 0.22) * dt, 0, 1);
    s.dirC += (s.dir - s.dirC) * (1 - Math.exp(-dt * 9));
    const w = baseW(time) * s.dirC * (s.turbo ? 1.5 : 1);
    s.ang += w * dt;
    if (time > 10 && s.arm2 < 1) { if (s.arm2 === 0) ctx.fx({ k: 'arm2' }); s.arm2 = Math.min(1, s.arm2 + dt * 1.5); }
    for (const id of team(s)) {
      const p = s.pl[id];
      if (p.out) {
        p.vyf -= 22 * dt;
        p.fx += p.vx * dt; p.fy += p.vyf * dt; p.fz += p.vz * dt;
        continue;
      }
      p.cd -= dt;
      if (inputs[id].aP && p.y <= 0.001 && p.vy === 0) { p.vy = JUMP_V; ctx.fx({ k: 'jump', p: id }); }
      if (p.vy !== 0 || p.y > 0) { p.vy -= 22 * dt; p.y += p.vy * dt; if (p.y <= 0) { p.y = 0; p.vy = 0; ctx.fx({ k: 'land', p: id }); } }
      [s.ang, s.ang + Math.PI].forEach((aa, j) => {
        const dd = wrapA(p.a - aa);
        if (Math.sign(dd) !== Math.sign(p.prev[j]) && Math.abs(dd) < 1 && Math.abs(p.prev[j]) < 1 && p.y < 0.72 && p.cd <= 0 && (j === 0 || s.arm2 > 0.8)) {
          if (mode !== 'play') { p.cd = 0.4; ctx.fx({ k: 'ouch', p: id }); }
          else {
            p.out = true; p.outT = time; s.hits++;
            const sg = Math.sign(s.dirC) || 1;
            p.fx = Math.cos(p.a) * TR; p.fy = p.y; p.fz = Math.sin(p.a) * TR;
            p.vx = Math.cos(p.a) * 6 + Math.cos(p.a + Math.PI / 2) * 4 * sg; p.vyf = 10; p.vz = Math.sin(p.a) * 6 + Math.sin(p.a + Math.PI / 2) * 4 * sg;
            ctx.fx({ k: 'hit', p: id });
          }
        }
        p.prev[j] = dd;
      });
    }
  },
  bot(s, i, ctx) {
    const lvl = ctx.setup.players[i].bot ?? 'normal';
    if (i === 0) {
      const ai = s._ai;
      ai.rev -= 1 / 60;
      ai.turbo -= 1 / 60;
      let rev = false;
      if (ai.rev <= 0 && s.revCd <= 0) { rev = true; ai.rev = (2 + ctx.rng() * 2) / SOLO_SKILL[lvl]; }
      if (ai.turbo <= 0 && s.energy > 0.5 && ctx.rng() < (1 / 60) * 0.8 * SOLO_SKILL[lvl]) ai.turbo = 0.35 + ctx.rng() * 0.35;
      return { ...NO_INPUT, lP: rev, a: ai.turbo > 0 };
    }
    const p = s.pl[i];
    if (p.out || p.y > 0 || p.vy !== 0) return NO_INPUT;
    const w = baseW(ctx.time) * s.dirC * (s.turbo ? 1.5 : 1);
    let tmin = 99;
    for (const aa of s.arm2 > 0.5 ? [s.ang, s.ang + Math.PI] : [s.ang]) { const dd = wrapA(p.a - aa); if (dd * w > 0) tmin = Math.min(tmin, Math.abs(dd / w)); }
    if (tmin < s._ai.react[i]) {
      const [m, sd] = REACT[lvl];
      s._ai.react[i] = clamp(m + gauss() * (sd + 0.04 * Math.min(1, ctx.time / D)), 0.08, 0.62);
      return { ...NO_INPUT, a: true, aP: true };
    }
    return NO_INPUT;
  },
  over: (s, ctx) => ctx.setup.mode === 'play' && team(s).every((i) => s.pl[i].out),
  result(s, ctx) {
    const alive = team(s).filter((i) => !s.pl[i].out);
    const teamWins = alive.length > 0;
    const solo = ctx.setup.players[0];
    const rows = s.pl.map((p, i) => {
      const isSolo = i === 0, win = isSolo ? !teamWins : teamWins;
      return { i, win, coins: win ? WIN_COINS : 0, score: (win ? 100 : 0) + (isSolo ? s.hits : p.out ? p.outT : 50), note: isSolo ? `Allein am Balken · ${s.hits} erwischt` : p.out ? `erwischt nach ${p.outT.toFixed(1).replace('.', ',')} s` : 'bis zum Schluss gehüpft' };
    });
    return { rows, title: teamWins ? 'Das Team gewinnt!' : `${solo.name} gewinnt allein!` };
  },
  score: (s, i) => (i === 0 ? { v: `${s.hits} ✕` } : { v: s.pl[i]?.out ? 'raus' : 'drin', out: !!s.pl[i]?.out }),
  view(setup) {
    const scene = new THREE.Scene();
    scene.background = skyTex(['#ff8a5c', '#ffc27a', '#fff0d6']);
    scene.fog = new THREE.Fog('#fff0d6', 45, 110);
    mgLights(scene, 12);
    const cam = new THREE.PerspectiveCamera(42, 1, 0.5, 300);
    const b = new Batch(), g = new Batch();
    floatingArena(b, R, [[1, '#43c6ff'], [0.69, '#fff3c4'], [0.55, '#43c6ff'], [0.2, '#2b8fe0']], '#2a6fd0');
    for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; g.add(SPH_LO, k % 2 ? '#fff3a6' : '#ff7ad0', Math.cos(a) * (R + 0.1), 0.25, Math.sin(a) * (R + 0.1), 0, 0, 0, 0.24); }
    g.add(TOR_THIN, '#ff4fb0', 0, 0.02, 0, Math.PI / 2, 0, 0, R + 0.1);
    b.add(CYL, '#ff5fae', 0, 0.8, 0, 0, 0, 0, 1.35, 1.6, 1.35); b.add(CYL, '#ffd23f', 0, 1.65, 0, 0, 0, 0, 1.55, 0.2, 1.55);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; b.add(BOX, '#ffffff', Math.cos(a) * 1.36, 0.8, Math.sin(a) * 1.36, 0, -a, 0, 0.05, 1.2, 0.3); }
    scene.add(b.mesh(), g.mesh(GLOW, false, false));
    cloudsBelow(scene);
    const armB = new Batch();
    for (let k = 0; k < 9; k++) armB.add(BOX, k % 2 ? '#ffffff' : '#ff3d6e', 1.75 + k * 0.8, 0, 0, 0, 0, 0, 0.8, 0.5, 0.5);
    armB.add(SPH, '#ffd23f', 8.7, 0, 0, 0, 0, 0, 0.45); armB.add(CYL, '#1a0b33', 1.5, 0, 0, 0, 0, Math.PI / 2, 0.35, 0.3, 0.35);
    const armGeo = armB.geometry(), armOut = new THREE.BoxGeometry(7.4, 0.62, 0.62).translate(5.3, 0, 0);
    const rotor = new THREE.Group();
    rotor.position.y = 0.55;
    scene.add(rotor);
    const arms = [0, 1].map((k) => { const a = new THREE.Group(); const m = new THREE.Mesh(armGeo, VC); m.castShadow = true; a.add(m, new THREE.Mesh(armOut, OUT)); a.rotation.y = k * Math.PI; rotor.add(a); return a; });
    const figs = mgFigures(scene, setup);
    const pads = setup.players.slice(1).map((p, k) => { const m = new THREE.Mesh(CYL, toon(p.color)); m.scale.set(0.95, 0.06, 0.95); const a = SPOTS[k % 3]; m.position.set(Math.cos(a) * TR, 0.03, Math.sin(a) * TR); m.receiveShadow = true; scene.add(m); return m; });
    void pads;
    let cele: boolean[] | null = null;
    return {
      scene, cam,
      frame(s, dt, t) {
        rotor.rotation.y = -s.ang;
        arms[1].scale.setScalar(Math.max(0.0001, s.arm2));
        const fs = figs[0];
        fs.root.position.set(0, 1.75, 0);
        fs.yawT = Math.atan2(Math.cos(s.ang), Math.sin(s.ang));
        if (s.turbo) { const q = Math.sin(t * 30) * 0.06; fs.sq.scale.set(1 + q, 1 - q, 1 + q); fs.idle = false; } else fs.idle = true;
        for (let i = 1; i < figs.length; i++) {
          const p = s.pl[i], f = figs[i];
          if (!p) continue;
          if (p.out) {
            f.root.position.set(p.fx, p.fy, p.fz);
            f.root.rotation.z += dt * 9;
            f.root.rotation.x += dt * 5;
            f.root.visible = p.fy > -14;
            continue;
          }
          f.root.visible = true;
          f.root.rotation.set(0, f.root.rotation.y, 0);
          f.root.position.set(Math.cos(p.a) * TR, 0, Math.sin(p.a) * TR);
          f.hop.position.y = p.y;
          if (p.vy !== 0) { const q = clamp(p.vy / JUMP_V, -1, 1) * 0.12; f.sq.scale.set(1 - q, 1 + q, 1 - q); f.busy = true; }
          else if (f.busy && p.y === 0 && f.tok === 0) f.busy = false;
          if (!cele) f.yawT = Math.atan2(-Math.cos(p.a), -Math.sin(p.a));
        }
        if (cele) celebrate(figs, cele, t, cam);
        figs.forEach((f) => updateFigure(f, dt, t));
        arenaCam(cam, 10.2, 0.86);
        const tf = document.getElementById('turboFill');
        if (tf) tf.style.transform = `scaleX(${s.energy.toFixed(3)})`;
      },
      fx(e, me) {
        if (e.k === 'rev') sfx.whoosh();
        else if (e.k === 'arm2') { sfx.whistle(); floatText(new THREE.Vector3(0, 3.4, 0), 'Zweiter Balken!', '#ffe14a', scene); }
        else if (e.k === 'jump') { if (e.p === me || me < 0) sfx.jump(); }
        else if (e.k === 'land') { const f = figs[e.p!]; if (f) { f.tok = 0; f.busy = false; void squashLand(f, 0.22); } }
        else if (e.k === 'ouch') { sfx.bonk(); const f = figs[e.p!]; void squashLand(f, 0.4); if (e.p === me) floatText(f.root.position.clone().setY(2.4), 'Autsch!', '#ff8fb0', scene); }
        else if (e.k === 'hit') { sfx.bonk(); floatText(figs[e.p!].root.position.clone().setY(2.6), 'Erwischt!', '#ff8fb0', scene); }
      },
      celebrate(w) { cele = w; if (!w) figs.forEach((f) => { f.busy = false; f.tok = 0; f.hop.position.y = 0; f.sq.scale.set(1, 1, 1); f.root.rotation.set(0, 0, 0); }); },
    };
  },
};

/** The team-hop input also accepts ↑/W (mapped to A by the framework). */
export default kreiselbalken;
export type { MgCtx };
