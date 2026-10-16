// Münzschmiede (Jeder gegen jeden · Münz-Minispiel): everybody stands at an anvil. A blank
// slides in and heats up: hammer it (Leertaste) while the needle is in the golden zone and it
// becomes a coin, in the white middle even two. Too early and it cracks, too late and it melts.
// Everybody gets the same blanks in the same order, so it is fair; they heat up faster and the
// golden zone shrinks as the game goes on. Every 5 in a row gives a bonus coin.

import { sfx } from '../sfx';
import { clamp, lerp } from '../util';
import { celebrate, squashLand, updateFigure } from '../view3d/figures';
import { BOX, Batch, COIN_GEO, COIN_MAT, CONE, CYL, CYL8, GLOW, GRAD, SPH_LO, STAR_GEO, THREE, VC, VC_EMI, skyTex } from '../view3d/kit';
import { VH, VW, floatText } from '../view3d/stage';
import { KBD, mgFigures, mgLights } from './common';
import { Sparks, uncelebrate, winTitle } from './mgkit-a';
import { NO_INPUT, WIN_COINS, type MinigameDef } from './types';

const D = 30;
const T_IN = 0.65, T_OK = 0.6, T_FAIL = 1.1;
const MELT = 0.1;
const SEQ = 48;
const GAP = 4.2;

/** 0 = sliding in, 1 = heating, 2 = struck (coin), 3 = failed. */
interface Pl { ph: number; t: number; h: number; n: number; coins: number; combo: number; best: number; hits: number; perfect: number; fails: number }
interface S {
  pl: Pl[];
  /** The blanks, the same for everybody: zone centre, zone width, heat rate, star (1/0). */
  zc: number[]; zw: number[]; zr: number[]; zs: number[];
  _ai: { aim: number; sd: number; slip: number }[];
}

const SKILL = { leicht: [0.075, 0.12], normal: [0.042, 0.06], stark: [0.03, 0.03] } as const;

const zoneLo = (s: S, n: number) => s.zc[n % SEQ] - s.zw[n % SEQ] / 2;
const zoneHi = (s: S, n: number) => s.zc[n % SEQ] + s.zw[n % SEQ] / 2;
const perfectW = (s: S, n: number) => s.zw[n % SEQ] * 0.17;

const muenzschmiede: MinigameDef<S> = {
  id: 'muenzschmiede',
  name: 'Münzschmiede',
  type: 'ffa',
  coin: true,
  seconds: D,
  players: [2, 4],
  pro: true,
  online: 'ok',
  card: {
    sub: 'Schmiede glühende Rohlinge zu Münzen. Schlag zu, wenn die Nadel im goldenen Bereich steht, in der weißen Mitte gibt es doppelt.',
    rules: () => [
      '<b>Gold</b> = 1 Münze, <b>weiße Mitte</b> = 2, <b>Funkelrohling</b> = 3 oder 4. Alle bekommen dieselben Rohlinge.',
      '<b>Zu früh</b> springt der Rohling, <b>zu spät</b> schmilzt er. Fünf Treffer am Stück bringen 1 Extra-Münze.',
      '<b>Münz-Minispiel:</b> Alle behalten ihre Münzen. Die meisten bekommen +10 dazu.',
    ],
    controls: () => ({ keys: `${KBD('Leertaste')} oder ${KBD('↑')}: hämmern`, touch: 'Großer Knopf unten rechts: Hämmern' }),
    touch: () => ({ joy: false, buttons: [{ key: 'a', label: 'Hämmern' }] }),
  },
  init(ctx) {
    const zc: number[] = [], zw: number[] = [], zr: number[] = [], zs: number[] = [];
    for (let k = 0; k < SEQ; k++) {
      const p = Math.min(1, k / 16);
      const star = k > 2 && ctx.rng() < 0.13 ? 1 : 0;
      zw.push(Math.round(lerp(0.22, 0.13, p) * (star ? 0.8 : 1) * 1000) / 1000);
      zc.push(Math.round((0.55 + ctx.rng() * 0.3) * 1000) / 1000);
      zr.push(Math.round(lerp(0.36, 0.7, p) * (0.88 + ctx.rng() * 0.24) * (star ? 1.25 : 1) * 1000) / 1000);
      zs.push(star);
    }
    return {
      pl: ctx.setup.players.map(() => ({ ph: 0, t: 0, h: 0, n: 0, coins: 0, combo: 0, best: 0, hits: 0, perfect: 0, fails: 0 })),
      zc, zw, zr, zs,
      _ai: ctx.setup.players.map((p) => { const [sd, slip] = SKILL[p.bot ?? 'normal']; return { aim: -1, sd, slip }; }),
    };
  },
  step(s, dt, inputs, ctx) {
    s.pl.forEach((p, i) => {
      p.t += dt;
      const inp = inputs[i];
      if (p.ph === 0) { if (p.t >= T_IN) { p.ph = 1; p.t = 0; p.h = 0; } return; }
      if (p.ph === 2 || p.ph === 3) {
        if (p.t >= (p.ph === 2 ? T_OK : T_FAIL)) { p.ph = 0; p.t = 0; p.h = 0; p.n++; }
        return;
      }
      p.h += s.zr[p.n % SEQ] * dt;
      const lo = zoneLo(s, p.n), hi = zoneHi(s, p.n), c = s.zc[p.n % SEQ], star = s.zs[p.n % SEQ] === 1;
      if (inp.aP) {
        if (p.h < lo) { p.ph = 3; p.t = 0; p.combo = 0; p.fails++; ctx.fx({ k: 'crack', p: i }); }
        else if (p.h <= hi) {
          const perfect = Math.abs(p.h - c) <= perfectW(s, p.n);
          let v = star ? (perfect ? 4 : 3) : perfect ? 2 : 1;
          p.combo++; p.hits++;
          if (perfect) p.perfect++;
          p.best = Math.max(p.best, p.combo);
          const bonus = p.combo % 5 === 0;
          if (bonus) v++;
          p.coins += v;
          p.ph = 2; p.t = 0;
          ctx.fx({ k: 'coin', p: i, v, text: perfect ? 'Perfekt!' : bonus ? '5 am Stück!' : '' });
        }
        // above the zone but not melted yet: counts as too late
        else { p.ph = 3; p.t = 0; p.combo = 0; p.fails++; ctx.fx({ k: 'melt', p: i }); }
      } else if (p.h > hi + MELT) { p.ph = 3; p.t = 0; p.combo = 0; p.fails++; ctx.fx({ k: 'melt', p: i }); }
    });
  },
  bot(s, i, ctx) {
    const p = s.pl[i], ai = s._ai[i];
    if (p.ph !== 1) { ai.aim = -1; return NO_INPUT; }
    if (ai.aim < 0) {
      const c = s.zc[p.n % SEQ];
      // a gaussian-ish aim around the centre; sometimes a slip (too early or late)
      const g = (ctx.rng() + ctx.rng() + ctx.rng() - 1.5) / 0.5;
      ai.aim = ctx.rng() < ai.slip ? c + (ctx.rng() < 0.5 ? -1 : 1) * s.zw[p.n % SEQ] * 0.75 : c + g * ai.sd;
    }
    if (p.h >= ai.aim) { ai.aim = 9; return { ...NO_INPUT, a: true, aP: true }; }
    return NO_INPUT;
  },
  result(s, ctx) {
    const max = Math.max(...s.pl.map((p) => p.coins));
    const rows = s.pl.map((p, i) => {
      const win = max > 0 && p.coins === max;
      return { i, win, score: p.coins * 10 + p.perfect, coins: p.coins + (win ? WIN_COINS : 0), note: `${p.coins} Münzen geschmiedet · ${p.perfect}× perfekt${win ? ' · Sieg +10' : ''}` };
    });
    return { rows, title: winTitle(rows.filter((r) => r.win).map((r) => ctx.setup.players[r.i].name)) };
  },
  score: (s, i) => ({ v: String(s.pl[i]?.coins ?? 0) }),
  view(setup) {
    const scene = new THREE.Scene();
    scene.background = skyTex(['#1a0b33', '#3b1670', '#ff6a3d']);
    scene.fog = new THREE.Fog('#3b1670', 30, 80);
    const L = mgLights(scene, 12);
    L.hemi.intensity = 1.25;
    const cam = new THREE.PerspectiveCamera(40, 1, 0.5, 200);
    const n = setup.players.length;
    // station origins: in a row, or 2 × 2 on a portrait screen (set in frame)
    const SX = new Float32Array(n), SZ = new Float32Array(n);
    let layoutP: boolean | null = null;
    const st = new Batch(), gl = new Batch();
    // floor, back wall with bricks, lava channel, chimneys
    st.add(BOX, '#3a1f5e', 0, -0.5, 0, 0, 0, 0, 34, 1, 18);
    for (let x = -16; x <= 16; x += 2) for (let z = -8; z <= 8; z += 2) if ((x + z) % 4 === 0) st.add(BOX, '#4a2a74', x, 0.005, z, 0, 0, 0, 1.9, 0.02, 1.9);
    for (let r = 0; r < 7; r++) for (let c = -9; c <= 9; c++) st.add(BOX, (r + c) % 3 ? '#5b2a8a' : '#6d34a3', c * 1.9 + (r % 2) * 0.95, 0.5 + r * 1, -5.4, 0, 0, 0, 1.8, 0.9, 0.6);
    gl.add(BOX, '#ff7a1f', 0, 0.02, -4.4, 0, 0, 0, 30, 0.06, 1.2);
    for (let k = 0; k < 14; k++) gl.add(SPH_LO, k % 2 ? '#ffd23f' : '#ff4f1f', -13 + k * 2, 0.08, -4.4 + ((k * 7) % 3 - 1) * 0.25, 0, 0, 0, 0.35, 0.12, 0.3);
    for (const sx of [-12, 12]) { st.add(CYL8, '#2a1258', sx, 3.5, -4.6, 0, 0, 0, 1.4, 7, 1.4); gl.add(CYL8, '#ff7a1f', sx, 1.2, -3.8, Math.PI / 2, 0, 0, 0.7, 0.2, 0.7); }
    scene.add(st.mesh(), gl.mesh(GLOW, false, false));
    // stations: anvil, chute, gauge frame, name pad (one mesh each, moved by the layout)
    const stations = setup.players.map((pl) => {
      const b = new Batch(), pc = pl.color;
      b.add(BOX, '#2b2340', 0, 0.45, 0.6, 0, 0, 0, 1.2, 0.9, 0.9);
      b.add(BOX, '#3d3358', 0, 1.05, 0.6, 0, 0, 0, 2, 0.35, 1.05);
      b.add(CONE, '#3d3358', -1.25, 1.05, 0.6, 0, 0, Math.PI / 2, 0.36, 0.6, 0.36);
      b.add(BOX, '#5a4d7d', 0, 1.24, 0.6, 0, 0, 0, 2.02, 0.04, 1.07);
      b.add(BOX, '#8a83a8', -1.75, 1.18, 0.6, 0, 0, -0.12, 0.9, 0.1, 0.7);
      b.add(BOX, '#1a0b33', 1.7, 2.05, 0.6, 0, 0, 0, 0.52, 3.1, 0.3);
      b.add(BOX, '#3a2a55', 1.7, 2.05, 0.75, 0, 0, 0, 0.36, 2.9, 0.05);
      b.add(CYL, pc, 0, 0.02, -1.15, 0, 0, 0, 1.15, 0.06, 1.15);
      b.add(SPH_LO, pc, 1.7, 3.75, 0.65, 0, 0, 0, 0.22);
      const m = b.mesh();
      scene.add(m);
      return m;
    });
    // gauges: gold zone, perfect line and needle (instanced, 3 draw calls)
    const mkI = (geo: THREE.BufferGeometry, mat: THREE.Material) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; scene.add(m); return m; };
    const zoneM = mkI(BOX, new THREE.MeshBasicMaterial({ color: '#ffc21f' }));
    const perfM = mkI(BOX, new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    const needleM = mkI(new THREE.ConeGeometry(0.2, 0.5, 3).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff3d6e' }));
    const fillM = mkI(BOX, new THREE.MeshBasicMaterial({ color: '#ff6a3d', transparent: true, opacity: 0.55 }));
    const G0 = 0.62, GH = 2.8;
    const gy = (h: number) => G0 + clamp(h / 1.2, 0, 1) * GH;
    // blanks: their own material per station (glow follows the heat)
    const blankGeo = new THREE.CylinderGeometry(0.42, 0.46, 0.18, 20);
    const blanks = setup.players.map(() => {
      const mat = new THREE.MeshToonMaterial({ color: '#7a3a2a', emissive: '#000000', gradientMap: GRAD });
      const m = new THREE.Mesh(blankGeo, mat);
      m.castShadow = true;
      scene.add(m);
      const star = new THREE.Mesh(STAR_GEO, VC_EMI);
      star.scale.setScalar(0.32);
      star.rotation.x = -Math.PI / 2;
      star.position.y = 0.12;
      m.add(star);
      return { m, mat, star };
    });
    // hammers
    const hamB = new Batch();
    hamB.add(CYL8, '#8a4e2e', 0, 0.7, 0, 0, 0, 0, 0.07, 1.4, 0.07);
    hamB.add(BOX, '#6b6f8a', 0, 1.5, 0, 0, 0, 0, 0.75, 0.38, 0.38);
    for (const sd of [-1, 1]) hamB.add(BOX, '#9aa0c0', sd * 0.39, 1.5, 0, 0, 0, 0, 0.05, 0.3, 0.3);
    const hamGeo = hamB.geometry();
    const hammers = setup.players.map(() => {
      const pivot = new THREE.Group();
      const m = new THREE.Mesh(hamGeo, VC);
      m.castShadow = true;
      pivot.add(m);
      scene.add(pivot);
      return pivot;
    });
    // coin stacks (instanced) and flying coins
    const PER = 36;
    const coinLo = new Batch();
    coinLo.add(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 12), '#e09a00', 0, 0, 0, Math.PI / 2, 0, 0);
    coinLo.add(new THREE.CylinderGeometry(0.33, 0.33, 0.12, 12), '#ffd84a', 0, 0, 0, Math.PI / 2, 0, 0);
    const stackM = new THREE.InstancedMesh(coinLo.geometry(), COIN_MAT, n * PER);
    stackM.count = 0;
    let stackDirty = true;
    stackM.castShadow = true;
    stackM.frustumCulled = false;
    scene.add(stackM);
    const flyM = new THREE.InstancedMesh(COIN_GEO, COIN_MAT, 12);
    flyM.frustumCulled = false;
    flyM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(flyM);
    const fly = Array.from({ length: 12 }, () => ({ t: -1, p: 0 }));
    const figs = mgFigures(scene, setup, 1);
    const sparks = new Sparks(scene, 160);
    const dmy = new THREE.Object3D();
    const swing = new Float32Array(n), shake = new Float32Array(n);
    const shown = new Int32Array(n);
    const _hot = new THREE.Color(), _c1 = new THREE.Color('#7a3a2a'), _c2 = new THREE.Color('#ff4f1f'), _c3 = new THREE.Color('#ffd23f'), _c4 = new THREE.Color('#fffbe8'), _grey = new THREE.Color('#5a5470');
    const _v = new THREE.Vector3();
    let cele: boolean[] | null = null;
    const heatCol = (h: number, out: THREE.Color) => {
      if (h < 0.45) return out.copy(_c1).lerp(_c2, h / 0.45);
      if (h < 0.85) return out.copy(_c2).lerp(_c3, (h - 0.45) / 0.4);
      return out.copy(_c3).lerp(_c4, clamp((h - 0.85) / 0.3, 0, 1));
    };
    const stackPos = (i: number, k: number, out: THREE.Vector3) => out.set(SX[i] - 1.25 + (k % 2) * 0.55, 0.08 + Math.floor((k % (PER / 2)) / 2) * 0.13, SZ[i] + 1.75 + (k >= PER / 2 ? 0.55 : 0));
    const layout = (portrait: boolean) => {
      layoutP = portrait;
      for (let i = 0; i < n; i++) {
        if (portrait && n > 2) { SX[i] = (i % 2 ? 1 : -1) * 2.35; SZ[i] = Math.floor(i / 2) * 5.4 - 2.7; }
        else { SX[i] = (i - (n - 1) / 2) * GAP; SZ[i] = 0; }
        stations[i].position.set(SX[i], 0, SZ[i]);
        hammers[i].position.set(SX[i] + 0.55, 1.1, SZ[i] - 0.9);
      }
      stackDirty = true;
    };
    return {
      scene, cam,
      frame(s, dt, t) {
        const portrait = VW / VH < 1;
        if (portrait !== layoutP) layout(portrait);
        for (let i = 0; i < n; i++) {
          const p = s.pl[i];
          if (!p) continue;
          const x = SX[i], z = SZ[i], b = blanks[i];
          const lo = zoneLo(s, p.n), hi = zoneHi(s, p.n), c = s.zc[p.n % SEQ], star = s.zs[p.n % SEQ] === 1;
          // gauge
          dmy.rotation.set(0, 0, 0);
          dmy.position.set(x + 1.7, (gy(lo) + gy(hi)) / 2, z + 0.8); dmy.scale.set(0.38, gy(hi) - gy(lo), 0.06); dmy.updateMatrix(); zoneM.setMatrixAt(i, dmy.matrix);
          dmy.position.set(x + 1.7, gy(c), z + 0.84); dmy.scale.set(0.42, Math.max(0.05, gy(c + perfectW(s, p.n)) - gy(c - perfectW(s, p.n))), 0.06); dmy.updateMatrix(); perfM.setMatrixAt(i, dmy.matrix);
          const hh = p.ph === 1 ? p.h : p.ph === 0 ? 0 : p.h;
          dmy.position.set(x + 1.7, (G0 + gy(hh)) / 2, z + 0.78); dmy.scale.set(0.3, Math.max(0.01, gy(hh) - G0), 0.05); dmy.updateMatrix(); fillM.setMatrixAt(i, dmy.matrix);
          dmy.position.set(x + 2.15, gy(hh), z + 0.85); dmy.scale.setScalar(1); dmy.updateMatrix(); needleM.setMatrixAt(i, dmy.matrix);
          // the blank
          b.star.visible = star && p.ph !== 3;
          if (p.ph === 0) { const k = clamp(p.t / T_IN, 0, 1); b.m.position.set(x - 2.6 + 2.6 * (1 - (1 - k) * (1 - k)), 1.33 + Math.sin(k * Math.PI) * 0.2, z + 0.6); b.m.scale.set(1, 1, 1); b.mat.color.copy(_c1); b.mat.emissive.setRGB(0, 0, 0); }
          else if (p.ph === 1) {
            b.m.position.set(x + (Math.random() - 0.5) * 0.03 * p.h, 1.33, z + 0.6);
            b.m.scale.set(1, 1, 1);
            heatCol(p.h, _hot);
            b.mat.color.copy(_hot);
            b.mat.emissive.copy(_hot).multiplyScalar(clamp(p.h, 0, 1) * 0.75);
            if (p.h > hi && Math.random() < 0.3) sparks.shoot(x + (Math.random() - 0.5) * 0.6, 1.5, z + 0.6, (Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2, '#ff8a3d', 0.08, 0.4);
          } else if (p.ph === 2) {
            const k = clamp(p.t / T_OK, 0, 1);
            b.m.position.set(x, 1.33, z + 0.6);
            b.m.scale.set(1 + 0.3 * (1 - k), Math.max(0.05, 0.5 * (1 - k)), 1 + 0.3 * (1 - k));
          } else {
            const k = clamp(p.t / T_FAIL, 0, 1);
            b.m.position.set(x + Math.sin(p.t * 40) * 0.05 * (1 - k), 1.29, z + 0.6);
            if (p.h >= lo) { b.m.scale.set(1 + k * 0.6, Math.max(0.08, 1 - k * 0.9), 1 + k * 0.6); heatCol(1.2, _hot); b.mat.color.copy(_hot).lerp(_grey, k); b.mat.emissive.copy(_hot).multiplyScalar(0.6 * (1 - k)); }
            else { b.m.scale.set(1, 1 - k * 0.3, 1); b.mat.color.copy(_grey); b.mat.emissive.setRGB(0, 0, 0); }
          }
          // hammer: lifts with the heat, swings down on a strike
          swing[i] = Math.max(0, swing[i] - dt * 6);
          const lift = p.ph === 1 ? clamp(p.h / Math.max(0.1, c), 0, 1.1) : 0.2;
          hammers[i].rotation.x = swing[i] > 0 ? lerp(-0.8, 1.42, Math.min(1, (1 - swing[i]) * 2.5)) : lerp(0.4, -0.8, lift);
          shake[i] = Math.max(0, shake[i] - dt * 3);
          // coin stack (repacked only when a count changes)
          if (Math.min(PER, p.coins) !== shown[i]) { shown[i] = Math.min(PER, p.coins); stackDirty = true; }
          // figure behind the anvil
          const f = figs[i];
          f.root.position.set(x, 0, z - 1.15);
          if (!cele) { f.yawT = 0; f.idle = p.ph !== 1; if (p.ph === 1 && !f.busy) { const q = Math.sin(t * 10) * 0.025 * p.h; f.sq.scale.set(1 + q, 1 - q, 1 + q); } }
        }
        if (stackDirty) {
          stackDirty = false;
          let sc = 0;
          for (let i = 0; i < n; i++) for (let k = 0; k < shown[i]; k++) {
            stackPos(i, k, dmy.position); dmy.rotation.set(Math.PI / 2, 0, k * 0.7); dmy.scale.setScalar(1.25); dmy.updateMatrix();
            stackM.setMatrixAt(sc++, dmy.matrix);
          }
          stackM.count = sc;
          stackM.instanceMatrix.needsUpdate = true;
        }
        zoneM.instanceMatrix.needsUpdate = true; perfM.instanceMatrix.needsUpdate = true; needleM.instanceMatrix.needsUpdate = true; fillM.instanceMatrix.needsUpdate = true;
        // flying coins
        let fc = 0;
        for (const fl of fly) {
          if (fl.t < 0) continue;
          fl.t += dt;
          const k = Math.min(1, fl.t / 0.55);
          stackPos(fl.p, Math.min(PER - 1, (s.pl[fl.p]?.coins ?? 1) - 1), _v);
          dmy.position.set(lerp(SX[fl.p], _v.x, k), lerp(1.5, _v.y, k) + Math.sin(k * Math.PI) * 2.2, lerp(SZ[fl.p] + 0.6, _v.z, k));
          dmy.rotation.set(fl.t * 12, 0, 0);
          dmy.scale.setScalar(1.4);
          dmy.updateMatrix();
          flyM.setMatrixAt(fc++, dmy.matrix);
          if (k >= 1) fl.t = -1;
        }
        flyM.count = fc;
        flyM.instanceMatrix.needsUpdate = true;
        if (cele) celebrate(figs, cele, t, cam);
        figs.forEach((f) => updateFigure(f, dt, t));
        sparks.update(dt);
        const grid = portrait && n > 2;
        const w = grid ? 9.6 : n * GAP + 1.5;
        const dist = Math.max(w / (2 * Math.tan((cam.fov * Math.PI) / 360) * (VW / VH)), 9.5) * 1.02;
        if (grid) { cam.position.set(0, 2 + dist * 0.82, 1.5 + dist * 0.56); cam.lookAt(0, 0.6, 0.6); }
        else { cam.position.set(0, 2.4 + dist * 0.62, 0.6 + dist * 0.8); cam.lookAt(0, 1.25, -0.2); }
      },
      fx(e, me) {
        const i = e.p!;
        if (i < 0 || i >= n) return;
        const x = SX[i], z = SZ[i];
        if (e.k === 'coin') {
          swing[i] = 1;
          if (i === me || me < 0) sfx.hit();
          if (i === me || me < 0) setTimeout(() => sfx.coin(), 120);
          sparks.emit(x, 1.45, z + 0.6, e.text === 'Perfekt!' ? 22 : 12, '#ffd23f', 5, 5, 0.14, 0.55);
          sparks.emit(x, 1.45, z + 0.6, 6, '#ffffff', 4, 5, 0.1, 0.4);
          const fl = fly.find((q) => q.t < 0);
          if (fl) { fl.t = 0; fl.p = i; }
          floatText(_v.set(x, 2.9, z + 0.6), `+${e.v}${e.text ? ' ' + e.text : ''}`, e.text === 'Perfekt!' ? '#ffffff' : '#ffe14a', scene);
          void squashLand(figs[i], 0.15);
        } else if (e.k === 'crack') {
          swing[i] = 1;
          if (i === me || me < 0) sfx.bonk();
          sparks.emit(x, 1.4, z + 0.6, 8, '#8a83a8', 3.5, 3, 0.14, 0.5);
          if (i === me) floatText(_v.set(x, 2.8, z + 0.6), 'Zu kalt!', '#7af0ff', scene);
        } else if (e.k === 'melt') {
          if (i === me || me < 0) sfx.lose();
          sparks.emit(x, 1.4, z + 0.6, 10, '#ff6a3d', 2.5, 2, 0.16, 0.7);
          if (i === me) floatText(_v.set(x, 2.8, z + 0.6), 'Geschmolzen!', '#ff8fb0', scene);
        }
      },
      celebrate(w) { cele = w; if (!w) uncelebrate(figs); },
    };
  },
};

export default muenzschmiede;
