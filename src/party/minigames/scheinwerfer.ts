// Scheinwerfer (1 gegen 3): night in the crate yard. The single player sits up in the lamp tower
// and sweeps a spotlight over the yard (with a short wide flash). The team runs around and
// collects glow-worms together; behind a crate (in its shadow) the light cannot see you. Stay in
// the light too long and you are caught. The team wins with enough glow-worms, the single
// player wins by catching everybody or when time runs out first. Also runs as 1 gegen 2 / 1 gegen 1.

import { sfx } from '../sfx';
import { TAU, clamp } from '../util';
import { celebrate, squashLand, updateFigure } from '../view3d/figures';
import { BOX, Batch, CYL8, FONT, GLOW, SPH, SPH_LO, THREE, skyTex } from '../view3d/kit';
import { VH, VW, floatText } from '../view3d/stage';
import { KBD, mgFigures, mgLights, names, teamOf } from './common';
import { Sparks, runFig, uncelebrate } from './mgkit-a';
import { NO_INPUT, WIN_COINS, type MgCtx, type MgSetup, type MinigameDef } from './types';

const D = 30;
const XW = 9, Z0 = -6, Z1 = 6.5;
const TX = 0, TZ = -9.6, TH = 4.2;
const LR = 1.75, FLASH_K = 1.6, FLASH_T = 0.7, FLASH_E = 0.5;
const LIGHT_V = 5.2, RUN_V = 6, CATCH = 0.7;
const CR = 0.95, SHADOW_LEN = 4.6;
const CRATES: [number, number][] = [[-5.6, -2.6], [0, -2.2], [5.6, -2.6], [-3, 2], [3, 2], [-6.6, 4.4], [6.6, 4.4], [0, 4]];

interface Pl { x: number; z: number; vx: number; vz: number; exp: number; out: boolean; outT: number; got: number; hid: boolean; stun: number }
interface Fly { id: number; x: number; z: number; t: number }
interface S {
  lx: number; lz: number; lvx: number; lvz: number;
  flash: number; energy: number;
  pl: Pl[];
  fl: Fly[];
  got: number; goal: number; caught: number;
  nextId: number; spawnT: number; doneT: number;
  _ai: { rt: number; tx: number; tz: number; tgt: number; speed: number; lead: number; aware: number; react: number }[];
}

const SOLO = { leicht: [0.72, 0.1, 0.4], normal: [0.88, 0.25, 0.25], stark: [1, 0.4, 0.14] } as const;
const TEAM = { leicht: [0.86, 0, 0.36], normal: [0.95, 0.25, 0.22], stark: [1, 0.4, 0.12] } as const;

/** Is (x, z) in the shadow of a crate (as seen from the lamp tower)? */
function hidden(x: number, z: number) {
  const dx = x - TX, dz = z - TZ, L = Math.hypot(dx, dz);
  for (const [cx, cz] of CRATES) {
    const ex = cx - TX, ez = cz - TZ, cl = Math.hypot(ex, ez);
    if (L < cl + 0.3 || L > cl + SHADOW_LEN + CR * 0.6) continue;
    // distance from the crate centre to the ray tower→player
    const along = (ex * dx + ez * dz) / L;
    const perp = Math.sqrt(Math.max(0, cl * cl - along * along));
    if (perp < CR * 0.92) return true;
  }
  return false;
}
const blocked = (x: number, z: number, r: number) => CRATES.some(([cx, cz]) => Math.abs(x - cx) < CR + r && Math.abs(z - cz) < CR + r);
const soloIdx = (setup: MgSetup) => Math.max(0, setup.players.findIndex((p) => p.team === 0));
/** Glow-worms the team needs, by team size. */
const goalFor = (t: number) => [3, 3, 7, 12][clamp(t, 0, 3)];
const lightR = (s: S) => LR * (s.flash > 0 ? FLASH_K : 1);

function spawnFly(s: S, ctx: MgCtx) {
  for (let k = 0; k < 20; k++) {
    const x = (ctx.rng() * 2 - 1) * (XW - 1), z = Z0 + 0.8 + ctx.rng() * (Z1 - Z0 - 1.6);
    if (blocked(x, z, 0.5) || Math.hypot(x - s.lx, z - s.lz) < 3.5) continue;
    if (s.fl.some((f) => Math.hypot(f.x - x, f.z - z) < 3)) continue;
    s.fl.push({ id: s.nextId++, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, t: 0 });
    return;
  }
}

const segDist = (ax: number, az: number, bx: number, bz: number, px: number, pz: number) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const k = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
  return Math.hypot(ax + dx * k - px, az + dz * k - pz);
};

function teamThink(s: S, i: number, ctx: MgCtx) {
  const ai = s._ai[i], me = s.pl[i];
  const r = lightR(s) + 0.2;
  // where the light will be in a moment (good bots look ahead)
  const lx = s.lx + s.lvx * ai.lead, lz = s.lz + s.lvz * ai.lead;
  const near = Math.hypot(me.x - lx, me.z - lz) < r + 1.2;
  let bx = me.x, bz = me.z, bs = -1e9;
  const consider = (cx: number, cz: number, value: number) => {
    if (cx < -XW + 0.5 || cx > XW - 0.5 || cz < Z0 + 0.5 || cz > Z1 - 0.5 || blocked(cx, cz, 0.45)) return;
    const hid = hidden(cx, cz);
    let sc = value - Math.hypot(cx - me.x, cz - me.z) * 0.18;
    const dl = Math.hypot(cx - lx, cz - lz);
    if (!hid) { if (dl < r + 0.5) sc -= 14; else sc -= Math.max(0, r + 2.2 - dl) * 1.2; }
    else if (near) sc += 3;
    if (segDist(me.x, me.z, cx, cz, lx, lz) < r && !hid) sc -= 9;
    // walls are traps
    sc -= Math.max(0, 1.6 - (XW - Math.abs(cx))) * 1.2 + Math.max(0, 1.6 - Math.min(cz - Z0, Z1 - cz)) * 1.2;
    sc += (ctx.rng() - 0.5) * 0.6;
    if (sc > bs) { bs = sc; bx = cx; bz = cz; }
  };
  for (const f of s.fl) {
    let v = near ? 4 : 9;
    for (let j = 1; j < s.pl.length; j++) if (j !== i && !s.pl[j].out && Math.hypot(f.x - s.pl[j].x, f.z - s.pl[j].z) < Math.hypot(f.x - me.x, f.z - me.z) - 1) v -= 4;
    consider(f.x, f.z, v);
  }
  for (const [cx, cz] of CRATES) {
    const ex = cx - TX, ez = cz - TZ, cl = Math.hypot(ex, ez);
    consider(cx + (ex / cl) * 1.7, cz + (ez / cl) * 1.7, 0.5);
  }
  for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; for (const d of [1.6, 3.2]) consider(me.x + Math.cos(a) * d, me.z + Math.sin(a) * d, 0); }
  ai.tx = bx; ai.tz = bz;
}

const scheinwerfer: MinigameDef<S> = {
  id: 'scheinwerfer',
  name: 'Scheinwerfer',
  type: '1v3',
  seconds: D,
  players: [2, 4],
  pro: true,
  online: 'ok',
  card: {
    sub: 'Einer sitzt im Lampenturm und sucht mit dem Scheinwerfer. Die anderen sammeln Glühwürmchen und verstecken sich im Schatten der Kisten.',
    rules: (setup) => {
      const t = teamOf(setup, 1).length || 1;
      return [
        `<b>Team (${names(setup, teamOf(setup, 1))}):</b> Sammelt zusammen ${goalFor(t)} Glühwürmchen. Im dunklen Kistenschatten sieht euch das Licht nicht. Wer zu lange im Licht steht, ist erwischt.`,
        `<b>Allein (${setup.players[soloIdx(setup)].name}):</b> Licht lenken, mit dem Blitz kurz alles weit ausleuchten. Erwischt alle, oder haltet sie bis zum Schluss auf.`,
        'Die Gewinnerseite bekommt je 10 Münzen.',
      ];
    },
    controls: (setup, me) => (me === soloIdx(setup)
      ? { keys: `${KBD('W')} ${KBD('A')} ${KBD('S')} ${KBD('D')} oder Pfeile: Licht lenken<br>${KBD('Shift')} oder ${KBD('X')}: Blitz`, touch: 'Daumen-Stick: Licht lenken · Knopf: Blitz' }
      : { keys: `${KBD('W')} ${KBD('A')} ${KBD('S')} ${KBD('D')} oder Pfeile: laufen`, touch: 'Daumen-Stick unten links: laufen' }),
    touch: (setup, me) => (me === soloIdx(setup) ? { joy: true, buttons: [{ key: 'b', label: 'Blitz' }] } : { joy: true, buttons: [] }),
    meter: (setup, me) => (me === soloIdx(setup) ? 'Blitz' : null),
  },
  init(ctx) {
    const n = ctx.setup.players.length, t = n - 1;
    const s: S = {
      lx: 0, lz: Z0 + 1, lvx: 0, lvz: 0, flash: 0, energy: 1,
      pl: ctx.setup.players.map((_, i) => {
        const x = i === 0 ? 0 : (i - (n) / 2) * 3.2 + (n === 2 ? 1.6 : 0);
        return { x: i === 0 ? TX : x, z: i === 0 ? TZ : Z1 - 0.5, vx: 0, vz: 0, exp: 0, out: false, outT: 0, got: 0, hid: false, stun: 0 };
      }),
      fl: [], got: 0, goal: goalFor(t), caught: 0, nextId: 1, spawnT: 0, doneT: -1,
      _ai: ctx.setup.players.map((p, i) => {
        const lv = p.bot ?? 'normal';
        if (i === 0) { const [speed, lead, react] = SOLO[lv]; return { rt: 0, tx: 0, tz: 0, tgt: -1, speed, lead, aware: 0, react }; }
        const [speed, lead, react] = TEAM[lv];
        return { rt: ctx.rng() * 0.2, tx: 0, tz: 0, tgt: -1, speed, lead, aware: 0, react };
      }),
    };
    for (let k = 0; k < Math.min(3, t + 1); k++) spawnFly(s, ctx);
    return s;
  },
  step(s, dt, inputs, ctx) {
    const play = ctx.setup.mode === 'play', time = ctx.time;
    if (s.doneT >= 0) return;
    // the light
    const si = inputs[0];
    let ix = si.x, iz = si.y;
    const il = Math.hypot(ix, iz);
    if (il > 1) { ix /= il; iz /= il; }
    s.lvx += (ix * LIGHT_V - s.lvx) * (1 - Math.exp(-dt * 10));
    s.lvz += (iz * LIGHT_V - s.lvz) * (1 - Math.exp(-dt * 10));
    s.lx = clamp(s.lx + s.lvx * dt, -XW, XW);
    s.lz = clamp(s.lz + s.lvz * dt, Z0, Z1);
    s.flash = Math.max(0, s.flash - dt);
    s.energy = Math.min(1, s.energy + dt * 0.11);
    if (si.bP && s.energy >= FLASH_E && s.flash <= 0) { s.energy -= FLASH_E; s.flash = FLASH_T; ctx.fx({ k: 'flash', x: s.lx, z: s.lz }); }
    const r = lightR(s);
    // the team
    for (let i = 1; i < s.pl.length; i++) {
      const p = s.pl[i];
      if (p.out) continue;
      p.stun -= dt;
      let mx = p.stun > 0 ? 0 : inputs[i].x, mz = p.stun > 0 ? 0 : inputs[i].y;
      const ml = Math.hypot(mx, mz);
      if (ml > 1) { mx /= ml; mz /= ml; }
      p.vx += (mx * RUN_V - p.vx) * (1 - Math.exp(-dt * 14));
      p.vz += (mz * RUN_V - p.vz) * (1 - Math.exp(-dt * 14));
      let nx = clamp(p.x + p.vx * dt, -XW + 0.4, XW - 0.4), nz = clamp(p.z + p.vz * dt, Z0 + 0.4, Z1 - 0.4);
      for (const [cx, cz] of CRATES) {
        const lim = CR + 0.45;
        if (Math.abs(nx - cx) < lim && Math.abs(nz - cz) < lim) {
          // slide along the crate side we came from
          if (Math.abs(p.x - cx) >= lim) nx = cx + Math.sign(p.x - cx) * lim;
          else if (Math.abs(p.z - cz) >= lim) nz = cz + Math.sign(p.z - cz) * lim;
          else { nx = p.x; nz = p.z; }
        }
      }
      p.x = nx; p.z = nz;
      p.hid = hidden(p.x, p.z);
      const lit = !p.hid && Math.hypot(p.x - s.lx, p.z - s.lz) < r;
      if (lit) {
        if (p.exp === 0) ctx.fx({ k: 'spotted', p: i });
        p.exp += dt;
      } else p.exp = Math.max(0, p.exp - dt * 0.7);
      if (p.exp >= CATCH) {
        if (play) { p.out = true; p.outT = time; s.caught++; ctx.fx({ k: 'caught', p: i, x: p.x, z: p.z }); }
        else { p.exp = 0; p.stun = 0.8; ctx.fx({ k: 'zap', p: i }); }
        continue;
      }
      for (let k = s.fl.length - 1; k >= 0; k--) {
        const f = s.fl[k];
        if (Math.hypot(f.x - p.x, f.z - p.z) < 0.95) {
          s.fl.splice(k, 1);
          p.got++; s.got++;
          ctx.fx({ k: 'fly', p: i, x: f.x, z: f.z, v: s.got });
        }
      }
    }
    for (const f of s.fl) f.t += dt;
    const want = Math.min(3, s.pl.length);
    s.spawnT -= dt;
    if (s.fl.length < want && s.spawnT <= 0) { spawnFly(s, ctx); s.spawnT = 0.5; }
    if (play && (s.got >= s.goal || s.pl.every((p, i) => i === 0 || p.out))) { s.doneT = time; ctx.fx({ k: s.got >= s.goal ? 'teamwin' : 'solowin' }); }
  },
  bot(s, i, ctx) {
    const ai = s._ai[i];
    ai.rt -= 1 / 60;
    if (i === 0) {
      if (ai.rt <= 0) {
        ai.rt = ai.react * (0.7 + ctx.rng() * 0.6);
        let best = -1, bs = 1e9;
        for (let j = 1; j < s.pl.length; j++) {
          const p = s.pl[j];
          if (p.out) continue;
          let sc = Math.hypot(p.x - s.lx, p.z - s.lz);
          if (p.hid) sc += 7;
          if (j === ai.tgt) sc -= 1.5;
          if (sc < bs) { bs = sc; best = j; }
        }
        ai.tgt = best;
      }
      const p = s.pl[ai.tgt];
      if (!p) return NO_INPUT;
      const tx = p.x + p.vx * ai.lead, tz = p.z + p.vz * ai.lead;
      const dx = tx - s.lx, dz = tz - s.lz, dl = Math.hypot(dx, dz);
      const sp = dl < 0.3 ? 0 : Math.min(1, dl / 1.2) * ai.speed;
      const fl = !p.hid && dl > LR * 0.9 && dl < LR * FLASH_K * 0.95 && s.energy >= FLASH_E && ctx.rng() < 0.12;
      return { ...NO_INPUT, x: dl ? (dx / dl) * sp : 0, y: dl ? (dz / dl) * sp : 0, b: fl, bP: fl };
    }
    const me = s.pl[i];
    if (me.out) return NO_INPUT;
    if (ai.rt <= 0) { ai.rt = ai.react * (0.7 + ctx.rng() * 0.6); teamThink(s, i, ctx); }
    let dx = ai.tx - me.x, dz = ai.tz - me.z;
    // walk around crates in the way
    for (const [cx, cz] of CRATES) {
      const ox = cx - me.x, oz = cz - me.z, od = Math.hypot(ox, oz);
      if (od < 2.2 && (ox * dx + oz * dz) > 0) { const side = ox * dz - oz * dx > 0 ? 1 : -1; dx += (-oz / od) * side * 1.6; dz += (ox / od) * side * 1.6; }
    }
    const l = Math.hypot(dx, dz);
    const sp = l < 0.25 ? 0 : ai.speed;
    return { ...NO_INPUT, x: l ? (dx / l) * sp : 0, y: l ? (dz / l) * sp : 0 };
  },
  over: (s, ctx) => s.doneT >= 0 && ctx.time > s.doneT + 0.8,
  result(s, ctx) {
    const teamWins = s.got >= s.goal;
    const solo = ctx.setup.players[0];
    const rows = s.pl.map((p, i) => {
      const isSolo = i === 0, win = isSolo ? !teamWins : teamWins;
      const note = isSolo ? `im Lampenturm · ${s.caught} erwischt` : `${p.got} Glühwürmchen${p.out ? ` · erwischt nach ${p.outT.toFixed(1).replace('.', ',')} s` : ''}`;
      return { i, win, coins: win ? WIN_COINS : 0, score: (win ? 100 : 0) + (isSolo ? s.caught : p.got * 2 + (p.out ? 0 : 1)), note };
    });
    return { rows, title: teamWins ? `Das Team gewinnt! ${s.got} von ${s.goal}` : `${solo.name} gewinnt allein!` };
  },
  score: (s, i) => (i === 0 ? { v: `${s.got}/${s.goal}` } : { v: s.pl[i]?.out ? 'erwischt' : String(s.pl[i]?.got ?? 0), out: !!s.pl[i]?.out }),
  view(setup) {
    const scene = new THREE.Scene();
    scene.background = skyTex(['#05031a', '#1a0b4a', '#3a1f7a']);
    scene.fog = new THREE.Fog('#140a3a', 30, 80);
    const L = mgLights(scene, 13);
    L.hemi.intensity = 0.62;
    L.hemi.color.set('#9aa8ff');
    L.sun.intensity = 0.55;
    L.sun.color.set('#9ab0ff');
    const cam = new THREE.PerspectiveCamera(42, 1, 0.5, 200);
    const st = new Batch(), gl = new Batch();
    // the yard: cobbles, hedges, lanterns
    st.add(BOX, '#2a2458', 0, -0.5, 0, 0, 0, 0, 40, 1, 40);
    st.add(BOX, '#5d55b0', 0, -0.03, (Z0 + Z1) / 2, 0, 0, 0, XW * 2 + 0.6, 0.1, Z1 - Z0 + 0.6);
    for (let x = -XW + 0.5; x < XW; x += 1.5) for (let z = Z0 + 0.5; z < Z1; z += 1.5) if (((x + z) * 7) % 3 < 1.2) st.add(BOX, '#6a62bd', x, 0.025, z, 0, 0.1 * Math.sin(x * z), 0, 1.3, 0.02, 1.3);
    for (const sx of [-1, 1]) for (let z = Z0 - 1; z <= Z1 + 1; z += 2) st.add(SPH_LO, '#1f5a4a', sx * (XW + 1.3), 0.6, z, 0, 0, 0, 1.2, 1.1, 1.3);
    for (let x = -XW - 1; x <= XW + 1; x += 2) st.add(SPH_LO, '#1f5a4a', x, 0.6, Z1 + 1.4, 0, 0, 0, 1.3, 1.1, 1.2);
    for (const [lx, lz] of [[-XW - 1.2, Z1 + 1.2], [XW + 1.2, Z1 + 1.2], [-XW - 1.2, Z0], [XW + 1.2, Z0]]) { st.add(CYL8, '#1a0b33', lx, 1.5, lz, 0, 0, 0, 0.12, 3, 0.12); gl.add(SPH_LO, '#ffcf5a', lx, 3.1, lz, 0, 0, 0, 0.3); }
    // the lamp tower
    st.add(CYL8, '#3a2a6a', TX, TH / 2, TZ, 0, 0.4, 0, 1.8, TH, 1.8);
    st.add(CYL8, '#2a1258', TX, TH + 0.15, TZ, 0, 0.4, 0, 2.3, 0.3, 2.3);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; st.add(BOX, '#2a1258', TX + Math.cos(a) * 2.1, TH + 0.7, TZ + Math.sin(a) * 2.1, 0, -a, 0, 0.15, 0.9, 0.5); }
    for (let k = 0; k < 4; k++) gl.add(BOX, '#ffcf5a', TX + (k - 1.5) * 0.7, 1.2 + (k % 2) * 1.2, TZ + 1.82, 0, 0, 0, 0.35, 0.5, 0.05);
    // the cage for caught players
    for (let k = 0; k < 7; k++) st.add(CYL8, '#8a83a8', -7.6 + k * 0.7, 1.1, -8.4, 0, 0, 0, 0.06, 2.2, 0.06);
    st.add(BOX, '#5a5470', -5.5, 2.25, -8.4, 0, 0, 0, 4.6, 0.15, 1.6);
    st.add(BOX, '#5a5470', -5.5, 0.05, -8.4, 0, 0, 0, 4.6, 0.1, 1.6);
    // crates
    for (const [cx, cz] of CRATES) {
      st.add(BOX, '#b8783a', cx, CR, cz, 0, 0, 0, CR * 2, CR * 2, CR * 2);
      for (const sy of [0.15, CR * 2 - 0.15]) st.add(BOX, '#8a5426', cx, sy, cz, 0, 0, 0, CR * 2 + 0.04, 0.2, CR * 2 + 0.04);
      st.add(BOX, '#8a5426', cx, CR, cz + CR + 0.01, 0, 0, Math.PI / 4, 0.18, CR * 2.6, 0.04);
    }
    scene.add(st.mesh(), gl.mesh(GLOW, false, false));
    // crate shadows from the lamp (where you are hidden)
    const sh = new Batch();
    for (const [cx, cz] of CRATES) {
      const ex = cx - TX, ez = cz - TZ, cl = Math.hypot(ex, ez), ux = ex / cl, uz = ez / cl, px = -uz, pz = ux;
      const half = CR * 0.92, far = SHADOW_LEN + CR * 0.6, spread = half * ((cl + far) / cl);
      const shape = new THREE.Shape();
      shape.moveTo(cx + px * half, -(cz + pz * half));
      shape.lineTo(cx + ux * far + px * spread, -(cz + uz * far + pz * spread));
      shape.lineTo(cx + ux * far - px * spread, -(cz + uz * far - pz * spread));
      shape.lineTo(cx - px * half, -(cz - pz * half));
      const g = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
      sh.add(g, '#ffffff', 0, 0.035, 0);
      g.dispose();
    }
    const shadowM = new THREE.Mesh(sh.geometry(), new THREE.MeshBasicMaterial({ color: '#08041a', transparent: true, opacity: 0.72, depthWrite: false }));
    scene.add(shadowM);
    // the spotlight: a real spot (lights figures) plus a bright floor disc and a soft beam
    const spot = new THREE.SpotLight('#fff2b0', 60, 30, 0.32, 0.35, 1.2);
    spot.position.set(TX, TH + 1.5, TZ + 0.7);
    scene.add(spot, spot.target);
    const discMat = new THREE.MeshBasicMaterial({ color: '#fff3b8', transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), discMat);
    disc.position.y = 0.06;
    scene.add(disc);
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ffe14a', transparent: true, opacity: 0.9, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2), ringMat);
    ring.position.y = 0.07;
    scene.add(ring);
    const beamMat = new THREE.MeshBasicMaterial({ color: '#fff3b8', transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 1, 1, 24, 1, true).translate(0, -0.5, 0), beamMat);
    scene.add(beam);
    const lampHead = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: '#fff6c8' }));
    lampHead.scale.setScalar(0.42);
    lampHead.position.copy(spot.position);
    scene.add(lampHead);
    // glow-worms
    const flyGeo = new Batch();
    flyGeo.add(SPH_LO, '#fff36a', 0, 0, 0, 0, 0, 0, 0.22); flyGeo.add(SPH_LO, '#7aff9a', 0, -0.05, -0.2, 0, 0, 0, 0.13, 0.13, 0.2);
    const flyM = new THREE.InstancedMesh(flyGeo.geometry(), GLOW, 6);
    const haloM = new THREE.InstancedMesh(SPH_LO, new THREE.MeshBasicMaterial({ color: '#c8ff5a', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }), 6);
    for (const m of [flyM, haloM]) { m.frustumCulled = false; m.count = 0; scene.add(m); }
    // exposure bars over the team
    const barBg = new THREE.InstancedMesh(BOX, new THREE.MeshBasicMaterial({ color: '#1a0b33' }), 4);
    const barFg = new THREE.InstancedMesh(BOX, new THREE.MeshBasicMaterial({ color: '#ff3d6e' }), 4);
    for (const m of [barBg, barFg]) { m.frustumCulled = false; m.count = 0; scene.add(m); }
    // progress sign on the tower
    const signCv = { got: -1, goal: -1 };
    const signC = document.createElement('canvas');
    signC.width = 256; signC.height = 96;
    const signT = new THREE.CanvasTexture(signC);
    signT.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.2), new THREE.MeshBasicMaterial({ map: signT, transparent: true }));
    sign.position.set(TX + 3.6, 2.2, TZ + 1.2);
    scene.add(sign);
    const drawSign = (got: number, goal: number) => {
      const g = signC.getContext('2d')!;
      g.clearRect(0, 0, 256, 96);
      g.fillStyle = 'rgba(26,11,51,.88)'; g.beginPath(); g.roundRect(4, 4, 248, 88, 18); g.fill();
      g.strokeStyle = '#c8ff5a'; g.lineWidth = 5; g.stroke();
      g.font = `italic 900 56px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#c8ff5a';
      g.fillText(`${got} / ${goal}`, 128, 52);
      signT.needsUpdate = true;
    };
    const figs = mgFigures(scene, setup);
    const sparks = new Sparks(scene, 120, undefined, 6);
    const ph = new Float32Array(figs.length);
    const lift = new Float32Array(figs.length);
    const dmy = new THREE.Object3D();
    const _v = new THREE.Vector3();
    let cele: boolean[] | null = null;
    let flashK = 0;
    return {
      scene, cam,
      frame(s, dt, t) {
        const r = lightR(s);
        disc.position.set(s.lx, 0.06, s.lz);
        disc.scale.setScalar(r);
        ring.position.set(s.lx, 0.07, s.lz);
        ring.scale.setScalar(r);
        flashK = Math.max(0, flashK - dt * 2.5);
        discMat.opacity = 0.38 + flashK * 0.4;
        spot.target.position.set(s.lx, 0, s.lz);
        spot.target.updateMatrixWorld();
        spot.intensity = 60 + flashK * 80;
        const dx = s.lx - spot.position.x, dy = -spot.position.y, dz = s.lz - spot.position.z, len = Math.hypot(dx, dy, dz);
        beam.position.copy(spot.position);
        beam.scale.set(r, len, r);
        beam.lookAt(s.lx, 0, s.lz);
        beam.rotateX(-Math.PI / 2);
        beamMat.opacity = 0.09 + flashK * 0.12;
        // glow-worms
        let k = 0;
        for (const f of s.fl) {
          if (k >= 6) break;
          const bob = Math.sin(t * 3 + f.id) * 0.25, sc = Math.min(1, f.t * 3);
          dmy.position.set(f.x + Math.sin(t * 2.3 + f.id) * 0.15, 0.9 + bob, f.z); dmy.rotation.set(0, t * 2 + f.id, 0); dmy.scale.setScalar(sc); dmy.updateMatrix(); flyM.setMatrixAt(k, dmy.matrix);
          dmy.scale.setScalar(sc * (0.7 + Math.sin(t * 6 + f.id) * 0.12)); dmy.updateMatrix(); haloM.setMatrixAt(k, dmy.matrix);
          k++;
        }
        flyM.count = haloM.count = k;
        flyM.instanceMatrix.needsUpdate = haloM.instanceMatrix.needsUpdate = true;
        if (s.got !== signCv.got || s.goal !== signCv.goal) { signCv.got = s.got; signCv.goal = s.goal; drawSign(s.got, s.goal); }
        // figures
        let bars = 0, caged = 0;
        for (let i = 0; i < figs.length; i++) {
          const f = figs[i], p = s.pl[i];
          if (!p) continue;
          if (i === 0) { f.root.position.set(TX, TH + 0.3, TZ - 0.5); if (!cele) { f.yawT = Math.atan2(s.lx - TX, s.lz - TZ); f.idle = true; } continue; }
          if (p.out) {
            lift[i] = Math.min(1.6, lift[i] + dt);
            if (lift[i] < 0.9) { f.root.position.set(p.x, lift[i] * 4, p.z); f.yawT += dt * 14; f.yaw = f.yawT; f.root.scale.setScalar(1 - lift[i] * 0.5); }
            else { f.root.position.set(-7.2 + caged * 1.3, 0.1, -8.4); f.root.scale.setScalar(0.85); if (!cele) f.yawT = 0; }
            caged++;
            continue;
          }
          lift[i] = 0;
          f.root.scale.setScalar(1);
          f.root.position.set(p.x, 0, p.z);
          if (!cele) {
            if (p.stun > 0) { f.yawT += dt * 14; f.yaw = f.yawT; } else runFig(f, p.vx, p.vz, dt, ph, i);
          }
          if (p.exp > 0.02 && bars < 4) {
            dmy.rotation.set(0, 0, 0);
            dmy.position.set(p.x, 2.35, p.z); dmy.scale.set(1.1, 0.18, 0.12); dmy.updateMatrix(); barBg.setMatrixAt(bars, dmy.matrix);
            const kk = clamp(p.exp / CATCH, 0, 1);
            dmy.position.set(p.x - 0.5 * (1 - kk), 2.35, p.z + 0.02); dmy.scale.set(Math.max(0.01, kk), 0.12, 0.12); dmy.updateMatrix(); barFg.setMatrixAt(bars, dmy.matrix);
            bars++;
          }
        }
        barBg.count = barFg.count = bars;
        barBg.instanceMatrix.needsUpdate = barFg.instanceMatrix.needsUpdate = true;
        if (cele) celebrate(figs, cele, t, cam);
        for (const f of figs) updateFigure(f, dt, t);
        sparks.update(dt);
        const tf = document.getElementById('turboFill');
        if (tf) tf.style.transform = `scaleX(${s.energy.toFixed(3)})`;
        // camera: the whole yard, the tower at the back
        const aspect = VW / VH, w = XW + (aspect < 1 ? 0.2 : 1.2);
        const d = Math.max((w * 1.05) / (0.39 * aspect), 17);
        cam.position.set(0, d * 0.72, Z1 + d * 0.62);
        cam.lookAt(0, 0, -1.4 + (aspect < 1 ? -0.6 : 0));
      },
      fx(e, me) {
        if (e.k === 'flash') { flashK = 1; sfx.whoosh(); }
        else if (e.k === 'spotted') { if (e.p === me) sfx.beep(false); }
        else if (e.k === 'fly') {
          if (e.p === me || me < 0) sfx.coin();
          sparks.emit(e.x!, 0.9, e.z!, 12, '#c8ff5a', 3.5, 3, 0.12, 0.6);
          floatText(_v.set(e.x!, 2, e.z!), `${e.v}`, '#c8ff5a', scene);
        } else if (e.k === 'caught') {
          sfx.lose();
          sparks.emit(e.x!, 1, e.z!, 18, '#fff3b8', 4, 6, 0.16, 0.7);
          floatText(_v.set(e.x!, 2.8, e.z!), 'Erwischt!', '#ffe14a', scene);
        } else if (e.k === 'zap') { sfx.bonk(); const f = figs[e.p!]; if (f) { void squashLand(f, 0.35); if (e.p === me) floatText(f.root.position.clone().setY(2.6), 'Erwischt!', '#ffe14a', scene); } }
        else if (e.k === 'teamwin') { sfx.star(); floatText(_v.set(0, 3.5, 0), 'Genug Glühwürmchen!', '#c8ff5a', scene); }
        else if (e.k === 'solowin') { sfx.star(); floatText(_v.set(0, 3.5, 0), 'Alle erwischt!', '#ffe14a', scene); }
      },
      celebrate(w) { cele = w; if (!w) { uncelebrate(figs); for (const f of figs) f.root.scale.setScalar(1); } },
    };
  },
};

export default scheinwerfer;
