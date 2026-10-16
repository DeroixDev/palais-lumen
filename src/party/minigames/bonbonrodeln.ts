// Bonbon-Rodeln (Jeder gegen jeden): a sledge race down a sugar-icing slope. Steer left and
// right, go through the candy-cane gates for a turbo and keep clear of gumdrops and gingerbread
// blocks. First into the finish wins; when time runs out, the furthest wins.

import { sfx } from '../sfx';
import { clamp } from '../util';
import { celebrate, squashLand, updateFigure } from '../view3d/figures';
import { BOX, Batch, CYL, CYL8, FONT, GLOW, SPH_LO, THREE, VC, ctex, skyTex } from '../view3d/kit';
import { VH, VW, floatText } from '../view3d/stage';
import { KBD, mgFigures, mgLights } from './common';
import { Sparks, uncelebrate, winTitle } from './mgkit-a';
import { NO_INPUT, WIN_COINS, type MgCtx, type MinigameDef } from './types';

const D = 35;
const LEN = 430;
const HW = 6.4;
const SLOPE = 0.22;
const BASE_V = 15.5, STEER = 10.5, BOOST = 7.5, GATE_W = 1.75;
/** Course centre line (fixed shape; gates and obstacles are random). */
const cx = (d: number) => 5 * Math.sin(d / 46) + 2.4 * Math.sin(d / 19 + 1);
const cxd = (d: number) => (5 / 46) * Math.cos(d / 46) + (2.4 / 19) * Math.cos(d / 19 + 1);

interface Pl { d: number; x: number; v: number; vx: number; boost: number; stun: number; fin: number; gates: number; crash: number; hit: number; bump: number }
interface Gate { d: number; x: number }
interface Ob { d: number; x: number; k: number }
interface S {
  cid: number;
  pl: Pl[];
  gates: Gate[];
  obs: Ob[];
  first: number;
  _ai: { rt: number; tx: number; noise: number; look: number; react: number; off: number }[];
}

const SKILL = { leicht: [1.9, 8, 0.3], normal: [1.2, 10, 0.22], stark: [0.3, 18, 0.08] } as const;

function think(s: S, i: number, ctx: MgCtx) {
  const ai = s._ai[i], p = s.pl[i];
  // preferred line: the next gate (aimed with some noise), else stay where we are
  let want = p.x;
  for (const g of s.gates) if (g.d > p.d + 1) { if (g.d - p.d < ai.look * 2.6) want = g.x + ai.off; break; }
  // try lateral lines and keep the one with the fewest obstacles in reach
  let best = p.x, bs = -1e9;
  for (let c = -HW + 0.8; c <= HW - 0.8 + 1e-6; c += 0.4) {
    let sc = -Math.abs(c - want) * 0.6 - Math.abs(c - p.x) * 0.08;
    for (const o of s.obs) {
      const dd = o.d - p.d;
      if (dd < -0.5 || dd > ai.look) continue;
      // where can we be by the time we reach it?
      const tt = Math.max(0.05, dd / Math.max(p.v, 4)), reach = STEER * 0.8 * tt;
      const lx = clamp(c, p.x - reach, p.x + reach);
      const gap = Math.abs(o.x - lx) - (o.k ? 1.25 : 1.05) - 0.45;
      if (gap < 0) sc -= 12 * (1 - dd / (ai.look + 1)) + 4;
      else if (gap < 0.6) sc -= (0.6 - gap) * 3;
    }
    if (sc > bs) { bs = sc; best = c; }
  }
  if (ctx.rng() < 0.12) ai.off = (ctx.rng() - 0.5) * 2 * ai.noise;
  ai.tx = best;
}

const bonbonrodeln: MinigameDef<S> = {
  id: 'bonbonrodeln',
  name: 'Bonbon-Rodeln',
  type: 'ffa',
  seconds: D,
  players: [2, 4],
  pro: true,
  online: 'ok',
  card: {
    sub: 'Rodelt den Zuckerhang hinunter. Fahrt durch die Zuckerstangen-Tore für Turbo und weicht den Gummibonbons aus. Wer zuerst unten ist, gewinnt.',
    rules: () => [
      '<b>Tor = Turbo:</b> Zwischen den zwei Zuckerstangen durch, und der Schlitten schießt los.',
      '<b>Gummibonbons und Lebkuchen</b> bremsen dich hart aus. Der Rand bremst ein wenig.',
      'Wer zuerst im Ziel ist, gewinnt 10 Münzen. Ist die Zeit vorher um, gewinnt, wer am weitesten kam.',
    ],
    controls: () => ({ keys: `${KBD('←')} ${KBD('→')} oder ${KBD('A')} ${KBD('D')}: lenken`, touch: 'Daumen-Stick nach links und rechts: lenken' }),
    touch: () => ({ joy: true, buttons: [] }),
  },
  init(ctx) {
    const gates: Gate[] = [];
    for (let d = 42; d < LEN - 25; d += 26 + ctx.rng() * 8) gates.push({ d: Math.round(d * 10) / 10, x: Math.round((ctx.rng() - 0.5) * 2 * (HW - 2.2) * 10) / 10 });
    const obs: Ob[] = [];
    for (let d = 26; d < LEN - 15; d += 5.5 + ctx.rng() * 6) {
      if (gates.some((g) => Math.abs(g.d - d) < 5)) continue;
      const k = ctx.rng() < 0.3 ? 1 : 0;
      obs.push({ d: Math.round(d * 10) / 10, x: Math.round((ctx.rng() - 0.5) * 2 * (HW - 1) * 10) / 10, k });
      if (d > 120 && ctx.rng() < 0.35) obs.push({ d: Math.round((d + 0.6) * 10) / 10, x: Math.round((ctx.rng() - 0.5) * 2 * (HW - 1) * 10) / 10, k: 0 });
    }
    const n = ctx.setup.players.length;
    return {
      cid: Math.floor(ctx.rng() * 1e9),
      pl: ctx.setup.players.map((_, i) => ({ d: 0, x: (i - (n - 1) / 2) * 2.4, v: 0, vx: 0, boost: 0, stun: 0, fin: -1, gates: 0, crash: 0, hit: -1, bump: 0 })),
      gates, obs, first: -1,
      _ai: ctx.setup.players.map((p) => { const [noise, look, react] = SKILL[p.bot ?? 'normal']; return { rt: ctx.rng() * 0.2, tx: 0, noise, look, react, off: 0 }; }),
    };
  },
  step(s, dt, inputs, ctx) {
    const time = ctx.time;
    s.pl.forEach((p, i) => {
      const inp = p.fin >= 0 ? NO_INPUT : inputs[i];
      p.stun -= dt; p.bump -= dt;
      p.boost = Math.max(0, p.boost - dt * 2.6);
      const target = p.fin >= 0 ? 2 : p.stun > 0 ? 3 : BASE_V + p.boost;
      p.v += (target - p.v) * (1 - Math.exp(-dt * (p.v < target ? 0.95 : 2.4)));
      const ix = p.stun > 0 ? 0 : clamp(inp.x, -1, 1);
      p.vx += (ix * STEER - p.vx) * (1 - Math.exp(-dt * 7));
      const pd = p.d;
      p.d += p.v * dt;
      p.x += p.vx * dt;
      if (Math.abs(p.x) > HW - 0.55) { p.x = Math.sign(p.x) * (HW - 0.55); p.vx *= -0.3; p.v *= Math.exp(-dt * 1.2); }
      for (const g of s.gates) {
        if (pd < g.d && p.d >= g.d) {
          if (Math.abs(p.x - g.x) < GATE_W) { p.boost = BOOST; p.gates++; ctx.fx({ k: 'gate', p: i }); }
          else ctx.fx({ k: 'miss', p: i });
        }
      }
      if (p.stun <= 0) for (let k = 0; k < s.obs.length; k++) {
        const o = s.obs[k];
        if (k === p.hit || Math.abs(o.d - p.d) > 0.9) continue;
        if (Math.abs(o.x - p.x) < (o.k ? 1.25 : 1.05)) {
          p.hit = k; p.stun = 0.75; p.v *= 0.32; p.boost = 0; p.crash++;
          p.vx = (p.x >= o.x ? 1 : -1) * 4;
          ctx.fx({ k: 'crash', p: i });
          break;
        }
      }
      if (p.fin < 0 && p.d >= LEN) { p.fin = time; if (s.first < 0) s.first = time; ctx.fx({ k: 'fin', p: i, v: s.pl.filter((q) => q.fin >= 0).length }); }
    });
    // sledges bump sideways into each other
    for (let i = 0; i < s.pl.length; i++) for (let j = i + 1; j < s.pl.length; j++) {
      const a = s.pl[i], b = s.pl[j];
      if (Math.abs(a.d - b.d) > 1.5) continue;
      const dx = b.x - a.x;
      if (Math.abs(dx) > 1.15) continue;
      const sg = dx >= 0 ? 1 : -1, push = (1.15 - Math.abs(dx)) / 2;
      a.x -= sg * push; b.x += sg * push;
      const rel = a.vx - b.vx;
      if (rel * sg > 0) { a.vx -= rel * 0.7; b.vx += rel * 0.7; }
      a.vx -= sg * 2.5; b.vx += sg * 2.5;
      if (a.bump <= 0 && b.bump <= 0) { a.bump = b.bump = 0.5; ctx.fx({ k: 'bump', p: i, v: j }); }
    }
  },
  bot(s, i, ctx) {
    const ai = s._ai[i], p = s.pl[i];
    if (p.fin >= 0) return NO_INPUT;
    ai.rt -= 1 / 60;
    if (ai.rt <= 0) { ai.rt = ai.react * (0.7 + ctx.rng() * 0.6); think(s, i, ctx); }
    const x = clamp((ai.tx - p.x) * 0.9 - p.vx * 0.12, -1, 1);
    return { ...NO_INPUT, x: Math.abs(x) < 0.08 ? 0 : x };
  },
  over: (s, ctx) => ctx.setup.mode === 'play' && s.first >= 0 && (s.pl.every((p) => p.fin >= 0) || ctx.time > s.first + 3.5),
  result(s, ctx) {
    const order = s.pl.map((_, i) => i).sort((a, b) => {
      const A = s.pl[a], B = s.pl[b];
      if (A.fin >= 0 && B.fin >= 0) return A.fin - B.fin;
      if (A.fin >= 0 || B.fin >= 0) return A.fin >= 0 ? -1 : 1;
      return B.d - A.d;
    });
    const top = s.pl[order[0]];
    const win = new Set(order.filter((i) => { const p = s.pl[i]; return top.fin >= 0 ? p.fin === top.fin : p.fin < 0 && Math.abs(p.d - top.d) < 0.01; }));
    const rows = s.pl.map((p, i) => {
      const w = win.has(i);
      const note = (p.fin >= 0 ? `im Ziel nach ${p.fin.toFixed(2).replace('.', ',')} s` : `${Math.round((Math.min(p.d, LEN) / LEN) * 100)} % der Strecke`) + ` · ${p.gates} Tore`;
      return { i, win: w, coins: w ? WIN_COINS : 0, score: 1000 - order.indexOf(i) * 100 + p.gates, note };
    });
    return { rows, title: winTitle([...win].map((i) => ctx.setup.players[i].name)) };
  },
  score: (s, i) => {
    const p = s.pl[i];
    if (!p) return { v: '' };
    if (p.fin >= 0) return { v: 'Ziel!' };
    let place = 1;
    for (const q of s.pl) if (q !== p && (q.fin >= 0 || q.d > p.d)) place++;
    return { v: `${place}. Platz` };
  },
  view(setup) {
    const scene = new THREE.Scene();
    scene.background = skyTex(['#ff9ad0', '#ffd0e8', '#fff6e0']);
    scene.fog = new THREE.Fog('#ffe6f2', 50, 140);
    const L = mgLights(scene, 22);
    const cam = new THREE.PerspectiveCamera(50, 1, 0.5, 260);
    const wp = (d: number, x: number, out: THREE.Vector3, y = 0) => out.set(cx(d) + x, -d * SLOPE + y, -d);
    // the slope: icing strips, candy fences and sugar banks (one draw call)
    // the slope is cut into chunks so the parts behind the camera get culled
    const chunks: Batch[] = [], gl = new Batch();
    const B = (d: number) => { const k = clamp(Math.floor((d + 30) / 90), 0, 6); return chunks[k] ?? (chunks[k] = new Batch()); };
    const rx = -Math.atan(SLOPE);
    for (let d = -20, k = 0; d < LEN + 50; d += 4, k++) {
      const yaw = -Math.atan(cxd(d + 2));
      B(d).add(BOX, k % 2 ? '#ffffff' : '#fff0f8', cx(d + 2), -(d + 2) * SLOPE - 0.25, -(d + 2), rx, yaw, 0, HW * 2 + 0.6, 0.5, 4.15 / Math.cos(rx));
      for (const sd of [-1, 1]) {
        const ex = cx(d + 2) + sd * (HW + 0.5);
        B(d).add(BOX, k % 2 ? '#ff5fae' : '#ffffff', ex, -(d + 2) * SLOPE + 0.25, -(d + 2), rx, yaw, 0, 0.35, 0.5, 4.1);
        if (k % 2 === 0) B(d).add(SPH_LO, '#ffffff', cx(d) + sd * (HW + 2.6 + (k % 3)), -d * SLOPE - 0.6, -d, 0, k, 0, 2.2, 1.3, 2.6);
        if (k % 4 === 0) { B(d).add(CYL8, '#ffffff', ex, -d * SLOPE + 1, -d, 0, 0, 0, 0.13, 1.6, 0.13); gl.add(SPH_LO, sd > 0 ? '#ff4fb0' : '#2fe6ff', ex, -d * SLOPE + 1.9, -d, 0, 0, 0, 0.24); }
      }
    }
    // candy hills along the way
    for (let k = 0; k < 40; k++) {
      const d = k * 12 - 10, sd = k % 2 ? 1 : -1, off = HW + 9 + (k % 5) * 3;
      const c = ['#ffb3d9', '#b8f0ff', '#fff0a0', '#d9c2ff'][k % 4];
      B(d).add(SPH_LO, c, cx(d) + sd * off, -d * SLOPE - 1, -d, 0, 0, 0, 5 + (k % 3), 3.5 + (k % 4), 5);
      if (k % 3 === 0) { B(d).add(CYL8, '#ffffff', cx(d) + sd * (off - 2), -d * SLOPE + 3, -d - 3, 0, 0, 0.1 * sd, 0.3, 6, 0.3); B(d).add(CYL, ['#ff4fb0', '#35d4ff', '#ffd23f'][k % 3], cx(d) + sd * (off - 2) - sd * 0.3, -d * SLOPE + 6.4, -d - 3, Math.PI / 2, 0, 0, 1.4, 0.35, 1.4); }
    }
    // finish arch
    const fy = -LEN * SLOPE, fx0 = cx(LEN);
    for (const sd of [-1, 1]) for (let q = 0; q < 6; q++) B(LEN).add(CYL8, q % 2 ? '#ff3d6e' : '#ffffff', fx0 + sd * (HW + 0.6), fy + 0.5 + q, -LEN, 0, 0, 0, 0.35, 1, 0.35);
    B(LEN).add(BOX, '#1a0b33', fx0, fy + 6.6, -LEN, 0, 0, 0, HW * 2 + 2.4, 1.6, 0.4);
    for (let q = 0; q < 14; q++) gl.add(SPH_LO, q % 2 ? '#dcff1f' : '#ff3d9a', fx0 - HW - 0.4 + q * ((HW * 2 + 0.8) / 13), fy + 7.55, -LEN + 0.1, 0, 0, 0, 0.22);
    for (let q = 0; q < 10; q++) B(LEN).add(BOX, q % 2 ? '#1a0b33' : '#ffffff', fx0 - HW + (q + 0.5) * (HW * 2 / 10), fy + 0.02, -LEN, 0, 0, 0, (HW * 2) / 10, 0.06, 0.9);
    for (const c of chunks) if (c) { const m = c.mesh(); m.castShadow = false; scene.add(m); }
    scene.add(gl.mesh(GLOW, false, false));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.4), new THREE.MeshBasicMaterial({ transparent: true, map: ctex(384, 90, (g) => { g.font = `italic 900 70px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#dcff1f'; g.fillText('ZIEL', 192, 50); }) }));
    sign.position.set(fx0, fy + 6.6, -LEN + 0.25);
    scene.add(sign);
    // gates and obstacles: instanced, filled from the state once per course
    const gateB = new Batch();
    for (const sd of [-1, 1]) for (let q = 0; q < 7; q++) gateB.add(CYL8, q % 2 ? '#ff3d6e' : '#ffffff', sd * GATE_W, 0.25 + q * 0.5, 0, 0, 0, 0, 0.2, 0.5, 0.2);
    const torLo = new THREE.TorusGeometry(1, 0.08, 4, 24, Math.PI);
    gateB.add(torLo, '#ff3d6e', 0, 3.1, 0, 0, 0, 0, GATE_W, GATE_W * 0.6, 2.6);
    torLo.dispose();
    for (const sd of [-1, 1]) gateB.add(SPH_LO, '#ffd23f', sd * GATE_W, 3.6, 0, 0, 0, 0, 0.3);
    const gateM = new THREE.InstancedMesh(gateB.geometry(), VC, 24);
    const HEMI_LO = new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    const dropB = new Batch();
    dropB.add(HEMI_LO, '#42e06a', 0, 0, 0, 0, 0, 0, 0.95, 1.3, 0.95); dropB.add(SPH_LO, '#ffffff', -0.3, 0.75, 0.55, 0, 0, 0, 0.16, 0.1, 0.1);
    const dropB2 = new Batch();
    dropB2.add(HEMI_LO, '#ff5f9e', 0, 0, 0, 0, 0, 0, 0.95, 1.3, 0.95); dropB2.add(SPH_LO, '#ffffff', -0.3, 0.75, 0.55, 0, 0, 0, 0.16, 0.1, 0.1);
    const gingB = new Batch();
    gingB.add(BOX, '#c9772f', 0, 0.6, 0, 0, 0, 0, 2.3, 1.2, 0.9); gingB.add(BOX, '#ffffff', 0, 1.22, 0, 0, 0, 0, 2.35, 0.1, 0.95);
    for (const sd of [-1, 0, 1]) gingB.add(SPH_LO, '#ff3d6e', sd * 0.7, 0.65, 0.47, 0, 0, 0, 0.13, 0.13, 0.05);
    const obM = [new THREE.InstancedMesh(dropB.geometry(), VC, 80), new THREE.InstancedMesh(gingB.geometry(), VC, 40), new THREE.InstancedMesh(dropB2.geometry(), VC, 80)];
    for (const m of [gateM, ...obM]) { m.count = 0; m.frustumCulled = false; scene.add(m); }
    gateM.castShadow = true;
    HEMI_LO.dispose();
    const dmy = new THREE.Object3D();
    let cid = -1;
    // only the gates and obstacles near the camera are drawn (also in the shadow pass)
    const cnt = [0, 0, 0];
    const fill = (s: S, d0: number) => {
      const lo = d0 - 18, hi = d0 + 120;
      let gn = 0;
      for (let k = 0; k < s.gates.length && gn < 24; k++) {
        const g = s.gates[k];
        if (g.d < lo || g.d > hi) continue;
        wp(g.d, g.x, dmy.position); dmy.rotation.set(0, -Math.atan(cxd(g.d)), 0); dmy.scale.setScalar(1); dmy.updateMatrix();
        gateM.setMatrixAt(gn++, dmy.matrix);
      }
      gateM.count = gn;
      gateM.instanceMatrix.needsUpdate = true;
      cnt[0] = cnt[1] = cnt[2] = 0;
      for (let k = 0; k < s.obs.length; k++) {
        const o = s.obs[k], m = o.k ? 1 : k % 2 ? 2 : 0;
        if (o.d < lo || o.d > hi || cnt[m] >= obM[m].instanceMatrix.count) continue;
        wp(o.d, o.x, dmy.position);
        dmy.rotation.set(0, (k * 1.7) % 0.8 - 0.4, 0);
        dmy.scale.setScalar(o.k ? 1 : 0.8 + (k % 3) * 0.1);
        dmy.updateMatrix();
        obM[m].setMatrixAt(cnt[m]++, dmy.matrix);
      }
      for (let k = 0; k < 3; k++) { obM[k].count = cnt[k]; obM[k].instanceMatrix.needsUpdate = true; }
    };
    // sledges (player colour) with the figures riding them
    const sleds = setup.players.map((p) => {
      const b = new Batch();
      b.add(BOX, p.color, 0, 0.32, 0, 0, 0, 0, 1.3, 0.22, 2);
      b.add(BOX, '#ffffff', 0, 0.45, -0.1, 0, 0, 0, 1.1, 0.06, 1.5);
      for (const sd of [-1, 1]) { b.add(BOX, '#1a0b33', sd * 0.55, 0.08, 0, 0, 0, 0, 0.12, 0.1, 2.2); b.add(CYL, '#1a0b33', sd * 0.55, 0.3, -1.1, 0, 0, Math.PI / 2, 0.22, 0.12, 0.22); }
      const m = b.mesh();
      scene.add(m);
      return m;
    });
    const figs = mgFigures(scene, setup, 0.85);
    const sparks = new Sparks(scene, 160, undefined, 9);
    const _v = new THREE.Vector3(), _c = new THREE.Vector3(), _l = new THREE.Vector3();
    const camPos = new THREE.Vector3(0, 8, 14), camLook = new THREE.Vector3(0, 0, -8);
    const prevD = new Float32Array(figs.length);
    let cele: boolean[] | null = null;
    let camInit = false;
    return {
      scene, cam,
      frame(s, dt, t, me) {
        if (s.cid !== cid) { cid = s.cid; camInit = false; }
        // who the camera follows: me, otherwise the leader
        let fol = me >= 0 && s.pl[me] ? me : 0;
        if (me < 0) s.pl.forEach((p, i) => { if (p.d > s.pl[fol].d) fol = i; });
        figs.forEach((f, i) => {
          const p = s.pl[i];
          if (!p) return;
          const yaw = -Math.atan(cxd(p.d)) - p.vx * 0.05;
          wp(p.d, p.x, _v);
          const sl = sleds[i];
          sl.position.copy(_v);
          sl.rotation.set(rx, yaw, -p.vx * 0.03, 'YXZ');
          if (p.stun > 0) sl.rotation.y += Math.sin(p.stun * 30) * 0.4;
          f.root.position.set(_v.x, _v.y + 0.42, _v.z);
          if (!cele) { f.yawT = yaw + Math.PI; f.root.rotation.x = 0; f.idle = false; f.hop.position.y = p.stun > 0 ? Math.abs(Math.sin(p.stun * 12)) * 0.4 : 0; f.sq.scale.set(1 + Math.abs(p.vx) * 0.01, 1 - (p.boost > 1 ? 0.12 : 0), 1); }
          // icing spray when steering or boosting
          const moved = p.d - prevD[i];
          prevD[i] = p.d;
          if (moved > 0 && moved < 3 && p.fin < 0) {
            const sp = Math.abs(p.vx);
            if ((sp > 4 || p.boost > 2) && Math.random() < 0.7) sparks.shoot(_v.x - Math.sign(p.vx) * 0.6, _v.y + 0.2, _v.z + 1, -p.vx * 0.3 + (Math.random() - 0.5) * 2, 2 + Math.random() * 2, 3 + Math.random() * 2, p.boost > 2 ? '#ff7ad0' : '#ffffff', 0.16, 0.5);
          }
        });
        if (cele) celebrate(figs, cele, t, cam);
        figs.forEach((f) => updateFigure(f, dt, t));
        sparks.update(dt);
        // chase camera
        const fp = s.pl[fol];
        if (fp) fill(s, fp.d);
        if (fp) {
          const portrait = VW / VH < 1;
          const back = portrait ? 15 : 10.5, up = portrait ? 9.5 : 6.2;
          const d = Math.min(fp.d, LEN + 6);
          wp(d - back, cele ? fp.x * 0.4 : fp.x * 0.55, _c, up + back * SLOPE * 0.2);
          wp(d + (portrait ? 9 : 11), fp.x * 0.35, _l, 0.5);
          if (cele) { wp(d + 6, fp.x * 0.3, _c, 3.5); _c.z += 0; wp(d - 2, fp.x * 0.3, _l, 1.6); }
          const k = camInit ? 1 - Math.exp(-dt * 6) : 1;
          camInit = true;
          camPos.lerp(_c, k); camLook.lerp(_l, k);
          cam.position.copy(camPos);
          cam.lookAt(camLook);
          wp(d + 6, 0, _v);
          L.sun.target.position.copy(_v);
          L.sun.position.set(_v.x - 10, _v.y + 26, _v.z + 14);
          L.sun.target.updateMatrixWorld();
        }
      },
      fx(e, me) {
        const f = figs[e.p!];
        if (!f) return;
        const pos = f.root.position;
        if (e.k === 'gate') { if (e.p === me || me < 0) { sfx.buy(); floatText(_v.set(pos.x, pos.y + 2.6, pos.z), 'Turbo!', '#dcff1f', scene); } sparks.emit(pos.x, pos.y + 1, pos.z, 12, '#ff7ad0', 5, 4, 0.16, 0.5); sparks.emit(pos.x, pos.y + 1, pos.z, 6, '#ffd23f', 4, 4, 0.14, 0.5); }
        else if (e.k === 'miss') { if (e.p === me) sfx.wheel(); }
        else if (e.k === 'crash') { sfx.bonk(); void squashLand(f, 0.4); sparks.emit(pos.x, pos.y + 0.6, pos.z, 14, '#ffffff', 5, 5, 0.18, 0.6); if (e.p === me) floatText(_v.set(pos.x, pos.y + 2.6, pos.z), 'Rumms!', '#ff8fb0', scene); }
        else if (e.k === 'bump') { if (e.p === me || e.v === me) sfx.pop(); }
        else if (e.k === 'fin') { if (e.p === me || e.v === 1) sfx.fanfare(); floatText(_v.set(pos.x, pos.y + 2.8, pos.z), e.v === 1 ? 'Erste!' : `${e.v}. im Ziel`, '#dcff1f', scene); sparks.emit(pos.x, pos.y + 1.5, pos.z, 20, '#dcff1f', 6, 6, 0.18, 0.8); }
      },
      celebrate(w) { cele = w; if (!w) uncelebrate(figs); },
    };
  },
};

export default bonbonrodeln;
