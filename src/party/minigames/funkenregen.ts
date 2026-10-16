// Funkenregen (Jeder gegen jeden · Münz-Minispiel): coins and sparkle stars rain onto a cloud
// stage. Run there, grab them, and keep away from the Knallbonbons.

import { sfx } from '../sfx';
import { TAU, lerp } from '../util';
import { celebrate, squashLand, updateFigure } from '../view3d/figures';
import { Batch, COIN_GEO, COIN_MAT, CONE, CYL8, GLOW, SPH, SPH_LO, STAR_GEO, THREE, TOR, TOR_THIN, VC, VC_EMI, skyTex } from '../view3d/kit';
import { floatText } from '../view3d/stage';
import { KBD, arenaCam, cloudsBelow, floatingArena, mgFigures, mgLights } from './common';
import { NO_INPUT, WIN_COINS, type MgCtx, type MgInput, type MinigameDef } from './types';

const R = 9.2;
const VAL = { c: 1, s: 3 } as const;
type Kind = 'c' | 's' | 'b';

interface Item { id: number; k: Kind; x: number; z: number; t: number; fall: number; y: number }
interface Pl { x: number; z: number; vx: number; vz: number; score: number; stun: number }
interface S {
  pl: Pl[];
  items: Item[];
  spawnT: number;
  nextId: number;
  _ai: { rt: number; tx: number; tz: number; skill: number }[];
}

const SKILL = { leicht: 0.72, normal: 0.88, stark: 0.97 } as const;

function botDir(s: S, i: number, ctx: MgCtx): [number, number] {
  const b = s._ai[i], me = s.pl[i];
  b.rt -= 1 / 60;
  if (b.rt <= 0) {
    b.rt = 0.15 + ctx.rng() * 0.15;
    let best: Item | null = null, bs = 0;
    for (const it of s.items) {
      if (it.k === 'b') continue;
      const dd = Math.hypot(it.x - me.x, it.z - me.z), tl = Math.max(0, it.fall - it.t), tt = dd / (7 * b.skill);
      if (it.t > it.fall && it.t - it.fall + tt > 3) continue;
      let sc = VAL[it.k] / (Math.max(tt, tl) + 0.5);
      for (let j = 0; j < s.pl.length; j++) if (j !== i && Math.hypot(it.x - s.pl[j].x, it.z - s.pl[j].z) < dd * 0.6) sc *= 0.5;
      if (sc > bs) { bs = sc; best = it; }
    }
    if (best) { b.tx = best.x; b.tz = best.z; } else { b.tx = Math.cos(ctx.time + i) * 3; b.tz = Math.sin(ctx.time + i) * 3; }
  }
  let dx = b.tx - me.x, dz = b.tz - me.z;
  const l = Math.hypot(dx, dz);
  if (l < 0.3) { dx = 0; dz = 0; } else { dx /= l; dz /= l; }
  for (const it of s.items) if (it.k === 'b' && it.fall - it.t < 1.1) {
    const bx = me.x - it.x, bz = me.z - it.z, bl = Math.hypot(bx, bz);
    if (bl < 2.6) { dx += (bx / (bl + 0.1)) * 1.8; dz += (bz / (bl + 0.1)) * 1.8; }
  }
  const ll = Math.hypot(dx, dz);
  return ll > 1 ? [(dx / ll) * b.skill, (dz / ll) * b.skill] : [dx * b.skill, dz * b.skill];
}

const funkenregen: MinigameDef<S> = {
  id: 'funkenregen',
  name: 'Funkenregen',
  type: 'ffa',
  coin: true,
  seconds: 30,
  players: [2, 4],
  pro: true,
  online: 'ok',
  card: {
    sub: 'Über der Wolkenbühne regnet es Münzen und Funkelsterne. Lauf hin, schnapp sie dir, und pass auf die Knallbonbons auf!',
    rules: () => [
      '<b>Münze</b> +1, <b>Funkelstern</b> +3. Der dunkle Ring zeigt, wo etwas landet.',
      '<b>Knallbonbon:</b> Wer zu nah steht, ist kurz benommen und verliert 2.',
      '<b>Münz-Minispiel:</b> Alle behalten, was sie sammeln. Die meisten bekommen +10 dazu.',
    ],
    controls: () => ({ keys: `${KBD('W')} ${KBD('A')} ${KBD('S')} ${KBD('D')} oder Pfeile: laufen`, touch: 'Daumen-Stick unten links: laufen' }),
    touch: () => ({ joy: true, buttons: [] }),
  },
  init(ctx) {
    const n = ctx.setup.players.length;
    return {
      pl: ctx.setup.players.map((_, i) => { const a = Math.PI / 2 + (i * TAU) / n; return { x: Math.cos(a) * 5, z: Math.sin(a) * 5, vx: 0, vz: 0, score: 0, stun: 0 }; }),
      items: [],
      spawnT: 0.5,
      nextId: 1,
      _ai: ctx.setup.players.map((p) => ({ rt: 0, tx: 0, tz: 0, skill: SKILL[p.bot ?? 'normal'] + (ctx.rng() - 0.5) * 0.06 })),
    };
  },
  step(s, dt, inputs, ctx) {
    const dur = ctx.setup.mode === 'practice' ? 20 : this.seconds;
    s.spawnT -= dt;
    if (s.spawnT <= 0 && (ctx.setup.mode === 'demo' || ctx.time < dur - 0.8)) {
      const spawn = () => {
        const r = Math.sqrt(ctx.rng()) * (R - 1.4), a = ctx.rng() * TAU;
        const roll = ctx.rng(), k: Kind = roll < 0.14 ? 's' : roll < 0.33 ? 'b' : 'c';
        if (s.items.filter((x) => x.k === k).length >= (k === 'c' ? 30 : 9)) return;
        s.items.push({ id: s.nextId++, k, x: Math.cos(a) * r, z: Math.sin(a) * r, t: 0, fall: 1.1 + ctx.rng() * 0.5, y: 13 });
      };
      spawn();
      if (ctx.rng() < 0.3) spawn();
      s.spawnT = 0.55 + ctx.rng() * 0.35;
    }
    for (const it of s.items) {
      it.t += dt;
      if (it.k === 'b' && it.t >= it.fall) {
        it.t = 99;
        ctx.fx({ k: 'boom', x: it.x, z: it.z });
        s.pl.forEach((p, i) => {
          if (Math.hypot(p.x - it.x, p.z - it.z) < 2.1 && p.stun <= 0) {
            p.stun = 1.2;
            const lose = Math.min(2, p.score);
            p.score -= lose;
            ctx.fx({ k: 'stun', p: i, v: lose });
          }
        });
        continue;
      }
      it.y = it.t < it.fall ? 13 * (1 - Math.pow(it.t / it.fall, 2)) + 0.55 : 0.55 + Math.abs(Math.sin((it.t - it.fall) * 6)) * Math.max(0, 0.5 - (it.t - it.fall) * 0.6);
      if (it.y < 1.4 && it.k !== 'b') {
        let bi = -1, bd = 1.15;
        s.pl.forEach((p, i) => { if (p.stun > 0) return; const dd = Math.hypot(p.x - it.x, p.z - it.z); if (dd < bd) { bd = dd; bi = i; } });
        if (bi >= 0) {
          const v = VAL[it.k];
          s.pl[bi].score += v;
          it.t = 99;
          ctx.fx({ k: 'coin', p: bi, v, x: it.x, z: it.z });
        }
      }
    }
    s.items = s.items.filter((it) => it.t < 90 && it.t <= it.fall + 3);
    s.pl.forEach((p, i) => {
      const inp: MgInput = p.stun > 0 ? NO_INPUT : inputs[i];
      if (p.stun > 0) p.stun -= dt;
      const sp = 7.2, acc = 1 - Math.exp(-dt * 12);
      let ix = inp.x, iz = inp.y;
      const l = Math.hypot(ix, iz);
      if (l > 1) { ix /= l; iz /= l; }
      p.vx += (ix * sp - p.vx) * acc;
      p.vz += (iz * sp - p.vz) * acc;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      const r = Math.hypot(p.x, p.z);
      if (r > R - 0.8) { p.x *= (R - 0.8) / r; p.z *= (R - 0.8) / r; }
    });
    for (let i = 0; i < s.pl.length; i++) for (let j = i + 1; j < s.pl.length; j++) {
      const a = s.pl[i], b = s.pl[j], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
      if (l < 1.25 && l > 0.001) { const push = (1.25 - l) / 2; a.x -= (dx / l) * push; a.z -= (dz / l) * push; b.x += (dx / l) * push; b.z += (dz / l) * push; }
    }
  },
  bot(s, i, ctx) {
    const [x, y] = botDir(s, i, ctx);
    return { ...NO_INPUT, x, y };
  },
  result(s, ctx) {
    const max = Math.max(...s.pl.map((p) => p.score));
    const rows = s.pl.map((p, i) => {
      const win = max > 0 && p.score === max;
      return { i, win, score: p.score, coins: p.score + (win ? WIN_COINS : 0), note: `${p.score} Münzen gesammelt${win ? ' · Sieg +10' : ''}` };
    });
    const winners = rows.filter((r) => r.win).map((r) => ctx.setup.players[r.i].name);
    return { rows, title: winners.length === 1 ? `${winners[0]} gewinnt!` : winners.length ? `${winners.join(' und ')} gewinnen!` : 'Niemand gewinnt' };
  },
  score: (s, i) => ({ v: String(s.pl[i]?.score ?? 0) }),
  view(setup) {
    const scene = new THREE.Scene();
    scene.background = skyTex(['#3a7bff', '#8fd0ff', '#ffe0f2']);
    scene.fog = new THREE.Fog('#ffe0f2', 45, 110);
    mgLights(scene, 13);
    const cam = new THREE.PerspectiveCamera(42, 1, 0.5, 300);
    const b = new Batch(), g = new Batch();
    floatingArena(b, R, [[1, '#ff7ac2'], [0.8, '#ffe36e'], [0.6, '#ff7ac2'], [0.4, '#ffe36e'], [0.2, '#ff7ac2']]);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; b.add(CYL8, '#2a1258', Math.cos(a) * (R + 0.2), 0.35, Math.sin(a) * (R + 0.2), 0, 0, 0, 0.1, 0.9, 0.1); g.add(SPH_LO, k % 2 ? '#7af0ff' : '#ff7ad0', Math.cos(a) * (R + 0.2), 0.9, Math.sin(a) * (R + 0.2), 0, 0, 0, 0.22); }
    g.add(TOR_THIN, '#35e6ff', 0, 0.02, 0, Math.PI / 2, 0, 0, R + 0.2);
    const arena = b.mesh();
    arena.castShadow = false;
    scene.add(arena, g.mesh(GLOW, false, false));
    cloudsBelow(scene);
    const figs = mgFigures(scene, setup);
    const mkPool = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => { const im = new THREE.InstancedMesh(geo, mat, n); im.frustumCulled = false; im.castShadow = true; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.count = 0; scene.add(im); return im; };
    const bombB = new Batch();
    bombB.add(SPH, '#ff3d6e', 0, 0, 0, 0, 0, 0, 0.5); bombB.add(TOR, '#ffffff', 0, 0, 0, 0, 0, 0, 0.5, 0.5, 2);
    bombB.add(CONE, '#ffe14a', 0.62, 0, 0, 0, 0, Math.PI / 2, 0.3, 0.4, 0.3); bombB.add(CONE, '#ffe14a', -0.62, 0, 0, 0, 0, -Math.PI / 2, 0.3, 0.4, 0.3);
    bombB.add(CYL8, '#1a0b33', 0, 0.55, 0, 0, 0, 0.3, 0.05, 0.3, 0.05); bombB.add(SPH_LO, '#fff3a6', 0.08, 0.72, 0, 0, 0, 0, 0.1);
    const pools: Record<Kind, THREE.InstancedMesh> = { c: mkPool(COIN_GEO, COIN_MAT, 40), s: mkPool(STAR_GEO, VC_EMI, 12), b: mkPool(bombB.geometry(), VC, 12) };
    const marks = new THREE.InstancedMesh(new THREE.RingGeometry(0.55, 0.8, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#1a0b33', transparent: true, opacity: 0.45, depthWrite: false }), 64);
    marks.frustumCulled = false;
    marks.count = 0;
    scene.add(marks);
    const booms = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: '#ffb340', transparent: true, opacity: 0, depthWrite: false })); m.visible = false; scene.add(m); return { m, t: 0 }; });
    const d = new THREE.Object3D();
    const ph = figs.map(() => 0);
    let cele: boolean[] | null = null;
    let T = 0;
    const counts: Record<Kind, number> = { c: 0, s: 0, b: 0 };
    return {
      scene, cam,
      frame(s, dt, t) {
        T = t;
        counts.c = counts.s = counts.b = 0;
        let mi = 0;
        for (const it of s.items) {
          const im = pools[it.k];
          if (counts[it.k] >= im.instanceMatrix.count) continue;
          const sc = it.k === 's' ? 0.62 : it.k === 'b' ? 1.1 : 1.5;
          d.position.set(it.x, it.y, it.z);
          d.rotation.set(it.k === 'b' ? it.t * 3 : it.k === 'c' ? -0.45 : 0, it.t * 4, 0);
          d.scale.setScalar(it.t > it.fall + 2.4 ? sc * Math.max(0, (it.fall + 3 - it.t) / 0.6) : sc);
          d.updateMatrix();
          im.setMatrixAt(counts[it.k]++, d.matrix);
          if (it.t < it.fall && mi < 64) { const k = it.t / it.fall; d.position.set(it.x, 0.03, it.z); d.rotation.set(0, 0, 0); d.scale.setScalar(lerp(1.6, 0.8, k)); d.updateMatrix(); marks.setMatrixAt(mi++, d.matrix); }
        }
        for (const k of ['c', 's', 'b'] as Kind[]) { pools[k].count = counts[k]; pools[k].instanceMatrix.needsUpdate = true; }
        marks.count = mi;
        marks.instanceMatrix.needsUpdate = true;
        for (const bm of booms) if (bm.t > 0) { bm.t -= dt; const k = 1 - bm.t / 0.45; bm.m.scale.setScalar(0.5 + k * 2.4); (bm.m.material as THREE.MeshBasicMaterial).opacity = 1 - k; if (bm.t <= 0) bm.m.visible = false; }
        figs.forEach((f, i) => {
          const p = s.pl[i];
          if (!p) return;
          f.root.position.set(p.x, 0, p.z);
          const speed = Math.hypot(p.vx, p.vz);
          if (p.stun > 0) { f.yawT += dt * 14; f.yaw = f.yawT; }
          else if (speed > 0.6) {
            f.yawT = Math.atan2(p.vx, p.vz);
            ph[i] += dt * speed * 2.2;
            f.hop.position.y = Math.abs(Math.sin(ph[i])) * 0.22;
            const q = Math.sin(ph[i] * 2) * 0.05;
            if (!f.busy) f.sq.scale.set(1 - q, 1 + q, 1 - q);
            f.idle = false;
          } else { f.hop.position.y *= 0.8; f.idle = true; }
        });
        if (cele) celebrate(figs, cele, t, cam);
        figs.forEach((f) => updateFigure(f, dt, t));
        arenaCam(cam, 9.9);
      },
      fx(e, me) {
        if (e.k === 'boom') {
          sfx.boom();
          const bm = booms.find((q) => q.t <= 0);
          if (bm) { bm.t = 0.45; bm.m.visible = true; bm.m.position.set(e.x!, 0.4, e.z!); }
        } else if (e.k === 'stun') {
          const f = figs[e.p!];
          void squashLand(f, 0.35);
          floatText(f.root.position.clone().setY(2.4), e.v ? `−${e.v}` : 'Bumm!', '#ff8fb0', scene);
        } else if (e.k === 'coin') {
          if (e.p === me || me < 0) sfx.coin();
          floatText(new THREE.Vector3(e.x, 2.2, e.z), `+${e.v}`, e.v === 3 ? '#ffe14a' : '#fff3a6', scene);
        }
        void T;
      },
      celebrate(w) { cele = w; if (!w) figs.forEach((f) => { f.busy = false; f.hop.position.y = 0; f.sq.scale.set(1, 1, 1); }); },
    };
  },
};

export default funkenregen;
