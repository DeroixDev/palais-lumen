// Neonmemory (Jeder gegen jeden): the neon board flashes a sequence of four colours, then
// everybody repeats it on their own floor mat. Each round the sequence grows by one and gets
// faster. A wrong colour or running out of time puts you out; the last one in wins.

import { sfx } from '../sfx';
import { celebrate, squashLand, updateFigure } from '../view3d/figures';
import { BOX, Batch, CONE, CYL, CYL8, GLOW, SPH_LO, THREE, skyTex } from '../view3d/kit';
import { floatText } from '../view3d/stage';
import { KBD, mgFigures, mgLights } from './common';
import { Rings, Seg, Sparks, TOUCH4, Tag, botPool, dir4, fitDist, gaussR, press4, signMesh, unCele, verb } from './mgbkit';
import { NO_INPUT, WIN_COINS, type MinigameDef } from './types';

/** Pads: 0 up, 1 right, 2 down, 3 left. */
const PAD_COL = ['#ff4fb0', '#35d4ff', '#9dff3a', '#ffd23f'];
const PAD_NAME = ['Pink', 'Cyan', 'Grün', 'Gelb'];
const START = 3, MAXLEN = 24, LEAD = 0.35, JUDGE = 1.5;

interface Pl { pos: number; done: boolean; fail: boolean; out: boolean; outR: number; cnt: number; tsum: number; lit: number; hl: number }
interface S {
  seq: number[];
  len: number;
  ph: 'show' | 'input' | 'judge' | 'end';
  t: number;
  iv: number;
  lim: number;
  pl: Pl[];
  _py: number[];
  _ai: { at: number; err: number }[];
}

const SPAN = { leicht: 4.8, normal: 6.6, stark: 8.8 } as const;
const DELAY = { leicht: 0.6, normal: 0.44, stark: 0.31 } as const;
const bin = botPool();
const ivFor = (len: number) => Math.max(0.3, 0.64 - (len - START) * 0.045);


function newShow(s: S) {
  s.ph = 'show';
  s.t = 0;
  s.iv = ivFor(s.len);
  for (const p of s.pl) { p.pos = 0; p.done = false; p.fail = false; p.hl = 0; }
  for (const a of s._ai) a.at = -1;
}

const alive = (s: S) => { let n = 0; for (const p of s.pl) if (!p.out) n++; return n; };

const neonmemory: MinigameDef<S> = {
  id: 'neonmemory',
  name: 'Neonmemory',
  type: 'ffa',
  seconds: 45,
  players: [2, 4],
  pro: true,
  online: 'gut',
  card: {
    sub: 'Die Neontafel leuchtet eine Farbfolge vor. Merkt sie euch und tippt sie danach auf eurer Matte nach. Jede Runde kommt eine Farbe dazu.',
    rules: () => [
      '<b>Pink ▲, Cyan ▶, Grün ▼, Gelb ◀</b>: Die Richtung auf der Tafel ist die Taste.',
      '<b>Eine falsche Farbe</b> oder zu langsam, und du bist raus. Wer zuletzt übrig ist, gewinnt 10 Münzen.',
      'Sind am Ende mehrere drin, gewinnt, wer mehr richtig getippt hat, bei Gleichstand der Schnellere.',
    ],
    controls: () => ({ keys: `${KBD('↑')} ${KBD('→')} ${KBD('↓')} ${KBD('←')} oder ${KBD('W')} ${KBD('D')} ${KBD('S')} ${KBD('A')}`, touch: 'Vier Knöpfe unten rechts: ◀ ▲ ▼ ▶' }),
    touch: () => TOUCH4,
  },
  init(ctx) {
    const seq: number[] = [];
    for (let k = 0; k < MAXLEN; k++) {
      let v = Math.floor(ctx.rng() * 4);
      // never three of the same in a row
      if (k >= 2 && seq[k - 1] === v && seq[k - 2] === v) v = (v + 1 + Math.floor(ctx.rng() * 3)) % 4;
      seq.push(v);
    }
    const s: S = {
      seq, len: START, ph: 'show', t: 0, iv: ivFor(START), lim: 0,
      pl: ctx.setup.players.map(() => ({ pos: 0, done: false, fail: false, out: false, outR: 0, cnt: 0, tsum: 0, lit: -1, hl: 0 })),
      _py: ctx.setup.players.map(() => 0),
      _ai: ctx.setup.players.map(() => ({ at: -1, err: -1 })),
    };
    newShow(s);
    return s;
  },
  step(s, dt, inputs, ctx) {
    const play = ctx.setup.mode === 'play';
    if (s.ph === 'end') return;
    const t0 = s.t;
    s.t += dt;
    for (const p of s.pl) if (p.hl > 0) p.hl = Math.max(0, p.hl - dt);
    if (s.ph === 'show') {
      const k0 = Math.floor((t0 - LEAD) / s.iv), k1 = Math.floor((s.t - LEAD) / s.iv);
      if (t0 < LEAD && s.t >= LEAD) ctx.fx({ k: 'flash', v: s.seq[0] });
      else if (k1 > k0 && k1 < s.len) ctx.fx({ k: 'flash', v: s.seq[k1] });
      if (s.t >= LEAD + s.len * s.iv + 0.15) { s.ph = 'input'; s.t = 0; s.lim = 2.2 + s.len * 0.95; ctx.fx({ k: 'yourTurn' }); }
    } else if (s.ph === 'input') {
      let open = 0;
      for (let i = 0; i < s.pl.length; i++) {
        const p = s.pl[i], inp = inputs[i];
        const dir = inp ? dir4(inp, s._py[i]) : -1;
        if (inp) s._py[i] = inp.y;
        if (p.out || p.done || p.fail) continue;
        if (dir >= 0) {
          p.lit = dir;
          p.hl = 0.22;
          if (dir === s.seq[p.pos]) {
            p.pos++;
            p.cnt++;
            if (p.pos >= s.len) { p.done = true; p.tsum += s.t; ctx.fx({ k: 'done', p: i }); }
            else ctx.fx({ k: 'tap', p: i, v: dir });
          } else {
            p.fail = true;
            if (play) { p.out = true; p.outR = s.len; }
            ctx.fx({ k: 'wrong', p: i, v: s.seq[p.pos] });
          }
        }
        if (!p.done && !p.fail) open++;
      }
      if (open && s.t >= s.lim) {
        for (let i = 0; i < s.pl.length; i++) {
          const p = s.pl[i];
          if (p.out || p.done || p.fail) continue;
          p.fail = true;
          if (play) { p.out = true; p.outR = s.len; }
          ctx.fx({ k: 'slow', p: i });
        }
        open = 0;
      }
      if (!open) { s.ph = 'judge'; s.t = 0; ctx.fx({ k: 'judge' }); }
    } else if (s.ph === 'judge' && s.t >= JUDGE) {
      const left = alive(s);
      if (play && (left === 0 || (s.pl.length > 1 && left <= 1)) || s.len >= MAXLEN) { s.ph = 'end'; s.t = 0; return; }
      s.len++;
      newShow(s);
      ctx.fx({ k: 'round', v: s.len });
    }
  },
  bot(s, i, ctx) {
    const p = s.pl[i];
    if (s.ph !== 'input' || p.out || p.done || p.fail) return NO_INPUT;
    const a = s._ai[i], lvl = ctx.setup.players[i].bot ?? 'normal';
    if (a.at < 0) {
      const pFail = 1 / (1 + Math.exp(-(s.len - SPAN[lvl]) / 0.9));
      a.err = ctx.rng() < pFail ? Math.floor(ctx.rng() * s.len) : -1;
      a.at = s.t + DELAY[lvl] * (1.3 + ctx.rng() * 0.6);
    }
    if (s.t < a.at) return NO_INPUT;
    a.at = s.t + Math.max(0.12, DELAY[lvl] * (1 + gaussR(ctx.rng) * 0.25));
    let dir = s.seq[p.pos];
    if (p.pos === a.err) dir = (dir + 1 + Math.floor(ctx.rng() * 3)) % 4;
    return press4(bin(i), dir);
  },
  over: (s) => s.ph === 'end',
  result(s, ctx) {
    let bc = -1, bt = 1e9;
    for (const p of s.pl) { if (p.cnt > bc || (p.cnt === bc && p.tsum < bt)) { bc = p.cnt; bt = p.tsum; } }
    const rows = s.pl.map((p, i) => {
      const win = bc > 0 && p.cnt === bc && p.tsum <= bt + 0.05;
      return { i, win, coins: win ? WIN_COINS : 0, score: (win ? 100000 : 0) + p.cnt * 100 - Math.round(p.tsum), note: p.out ? `raus bei ${p.outR} Farben · ${p.cnt} richtig` : `bis zum Schluss · ${p.cnt} richtig` };
    });
    const w = rows.filter((r) => r.win).map((r) => ctx.setup.players[r.i].name);
    return { rows, title: !w.length ? 'Niemand gewinnt' : w.length === 1 ? `${w[0]} ${verb(w[0], 'hat', 'hast')} das beste Gedächtnis!` : `${w.join(' und ')} gewinnen!` };
  },
  score: (s, i) => { const p = s.pl[i]; return p ? { v: p.out ? 'raus' : String(p.cnt), out: p.out } : { v: '' }; },
  view(setup) {
    const scene = new THREE.Scene();
    scene.background = skyTex(['#07031c', '#24106b', '#6a24b8']);
    scene.fog = new THREE.Fog('#24106b', 40, 110);
    mgLights(scene, 12);
    const cam = new THREE.PerspectiveCamera(40, 1, 0.5, 300);
    const n = setup.players.length, gap = 2.9, px = (i: number) => (i - (n - 1) / 2) * gap;
    const BC = new THREE.Vector3(0, 5.2, -4.2), PR = 1.9;
    const padPos = [[0, PR], [PR, 0], [0, -PR], [-PR, 0]] as const;
    const st = new Batch(), gl = new Batch();
    st.add(BOX, '#1d0c52', 0, -0.5, 0, 0, 0, 0, 26, 1, 14);
    st.add(BOX, '#2c1478', 0, 0.01, 1.6, 0, 0, 0, 13, 0.04, 4.6);
    for (let x = -6; x <= 6; x += 1.2) for (let z = -0.4; z <= 3.6; z += 1.2) gl.add(BOX, (Math.round(x / 1.2) + Math.round(z / 1.2)) % 2 ? '#3a1d96' : '#4a25b8', x, 0.035, z + 0.2, 0, 0, 0, 1.12, 0.02, 1.12);
    // the board: frame, diamond back plate, arrows, rim bulbs
    st.add(BOX, '#120733', BC.x, BC.y, BC.z - 0.4, 0, 0, Math.PI / 4, 4.6, 4.6, 0.5);
    st.add(BOX, '#ffd23f', BC.x, BC.y, BC.z - 0.5, 0, 0, Math.PI / 4, 4.95, 4.95, 0.4);
    st.add(BOX, '#2a1170', 0, 5, -5.6, 0, 0, 0, 24, 10, 0.6);
    for (let k = 0; k < 4; k++) {
      const [x, y] = padPos[k], ang = [0, -Math.PI / 2, Math.PI, Math.PI / 2][k];
      st.add(CONE, '#1a0b33', BC.x + x * 1.0, BC.y + y * 1.0, BC.z + 0.45, 0, 0, ang, 0.34, 0.5, 0.12);
    }
    for (let k = 0; k < 20; k++) { const x = -11 + k * 1.15; gl.add(SPH_LO, k % 2 ? '#ff4fb0' : '#35d4ff', x, 9.5, -5.25, 0, 0, 0, 0.16); }
    for (let i = 0; i < n; i++) {
      st.add(CYL, '#120733', px(i), 0.06, 1.5, 0, 0, 0, 1.35, 0.1, 1.35); gl.add(CYL, setup.players[i].color, px(i), 0.04, 1.5, 0, 0, 0, 1.45, 0.06, 1.45);
      // a small console next to each player: their own four pads
      st.add(CYL8, '#2a1258', px(i) + 1.1, 0.3, 2.05, 0, 0, 0, 0.08, 0.6, 0.08);
      st.add(BOX, '#120733', px(i) + 1.1, 1.0, 2.04, 0, 0, Math.PI / 4, 0.74, 0.74, 0.1);
      gl.add(BOX, setup.players[i].color, px(i) + 1.1, 1.0, 2.02, 0, 0, Math.PI / 4, 0.83, 0.83, 0.06);
    }
    scene.add(st.mesh(), gl.mesh(GLOW, false, false));
    // big pads (instanced) + additive halos
    const dim = PAD_COL.map((c) => new THREE.Color(c).lerp(new THREE.Color('#1a0b33'), 0.68));
    const lit = PAD_COL.map((c) => new THREE.Color(c).lerp(new THREE.Color('#ffffff'), 0.25));
    const big = new THREE.InstancedMesh(CYL, new THREE.MeshBasicMaterial({ color: '#ffffff' }), 4);
    const halo = new THREE.InstancedMesh(CYL, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }), 4);
    for (let k = 0; k < 4; k++) { big.setColorAt(k, dim[k]); halo.setColorAt(k, lit[k]); }
    scene.add(halo, big);
    // floor mats: 4 small pads per player (one instanced mesh)
    const mats = new THREE.InstancedMesh(CYL, new THREE.MeshBasicMaterial({ color: '#ffffff' }), n * 4);
    const d = new THREE.Object3D();
    for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) {
      const [x, y] = padPos[k];
      d.position.set(px(i) + 1.1 + x * 0.15, 1.0 + y * 0.15, 2.12); d.rotation.set(Math.PI / 2, 0, 0); d.scale.set(0.17, 0.06, 0.17); d.updateMatrix();
      mats.setMatrixAt(i * 4 + k, d.matrix);
      mats.setColorAt(i * 4 + k, dim[k]);
    }
    scene.add(mats);
    const seg = new Seg(2, 0.9, '#dcff1f');
    seg.mesh.position.set(BC.x + 3.9, BC.y + 1.4, BC.z);
    scene.add(seg.mesh);
    const sMerk = signMesh('MERKEN!', 4.4, 1.0, '#ffd23f');
    const sNach = signMesh('NACHTIPPEN!', 4.4, 1.0, '#9dff3a');
    for (const m of [sMerk, sNach]) { m.position.set(BC.x, BC.y + 3.25, BC.z); scene.add(m); }
    const sLen = signMesh('FARBEN', 2.0, 0.55, '#ffffff', '', '');
    sLen.position.set(BC.x + 3.9, BC.y + 0.55, BC.z);
    scene.add(sLen);
    const figs = mgFigures(scene, setup, 1.0);
    const tags = setup.players.map(() => new Tag(scene, 'name3'));
    const tagK = new Int32Array(n).fill(-99);
    const sparks = new Sparks(scene, 140, 0.18);
    const rings = new Rings(scene, 4, true);
    const fallT = new Float32Array(n);
    const bigHl = new Float32Array(4);
    let cele: boolean[] | null = null;
    return {
      scene, cam,
      frame(s, dt, t, me) {
        // board
        let litK = -1;
        if (s.ph === 'show' && s.t >= LEAD) { const k = Math.floor((s.t - LEAD) / s.iv); if (k < s.len && (s.t - LEAD) % s.iv < s.iv * 0.66) litK = s.seq[k]; }
        for (let k = 0; k < 4; k++) {
          bigHl[k] = k === litK ? 1 : Math.max(0, bigHl[k] - dt * 5);
          const [x, y] = padPos[k], h = bigHl[k];
          d.position.set(BC.x + x, BC.y + y, BC.z + 0.05 + h * 0.15); d.rotation.set(Math.PI / 2, 0, 0); d.scale.set(1.0 + h * 0.08, 0.4, 1.0 + h * 0.08); d.updateMatrix();
          big.setMatrixAt(k, d.matrix);
          big.setColorAt(k, h > 0.5 ? lit[k] : dim[k]);
          d.position.z = BC.z - 0.05; d.scale.set(0.001 + h * 1.6, 0.1, 0.001 + h * 1.6); d.updateMatrix();
          halo.setMatrixAt(k, d.matrix);
        }
        big.instanceMatrix.needsUpdate = true; big.instanceColor!.needsUpdate = true; halo.instanceMatrix.needsUpdate = true;
        sMerk.visible = s.ph === 'show';
        sNach.visible = s.ph === 'input';
        if (sNach.visible) sNach.scale.setScalar(1 + Math.sin(t * 8) * 0.03);
        seg.num(s.len, 0, s.ph === 'input' ? '#9dff3a' : '#ffd23f');
        // players
        for (let i = 0; i < n; i++) {
          const p = s.pl[i], f = figs[i];
          if (!p) continue;
          for (let k = 0; k < 4; k++) mats.setColorAt(i * 4 + k, p.out ? DARK : p.hl > 0 && p.lit === k ? lit[k] : dim[k]);
          if (p.out) fallT[i] = Math.min(2, fallT[i] + dt); else fallT[i] = 0;
          const ft = fallT[i];
          f.root.position.set(px(i), ft > 0.25 ? -(ft - 0.25) * (ft - 0.25) * 14 : 0, 1.5);
          f.root.visible = f.root.position.y > -9;
          if (!cele) f.yawT = 0;
          // progress tag
          const key = cele ? -1 : p.out ? -2 : s.ph === 'input' ? (p.fail ? -3 : p.done ? -4 : p.pos) : -5;
          if (key !== tagK[i]) {
            tagK[i] = key;
            const y = 2.6;
            if (key === -1 || key === -5 || key === -2) tags[i].hide();
            else if (key === -3) tags[i].set('Falsch!', px(i), y, 1.5, '#ff8fb0');
            else if (key === -4) tags[i].set('Geschafft!', px(i), y, 1.5, '#dcff1f');
            else tags[i].set(`${p.pos} / ${s.len}`, px(i), y, 1.5, setup.players[i].color);
          }
        }
        mats.instanceColor!.needsUpdate = true;
        if (cele) celebrate(figs, cele, t, cam);
        for (let q = 0; q < figs.length; q++) updateFigure(figs[q], dt, t);
        sparks.update(dt);
        rings.update(dt);
        void me;
        const w = Math.max(n * gap + 1.4, 11), dist = fitDist(cam, w, 12.6);
        cam.position.set(0, 5.2 + dist * 0.12, 1.8 + dist);
        cam.lookAt(0, 4.6, 0);
      },
      fx(e, me) {
        if (e.k === 'flash') { sfx.hop((e.v ?? 0) * 4); rings.emit(BC.x + padPos[e.v!][0], BC.y + padPos[e.v!][1], BC.z + 0.3, PAD_COL[e.v!], 2.2); }
        else if (e.k === 'yourTurn') { sfx.beep(true); }
        else if (e.k === 'round') { sfx.pop(); floatText(new THREE.Vector3(BC.x + 3.9, BC.y - 0.3, BC.z), `${e.v} Farben!`, '#ffe14a', scene); }
        else if (e.k === 'tap') { if (e.p === me || me < 0) sfx.hop((e.v ?? 0) * 4); void squashLand(figs[e.p!], 0.12); }
        else if (e.k === 'done') {
          const i = e.p!;
          if (i === me || me < 0) sfx.coin();
          void squashLand(figs[i], 0.25);
          sparks.emit(px(i), 1.4, 1.5, '#dcff1f', 14, 3, 5);
        } else if (e.k === 'wrong' || e.k === 'slow') {
          const i = e.p!;
          sfx.bonk();
          void squashLand(figs[i], 0.4);
          floatText(new THREE.Vector3(px(i), 3.4, 1.5), e.k === 'slow' ? 'Zu langsam!' : `Richtig: ${PAD_NAME[e.v ?? 0]}`, '#ff8fb0', scene);
          rings.emit(px(i), 0.2, 1.5, '#ff3d6e', 2.4);
        } else if (e.k === 'judge') sfx.whoosh();
      },
      celebrate(w) { cele = w; if (!w) { unCele(figs); fallT.fill(0); } tagK.fill(-99); },
      dispose() { tags.forEach((g) => g.hide()); tagK.fill(-99); },
    };
  },
};
const DARK = new THREE.Color('#15102a');

export default neonmemory;
