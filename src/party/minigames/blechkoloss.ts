// Blechkoloss (Koop-Boss): everybody together against a giant wind-up tin robot. Pick up candy
// bombs from the floor and throw them at its glowing heart (Shift / X; with empty hands the same
// key jumps). Jump over its stomp waves, run from the falling screws, and don't waste bombs on
// its shield. Coins by damage share (2 to 10), and 5 more for everybody when it falls.

import { sfx } from '../sfx';
import { TAU, clamp, lerp } from '../util';
import { celebrate, squashLand, updateFigure } from '../view3d/figures';
import { BOX, Batch, CONE, CYL, CYL8, GLOW, SPH, SPH_LO, THREE, TOR, VC, skyTex } from '../view3d/kit';
import { VH, VW, floatText } from '../view3d/stage';
import { KBD, cloudsBelow, floatingArena, mgFigures, mgLights } from './common';
import { Ripples, Sparks, col, runFig, uncelebrate } from './mgkit-a';
import { NO_INPUT, type MgCtx, type MinigameDef } from './types';

const D = 40;
const R = 10.5, BR = 2.5;
/** The robot stands at the back of the round stage. */
const BZ = -5.2;
const bd = (x: number, z: number) => Math.hypot(x, z - BZ);
const RUN_V = 6.4, JUMP_V = 8.6, GRAV = 24;
const THROW_R = 9.2, FLIGHT = 0.55;
const WAVE_V = 8.5, WAVE_W = 0.5;
const BOLT_T = 1.25, BOLT_R = 1.45;
const HEART_Y = 4.3;

interface Pl { x: number; z: number; vx: number; vz: number; y: number; vy: number; hold: boolean; stun: number; inv: number; dmg: number; thrown: number }
interface Bomb { id: number; x: number; z: number; t: number }
interface Shot { id: number; p: number; x: number; z: number; t: number }
interface Wave { id: number; r: number }
interface Bolt { id: number; x: number; z: number; t: number }
interface S {
  hp: number; max: number;
  /** idle | stomp | bolts | shield | down */
  ph: string; pt: number; dur: number;
  yaw: number; rage: boolean; extra: number;
  pl: Pl[];
  bombs: Bomb[]; shots: Shot[]; waves: Wave[]; bolts: Bolt[];
  nextId: number; bombT: number; downT: number; hitT: number;
  _ai: { rt: number; tx: number; tz: number; lead: number; sd: number; miss: number; bolt: number; speed: number; waste: number; jumpAt: number; waveId: number }[];
}

const SKILL = { leicht: [0.32, 0.14, 0.25, 0.45, 0.8, 0.5], normal: [0.26, 0.06, 0.06, 0.85, 0.93, 0.12], stark: [0.22, 0.025, 0.01, 1, 1, 0] } as const;

const alive = (p: Pl) => p.stun <= 0;

function spawnBomb(s: S, ctx: MgCtx) {
  for (let k = 0; k < 12; k++) {
    const a = ctx.rng() * TAU, r = Math.sqrt(ctx.rng()) * (R - 1.3);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (bd(x, z) < BR + 2.2 || z < BZ + 0.6) continue;
    if (s.bombs.some((b) => Math.hypot(b.x - x, b.z - z) < 2.2)) continue;
    s.bombs.push({ id: s.nextId++, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, t: 0 });
    return;
  }
}

function hurt(s: S, i: number, ctx: MgCtx, from: number, fz: number) {
  const p = s.pl[i];
  if (p.inv > 0 || p.stun > 0) return;
  p.stun = 1.6; p.inv = 2.1;
  if (p.hold) { p.hold = false; ctx.fx({ k: 'drop', p: i }); }
  const dx = p.x - from, dz = p.z - fz, l = Math.hypot(dx, dz) || 1;
  p.vx = (dx / l) * 5; p.vz = (dz / l) * 5;
  ctx.fx({ k: 'zap', p: i });
}

function nextAttack(s: S, ctx: MgCtx) {
  const r = ctx.rng();
  s.pt = 0;
  if (r < 0.42) { s.ph = 'stomp'; s.dur = s.rage ? 0.7 : 0.95; s.extra = s.rage ? 1 : 0; }
  else if (r < 0.78) {
    s.ph = 'bolts'; s.dur = 0.6;
    const P = s.pl.filter(alive);
    for (const p of P) {
      const ox = (ctx.rng() - 0.5) * 1.4, oz = (ctx.rng() - 0.5) * 1.4;
      let x = p.x + p.vx * 0.7 + ox, z = p.z + p.vz * 0.7 + oz;
      const l = Math.hypot(x, z);
      if (l > R - 0.8) { x *= (R - 0.8) / l; z *= (R - 0.8) / l; }
      const lb = bd(x, z);
      if (lb < BR + 1) { x *= (BR + 1) / (lb || 1); z = BZ + (z - BZ) * ((BR + 1) / (lb || 1)); }
      s.bolts.push({ id: s.nextId++, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, t: 0 });
    }
    for (let k = 0; k < (s.rage ? 3 : 1); k++) {
      const a = ctx.rng() * Math.PI, rr = BR + 1.5 + ctx.rng() * 7;
      const x = Math.cos(a) * rr, z = BZ + Math.sin(a) * rr;
      if (Math.hypot(x, z) < R - 0.8) s.bolts.push({ id: s.nextId++, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, t: 0 });
    }
    ctx.fx({ k: 'bolts' });
  } else { s.ph = 'shield'; s.dur = s.rage ? 2 : 1.6; ctx.fx({ k: 'shield' }); }
}

const blechkoloss: MinigameDef<S> = {
  id: 'blechkoloss',
  name: 'Blechkoloss',
  type: 'koop',
  seconds: D,
  players: [2, 4],
  pro: true,
  online: 'ok',
  card: {
    sub: 'Alle zusammen gegen einen riesigen Aufzieh-Roboter! Schnappt euch Bonbonbomben und werft sie auf sein leuchtendes Herz.',
    rules: () => [
      '<b>Werfen:</b> Mit Bombe in der Hand fliegt sie aufs Herz. Hinter dem blauen Schild prallt sie ab, warte dann lieber.',
      '<b>Ausweichen:</b> Über die Stampfwellen springen (mit leeren Händen) und weg von den roten Kreisen, da fallen Schrauben.',
      '<b>Münzen:</b> 2 bis 10 je nach eigenem Schaden. Fällt der Koloss, bekommen alle 5 dazu.',
    ],
    controls: () => ({ keys: `${KBD('W')} ${KBD('A')} ${KBD('S')} ${KBD('D')} oder Pfeile: laufen<br>${KBD('Shift')} oder ${KBD('X')}: werfen, mit leeren Händen springen`, touch: 'Daumen-Stick: laufen · Knopf: werfen oder springen' }),
    touch: () => ({ joy: true, buttons: [{ key: 'b', label: 'Werfen / Springen' }] }),
  },
  init(ctx) {
    const n = ctx.setup.players.length;
    const max = [20, 20, 36, 57, 76][clamp(n, 0, 4)];
    const s: S = {
      hp: max, max, ph: 'idle', pt: 0, dur: 2, yaw: 0, rage: false, extra: 0,
      pl: ctx.setup.players.map((_, i) => { const a = Math.PI / 2 + ((i - (n - 1) / 2) * 0.7); return { x: Math.cos(a) * 7.2, z: Math.sin(a) * 7.2, vx: 0, vz: 0, y: 0, vy: 0, hold: false, stun: 0, inv: 0, dmg: 0, thrown: 0 }; }),
      bombs: [], shots: [], waves: [], bolts: [], nextId: 1, bombT: 0, downT: -1, hitT: -9,
      _ai: ctx.setup.players.map((p) => { const [lead, sd, miss, bolt, speed, waste] = SKILL[p.bot ?? 'normal']; return { rt: ctx.rng() * 0.2, tx: 0, tz: 0, lead, sd, miss, bolt, speed, waste, jumpAt: -1, waveId: -1 }; }),
    };
    for (let k = 0; k < n + 2; k++) spawnBomb(s, ctx);
    return s;
  },
  step(s, dt, inputs, ctx) {
    const n = s.pl.length;
    if (s.ph === 'down') {
      s.pt += dt;
      for (const p of s.pl) { p.vy -= GRAV * dt; p.y = Math.max(0, p.y + p.vy * dt); if (p.y === 0) p.vy = 0; }
      return;
    }
    // the boss: turn towards the nearest player, pick attacks
    let near = -1, nd = 1e9;
    s.pl.forEach((p, i) => { const d = bd(p.x, p.z); if (d < nd) { nd = d; near = i; } });
    if (near >= 0) { const ty = Math.atan2(s.pl[near].x, s.pl[near].z - BZ); s.yaw += clamp(((ty - s.yaw + Math.PI * 3) % TAU) - Math.PI, -dt * 1.4, dt * 1.4); }
    s.pt += dt;
    if (s.ph === 'idle' && s.pt >= s.dur) nextAttack(s, ctx);
    else if (s.ph === 'stomp' && s.pt >= s.dur) {
      s.waves.push({ id: s.nextId++, r: BR });
      ctx.fx({ k: 'stomp' });
      if (s.extra > 0) { s.extra--; s.pt = s.dur - 0.55; }
      else { s.ph = 'idle'; s.pt = 0; s.dur = s.rage ? 0.7 : 1.1; }
    } else if ((s.ph === 'bolts' || s.ph === 'shield') && s.pt >= s.dur) { s.ph = 'idle'; s.pt = 0; s.dur = s.rage ? 0.7 : 1.1; }
    // waves and bolts
    for (let k = s.waves.length - 1; k >= 0; k--) {
      const w = s.waves[k], r0 = w.r;
      w.r += WAVE_V * dt;
      s.pl.forEach((p, i) => { const d = bd(p.x, p.z); if (p.y < 0.35 && d >= r0 - WAVE_W && d <= w.r + WAVE_W) hurt(s, i, ctx, 0, BZ); });
      if (w.r > R - BZ + 0.5) s.waves.splice(k, 1);
    }
    for (let k = s.bolts.length - 1; k >= 0; k--) {
      const b = s.bolts[k];
      b.t += dt;
      if (b.t >= BOLT_T) {
        ctx.fx({ k: 'bolt', x: b.x, z: b.z });
        s.pl.forEach((p, i) => { if (Math.hypot(p.x - b.x, p.z - b.z) < BOLT_R) hurt(s, i, ctx, b.x, b.z); });
        s.bolts.splice(k, 1);
      }
    }
    // players
    s.pl.forEach((p, i) => {
      const inp = inputs[i];
      p.stun -= dt; p.inv -= dt;
      const ctl = p.stun <= 0;
      let ix = ctl ? inp.x : 0, iz = ctl ? inp.y : 0;
      const l = Math.hypot(ix, iz);
      if (l > 1) { ix /= l; iz /= l; }
      const acc = 1 - Math.exp(-dt * (ctl ? 14 : 3));
      p.vx += (ix * RUN_V - p.vx) * acc; p.vz += (iz * RUN_V - p.vz) * acc;
      p.x += p.vx * dt; p.z += p.vz * dt;
      if (p.z < BZ) p.z = BZ;
      const d = Math.hypot(p.x, p.z);
      if (d > R - 0.6) { p.x *= (R - 0.6) / d; p.z *= (R - 0.6) / d; }
      const db = bd(p.x, p.z);
      if (db < BR + 0.5) { p.x *= (BR + 0.5) / (db || 1); p.z = BZ + (p.z - BZ) * ((BR + 0.5) / (db || 1)); }
      if (p.vy !== 0 || p.y > 0) { p.vy -= GRAV * dt; p.y += p.vy * dt; if (p.y <= 0) { p.y = 0; p.vy = 0; } }
      if (ctl && inp.bP) {
        if (p.hold) {
          if (bd(p.x, p.z) <= THROW_R) { p.hold = false; p.thrown++; s.shots.push({ id: s.nextId++, p: i, x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100, t: 0 }); ctx.fx({ k: 'throw', p: i }); }
          else ctx.fx({ k: 'far', p: i });
        } else if (p.y === 0 && p.vy === 0) { p.vy = JUMP_V; ctx.fx({ k: 'jump', p: i }); }
      }
      if (!p.hold && ctl) for (let b = s.bombs.length - 1; b >= 0; b--) {
        const B = s.bombs[b];
        if (B.t > 0.3 && Math.hypot(B.x - p.x, B.z - p.z) < 0.95 && p.y < 1) { s.bombs.splice(b, 1); p.hold = true; ctx.fx({ k: 'grab', p: i }); break; }
      }
    });
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = s.pl[i], b = s.pl[j], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
      if (l < 1.2 && l > 1e-4) { const push = (1.2 - l) / 2; a.x -= (dx / l) * push; a.z -= (dz / l) * push; b.x += (dx / l) * push; b.z += (dz / l) * push; }
    }
    // bombs in flight
    for (let k = s.shots.length - 1; k >= 0; k--) {
      const sh = s.shots[k];
      sh.t += dt;
      if (sh.t < FLIGHT) continue;
      s.shots.splice(k, 1);
      if (s.ph === 'shield') { ctx.fx({ k: 'block', p: sh.p }); continue; }
      s.hp = Math.max(0, s.hp - 1);
      s.pl[sh.p].dmg++;
      s.hitT = ctx.time;
      ctx.fx({ k: 'hit', p: sh.p, v: s.hp });
      if (!s.rage && s.hp <= s.max / 2) { s.rage = true; ctx.fx({ k: 'rage' }); }
      if (s.hp <= 0) { s.ph = 'down'; s.pt = 0; s.downT = ctx.time; s.waves = []; s.bolts = []; s.shots = []; ctx.fx({ k: 'down' }); return; }
    }
    // more bombs
    for (const b of s.bombs) b.t += dt;
    let held = 0;
    for (const p of s.pl) if (p.hold) held++;
    s.bombT -= dt;
    if (s.bombs.length + held + s.shots.length < n + 2 && s.bombT <= 0) { spawnBomb(s, ctx); s.bombT = 0.25; }
  },
  bot(s, i, ctx) {
    const ai = s._ai[i], me = s.pl[i];
    if (s.ph === 'down' || me.stun > 0) return NO_INPUT;
    const d = bd(me.x, me.z);
    let press = false;
    // stomp waves: jump in time (throw first if the hands are full)
    for (const w of s.waves) {
      if (w.r > d + WAVE_W) continue;
      const tHit = (d - w.r) / WAVE_V;
      if (ai.waveId !== w.id) { ai.waveId = w.id; ai.jumpAt = ctx.rng() < ai.miss ? -9 : ai.lead + ((ctx.rng() + ctx.rng() + ctx.rng() - 1.5) / 0.5) * ai.sd; }
      if (tHit <= ai.jumpAt && me.y === 0) press = true;
    }
    ai.rt -= 1 / 60;
    if (ai.rt <= 0) {
      ai.rt = 0.12 + ctx.rng() * 0.12;
      let tx = me.x, tz = me.z;
      if (me.hold) {
        // walk into throwing range
        const want = clamp(d, BR + 2.5, THROW_R - 1.4);
        tx = (me.x / (d || 1)) * want; tz = BZ + ((me.z - BZ) / (d || 1)) * want;
      } else {
        let best = 1e9;
        for (const b of s.bombs) {
          let dd = Math.hypot(b.x - me.x, b.z - me.z);
          for (let j = 0; j < s.pl.length; j++) if (j !== i && !s.pl[j].hold && Math.hypot(b.x - s.pl[j].x, b.z - s.pl[j].z) < dd - 0.5) dd += 6;
          if (dd < best) { best = dd; tx = b.x; tz = b.z; }
        }
      }
      // run from falling screws
      if (ctx.rng() < ai.bolt) for (const b of s.bolts) {
        const bx = me.x - b.x, bz = me.z - b.z, bl = Math.hypot(bx, bz);
        if (bl < BOLT_R + 1.2) { tx = b.x + (bx / (bl || 1)) * (BOLT_R + 2); tz = b.z + (bz / (bl || 1)) * (BOLT_R + 2); }
      }
      ai.tx = tx; ai.tz = tz;
    }
    const dx = ai.tx - me.x, dz = ai.tz - me.z, l = Math.hypot(dx, dz);
    if (me.hold && !press && d <= THROW_R - 0.3 && (s.ph !== 'shield' || ctx.rng() < ai.waste * 0.2) && ctx.rng() < 0.12) press = true;
    if (me.hold && press && s.waves.length && me.y === 0) {
      // full hands and a wave coming: throw now (if possible), jump next step
      if (d > THROW_R) press = false;
    }
    const sp = l < 0.25 ? 0 : ai.speed;
    return { ...NO_INPUT, x: l ? (dx / l) * sp : 0, y: l ? (dz / l) * sp : 0, b: press, bP: press };
  },
  over: (s, ctx) => s.ph === 'down' && ctx.time > s.downT + 1.6,
  result(s, ctx) {
    const fell = s.hp <= 0;
    const top = Math.max(1, ...s.pl.map((p) => p.dmg));
    const rows = s.pl.map((p, i) => {
      const share = 2 + Math.round((8 * p.dmg) / top);
      return { i, win: fell, coins: share + (fell ? 5 : 0), score: p.dmg * 10 + (fell ? 100 : 0), note: `${p.dmg} Treffer · ${share} für den Schaden${fell ? ' · +5 Koloss besiegt' : ''}` };
    });
    return { rows, title: fell ? `Der Blechkoloss fällt nach ${s.downT.toFixed(1).replace('.', ',')} s!` : `Der Blechkoloss hält durch (${s.hp} von ${s.max} übrig)` };
  },
  score: (s, i) => ({ v: `${s.pl[i]?.dmg ?? 0} ✦` }),
  view(setup) {
    const scene = new THREE.Scene();
    scene.background = skyTex(['#ff7a4a', '#ffb36a', '#ffe8c8']);
    scene.fog = new THREE.Fog('#ffd8b0', 50, 120);
    mgLights(scene, 13);
    const cam = new THREE.PerspectiveCamera(42, 1, 0.5, 300);
    const st = new Batch(), gl = new Batch();
    floatingArena(st, R, [[1, '#6a7bb8'], [0.92, '#c8d4f0'], [0.6, '#aebce6'], [0.45, '#8a9ad0']], '#3a4a8a');
    for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; st.add(CYL8, '#ffd23f', Math.cos(a) * (R * 0.76), 0.02, Math.sin(a) * (R * 0.76), 0, 0, 0, 0.18, 0.03, 0.18); }
    for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU + 0.13; st.add(BOX, '#3a4a8a', Math.cos(a) * (R + 0.15), 0.35, Math.sin(a) * (R + 0.15), 0, -a, 0, 0.4, 0.9, 1.4); gl.add(SPH_LO, k % 2 ? '#ff3d6e' : '#ffd23f', Math.cos(a) * (R + 0.15), 0.95, Math.sin(a) * (R + 0.15), 0, 0, 0, 0.22); }
    // gears in the background
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + (k - 2.5) * 0.45, r = R + 9 + (k % 2) * 3, y = 2 + (k % 3) * 2, gr = 2.5 + (k % 2);
      st.add(CYL8, '#8a9ad0', Math.cos(a) * r, y, Math.sin(a) * r, 0, -a, Math.PI / 2, gr, 0.6, gr);
      st.add(CYL, '#aebce6', Math.cos(a) * (r - 0.1), y, Math.sin(a) * (r - 0.1), 0, -a, Math.PI / 2, gr * 0.75, 0.62, gr * 0.75);
      st.add(CYL, '#5b6b9a', Math.cos(a) * (r - 0.2), y, Math.sin(a) * (r - 0.2), 0, -a, Math.PI / 2, gr * 0.25, 0.7, gr * 0.25);
    }
    scene.add(st.mesh(), gl.mesh(GLOW, false, false));
    cloudsBelow(scene, 8);
    // ---- the robot (own material so it can flash) ----
    const bossMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: (VC as THREE.MeshToonMaterial).gradientMap, emissive: '#000000' });
    const TIN = '#9fb0d8', DARK = '#5b6b9a', GOLD = '#ffd23f';
    const boss = new THREE.Group(), body = new THREE.Group();
    boss.add(body);
    boss.position.z = BZ;
    scene.add(boss);
    const mk = (b: Batch, parent: THREE.Object3D) => { const m = b.mesh(bossMat); parent.add(m); return m; };
    const legs = [-1, 1].map((sd) => {
      const g = new THREE.Group();
      g.position.set(sd * 1.05, 2, 0);
      const b = new Batch();
      b.add(CYL, DARK, 0, -1, 0, 0, 0, 0, 0.55, 2, 0.55);
      for (let q = 0; q < 3; q++) b.add(TOR, GOLD, 0, -0.4 - q * 0.55, 0, Math.PI / 2, 0, 0, 0.58, 0.58, 1.5);
      b.add(BOX, TIN, 0, -1.85, 0.25, 0, 0, 0, 1.3, 0.45, 1.8);
      b.add(BOX, DARK, 0, -2.05, 0.25, 0, 0, 0, 1.36, 0.1, 1.86);
      mk(b, g);
      boss.add(g);
      return g;
    });
    const tb = new Batch();
    tb.add(BOX, TIN, 0, 3.9, 0, 0, 0, 0, 3.4, 2.9, 2.4);
    tb.add(BOX, DARK, 0, 2.35, 0, 0, 0, 0, 3.0, 0.35, 2.1);
    tb.add(BOX, DARK, 0, 5.4, 0, 0, 0, 0, 3.6, 0.2, 2.6);
    for (let q = 0; q < 6; q++) for (const sd of [-1, 1]) tb.add(SPH_LO, GOLD, sd * 1.6, 2.7 + q * 0.48, 1.21, 0, 0, 0, 0.09);
    tb.add(CYL, DARK, 0, HEART_Y, 1.17, Math.PI / 2, 0, 0, 0.95, 0.12, 0.95);
    // the wind-up key on the back
    tb.add(CYL8, GOLD, 0, 4, -1.6, Math.PI / 2, 0, 0, 0.16, 0.9, 0.16);
    // head
    tb.add(BOX, TIN, 0, 6.35, 0.1, 0, 0, 0, 2.3, 1.7, 1.9);
    tb.add(BOX, DARK, 0, 5.65, 0.95, 0, 0, 0, 1.6, 0.25, 0.2);
    for (let q = 0; q < 5; q++) tb.add(BOX, '#ffffff', -0.6 + q * 0.3, 5.66, 1.06, 0, 0, 0, 0.18, 0.16, 0.05);
    tb.add(CYL8, DARK, 0, 7.5, 0, 0, 0, 0, 0.07, 0.8, 0.07);
    for (const sd of [-1, 1]) tb.add(CYL, DARK, sd * 1.2, 6.4, 0.1, 0, 0, Math.PI / 2, 0.35, 0.2, 0.35);
    mk(tb, body);
    const keyB = new Batch();
    for (const sd of [-1, 1]) keyB.add(SPH, GOLD, sd * 0.55, 0, 0, 0, 0, 0, 0.5, 0.42, 0.14);
    keyB.add(CYL8, GOLD, 0, 0, 0, 0, 0, Math.PI / 2, 0.14, 0.4, 0.14);
    const key = mk(keyB, body);
    key.position.set(0, 4, -2.1);
    // glowing parts: heart, eyes, antenna tip
    const glowB = new Batch();
    glowB.add(SPH, '#ff5fae', -0.3, 0.12, 0, 0, 0, 0, 0.45, 0.45, 0.2);
    glowB.add(SPH, '#ff5fae', 0.3, 0.12, 0, 0, 0, 0, 0.45, 0.45, 0.2);
    glowB.add(CONE, '#ff5fae', 0, -0.32, 0, Math.PI, 0, 0, 0.62, 0.62, 0.2);
    const heart = new THREE.Mesh(glowB.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true }));
    heart.position.set(0, HEART_Y, 1.26);
    body.add(heart);
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#7af0ff' });
    const eyes = [-1, 1].map((sd) => { const m = new THREE.Mesh(SPH, eyeMat); m.scale.set(0.34, 0.34, 0.15); m.position.set(sd * 0.55, 6.55, 1.05); body.add(m); return m; });
    void eyes;
    const tip = new THREE.Mesh(SPH_LO, eyeMat);
    tip.scale.setScalar(0.22);
    tip.position.set(0, 7.95, 0);
    body.add(tip);
    const arms = [-1, 1].map((sd) => {
      const sh = new THREE.Group();
      sh.position.set(sd * 2.05, 4.9, 0);
      const b = new Batch();
      b.add(SPH, DARK, 0, 0, 0, 0, 0, 0, 0.55);
      b.add(CYL, TIN, 0, -1.2, 0, 0, 0, 0, 0.36, 2.2, 0.36);
      for (let q = 0; q < 3; q++) b.add(TOR, GOLD, 0, -0.6 - q * 0.6, 0, Math.PI / 2, 0, 0, 0.4, 0.4, 1.4);
      b.add(SPH, DARK, 0, -2.45, 0, 0, 0, 0, 0.55);
      for (const cz of [-1, 1]) b.add(CONE, TIN, 0, -2.95, cz * 0.25, Math.PI, 0, cz * 0.3, 0.2, 0.6, 0.2);
      mk(b, sh);
      body.add(sh);
      return sh;
    });
    // shield bubble
    const shieldMat = new THREE.MeshBasicMaterial({ color: '#5ad0ff', transparent: true, opacity: 0, depthWrite: false });
    const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), shieldMat);
    shield.position.y = 4;
    shield.scale.set(3.3, 4.6, 3.3);
    shield.visible = false;
    boss.add(shield);
    const shieldW = new THREE.Mesh(new THREE.IcosahedronGeometry(1.01, 1), new THREE.MeshBasicMaterial({ color: '#b8f0ff', wireframe: true, transparent: true, opacity: 0.6 }));
    shield.add(shieldW);
    // hp bar
    const hpG = new THREE.Group();
    const hpBg = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.62), new THREE.MeshBasicMaterial({ color: '#1a0b33' }));
    const hpFill = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.42).translate(2.2, 0, 0), new THREE.MeshBasicMaterial({ color: '#ff3d6e' }));
    hpFill.position.set(-2.2, 0, 0.01);
    hpG.add(hpBg, hpFill);
    scene.add(hpG);
    // bombs (ground, held, flying): one instanced mesh
    const bombB = new Batch();
    bombB.add(SPH, '#ff5fae', 0, 0, 0, 0, 0, 0, 0.42);
    bombB.add(TOR, '#ffffff', 0, 0, 0, 0, 0.6, 0, 0.42, 0.42, 2.2);
    bombB.add(CONE, '#7af0ff', 0.52, 0, 0, 0, 0, Math.PI / 2, 0.24, 0.34, 0.24); bombB.add(CONE, '#7af0ff', -0.52, 0, 0, 0, 0, -Math.PI / 2, 0.24, 0.34, 0.24);
    bombB.add(CYL8, '#1a0b33', 0, 0.48, 0, 0, 0, 0.3, 0.04, 0.24, 0.04);
    bombB.add(SPH_LO, '#ffe14a', 0.06, 0.62, 0, 0, 0, 0, 0.09);
    const bombM = new THREE.InstancedMesh(bombB.geometry(), VC, 16);
    bombM.castShadow = true;
    bombM.frustumCulled = false;
    bombM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(bombM);
    // stomp waves: glowing walls
    const waveMat = new THREE.MeshBasicMaterial({ color: '#ffe14a', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    const waveGeo = new THREE.CylinderGeometry(1, 1, 0.55, 64, 1, true, -Math.PI * 0.62, Math.PI * 1.24).translate(0, 0.27, 0);
    const waves = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(waveGeo, waveMat); m.visible = false; m.position.z = BZ; scene.add(m); return m; });
    // falling screws and their marks
    const markM = new THREE.InstancedMesh(new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff3d6e', transparent: true, opacity: 0.85, depthWrite: false }), 10);
    const markFill = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff3d6e', transparent: true, opacity: 0.25, depthWrite: false }), 10);
    const screwB = new Batch();
    screwB.add(CYL8, '#c8d4f0', 0, 0.6, 0, 0, 0, 0, 0.75, 0.5, 0.75);
    screwB.add(CYL, '#8a9ad0', 0, -0.4, 0, 0, 0, 0, 0.3, 1.6, 0.3);
    screwB.add(BOX, '#5b6b9a', 0, 0.86, 0, 0, 0, 0, 1.0, 0.08, 0.16);
    const screwM = new THREE.InstancedMesh(screwB.geometry(), VC, 10);
    for (const m of [markM, markFill, screwM]) { m.frustumCulled = false; m.count = 0; scene.add(m); }
    screwM.castShadow = true;
    const figs = mgFigures(scene, setup);
    const sparks = new Sparks(scene, 200);
    const ripples = new Ripples(scene, 6);
    const ph = new Float32Array(figs.length);
    const dmy = new THREE.Object3D();
    const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
    let cele: boolean[] | null = null;
    let flash = 0, shakeT = 0, keyA = 0, downK = 0;
    return {
      scene, cam,
      frame(s, dt, t) {
        flash = Math.max(0, flash - dt * 4);
        shakeT = Math.max(0, shakeT - dt);
        bossMat.emissive.setRGB(flash, flash, flash * 0.9);
        // boss pose
        boss.rotation.y = s.yaw;
        const k = s.dur > 0 ? clamp(s.pt / s.dur, 0, 1) : 0;
        let lean = 0, lift = 0, armUp = 0, cross = 0;
        if (s.ph === 'stomp') { lift = Math.sin(k * Math.PI * 0.5) * 1.6; lean = k * 0.08; }
        else if (s.ph === 'bolts') armUp = Math.sin(k * Math.PI);
        else if (s.ph === 'shield') cross = Math.min(1, s.pt * 5) * Math.min(1, (s.dur - s.pt) * 5);
        legs[1].position.y = 2 + lift; legs[1].rotation.x = -lift * 0.25;
        legs[0].position.y = 2;
        body.rotation.x = lean;
        body.position.y = Math.sin(t * 3) * 0.06 + (s.ph === 'idle' ? 0 : 0.02);
        arms.forEach((a, q) => { const sd = q ? 1 : -1; a.rotation.z = sd * (0.18 + armUp * 2.5 - cross * 0.2) + Math.sin(t * 2 + q) * 0.05; a.rotation.x = -cross * 1.3 - armUp * 0.2; a.rotation.y = sd * cross * -0.6; });
        keyA += dt * (s.rage ? 9 : 3) + flash * dt * 20;
        key.rotation.z = keyA;
        eyeMat.color.copy(col(s.ph === 'down' ? '#3a4a8a' : s.rage ? '#ff3d6e' : s.ph === 'bolts' ? '#ffe14a' : '#7af0ff'));
        heart.scale.setScalar(1 + Math.sin(t * (s.rage ? 12 : 6)) * 0.08 + flash * 0.3);
        shield.visible = s.ph === 'shield';
        if (shield.visible) { shieldMat.opacity = 0.28 * cross + 0.05; shield.rotation.y = t; }
        if (s.ph === 'down') { downK = Math.min(1, downK + dt * 1.2); boss.rotation.x = -downK * 1.25; boss.position.y = -downK * 0.6; if (Math.random() < 0.4) sparks.shoot((Math.random() - 0.5) * 3, 3 + Math.random() * 3, BZ + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4, 4, (Math.random() - 0.5) * 4, Math.random() < 0.5 ? '#ffd23f' : '#ffffff', 0.15, 0.6); }
        else { downK = 0; boss.rotation.x = 0; boss.position.y = 0; }
        // hp bar faces the camera
        hpG.position.set(0, 7.3 - downK * 3, BZ + 2);
        hpG.quaternion.copy(cam.quaternion);
        hpFill.scale.x = Math.max(0.001, s.hp / s.max);
        // waves
        for (let q = 0; q < waves.length; q++) {
          const w = s.waves[q], m = waves[q];
          m.visible = !!w;
          if (w) { m.scale.set(w.r, 1 + Math.sin(t * 30) * 0.08, w.r); }
        }
        waveMat.opacity = 0.65 + Math.sin(t * 25) * 0.2;
        // bolts
        let bn = 0;
        for (const b of s.bolts) {
          if (bn >= 10) break;
          const kk = clamp(b.t / BOLT_T, 0, 1);
          dmy.rotation.set(0, 0, 0);
          dmy.position.set(b.x, 0.05, b.z); dmy.scale.setScalar(BOLT_R * (1.25 - kk * 0.25)); dmy.updateMatrix(); markM.setMatrixAt(bn, dmy.matrix);
          dmy.scale.setScalar(BOLT_R * kk); dmy.updateMatrix(); markFill.setMatrixAt(bn, dmy.matrix);
          dmy.position.set(b.x, 0.6 + 16 * (1 - kk) * (1 - kk), b.z); dmy.rotation.set(0, b.t * 8, 0); dmy.scale.setScalar(1); dmy.updateMatrix(); screwM.setMatrixAt(bn, dmy.matrix);
          bn++;
        }
        markM.count = markFill.count = screwM.count = bn;
        markM.instanceMatrix.needsUpdate = markFill.instanceMatrix.needsUpdate = screwM.instanceMatrix.needsUpdate = true;
        // bombs
        let mn = 0;
        for (const b of s.bombs) {
          if (mn >= 16) break;
          dmy.position.set(b.x, 0.45 + Math.abs(Math.sin(t * 3 + b.id)) * 0.2, b.z); dmy.rotation.set(0, t * 2 + b.id, 0); dmy.scale.setScalar(Math.min(1, b.t * 4) * 1.1); dmy.updateMatrix();
          bombM.setMatrixAt(mn++, dmy.matrix);
        }
        for (let i = 0; i < s.pl.length && mn < 16; i++) {
          const p = s.pl[i];
          if (!p.hold) continue;
          dmy.position.set(p.x, p.y + 2.25, p.z); dmy.rotation.set(0, t * 3, 0); dmy.scale.setScalar(1); dmy.updateMatrix();
          bombM.setMatrixAt(mn++, dmy.matrix);
        }
        for (const sh of s.shots) {
          if (mn >= 16) break;
          const kk = clamp(sh.t / FLIGHT, 0, 1);
          _a.set(sh.x, 1.9, sh.z);
          _b.set(Math.sin(s.yaw) * 1.4, HEART_Y, BZ + Math.cos(s.yaw) * 1.4);
          dmy.position.set(lerp(_a.x, _b.x, kk), lerp(_a.y, _b.y, kk) + Math.sin(kk * Math.PI) * 3, lerp(_a.z, _b.z, kk));
          dmy.rotation.set(sh.t * 12, sh.t * 7, 0); dmy.scale.setScalar(1); dmy.updateMatrix();
          bombM.setMatrixAt(mn++, dmy.matrix);
        }
        bombM.count = mn;
        bombM.instanceMatrix.needsUpdate = true;
        // figures
        for (let i = 0; i < figs.length; i++) {
          const f = figs[i], p = s.pl[i];
          if (!p) continue;
          f.root.position.set(p.x, 0, p.z);
          f.hop.position.y = p.y;
          f.root.visible = !(p.inv > 0 && p.stun <= 0 && Math.sin(t * 40) > 0.3);
          if (cele) continue;
          if (p.stun > 0) { f.yawT += dt * 14; f.yaw = f.yawT; }
          else if (p.y > 0) { const q = clamp(p.vy / JUMP_V, -1, 1) * 0.12; f.sq.scale.set(1 - q, 1 + q, 1 - q); f.yawT = Math.atan2(-p.x, -p.z); }
          else { runFig(f, p.vx, p.vz, dt, ph, i); if (Math.hypot(p.vx, p.vz) < 0.6) f.yawT = Math.atan2(-p.x, -p.z); }
        }
        if (cele) celebrate(figs, cele, t, cam);
        for (const f of figs) updateFigure(f, dt, t);
        sparks.update(dt);
        ripples.update(dt);
        const aspect = VW / VH, w = R + 0.6;
        const cd = Math.max((w * 1.06) / (0.384 * aspect), (w * 1.02) / 0.384);
        cam.position.set(0, cd * (aspect < 1 ? 0.78 : 0.6), cd * (aspect < 1 ? 0.62 : 0.8));
        cam.lookAt(0, aspect < 1 ? 0.6 : 1.4, aspect < 1 ? -0.4 : -0.6);
        if (shakeT > 0) { cam.position.x += Math.sin(t * 70) * shakeT * 0.6; cam.position.y += Math.cos(t * 63) * shakeT * 0.4; }
      },
      fx(e, me) {
        if (e.k === 'stomp') { sfx.land(); sfx.boom(); shakeT = 0.35; ripples.spawn(0, 0.1, BZ, '#ffe14a', BR, BR + 3, 0.4); sparks.emit(Math.sin(s0yaw()) * 1.2, 0.3, BZ + Math.cos(s0yaw()) * 1.2, 16, '#c8d4f0', 6, 4, 0.2, 0.6); }
        else if (e.k === 'bolts') { sfx.whistle(); }
        else if (e.k === 'shield') { sfx.whoosh(); }
        else if (e.k === 'bolt') { sfx.bonk(); shakeT = Math.max(shakeT, 0.12); sparks.emit(e.x!, 0.4, e.z!, 12, '#c8d4f0', 5, 4, 0.16, 0.5); ripples.spawn(e.x!, 0.08, e.z!, '#ff3d6e', 0.4, BOLT_R + 0.4, 0.35); }
        else if (e.k === 'zap') { const f = figs[e.p!]; if (f) { void squashLand(f, 0.4); if (e.p === me) { sfx.lose(); floatText(f.root.position.clone().setY(2.6), 'Autsch!', '#ff8fb0', scene); } } }
        else if (e.k === 'drop') { const f = figs[e.p!]; if (f) sparks.emit(f.root.position.x, 1.8, f.root.position.z, 8, '#ff5fae', 3, 3, 0.14, 0.5); }
        else if (e.k === 'grab') { if (e.p === me || me < 0) sfx.pop(); }
        else if (e.k === 'throw') { if (e.p === me || me < 0) sfx.whoosh(); }
        else if (e.k === 'jump') { if (e.p === me || me < 0) sfx.jump(); }
        else if (e.k === 'far') { if (e.p === me) { const f = figs[e.p!]; floatText(f.root.position.clone().setY(2.8), 'Zu weit weg!', '#ffe14a', scene); sfx.bonk(); } }
        else if (e.k === 'block') { sfx.bonk(); _v.set(Math.sin(s0yaw()) * 3.4, 4.2, BZ + Math.cos(s0yaw()) * 3.4); sparks.emit(_v.x, _v.y, _v.z, 10, '#7af0ff', 5, 3, 0.15, 0.5); if (e.p === me) floatText(_v.clone(), 'Abgeprallt!', '#7af0ff', scene); }
        else if (e.k === 'hit') {
          sfx.hit(); flash = 1; shakeT = Math.max(shakeT, 0.1);
          _v.set(Math.sin(s0yaw()) * 1.4, HEART_Y, BZ + Math.cos(s0yaw()) * 1.4);
          sparks.emit(_v.x, _v.y, _v.z, 18, '#ff5fae', 6, 4, 0.18, 0.6);
          sparks.emit(_v.x, _v.y, _v.z, 8, '#ffe14a', 5, 5, 0.14, 0.5);
          if (e.p === me || me < 0) floatText(_v.clone().setY(HEART_Y + 1.6), 'Treffer!', '#dcff1f', scene);
        } else if (e.k === 'rage') { sfx.creak(); floatText(new THREE.Vector3(0, 8.4, BZ), 'Er wird wütend!', '#ff3d6e', scene); }
        else if (e.k === 'down') { sfx.boom(); sfx.star(); shakeT = 0.6; floatText(new THREE.Vector3(0, 6, BZ), 'Besiegt!', '#dcff1f', scene); }
      },
      celebrate(w) { cele = w; if (!w) uncelebrate(figs); },
    };
    function s0yaw() { return boss.rotation.y; }
  },
};

export default blechkoloss;
