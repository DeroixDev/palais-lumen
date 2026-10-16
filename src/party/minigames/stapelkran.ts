// Stapelkran (2 gegen 2): each team has a crane that swings a block over its tower. The two
// team members take turns dropping: what hangs over the edge is cut off, a perfect drop keeps the
// full width and even grows it back. The higher tower after the time wins.

import { sfx } from '../sfx';
import { clamp } from '../util';
import { celebrate, squashLand, updateFigure } from '../view3d/figures';
import { BOX, Batch, CYL8, GLOW, THREE, TOR, skyTex, toon } from '../view3d/kit';
import { floatText } from '../view3d/stage';
import { KBD, mgFigures, mgLights, names, teamOf } from './common';
import { Sparks, Tag, botPool, fitDist, gaussR, unCele } from './mgbkit';
import { NO_INPUT, WIN_COINS, type MgSetup, type MinigameDef } from './types';

const TX = [-4.4, 4.4];
const BH = 0.55, W0 = 2.4, AMP = 2.7, DROP = 2.5, GRAV = 30, PERF = 0.1, MINW = 0.45;
const MAXB = 48, AUTO_DROP = 4;

interface Blk { x: number; w: number; p: number }
interface Cur { x: number; w: number; ph: 'swing' | 'fall' | 'wait'; y: number; vy: number; phase: number; t: number }
interface Tw { blocks: Blk[]; cur: Cur; turn: number; perf: number; misses: number; combo: number }
interface S { tw: Tw[]; /** Team of each player. */ pt: number[]; _ai: { e: number; turn: number }[] }

const SD = { leicht: 0.07, normal: 0.04, stark: 0.024 } as const;
const bin = botPool();

const TOP = { x: 0, w: 0, y: 0 };
/** The top surface of a tower (written into one scratch object: read it right away). */
const topOf = (tw: Tw, team: number) => {
  const b = tw.blocks[tw.blocks.length - 1];
  if (b) { TOP.x = b.x; TOP.w = b.w; } else { TOP.x = TX[team]; TOP.w = W0 + 0.3; }
  TOP.y = tw.blocks.length * BH;
  return TOP;
};
const swingW = (tw: Tw) => Math.min(3.5, 1.85 + tw.blocks.length * 0.07);
const mateCache = new WeakMap<MgSetup, number[][]>();
function mates(setup: MgSetup, team: number) {
  let m = mateCache.get(setup);
  if (!m) { m = [teamOf(setup, 0), teamOf(setup, 1)]; mateCache.set(setup, m); }
  return m[team];
}
const dropper = (setup: MgSetup, s: S, team: number) => { const m = mates(setup, team); return m[s.tw[team].turn % m.length] ?? -1; };

function nextBlock(tw: Tw, team: number, rng: () => number, wait: number) {
  const top = topOf(tw, team);
  tw.cur.w = Math.max(MINW, Math.min(W0, top.w));
  tw.cur.ph = 'wait';
  tw.cur.t = -wait;
  tw.cur.phase = rng() < 0.5 ? -Math.PI / 2 : Math.PI / 2;
  tw.cur.x = TX[team] + AMP * Math.sin(tw.cur.phase);
  tw.cur.vy = 0;
  tw.cur.y = top.y + DROP;
}

const stapelkran: MinigameDef<S> = {
  id: 'stapelkran',
  name: 'Stapelkran',
  type: '2v2',
  seconds: 35,
  players: [4, 4],
  pro: true,
  online: 'gut',
  card: {
    sub: 'Euer Kran schwenkt einen Block über euren Turm. Ihr lasst abwechselnd fallen: Was übersteht, wird abgeschnitten. Wer am Ende höher baut, gewinnt.',
    rules: (setup) => [
      `<b>Team Links (${names(setup, teamOf(setup, 0))})</b> gegen <b>Team Rechts (${names(setup, teamOf(setup, 1))})</b>.`,
      '<b>Abwechselnd:</b> Wer dran ist, hat einen Leuchtring. Ein Treffer genau auf die Kante ist <b>perfekt</b> und macht den Block wieder breiter.',
      'Daneben fällt der Block runter und kostet Zeit. Nach 4 Sekunden fällt er von selbst. Der höhere Turm gewinnt, jedes Mitglied bekommt 10 Münzen.',
    ],
    controls: () => ({ keys: `${KBD('Leertaste')}: Block fallen lassen, wenn du dran bist`, touch: 'Großer Knopf unten rechts: Los!' }),
    touch: () => ({ joy: false, buttons: [{ key: 'a', label: 'Los!' }] }),
  },
  init(ctx) {
    const tw = [0, 1].map((team) => {
      const t: Tw = { blocks: [], cur: { x: 0, w: W0, ph: 'wait', y: 0, vy: 0, phase: 0, t: 0 }, turn: 0, perf: 0, misses: 0, combo: 0 };
      nextBlock(t, team, ctx.rng, 0.2);
      return t;
    });
    return { tw, pt: ctx.setup.players.map((p) => (p.team === 1 ? 1 : 0)), _ai: [{ e: -9, turn: -1 }, { e: -9, turn: -1 }] };
  },
  step(s, dt, inputs, ctx) {
    for (let team = 0; team < 2; team++) {
      const tw = s.tw[team], c = tw.cur;
      c.t += dt;
      if (c.ph === 'wait') { if (c.t >= 0) { c.ph = 'swing'; c.t = 0; } continue; }
      if (c.ph === 'swing') {
        c.phase += swingW(tw) * dt;
        c.x = TX[team] + AMP * Math.sin(c.phase);
        const who = dropper(ctx.setup, s, team);
        for (const i of mates(ctx.setup, team)) {
          if (!inputs[i]?.aP) continue;
          if (i === who) { c.ph = 'fall'; c.vy = 0; c.t = 0; ctx.fx({ k: 'drop', p: i }); }
          else ctx.fx({ k: 'notyou', p: i });
        }
        // nobody drops: the block goes by itself, so a team never stalls
        if (c.ph === 'swing' && c.t >= AUTO_DROP) { c.ph = 'fall'; c.vy = 0; c.t = 0; ctx.fx({ k: 'drop', p: who }); }
        continue;
      }
      // falling
      c.vy -= GRAV * dt;
      c.y += c.vy * dt;
      const top = topOf(tw, team);
      if (c.y > top.y) continue;
      const off = c.x - top.x;
      const lo = Math.max(c.x - c.w / 2, top.x - top.w / 2), hi = Math.min(c.x + c.w / 2, top.x + top.w / 2);
      const who = dropper(ctx.setup, s, team);
      if (Math.abs(off) <= PERF && tw.blocks.length < MAXB) {
        tw.combo++;
        tw.perf++;
        tw.blocks.push({ x: top.x, w: Math.min(W0, c.w + 0.12), p: who });
        ctx.fx({ k: 'perfect', p: who, v: team, x: top.x, y: top.y + BH });
        nextBlock(tw, team, ctx.rng, 0.3);
      } else if (hi - lo > 0.05 && tw.blocks.length < MAXB) {
        tw.combo = 0;
        const nw = hi - lo, nx = (lo + hi) / 2;
        tw.blocks.push({ x: nx, w: nw, p: who });
        const cw = c.w - nw, cx = off > 0 ? hi + cw / 2 : lo - cw / 2;
        ctx.fx({ k: 'cut', p: who, v: team, x: cx, y: top.y + BH / 2, z: cw });
        nextBlock(tw, team, ctx.rng, 0.3);
      } else {
        tw.combo = 0;
        tw.misses++;
        ctx.fx({ k: 'miss', p: who, v: team, x: c.x, y: top.y + BH / 2, z: c.w });
        nextBlock(tw, team, ctx.rng, 0.9);
      }
      tw.turn++;
    }
  },
  bot(s, i, ctx) {
    const team = ctx.setup.players[i].team === 1 ? 1 : 0, tw = s.tw[team], c = tw.cur;
    if (c.ph !== 'swing' || c.t < 0.3 || dropper(ctx.setup, s, team) !== i) return NO_INPUT;
    const a = s._ai[team];
    if (a.turn !== tw.turn) { a.turn = tw.turn; a.e = gaussR(ctx.rng) * SD[ctx.setup.players[i].bot ?? 'normal']; }
    const w = swingW(tw), top = topOf(tw, team);
    const x1 = TX[team] + AMP * Math.sin(c.phase - w * a.e), x0 = TX[team] + AMP * Math.sin(c.phase - w * (a.e + 1 / 60));
    if ((x0 - top.x) * (x1 - top.x) > 0) return NO_INPUT;
    const o = bin(i);
    o.a = true; o.aP = true;
    return o;
  },
  result(s, ctx) {
    const h = s.tw.map((t) => t.blocks.length);
    const win = h[0] !== h[1] ? (h[0] > h[1] ? 0 : 1) : s.tw[0].perf !== s.tw[1].perf ? (s.tw[0].perf > s.tw[1].perf ? 0 : 1) : -1;
    const rows = ctx.setup.players.map((p, i) => {
      const t = p.team === 1 ? 1 : 0, w = t === win;
      let mine = 0;
      for (const b of s.tw[t].blocks) if (b.p === i) mine++;
      return { i, win: w, coins: w ? WIN_COINS : 0, score: (w ? 1000 : 0) + h[t] * 10 + mine, note: `Turm ${h[t]} hoch · ${mine} Blöcke von dir` };
    });
    return { rows, title: win < 0 ? 'Unentschieden!' : `Team ${win === 0 ? 'Links' : 'Rechts'} baut höher!` };
  },
  score: (s, i) => { const tw = s.tw[s.pt[i] ?? 0]; return { v: tw ? `${tw.blocks.length} hoch` : '' }; },
  view(setup) {
    const scene = new THREE.Scene();
    scene.background = skyTex(['#ff7a9a', '#ffc27a', '#fff2d0']);
    scene.fog = new THREE.Fog('#ffd8b0', 50, 130);
    const Lg = mgLights(scene, 16);
    const cam = new THREE.PerspectiveCamera(40, 1, 0.5, 300);
    const st = new Batch(), gl = new Batch();
    // rooftop and tower bases
    st.add(BOX, '#5b2bd6', 0, -0.6, 0, 0, 0, 0, 30, 1.2, 12);
    st.add(BOX, '#8e6be0', 0, 0.01, 0.6, 0, 0, 0, 26, 0.04, 8);
    for (let x = -12; x <= 12; x += 2) st.add(BOX, '#b8a0ff', x, 0.03, 0.6, 0, 0, 0, 0.08, 0.02, 8);
    for (let team = 0; team < 2; team++) {
      const cx = TX[team], col = team === 0 ? '#ff5fae' : '#35d4ff';
      st.add(BOX, '#2a1258', cx, -0.15, 0, 0, 0, 0, W0 + 0.6, 0.3, 2.2);
      st.add(BOX, col, cx, 0.02, 0, 0, 0, 0, W0 + 0.3, 0.04, 2.0);
      // crane mast (tall, static) behind the tower
      const mx = cx + (team === 0 ? -3.6 : 3.6);
      st.add(BOX, '#ffd23f', mx, 15, -1.6, 0, 0, 0, 0.5, 30, 0.5);
      for (let y = 1; y < 30; y += 1.2) st.add(BOX, '#e0a800', mx, y, -1.6, 0, 0, team ? 0.7 : -0.7, 0.08, 1.5, 0.55);
      st.add(BOX, '#2a1258', mx, 0.3, -1.6, 0, 0, 0, 1.4, 0.6, 1.4);
    }
    // city in the back
    for (let k = 0; k < 14; k++) {
      const x = -26 + k * 4, h = 6 + ((k * 7) % 5) * 2.4;
      st.add(BOX, ['#ffb0d8', '#c8b0ff', '#ffd0a8', '#a8d8ff'][k % 4], x, h / 2 - 2, -14, 0, 0, 0, 3.2, h, 3);
      for (let y = 0; y < h - 3; y += 1.6) gl.add(BOX, '#fff3a6', x, y, -12.45, 0, 0, 0, 2, 0.5, 0.05);
    }
    scene.add(st.mesh(), gl.mesh(GLOW, false, false));
    // jibs that follow the towers up
    const jibs = [0, 1].map((team) => {
      const g = new THREE.Group(), b = new Batch(), mx = (team === 0 ? -3.6 : 3.6);
      b.add(BOX, '#ffd23f', (mx - Math.sign(mx) * (AMP + 0.8)) / 2, 0, -1.6, 0, 0, 0, Math.abs(mx) + AMP + 0.8, 0.4, 0.4);
      b.add(BOX, '#2a1258', mx, 0.6, -1.6, 0, 0, 0, 1.0, 0.9, 0.9);
      b.add(BOX, '#e0a800', mx * 0.3, 0, -1.6, 0, 0, 0, 0.1, 0.5, 0.5);
      g.add(b.mesh());
      g.position.x = TX[team];
      scene.add(g);
      return g;
    });
    const trolley = new THREE.InstancedMesh(BOX, toon('#2a1258'), 2);
    const cable = new THREE.InstancedMesh(CYL8, toon('#1a0b33'), 2);
    for (const m of [trolley, cable]) { m.frustumCulled = false; scene.add(m); }
    // tower blocks + hanging blocks (one instanced mesh), cut pieces (pool, view only)
    const blocks = new THREE.InstancedMesh(BOX, toon('#ffffff'), MAXB * 2 + 2);
    blocks.castShadow = true; blocks.receiveShadow = true; blocks.frustumCulled = false;
    blocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(blocks);
    const pcol = setup.players.map((p) => new THREE.Color(p.color));
    const lighten = setup.players.map((p) => new THREE.Color(p.color).lerp(new THREE.Color('#ffffff'), 0.45));
    const NC = 8;
    const cuts = new THREE.InstancedMesh(BOX, toon('#ffffff'), NC);
    cuts.frustumCulled = false;
    scene.add(cuts);
    const cutS = Array.from({ length: NC }, () => ({ x: 0, y: -50, vx: 0, vy: 0, w: 0, r: 0, life: 0 }));
    let cutN = 0;
    const halo = new THREE.InstancedMesh(TOR, new THREE.MeshBasicMaterial({ color: '#dcff1f' }), 2);
    halo.frustumCulled = false;
    scene.add(halo);
    const figs = mgFigures(scene, setup, 0.85);
    const slot = setup.players.map((p, i) => teamOf(setup, p.team).indexOf(i));
    const fx0 = (i: number) => { const t = setup.players[i].team === 1 ? 1 : 0; return TX[t] + (slot[i] === 0 ? -1 : 1) * 2.05; };
    const tags = [new Tag(scene, 'name3'), new Tag(scene, 'name3')];
    const tagWho = [-2, -2];
    const sparks = new Sparks(scene, 140, 0.18);
    const d = new THREE.Object3D();
    const camY = { v: 4 };
    let cele: boolean[] | null = null;
    const ymax = [0, 0];
    return {
      scene, cam,
      frame(s, dt, t, me) {
        let k = 0;
        for (let team = 0; team < 2; team++) {
          const tw = s.tw[team];
          if (!tw) continue;
          for (let b = 0; b < tw.blocks.length; b++) {
            const B = tw.blocks[b];
            d.position.set(B.x, b * BH + BH / 2, 0); d.rotation.set(0, 0, 0); d.scale.set(B.w, BH * 0.98, 2); d.updateMatrix();
            blocks.setMatrixAt(k, d.matrix);
            blocks.setColorAt(k, b % 2 ? lighten[B.p] ?? pcol[0] : pcol[B.p] ?? pcol[0]);
            k++;
          }
          const c = tw.cur, top = tw.blocks.length * BH;
          ymax[team] = top;
          const who = dropper(setup, s, team);
          const show = c.ph !== 'wait';
          d.position.set(c.x, (c.ph === 'wait' ? top + DROP : c.y) + BH / 2, 0); d.scale.set(show ? c.w : 0.0001, BH * 0.98, 2); d.updateMatrix();
          blocks.setMatrixAt(k, d.matrix);
          blocks.setColorAt(k, pcol[who] ?? pcol[0]);
          k++;
          // jib, trolley, cable
          const jy = top + DROP + 2.4;
          jibs[team].position.y += (jy - jibs[team].position.y) * (1 - Math.exp(-dt * 5));
          const J = jibs[team].position.y;
          d.position.set(c.x, J - 0.35, -1.6 + 1.2); d.scale.set(0.9, 0.5, 2.8); d.updateMatrix();
          trolley.setMatrixAt(team, d.matrix);
          const cy0 = J - 0.5, cy1 = c.ph === 'fall' ? J - 0.6 : top + DROP + BH;
          d.position.set(c.x, (cy0 + cy1) / 2, 0); d.scale.set(0.05, Math.max(0.05, cy0 - cy1), 0.05); d.updateMatrix();
          cable.setMatrixAt(team, d.matrix);
          // halo under the one whose turn it is
          d.position.set(who >= 0 ? fx0(who) : 0, 0.08, 1.6); d.rotation.set(Math.PI / 2, 0, 0); d.scale.setScalar(who >= 0 && !cele ? 0.75 + Math.sin(t * 8) * 0.06 : 0.0001); d.updateMatrix();
          halo.setMatrixAt(team, d.matrix);
          d.rotation.set(0, 0, 0);
          // "dran" tag over the dropper
          const key = cele ? -1 : who;
          if (key !== tagWho[team]) { tagWho[team] = key; if (key < 0) tags[team].hide(); }
          if (key >= 0) tags[team].set(key === me ? 'Du bist dran!' : 'dran', fx0(key), 2.2, 1.6, setup.players[key].color);
        }
        blocks.count = k;
        blocks.instanceMatrix.needsUpdate = true;
        if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;
        trolley.instanceMatrix.needsUpdate = true; cable.instanceMatrix.needsUpdate = true; halo.instanceMatrix.needsUpdate = true;
        // cut pieces
        for (let q = 0; q < NC; q++) {
          const c = cutS[q];
          if (c.life > 0) { c.life -= dt; c.vy -= 22 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.r += c.vx * dt * 0.8; }
          d.position.set(c.x, c.y, 0); d.rotation.set(0, 0, c.r); d.scale.set(c.life > 0 ? c.w : 0.0001, BH * 0.95, 2); d.updateMatrix();
          cuts.setMatrixAt(q, d.matrix);
        }
        cuts.instanceMatrix.needsUpdate = true;
        // figures
        for (let i = 0; i < figs.length; i++) {
          figs[i].root.position.set(fx0(i), 0, 1.6);
          if (!cele) figs[i].yawT = setup.players[i].team === 1 ? -0.5 : 0.5;
        }
        if (cele) celebrate(figs, cele, t, cam);
        for (let q = 0; q < figs.length; q++) updateFigure(figs[q], dt, t);
        sparks.update(dt);
        // camera: both towers side by side, rising with the higher one
        const hi = Math.max(ymax[0], ymax[1]);
        const wantY = Math.max(3.4, hi - 1.2);
        camY.v += (wantY - camY.v) * (1 - Math.exp(-dt * 3));
        const dist = fitDist(cam, 2 * (TX[1] + AMP + 1.6), 11.5);
        cam.position.set(0, camY.v + 2.2, dist + 1);
        cam.lookAt(0, camY.v, 0);
        Lg.sun.position.set(-10, camY.v + 22, 14);
        Lg.sun.target.position.set(0, camY.v - 2, 0);
        Lg.sun.target.updateMatrixWorld();
      },
      fx(e, me) {
        if (e.k === 'drop') { if (e.p === me || me < 0) sfx.whoosh(); void squashLand(figs[e.p!], 0.25); }
        else if (e.k === 'notyou') { if (e.p === me) floatText(new THREE.Vector3(fx0(e.p!), 2.9, 1.6), 'Partner ist dran!', '#ff8fb0', scene); }
        else if (e.k === 'perfect') {
          sfx.coin();
          sparks.emit(e.x!, e.y!, 0.6, '#dcff1f', 18, 4, 4);
          floatText(new THREE.Vector3(e.x!, e.y! + 1.2, 0), 'Perfekt!', '#dcff1f', scene);
        } else if (e.k === 'cut' || e.k === 'miss') {
          if (e.k === 'cut') sfx.land(); else sfx.bonk();
          const c = cutS[cutN];
          cutN = (cutN + 1) % NC;
          const team = e.v ?? 0, side = e.x! >= TX[team] ? 1 : -1;
          c.x = e.x!; c.y = e.y!; c.w = clamp(e.z ?? 0.5, 0.05, W0); c.vx = side * (e.k === 'miss' ? 1.4 : 2.2); c.vy = 2; c.r = 0; c.life = 2.2;
          if (e.k === 'miss') floatText(new THREE.Vector3(e.x!, e.y! + 1.2, 0), 'Daneben!', '#ff8fb0', scene);
        }
      },
      celebrate(w) { cele = w; if (!w) unCele(figs); },
      dispose() { tags.forEach((g) => g.hide()); tagWho[0] = tagWho[1] = -2; },
    };
  },
};

export default stapelkran;
