// Farbflut (2 gegen 2): run over the tile stage and paint it in your team colour. A paint splash
// (Shift / X) colours everything around you and knocks nearby rivals over; paint buckets give a
// big blot. After 30 seconds the team with more tiles wins.

import { sfx } from '../sfx';
import { clamp } from '../util';
import { celebrate, squashLand, updateFigure } from '../view3d/figures';
import { BOX, Batch, CYL, CYL8, GLOW, SPH_LO, THREE, VC, skyTex, toon } from '../view3d/kit';
import { floatText } from '../view3d/stage';
import { KBD, arenaCam, cloudsBelow, mgFigures, mgLights, names, teamOf } from './common';
import { Ripples, Sparks, col, runFig, uncelebrate } from './mgkit-a';
import { NO_INPUT, WIN_COINS, type MgCtx, type MinigameDef } from './types';

const D = 30;
const G = 14, TS = 1.2, HALF = (G * TS) / 2;
const SPEED = 6.2, SPLASH_R = 2.2, SPLASH_CD = 3.2, BUCKET_R = 3.3;
const TEAM_COL = ['#ff4fa3', '#2fd0ff'];
const TEAM_NAME = ['Pink', 'Cyan'];

interface Pl { x: number; z: number; vx: number; vz: number; cd: number; stun: number; painted: number }
interface Bucket { id: number; x: number; z: number; t: number }
interface S {
  /** Tiles row by row: 0 = blank, 1 = team Pink, 2 = team Cyan. */
  g: number[];
  cnt: [number, number];
  /** Team (0 = Pink, 1 = Cyan) per player. */
  tm: number[];
  pl: Pl[];
  bk: Bucket[];
  nextId: number;
  bkT: number;
  _ai: { rt: number; tx: number; tz: number; samples: number; speed: number; react: number }[];
}

const SKILL = { leicht: [4, 0.84, 0.42], normal: [8, 0.95, 0.26], stark: [14, 1, 0.14] } as const;

const tileOf = (x: number, z: number) => {
  const c = Math.floor((x + HALF) / TS), r = Math.floor((z + HALF) / TS);
  return c < 0 || r < 0 || c >= G || r >= G ? -1 : r * G + c;
};
const tileX = (k: number) => -HALF + ((k % G) + 0.5) * TS;
const tileZ = (k: number) => -HALF + (Math.floor(k / G) + 0.5) * TS;
const teamIdx = (team: number) => (team === 1 ? 1 : 0);

function paint(s: S, k: number, t: number, who: Pl | null) {
  const v = t + 1, old = s.g[k];
  if (old === v) return false;
  if (old) s.cnt[old - 1]--;
  s.g[k] = v;
  s.cnt[t]++;
  if (who) who.painted++;
  return true;
}
function paintR(s: S, x: number, z: number, R: number, t: number, who: Pl | null) {
  let n = 0;
  const c0 = Math.max(0, Math.floor((x - R + HALF) / TS)), c1 = Math.min(G - 1, Math.floor((x + R + HALF) / TS));
  const r0 = Math.max(0, Math.floor((z - R + HALF) / TS)), r1 = Math.min(G - 1, Math.floor((z + R + HALF) / TS));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const k = r * G + c;
    if (Math.hypot(tileX(k) - x, tileZ(k) - z) <= R && paint(s, k, t, who)) n++;
  }
  return n;
}
/** Tiles around (x, z) not in team t's colour (blank 1, rival 1.4). */
function gain(s: S, x: number, z: number, R: number, t: number) {
  let v = 0;
  const c0 = Math.max(0, Math.floor((x - R + HALF) / TS)), c1 = Math.min(G - 1, Math.floor((x + R + HALF) / TS));
  const r0 = Math.max(0, Math.floor((z - R + HALF) / TS)), r1 = Math.min(G - 1, Math.floor((z + R + HALF) / TS));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const k = r * G + c, g = s.g[k];
    if (g !== t + 1 && Math.hypot(tileX(k) - x, tileZ(k) - z) <= R) v += g ? 1.4 : 1;
  }
  return v;
}

function think(s: S, i: number, ctx: MgCtx) {
  const ai = s._ai[i], me = s.pl[i], t = teamIdx(ctx.setup.players[i].team);
  let bx = me.x, bz = me.z, bs = -1e9;
  const tryP = (x: number, z: number, bonus: number) => {
    x = clamp(x, -HALF + 0.5, HALF - 0.5); z = clamp(z, -HALF + 0.5, HALF - 0.5);
    let sc = gain(s, x, z, 1.9, t) + bonus - Math.hypot(x - me.x, z - me.z) * 0.45;
    // keep away from the team mate (cover more ground)
    s.pl.forEach((o, j) => { if (j !== i && teamIdx(ctx.setup.players[j].team) === t && Math.hypot(o.x - x, o.z - z) < 3.5) sc -= 3; });
    if (sc > bs) { bs = sc; bx = x; bz = z; }
  };
  for (let k = 0; k < ai.samples; k++) tryP((ctx.rng() * 2 - 1) * HALF, (ctx.rng() * 2 - 1) * HALF, 0);
  if (Math.hypot(me.vx, me.vz) > 1) tryP(me.x + me.vx * 0.6, me.z + me.vz * 0.6, 2);
  for (const b of s.bk) if (b.t > 0.4) tryP(b.x, b.z, 16);
  ai.tx = bx; ai.tz = bz;
}

const farbflut: MinigameDef<S> = {
  id: 'farbflut',
  name: 'Farbflut',
  type: '2v2',
  seconds: D,
  players: [4, 4],
  pro: true,
  online: 'ok',
  card: {
    sub: 'Lauft über die Bühne und färbt den Boden in eurer Teamfarbe. Nach 30 Sekunden gewinnt das Team mit mehr Feldern.',
    rules: (setup) => [
      `<b>Team Pink (${names(setup, teamOf(setup, 0))})</b> gegen <b>Team Cyan (${names(setup, teamOf(setup, 1))})</b>. Jedes Feld unter euren Füßen wird eures.`,
      '<b>Farbklecks:</b> färbt alles rund um dich und wirft Gegner in der Nähe kurz um. Danach ein paar Sekunden Pause.',
      '<b>Farbeimer</b> geben einen riesigen Klecks. Jedes Mitglied des Gewinnerteams bekommt 10 Münzen.',
    ],
    controls: () => ({ keys: `${KBD('W')} ${KBD('A')} ${KBD('S')} ${KBD('D')} oder Pfeile: laufen<br>${KBD('Shift')} oder ${KBD('X')}: Farbklecks`, touch: 'Daumen-Stick: laufen · Knopf: Farbklecks' }),
    touch: () => ({ joy: true, buttons: [{ key: 'b', label: 'Klecks' }] }),
    meter: () => 'Klecks',
  },
  init(ctx) {
    const P = ctx.setup.players;
    const slot = P.map((p, i) => P.slice(0, i).filter((q) => q.team === p.team).length);
    return {
      g: new Array(G * G).fill(0),
      cnt: [0, 0],
      tm: P.map((p) => teamIdx(p.team)),
      pl: P.map((p, i) => { const t = teamIdx(p.team); return { x: (t ? 1 : -1) * (HALF - 1.6), z: (slot[i] ? 1 : -1) * 3, vx: 0, vz: 0, cd: 1, stun: 0, painted: 0 }; }),
      bk: [], nextId: 1, bkT: 4,
      _ai: P.map((p) => { const [samples, speed, react] = SKILL[p.bot ?? 'normal']; return { rt: ctx.rng() * 0.2, tx: 0, tz: 0, samples, speed, react }; }),
    };
  },
  step(s, dt, inputs, ctx) {
    const P = ctx.setup.players;
    s.bkT -= dt;
    if (s.bkT <= 0 && s.bk.length < 2) {
      const k = Math.floor(ctx.rng() * G * G);
      s.bk.push({ id: s.nextId++, x: tileX(k), z: tileZ(k), t: 0 });
      s.bkT = 5 + ctx.rng() * 3;
    }
    for (const b of s.bk) b.t += dt;
    s.pl.forEach((p, i) => {
      const t = teamIdx(P[i].team), inp = inputs[i];
      p.cd -= dt; p.stun -= dt;
      let ix = p.stun > 0 ? 0 : inp.x, iz = p.stun > 0 ? 0 : inp.y;
      const l = Math.hypot(ix, iz);
      if (l > 1) { ix /= l; iz /= l; }
      const acc = 1 - Math.exp(-dt * 14);
      p.vx += (ix * SPEED - p.vx) * acc; p.vz += (iz * SPEED - p.vz) * acc;
      p.x = clamp(p.x + p.vx * dt, -HALF + 0.35, HALF - 0.35);
      p.z = clamp(p.z + p.vz * dt, -HALF + 0.35, HALF - 0.35);
      const k = tileOf(p.x, p.z);
      if (k >= 0 && p.stun <= 0) paint(s, k, t, p);
      if (inp.bP && p.cd <= 0 && p.stun <= 0) {
        p.cd = SPLASH_CD;
        const n = paintR(s, p.x, p.z, SPLASH_R, t, p);
        ctx.fx({ k: 'splash', p: i, x: p.x, z: p.z, v: n, col: TEAM_COL[t] });
        s.pl.forEach((o, j) => {
          if (teamIdx(P[j].team) === t || o.stun > 0) return;
          const dx = o.x - p.x, dz = o.z - p.z, dd = Math.hypot(dx, dz);
          if (dd < SPLASH_R) { o.stun = 0.9; o.vx = (dx / (dd || 1)) * 7; o.vz = (dz / (dd || 1)) * 7; ctx.fx({ k: 'knock', p: j }); }
        });
      }
      for (let b = s.bk.length - 1; b >= 0; b--) {
        const B = s.bk[b];
        if (B.t > 0.4 && Math.hypot(B.x - p.x, B.z - p.z) < 0.9) {
          s.bk.splice(b, 1);
          const n = paintR(s, B.x, B.z, BUCKET_R, t, p);
          ctx.fx({ k: 'bucket', p: i, x: B.x, z: B.z, v: n, col: TEAM_COL[t] });
        }
      }
    });
    for (let i = 0; i < s.pl.length; i++) for (let j = i + 1; j < s.pl.length; j++) {
      const a = s.pl[i], b = s.pl[j], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
      if (l < 1.2 && l > 1e-4) { const push = (1.2 - l) / 2; a.x -= (dx / l) * push; a.z -= (dz / l) * push; b.x += (dx / l) * push; b.z += (dz / l) * push; }
    }
  },
  bot(s, i, ctx) {
    const ai = s._ai[i], me = s.pl[i], t = teamIdx(ctx.setup.players[i].team);
    ai.rt -= 1 / 60;
    if (ai.rt <= 0) { ai.rt = ai.react * (0.7 + ctx.rng() * 0.6); think(s, i, ctx); }
    const dx = ai.tx - me.x, dz = ai.tz - me.z, l = Math.hypot(dx, dz);
    let splash = false;
    if (me.cd <= 0 && me.stun <= 0 && ctx.rng() < 0.2) {
      let rival = false;
      s.pl.forEach((o, j) => { if (teamIdx(ctx.setup.players[j].team) !== t && o.stun <= 0 && Math.hypot(o.x - me.x, o.z - me.z) < SPLASH_R * 0.85) rival = true; });
      splash = rival || gain(s, me.x, me.z, SPLASH_R, t) > 8;
    }
    if (l < 0.3) ai.rt = 0;
    const sp = l < 0.3 ? 0 : ai.speed;
    return { ...NO_INPUT, x: l ? (dx / l) * sp : 0, y: l ? (dz / l) * sp : 0, b: splash, bP: splash };
  },
  result(s, ctx) {
    const [a, b] = s.cnt, win = a === b ? -1 : a > b ? 0 : 1, tot = a + b || 1;
    const rows = ctx.setup.players.map((p, i) => {
      const t = teamIdx(p.team), w = t === win;
      return { i, win: w, coins: w ? WIN_COINS : 0, score: (w ? 1000 : 0) + s.pl[i].painted, note: `${s.pl[i].painted} Felder gefärbt · Team ${TEAM_NAME[t]} ${Math.round((s.cnt[t] / tot) * 100)} %` };
    });
    return { rows, title: win < 0 ? 'Unentschieden!' : `Team ${TEAM_NAME[win]} gewinnt! ${a > b ? a : b} zu ${a > b ? b : a}` };
  },
  score: (s, i) => {
    // the chip shows the share of the player's team
    const t = s.tm?.[i] ?? 0;
    return { v: `${Math.round(((s.cnt?.[t] ?? 0) / (G * G)) * 100)} %` };
  },
  view(setup) {
    const scene = new THREE.Scene();
    scene.background = skyTex(['#5b2bd6', '#b07aff', '#ffd0ef']);
    scene.fog = new THREE.Fog('#e8c8ff', 45, 110);
    mgLights(scene, 12);
    const cam = new THREE.PerspectiveCamera(42, 1, 0.5, 300);
    const st = new Batch(), gl = new Batch();
    // the stage block, a rim with lights, and paint pots in the corners
    st.add(BOX, '#3b1a8a', 0, -0.8, 0, 0, 0, 0, HALF * 2 + 1.6, 1.4, HALF * 2 + 1.6);
    st.add(BOX, '#2a1258', 0, -2.4, 0, 0, 0, 0, HALF * 2 + 0.6, 2, HALF * 2 + 0.6);
    for (const sd of [-1, 1]) {
      st.add(BOX, '#ffffff', sd * (HALF + 0.55), 0.1, 0, 0, 0, 0, 0.5, 0.35, HALF * 2 + 1.6);
      st.add(BOX, '#ffffff', 0, 0.1, sd * (HALF + 0.55), 0, 0, 0, HALF * 2 + 1.6, 0.35, 0.5);
    }
    for (let k = 0; k < 28; k++) {
      const side = Math.floor(k / 7), q = (k % 7) / 6 * 2 - 1, e = HALF + 0.55;
      const [x, z] = side === 0 ? [q * e, -e] : side === 1 ? [e, q * e] : side === 2 ? [-q * e, e] : [-e, -q * e];
      gl.add(SPH_LO, k % 2 ? TEAM_COL[0] : TEAM_COL[1], x, 0.38, z, 0, 0, 0, 0.17);
    }
    for (const [x, z, c] of [[-1, -1, 0], [1, -1, 1], [-1, 1, 0], [1, 1, 1]] as const) {
      const px = x * (HALF + 2.6), pz = z * (HALF + 2.6);
      st.add(CYL, '#e8e0ff', px, 0.2, pz, 0, 0, 0, 1.3, 2.2, 1.3);
      st.add(CYL, TEAM_COL[c], px, 1.33, pz, 0, 0, 0, 1.2, 0.08, 1.2);
      for (let k = 0; k < 3; k++) st.add(SPH_LO, TEAM_COL[c], px + Math.cos(k * 2.1) * 1.15, 0.8 - k * 0.3, pz + Math.sin(k * 2.1) * 1.15, 0, 0, 0, 0.3, 0.55, 0.3);
      st.add(CYL8, '#1a0b33', px, -0.9, pz, 0, 0, 0, 0.9, 0.2, 0.9);
    }
    scene.add(st.mesh(), gl.mesh(GLOW, false, false));
    cloudsBelow(scene);
    // the tiles: one InstancedMesh with per-tile colours
    const tileGeo = new THREE.BoxGeometry(TS - 0.08, 0.24, TS - 0.08);
    const tiles = new THREE.InstancedMesh(tileGeo, toon('#ffffff'), G * G);
    tiles.receiveShadow = true;
    tiles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(tiles);
    const COLS = [col('#efe6ff'), col(TEAM_COL[0]), col(TEAM_COL[1])], COLS2 = [col('#e2d6fa'), col('#ff6fb6'), col('#55dcff')];
    const dmy = new THREE.Object3D();
    const shown = new Int8Array(G * G).fill(-1);
    const pop = new Float32Array(G * G);
    const popList = new Int16Array(G * G);
    let popN = 0;
    const setTile = (k: number, lift: number) => { dmy.position.set(tileX(k), -0.12 + lift, tileZ(k)); dmy.rotation.set(0, 0, 0); dmy.scale.set(1, 1 + lift * 2, 1); dmy.updateMatrix(); tiles.setMatrixAt(k, dmy.matrix); };
    for (let k = 0; k < G * G; k++) { setTile(k, 0); tiles.setColorAt(k, COLS[0]); }
    // team score bar at the back
    const barBg = new THREE.Mesh(BOX, toon('#1a0b33'));
    barBg.scale.set(HALF * 2, 0.5, 0.5);
    barBg.position.set(0, 0.8, -HALF - 1.6);
    const bars = [0, 1].map((t) => { const m = new THREE.Mesh(BOX, toon(TEAM_COL[t])); m.position.set(0, 0.8, -HALF - 1.45); scene.add(m); return m; });
    scene.add(barBg);
    // buckets
    const bkB = new Batch();
    bkB.add(CYL, '#ffffff', 0, 0.45, 0, 0, 0, 0, 0.5, 0.9, 0.5);
    bkB.add(CYL, '#ffd23f', 0, 0.91, 0, 0, 0, 0, 0.44, 0.05, 0.44);
    for (let k = 0; k < 5; k++) bkB.add(SPH_LO, ['#ff4fa3', '#2fd0ff', '#ffd23f', '#7aff9a', '#b07aff'][k], Math.cos(k * 1.26) * 0.48, 0.75 - (k % 2) * 0.25, Math.sin(k * 1.26) * 0.48, 0, 0, 0, 0.12, 0.25, 0.12);
    const bkM = new THREE.InstancedMesh(bkB.geometry(), VC, 3);
    bkM.castShadow = true;
    bkM.count = 0;
    bkM.frustumCulled = false;
    scene.add(bkM);
    // team rings under the figures
    const ringGeo = new THREE.RingGeometry(0.62, 0.82, 28).rotateX(-Math.PI / 2);
    const rings = setup.players.map((p) => { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: TEAM_COL[teamIdx(p.team)] })); m.position.y = 0.04; scene.add(m); return m; });
    const figs = mgFigures(scene, setup);
    const sparks = new Sparks(scene, 160, undefined, 12);
    const ripples = new Ripples(scene, 6);
    const ph = new Float32Array(figs.length);
    const _v = new THREE.Vector3();
    let cele: boolean[] | null = null;
    return {
      scene, cam,
      frame(s, dt, t, me) {
        // tiles: only the ones that changed get a new colour and a little pop
        let dirtyC = false;
        for (let k = 0; k < G * G; k++) {
          const v = Math.round(s.g[k] ?? 0);
          if (v === shown[k]) continue;
          tiles.setColorAt(k, ((k % G) + Math.floor(k / G)) % 2 ? COLS2[v] : COLS[v]);
          if (shown[k] >= 0 && pop[k] <= 0) popList[popN++] = k;
          if (shown[k] >= 0) pop[k] = 0.3;
          shown[k] = v;
          dirtyC = true;
        }
        if (dirtyC && tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
        let dirtyM = false;
        for (let q = popN - 1; q >= 0; q--) {
          const k = popList[q];
          pop[k] -= dt;
          const kk = Math.max(0, pop[k]) / 0.3;
          setTile(k, Math.sin(kk * Math.PI) * 0.22);
          dirtyM = true;
          if (pop[k] <= 0) popList[q] = popList[--popN];
        }
        if (dirtyM) tiles.instanceMatrix.needsUpdate = true;
        // score bar
        const tot = G * G, a = s.cnt[0] / tot, b = s.cnt[1] / tot, W = HALF * 2;
        bars[0].scale.set(Math.max(0.001, a * W), 0.56, 0.4); bars[0].position.x = -HALF + (a * W) / 2;
        bars[1].scale.set(Math.max(0.001, b * W), 0.56, 0.4); bars[1].position.x = HALF - (b * W) / 2;
        // buckets
        let bn = 0;
        for (const B of s.bk) {
          if (bn >= 3) break;
          const sc = Math.min(1, B.t * 3);
          dmy.position.set(B.x, 0.1 + Math.abs(Math.sin(t * 4 + B.id)) * 0.35, B.z); dmy.rotation.set(0, t * 1.5, 0); dmy.scale.setScalar(sc * 1.1); dmy.updateMatrix();
          bkM.setMatrixAt(bn++, dmy.matrix);
        }
        bkM.count = bn;
        bkM.instanceMatrix.needsUpdate = true;
        // figures
        for (let i = 0; i < figs.length; i++) {
          const f = figs[i], p = s.pl[i];
          if (!p) continue;
          f.root.position.set(p.x, 0, p.z);
          rings[i].position.set(p.x, 0.05, p.z);
          rings[i].scale.setScalar(i === me ? 1.15 + Math.sin(t * 6) * 0.08 : 1);
          if (cele) continue;
          if (p.stun > 0) { f.yawT += dt * 14; f.yaw = f.yawT; }
          else runFig(f, p.vx, p.vz, dt, ph, i);
        }
        if (cele) celebrate(figs, cele, t, cam);
        for (const f of figs) updateFigure(f, dt, t);
        sparks.update(dt);
        ripples.update(dt);
        if (me >= 0 && s.pl[me]) { const tf = document.getElementById('turboFill'); if (tf) tf.style.transform = `scaleX(${clamp(1 - s.pl[me].cd / SPLASH_CD, 0, 1).toFixed(3)})`; }
        arenaCam(cam, HALF + 0.9, 0.86);
      },
      fx(e, me) {
        if (e.k === 'splash' || e.k === 'bucket') {
          const big = e.k === 'bucket';
          if (big || e.p === me || me < 0) sfx.boom();
          sparks.emit(e.x!, 0.6, e.z!, big ? 34 : 20, e.col ?? '#ffffff', big ? 7 : 5.5, 6, 0.2, 0.6);
          ripples.spawn(e.x!, 0.1, e.z!, e.col ?? '#ffffff', 0.4, big ? BUCKET_R + 0.4 : SPLASH_R + 0.3, 0.45);
          const f = figs[e.p!];
          if (f) void squashLand(f, 0.3);
          if (e.v && (e.p === me || big)) floatText(_v.set(e.x!, 2.4, e.z!), `+${e.v}`, e.col ?? '#ffffff', scene);
        } else if (e.k === 'knock') { sfx.bonk(); const f = figs[e.p!]; if (f) { void squashLand(f, 0.4); if (e.p === me) floatText(f.root.position.clone().setY(2.4), 'Umgeworfen!', '#ff8fb0', scene); } }
      },
      celebrate(w) { cele = w; if (!w) uncelebrate(figs); },
    };
  },
};

export default farbflut;
