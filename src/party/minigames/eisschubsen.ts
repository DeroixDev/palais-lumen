// Eisschubsen (Jeder gegen jeden): everybody slides around on a round ice floe in a cold
// sea. A dash (Shift / X) shoves whoever you hit. Every few seconds the outer ring of the floe
// breaks off, so the floe shrinks. Whoever is still on it at the end wins (the last one standing
// ends it early).

import { sfx } from '../sfx';
import { TAU, clamp } from '../util';
import { celebrate, squashLand, updateFigure } from '../view3d/figures';
import { Batch, CONE, CYL8, GLOW, SPH_LO, THREE, TOR_THIN, skyTex, toon } from '../view3d/kit';
import { floatText } from '../view3d/stage';
import { KBD, arenaCam, mgFigures, mgLights } from './common';
import { Ripples, Sparks, runFig, uncelebrate, winTitle } from './mgkit-a';
import { NO_INPUT, WIN_COINS, type MgCtx, type MinigameDef } from './types';

const D = 30;
const R0 = 8.6;
/** Outer rings break off at these times (seconds after "Los!"), one metre each. */
const DROPS = [8, 13, 18, 23];
const WARN = 1.6;
const PR = 0.7;
const KNOCK = 6.2, ACC = 17, MAXV = 6.4, DASH_V = 13.5, DASH_T = 0.22, DASH_CD = 1.5;

interface Pl {
  x: number; z: number; vx: number; vz: number;
  /** Facing (unit vector) for the dash. */
  fx: number; fz: number;
  dash: number; cd: number; stun: number;
  y: number; vy: number;
  out: boolean; outT: number;
  push: number; by: number; byT: number;
}
interface S {
  pl: Pl[];
  stage: number;
  /** Seconds until the next ring breaks (-1 = none left). */
  next: number;
  lastOut: number;
  _ai: { rt: number; tx: number; tz: number; dash: boolean; skill: number; cos: number; react: number }[];
}

const SKILL = { leicht: [0.78, 0.15, 0.36], normal: [0.92, 0.55, 0.2], stark: [1, 0.72, 0.11] } as const;

const edgeAt = (stage: number) => R0 - stage;
const stageAt = (t: number) => { let k = 0; for (const d of DROPS) if (t >= d) k++; return k; };
const aliveN = (s: S) => { let n = 0; for (const p of s.pl) if (!p.out) n++; return n; };

function botThink(s: S, i: number, ctx: MgCtx) {
  const ai = s._ai[i], me = s.pl[i];
  const edge = edgeAt(s.stage) - (s.next >= 0 && s.next < 2.2 ? 1 : 0);
  const d = Math.hypot(me.x, me.z);
  ai.dash = false;
  if (d > edge - 1.9) { ai.tx = me.x * 0.2; ai.tz = me.z * 0.2; return; }
  // pick the victim that is closest to the edge and not too far away
  let best = -1, bs = -1e9;
  s.pl.forEach((o, j) => {
    if (j === i || o.out) return;
    const od = Math.hypot(o.x, o.z), dd = Math.hypot(o.x - me.x, o.z - me.z);
    const sc = od / edge - dd * 0.09 + (ctx.rng() - 0.5) * (1.1 - ai.skill);
    if (sc > bs) { bs = sc; best = j; }
  });
  if (best < 0) { ai.tx = 0; ai.tz = 0; return; }
  const v = s.pl[best], vd = Math.hypot(v.x, v.z) || 1;
  const nx = vd > 0.5 ? v.x / vd : (v.x - me.x) || 1, nz = vd > 0.5 ? v.z / vd : (v.z - me.z);
  ai.tx = v.x - nx * 1.5; ai.tz = v.z - nz * 1.5;
  const dx = v.x - me.x, dz = v.z - me.z, dd = Math.hypot(dx, dz) || 1;
  const along = (dx * nx + dz * nz) / dd;
  const worth = vd + 3 > edge || ctx.rng() < 0.2;
  if (dd < 2.7 && along > ai.cos && me.cd <= 0 && worth) { ai.dash = true; ai.tx = v.x; ai.tz = v.z; }
  else if (ai.skill < 0.85 && dd < 2.4 && me.cd <= 0 && ctx.rng() < 0.25) { ai.dash = true; ai.tx = v.x; ai.tz = v.z; }
  // a dashing opponent heading for me near the edge: step towards the middle
  for (let j = 0; j < s.pl.length; j++) {
    const o = s.pl[j];
    if (j === i || o.out || o.dash <= 0) continue;
    const ox = me.x - o.x, oz = me.z - o.z, ol = Math.hypot(ox, oz);
    if (ol < 3.2 && (o.vx * ox + o.vz * oz) / (ol || 1) > 5 && d > edge - 3.6 && ctx.rng() < ai.skill) { ai.tx = -me.z * 0.5 + me.x * 0.1; ai.tz = me.x * 0.5 + me.z * 0.1; ai.dash = false; }
  }
}

const eisschubsen: MinigameDef<S> = {
  id: 'eisschubsen',
  name: 'Eisschubsen',
  type: 'ffa',
  seconds: D,
  players: [2, 4],
  pro: true,
  online: 'ok',
  card: {
    sub: 'Rutsch über die Eisscholle und schubs die anderen ins Wasser. Der Rand bricht immer weiter ab. Wer zuletzt noch oben steht, gewinnt.',
    rules: () => [
      '<b>Schubsen:</b> Ein kurzer Stoß nach vorn wirft getroffene Figuren weit weg. Danach braucht er eine Sekunde Pause.',
      '<b>Der Rand bricht:</b> Blinkt der äußere Ring rot, bricht er gleich ab. Rechtzeitig nach innen rutschen!',
      'Wer am Ende noch auf der Scholle steht, gewinnt 10 Münzen. Bleibt nur eine Figur übrig, ist sofort Schluss.',
    ],
    controls: () => ({ keys: `${KBD('W')} ${KBD('A')} ${KBD('S')} ${KBD('D')} oder Pfeile: rutschen<br>${KBD('Shift')} oder ${KBD('X')}: schubsen`, touch: 'Daumen-Stick: rutschen · Knopf rechts: Schubsen' }),
    touch: () => ({ joy: true, buttons: [{ key: 'b', label: 'Schubsen' }] }),
  },
  init(ctx) {
    const n = ctx.setup.players.length;
    return {
      pl: ctx.setup.players.map((_, i) => {
        const a = Math.PI / 2 + (i * TAU) / n, x = Math.cos(a) * 4.2, z = Math.sin(a) * 4.2;
        return { x, z, vx: 0, vz: 0, fx: -Math.cos(a), fz: -Math.sin(a), dash: 0, cd: 0.5, stun: 0, y: 0, vy: 0, out: false, outT: 0, push: 0, by: -1, byT: -9 };
      }),
      stage: 0, next: DROPS[0], lastOut: -9,
      _ai: ctx.setup.players.map((p) => {
        const [skill, cos, react] = SKILL[p.bot ?? 'normal'];
        return { rt: ctx.rng() * 0.2, tx: 0, tz: 0, dash: false, skill, cos, react };
      }),
    };
  },
  step(s, dt, inputs, ctx) {
    const time = ctx.time, play = ctx.setup.mode === 'play';
    const st = stageAt(time);
    if (st !== s.stage) { s.stage = st; ctx.fx({ k: 'break', v: st }); }
    s.next = st < DROPS.length ? DROPS[st] - time : -1;
    const edge = edgeAt(s.stage);
    s.pl.forEach((p, i) => {
      if (p.out) {
        p.vy -= 26 * dt; p.y += p.vy * dt;
        p.vx *= Math.exp(-dt * 2); p.vz *= Math.exp(-dt * 2);
        p.x += p.vx * dt; p.z += p.vz * dt;
        if (!play && time - p.outT > 1.5) {
          const a = ctx.rng() * TAU;
          Object.assign(p, { x: Math.cos(a) * 1.2, z: Math.sin(a) * 1.2, vx: 0, vz: 0, y: 0, vy: 0, out: false, stun: 0.3, dash: 0, cd: 0.4 });
          ctx.fx({ k: 'back', p: i });
        }
        return;
      }
      const inp = inputs[i];
      p.cd -= dt; p.dash -= dt; p.stun -= dt;
      let ix = inp.x, iz = inp.y;
      const l = Math.hypot(ix, iz);
      if (l > 1) { ix /= l; iz /= l; }
      if (l > 0.25) { const fl = Math.hypot(ix, iz); p.fx = ix / fl; p.fz = iz / fl; }
      if (inp.bP && p.cd <= 0 && p.stun <= 0) {
        p.vx = p.fx * DASH_V; p.vz = p.fz * DASH_V; p.dash = DASH_T; p.cd = DASH_CD;
        ctx.fx({ k: 'dash', p: i });
      }
      if (p.dash <= 0 && p.stun <= 0) { p.vx += ix * ACC * dt; p.vz += iz * ACC * dt; }
      const damp = Math.exp(-dt * (p.stun > 0 ? 2.6 : 1.5));
      p.vx *= damp; p.vz *= damp;
      const sp = Math.hypot(p.vx, p.vz);
      if (sp > MAXV && p.dash <= 0 && p.stun <= 0) { const k = Math.exp(-dt * 7); const ns = MAXV + (sp - MAXV) * k; p.vx *= ns / sp; p.vz *= ns / sp; }
      p.x += p.vx * dt; p.z += p.vz * dt;
    });
    // collisions: a dash hands its speed on, plain bumps bounce
    const n = s.pl.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = s.pl[i], b = s.pl[j];
      if (a.out || b.out) continue;
      let dx = b.x - a.x, dz = b.z - a.z;
      const L = Math.hypot(dx, dz);
      if (L >= PR * 2 || L < 1e-4) continue;
      dx /= L; dz /= L;
      const push = (PR * 2 - L) / 2;
      a.x -= dx * push; a.z -= dz * push; b.x += dx * push; b.z += dz * push;
      const va = a.vx * dx + a.vz * dz, vb = b.vx * dx + b.vz * dz;
      if (va - vb <= 0) continue;
      const aD = a.dash > 0, bD = b.dash > 0;
      if (aD !== bD) {
        const [h, v, sg] = aD ? [a, b, 1] : [b, a, -1];
        const hv = Math.max(va * sg, vb * -sg, 6);
        const kb = KNOCK + hv * 0.1;
        v.vx = v.vx * 0.3 + dx * sg * kb; v.vz = v.vz * 0.3 + dz * sg * kb;
        h.vx -= dx * sg * hv * 0.8; h.vz -= dz * sg * hv * 0.8;
        h.dash = 0; v.stun = 0.45; v.dash = 0;
        const hi = aD ? i : j, vi = aD ? j : i;
        v.by = hi; v.byT = ctx.time;
        ctx.fx({ k: 'shove', p: hi, v: vi, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
      } else {
        const ex = (va - vb) * (aD && bD ? 1.15 : 0.9);
        a.vx -= dx * ex; a.vz -= dz * ex; b.vx += dx * ex; b.vz += dz * ex;
        if (aD && bD) { a.dash = b.dash = 0; a.stun = b.stun = 0.3; }
        if (va - vb > 3) ctx.fx({ k: 'bump', x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
      }
    }
    // off the edge
    s.pl.forEach((p, i) => {
      if (p.out || Math.hypot(p.x, p.z) <= edge + 0.15) return;
      p.out = true; p.outT = time; p.vy = 3.5; s.lastOut = time;
      if (p.by >= 0 && time - p.byT < 2.5 && p.by !== i) s.pl[p.by].push++;
      ctx.fx({ k: 'splash', p: i, x: p.x, z: p.z, v: p.by >= 0 && time - p.byT < 2.5 ? p.by : -1 });
    });
  },
  bot(s, i, ctx) {
    const ai = s._ai[i], me = s.pl[i];
    if (me.out) return NO_INPUT;
    ai.rt -= 1 / 60;
    if (ai.rt <= 0) { ai.rt = ai.react * (0.7 + ctx.rng() * 0.6); botThink(s, i, ctx); }
    let dx = ai.tx - me.x, dz = ai.tz - me.z;
    const l = Math.hypot(dx, dz);
    // brake: icy floor, so steer against the current velocity a bit
    dx -= me.vx * 0.25; dz -= me.vz * 0.25;
    const ll = Math.hypot(dx, dz) || 1;
    const sp = l < 0.4 ? 0 : ai.skill;
    const dash = ai.dash && me.cd <= 0;
    if (dash) ai.dash = false;
    return { ...NO_INPUT, x: (dx / ll) * sp, y: (dz / ll) * sp, b: dash, bP: dash };
  },
  over: (s, ctx) => ctx.setup.mode === 'play' && aliveN(s) <= 1 && ctx.time > s.lastOut + 1.1,
  result(s, ctx) {
    const alive = s.pl.map((p, i) => (p.out ? -1 : i)).filter((i) => i >= 0);
    const lastT = Math.max(...s.pl.map((p) => p.outT));
    const win = alive.length ? new Set(alive) : new Set(s.pl.map((p, i) => (p.outT === lastT ? i : -1)).filter((i) => i >= 0));
    const rows = s.pl.map((p, i) => {
      const w = win.has(i);
      const note = (p.out ? `nach ${p.outT.toFixed(1).replace('.', ',')} s ins Wasser` : 'bis zum Schluss auf der Scholle') + ` · ${p.push} geschubst`;
      return { i, win: w, coins: w ? WIN_COINS : 0, score: (w ? 1000 : 0) + (p.out ? p.outT * 10 : 500) + p.push, note };
    });
    return { rows, title: winTitle([...win].map((i) => ctx.setup.players[i].name)) };
  },
  score: (s, i) => { const p = s.pl[i]; return p ? { v: p.out ? 'raus' : p.push ? `${p.push} geschubst` : 'drauf', out: p.out } : { v: '' }; },
  view(setup) {
    const scene = new THREE.Scene();
    scene.background = skyTex(['#4aa8ff', '#a6e0ff', '#f2fbff']);
    scene.fog = new THREE.Fog('#d8f2ff', 40, 110);
    mgLights(scene, 12);
    const cam = new THREE.PerspectiveCamera(42, 1, 0.5, 300);
    // the sea
    const sea = new THREE.Mesh(new THREE.CircleGeometry(140, 48).rotateX(-Math.PI / 2), toon('#2f9df0'));
    sea.position.y = -0.55;
    sea.receiveShadow = true;
    scene.add(sea);
    const deco = new Batch(), glow = new Batch();
    // icebergs and floating bits around
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * TAU + 0.2, r = 17 + (k % 4) * 4.5, h = 2 + (k % 3) * 2.2;
      deco.add(CONE, k % 2 ? '#ffffff' : '#d6f3ff', Math.cos(a) * r, h / 2 - 0.6, Math.sin(a) * r, 0, k, 0, 2 + (k % 3), h, 2 + (k % 2) * 1.5);
      deco.add(CYL8, '#bfe9ff', Math.cos(a) * r, -0.5, Math.sin(a) * r, 0, k, 0, 2.6 + (k % 3), 0.3, 2.4 + (k % 2) * 1.5);
    }
    for (let k = 0; k < 22; k++) { const a = k * 2.4, r = 10.5 + (k % 5) * 1.3; deco.add(CYL8, '#eefaff', Math.cos(a) * r, -0.42, Math.sin(a) * r, 0, k, 0, 0.35 + (k % 3) * 0.2, 0.18, 0.3 + (k % 2) * 0.25); }
    for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; glow.add(SPH_LO, k % 2 ? '#7af0ff' : '#ff9ad8', Math.cos(a) * 12.5, -0.3, Math.sin(a) * 12.5, 0, 0, 0, 0.22); }
    scene.add(deco.mesh(undefined, false, true), glow.mesh(GLOW, false, false));
    // the floe: a middle disc and four rings of ice chunks (outer ring breaks first)
    const segGeo = (r0: number, r1: number, top: boolean, a0: number, a1: number) => {
      const pts = top ? [new THREE.Vector2(r1, 0.02), new THREE.Vector2(r0, 0.02)] : [new THREE.Vector2(r0 + 0.12, -0.75), new THREE.Vector2(r1 - 0.25, -0.75), new THREE.Vector2(r1, -0.1), new THREE.Vector2(r1, 0), new THREE.Vector2(r0, 0), new THREE.Vector2(r0, -0.1)];
      return new THREE.LatheGeometry(pts, Math.max(4, Math.round((a1 - a0) * r1 * 1.4)), a0, a1 - a0);
    };
    const pieces: { grp: THREE.Group; drop: number }[] = [];
    const radii = [0, R0 - 4, R0 - 3, R0 - 2, R0 - 1, R0];
    for (let k = 0; k < 5; k++) {
      const b = new Batch(), r0 = radii[k], r1 = radii[k + 1];
      const segs = k === 0 ? 1 : 7 + k * 2;
      for (let q = 0; q < segs; q++) {
        const a0 = (q / segs) * TAU + (k ? 0.02 : 0), a1 = ((q + 1) / segs) * TAU - (k ? 0.02 : 0);
        const g1 = segGeo(r0 + (k ? 0.03 : 0), r1 - 0.03, false, a0, a1), g2 = segGeo(r0 + (k ? 0.03 : 0), r1 - 0.03, true, a0, a1);
        b.add(g1, k % 2 ? '#a8e2ff' : '#bdeaff');
        b.add(g2, (k + q) % 2 ? '#ffffff' : '#f0fbff', 0, 0.001, 0);
        g1.dispose(); g2.dispose();
      }
      if (k === 0) for (let q = 0; q < 6; q++) { const a = (q / 6) * TAU; b.add(CYL8, '#d6f3ff', Math.cos(a) * 2.2, 0.03, Math.sin(a) * 2.2, 0, 0, 0, 0.5, 0.04, 0.5); }
      const grp = new THREE.Group();
      grp.add(b.mesh());
      scene.add(grp);
      pieces.push({ grp, drop: -1 });
    }
    const warnMat = new THREE.MeshBasicMaterial({ color: '#ff3d6e', transparent: true, opacity: 0.8, depthWrite: false });
    const warn = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2), warnMat);
    warn.position.y = 0.06;
    scene.add(warn);
    const edgeGlow = new THREE.Mesh(TOR_THIN, new THREE.MeshBasicMaterial({ color: '#7af0ff' }));
    edgeGlow.rotation.x = Math.PI / 2;
    edgeGlow.position.y = 0.05;
    scene.add(edgeGlow);
    const figs = mgFigures(scene, setup);
    // facing arrows (show where the shove goes and when it is ready)
    const arrowGeo = new THREE.ConeGeometry(0.32, 0.7, 3).rotateX(Math.PI / 2);
    const arrows = setup.players.map((p) => { const m = new THREE.Mesh(arrowGeo, toon(p.color)); m.position.y = 0.12; scene.add(m); return m; });
    const sparks = new Sparks(scene, 120);
    const ripples = new Ripples(scene, 6);
    const ph = new Float32Array(figs.length);
    let cele: boolean[] | null = null;
    let lastStage = 0;
    return {
      scene, cam,
      frame(s, dt, t) {
        // rings breaking off (view-side animation; a new round puts them back)
        if (s.stage < lastStage) for (const pc of pieces) { pc.drop = -1; pc.grp.position.set(0, 0, 0); pc.grp.rotation.set(0, 0, 0); pc.grp.visible = true; }
        lastStage = s.stage;
        for (let k = 1; k < 5; k++) {
          const pc = pieces[k], gone = s.stage >= 5 - k;
          if (gone && pc.drop < 0) pc.drop = 0;
          if (pc.drop >= 0) {
            pc.drop += dt;
            pc.grp.position.y = -pc.drop * pc.drop * 3 - pc.drop * 0.6;
            pc.grp.rotation.x = Math.sin(k * 1.7) * pc.drop * 0.05;
            pc.grp.rotation.z = Math.cos(k * 1.3) * pc.drop * 0.05;
            pc.grp.visible = pc.drop < 2.5;
          }
        }
        const edge = edgeAt(s.stage);
        edgeGlow.scale.setScalar(edge);
        const warning = s.next >= 0 && s.next < WARN;
        warn.visible = warning && Math.sin(t * 22) > -0.3;
        if (warning) { warn.scale.setScalar(edge); warnMat.opacity = 0.55 + 0.35 * Math.sin(t * 22); }
        figs.forEach((f, i) => {
          const p = s.pl[i], ar = arrows[i];
          if (!p) return;
          f.root.position.set(p.x, p.y, p.z);
          ar.visible = !p.out && !cele;
          if (ar.visible) {
            const ready = p.cd <= 0;
            ar.position.set(p.x + p.fx * 1.15, 0.12, p.z + p.fz * 1.15);
            ar.rotation.y = Math.atan2(p.fx, p.fz);
            ar.scale.setScalar(ready ? 1 + Math.sin(t * 8) * 0.08 : clamp(1 - p.cd / DASH_CD, 0.25, 1) * 0.7);
          }
          if (p.out) { f.root.rotation.z += dt * 6; f.root.visible = p.y > -4; return; }
          f.root.rotation.z = 0;
          f.root.visible = true;
          if (cele) return;
          if (p.stun > 0) { f.yawT += dt * 16; f.yaw = f.yawT; }
          else if (p.dash > 0) { f.yawT = Math.atan2(p.fx, p.fz); if (!f.busy) f.sq.scale.set(0.85, 0.9, 1.3); f.idle = false; sparks.shoot(p.x - p.fx * 0.5, 0.15, p.z - p.fz * 0.5, -p.fx * 2, 1.5, -p.fz * 2, '#e8fbff', 0.12, 0.35); }
          else runFig(f, p.vx, p.vz, dt, ph, i, Math.hypot(p.vx, p.vz) > 1.2);
          if (p.dash <= 0 && p.stun <= 0 && Math.hypot(p.vx, p.vz) < 1.2 && Math.hypot(p.fx, p.fz) > 0) f.yawT = Math.atan2(p.fx, p.fz);
        });
        if (cele) celebrate(figs, cele, t, cam);
        figs.forEach((f) => updateFigure(f, dt, t));
        sparks.update(dt);
        ripples.update(dt);
        arenaCam(cam, 9.6, 0.82);
      },
      fx(e, me) {
        if (e.k === 'dash') { if (e.p === me || me < 0) sfx.whoosh(); }
        else if (e.k === 'shove') {
          sfx.hit();
          sparks.emit(e.x!, 0.9, e.z!, 14, '#ffffff', 6, 4, 0.18, 0.5);
          sparks.emit(e.x!, 0.9, e.z!, 6, '#ffe14a', 5, 5, 0.14, 0.5);
          const f = figs[e.v!];
          if (f) void squashLand(f, 0.35);
          if (e.p === me) floatText(new THREE.Vector3(e.x, 2.6, e.z), 'Schubs!', '#dcff1f', scene);
        } else if (e.k === 'bump') { sfx.pop(); sparks.emit(e.x!, 0.8, e.z!, 5, '#e8fbff', 3, 3, 0.12, 0.35); }
        else if (e.k === 'splash') {
          sfx.boom();
          sparks.emit(e.x!, 0, e.z!, 26, '#bff0ff', 4.5, 9, 0.2, 0.9);
          sparks.emit(e.x!, 0, e.z!, 10, '#ffffff', 3, 7, 0.16, 0.7);
          ripples.spawn(e.x!, -0.45, e.z!, '#e8fbff', 0.6, 3.4, 0.9);
          ripples.spawn(e.x!, -0.45, e.z!, '#ffffff', 0.3, 2, 0.6);
          floatText(new THREE.Vector3(e.x, 2.4, e.z), 'Platsch!', '#7af0ff', scene);
        } else if (e.k === 'break') {
          sfx.creak();
          floatText(new THREE.Vector3(0, 3.2, 0), 'Der Rand bricht!', '#ff8fb0', scene);
        } else if (e.k === 'back') { const f = figs[e.p!]; if (f) void squashLand(f, 0.3); }
      },
      celebrate(w) { cele = w; if (!w) uncelebrate(figs); },
    };
  },
};

export default eisschubsen;
