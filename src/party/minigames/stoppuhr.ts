// Stoppuhr-Profi (Jeder gegen jeden): a giant stopwatch starts, then a shutter closes over it.
// Everybody presses once when they think the target time is reached. Three rounds (about 5,
// 7,5 and 10 seconds); the smallest total deviation wins. Pure feel for time, no luck.

import { sfx } from '../sfx';
import { TAU } from '../util';
import { celebrate, squashLand, updateFigure } from '../view3d/figures';
import { BOX, Batch, CYL, CYL8, GLOW, HEMI, SPH_LO, THREE, TOR, skyTex, toon } from '../view3d/kit';
import { floatText } from '../view3d/stage';
import { KBD, mgFigures, mgLights } from './common';
import { Rings, Seg, Sparks, Tag, botPool, fitDist, gaussR, sec2, signMesh, unCele, verb } from './mgbkit';
import { NO_INPUT, WIN_COINS, type MinigameDef } from './types';

const PRE = 1.6, LATE = 2.5, REVEAL = 2.8;

interface S {
  round: number;
  /** pre = target shown, run = clock runs (hidden after hideAt), reveal = times shown, done. */
  ph: 'pre' | 'run' | 'reveal' | 'done';
  t: number;
  targets: number[];
  hideAt: number;
  /** Press time this round (-1 = not yet). */
  press: number[];
  /** Total deviation so far. */
  dev: number[];
  /** Deviation of the last finished round (-1 = none yet). */
  last: number[];
  best: number;
  _ai: { at: number }[];
}

const SD = { leicht: 0.55, normal: 0.26, stark: 0.12 } as const;
const bin = botPool();

function startRound(s: S) {
  s.ph = 'pre';
  s.t = 0;
  s.hideAt = [3, 2.2, 1.6][s.round] ?? 1.6;
  for (let i = 0; i < s.press.length; i++) { s.press[i] = -1; s._ai[i].at = -1; }
  s.best = -1;
}

const stoppuhr: MinigameDef<S> = {
  id: 'stoppuhr',
  name: 'Stoppuhr-Profi',
  type: 'ffa',
  seconds: 45,
  players: [2, 4],
  pro: true,
  online: 'gut',
  card: {
    sub: 'Die Riesen-Stoppuhr läuft los, dann geht der Deckel zu. Drückt genau dann, wenn ihr glaubt, dass die Zielzeit erreicht ist.',
    rules: () => [
      '<b>Drei Runden</b>, die Zielzeit steht vorher auf der Uhr. Pro Runde zählt nur der erste Druck.',
      '<b>Die Abweichung</b> (zu früh oder zu spät) wird über alle Runden addiert. Wer gar nicht drückt, bekommt 2,50 s.',
      'Die kleinste Gesamtabweichung gewinnt 10 Münzen. Der Countdown oben ist dabei ausgeblendet.',
    ],
    controls: () => ({ keys: `${KBD('Leertaste')} einmal drücken`, touch: 'Großer Knopf unten rechts: Stopp!' }),
    touch: () => ({ joy: false, buttons: [{ key: 'a', label: 'Stopp!' }] }),
  },
  init(ctx) {
    const n = ctx.setup.players.length;
    const targets = [4 + Math.floor(ctx.rng() * 3), 6.5 + Math.floor(ctx.rng() * 3) * 0.5, 9 + Math.floor(ctx.rng() * 3) * 0.5];
    const s: S = { round: 0, ph: 'pre', t: 0, targets, hideAt: 3, press: new Array(n).fill(-1), dev: new Array(n).fill(0), last: new Array(n).fill(-1), best: -1, _ai: ctx.setup.players.map(() => ({ at: -1 })) };
    startRound(s);
    ctx.fx({ k: 'pre', v: targets[0] });
    return s;
  },
  step(s, dt, inputs, ctx) {
    if (s.ph === 'done') return;
    s.t += dt;
    const target = s.targets[s.round];
    if (s.ph === 'pre') {
      if (s.t >= PRE) { s.ph = 'run'; s.t = 0; ctx.fx({ k: 'go' }); }
      return;
    }
    if (s.ph === 'run') {
      const before = s.t - dt;
      if (before < s.hideAt && s.t >= s.hideAt) ctx.fx({ k: 'hide' });
      let waiting = 0;
      for (let i = 0; i < s.press.length; i++) {
        if (s.press[i] >= 0) continue;
        if (inputs[i]?.aP) { s.press[i] = s.t; ctx.fx({ k: 'press', p: i }); } else waiting++;
      }
      if (waiting && s.t < target + LATE) return;
      // everybody pressed (or too late): reveal
      let best = -1, bd = 1e9;
      for (let i = 0; i < s.press.length; i++) {
        if (s.press[i] < 0) s.press[i] = target + LATE;
        const d = Math.min(LATE, Math.abs(s.press[i] - target));
        s.dev[i] += d;
        s.last[i] = d;
        if (d < bd - 1e-9) { bd = d; best = i; }
      }
      s.best = best;
      s.ph = 'reveal';
      s.t = 0;
      ctx.fx({ k: 'reveal', p: best });
      return;
    }
    if (s.ph === 'reveal' && s.t >= REVEAL) {
      if (s.round >= s.targets.length - 1) { s.ph = 'done'; return; }
      s.round++;
      startRound(s);
      ctx.fx({ k: 'pre', v: s.targets[s.round] });
    }
  },
  bot(s, i, ctx) {
    if (s.ph !== 'run' || s.press[i] >= 0) return NO_INPUT;
    const a = s._ai[i];
    if (a.at < 0) {
      const target = s.targets[s.round], sd = SD[ctx.setup.players[i].bot ?? 'normal'] * (0.55 + target * 0.06);
      a.at = Math.max(0.4, target + gaussR(ctx.rng) * sd * 0.8);
    }
    if (s.t < a.at) return NO_INPUT;
    const o = bin(i);
    o.a = true; o.aP = true;
    return o;
  },
  over: (s) => s.ph === 'done',
  result(s, ctx) {
    // unfinished rounds (time up) count the missing presses as late
    const dev = s.dev.map((d, i) => d + (s.ph === 'run' ? Math.min(LATE, s.press[i] >= 0 ? Math.abs(s.press[i] - s.targets[s.round]) : LATE) : 0));
    const min = Math.min(...dev);
    const rows = ctx.setup.players.map((_, i) => {
      const win = dev[i] <= min + 1e-6;
      return { i, win, coins: win ? WIN_COINS : 0, score: (win ? 1000 : 0) - Math.round(dev[i] * 100), note: `${sec2(dev[i])} s daneben insgesamt` };
    });
    const w = rows.filter((r) => r.win).map((r) => ctx.setup.players[r.i].name);
    return { rows, title: w.length === 1 ? `${w[0]} ${verb(w[0], 'hat', 'hast')} das beste Zeitgefühl!` : `${w.join(' und ')} gleichauf!` };
  },
  score: (s, i) => ({ v: sec2(s.dev[i] ?? 0) }),
  view(setup) {
    const scene = new THREE.Scene();
    scene.background = skyTex(['#0d0630', '#3b1a9c', '#c04bd8']);
    scene.fog = new THREE.Fog('#4a1f9a', 40, 110);
    mgLights(scene, 12);
    const cam = new THREE.PerspectiveCamera(40, 1, 0.5, 300);
    const n = setup.players.length, gap = 2.7, px = (i: number) => (i - (n - 1) / 2) * gap;
    const CL = new THREE.Vector3(0, 5.4, -3.2), R = 3.1;
    // stage, back wall, bulbs
    const st = new Batch(), gl = new Batch();
    st.add(BOX, '#2a1170', 0, -0.5, 0, 0, 0, 0, 26, 1, 14);
    st.add(BOX, '#ffe9fb', 0, 0.02, 1.8, 0, 0, 0, 13, 0.06, 4.4);
    st.add(BOX, '#ff4fb0', 0, 0.06, 4.05, 0, 0, 0, 13, 0.08, 0.14);
    for (let x = -5.75; x <= 5.8; x += 1.15) st.add(BOX, Math.round(x / 1.15) % 2 ? '#d9c6ff' : '#ffffff', x, 0.035, 1.8, 0, 0, 0, 1.1, 0.06, 4.3);
    st.add(BOX, '#3d1a8f', 0, 4.5, -5.6, 0, 0, 0, 22, 9, 0.6);
    for (let k = 0; k < 22; k++) { const a = (k / 22) * TAU; gl.add(SPH_LO, k % 2 ? '#fff3a6' : '#ff7ad0', CL.x + Math.cos(a) * (R + 1.05), CL.y + Math.sin(a) * (R + 1.05), CL.z - 0.2, 0, 0, 0, 0.17); }
    for (let x = -10; x <= 10; x += 2.5) gl.add(BOX, Math.abs(x) % 5 ? '#35d4ff' : '#ff4fb0', x, 8.7, -5.25, 0, 0, 0, 1.6, 0.18, 0.1);
    // the stopwatch body
    st.add(CYL, '#ff4fb0', CL.x, CL.y, CL.z, Math.PI / 2, 0, 0, R + 0.5, 0.9, R + 0.5);
    st.add(CYL, '#fff7e8', CL.x, CL.y, CL.z + 0.42, Math.PI / 2, 0, 0, R, 0.1, R);
    st.add(CYL, '#ffd23f', CL.x, CL.y + R + 0.75, CL.z, 0, 0, 0, 0.45, 0.6, 0.45);
    st.add(BOX, '#ffd23f', CL.x, CL.y + R + 1.15, CL.z, 0, 0, 0, 1.3, 0.35, 0.6);
    for (const s of [-1, 1]) st.add(CYL8, '#ffd23f', CL.x + s * (R + 0.35) * 0.7, CL.y + (R + 0.35) * 0.72, CL.z, 0, 0, -s * 0.78, 0.25, 0.6, 0.25);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU, r0 = R - 0.35; st.add(BOX, k % 3 ? '#9a86c8' : '#1a0b33', CL.x + Math.sin(a) * r0, CL.y + Math.cos(a) * r0, CL.z + 0.5, 0, 0, -a, k % 3 ? 0.08 : 0.16, k % 3 ? 0.32 : 0.55, 0.05); }
    st.add(BOX, '#1a0b33', CL.x, CL.y - 1.05, CL.z + 0.48, 0, 0, 0, 3.9, 1.3, 0.05);
    // podiums + buzzers
    for (let i = 0; i < n; i++) {
      const c = setup.players[i].color;
      st.add(CYL, '#1a0b33', px(i), 0.32, 1.4, 0, 0, 0, 1.0, 0.64, 1.0);
      st.add(CYL, c, px(i), 0.66, 1.4, 0, 0, 0, 0.92, 0.1, 0.92);
      st.add(BOX, '#2a1258', px(i) + 0.95, 0.55, 2.35, 0, 0, 0, 0.5, 1.1, 0.5);
    }
    scene.add(st.mesh(), gl.mesh(GLOW, false, false));
    const hand = new THREE.Group();
    hand.position.set(CL.x, CL.y, CL.z + 0.56);
    const hb = new Batch();
    hb.add(BOX, '#ff3d6e', 0, 1.15, 0, 0, 0, 0, 0.14, 2.3, 0.06);
    hb.add(CYL, '#1a0b33', 0, 0, 0.02, Math.PI / 2, 0, 0, 0.22, 0.08, 0.22);
    hand.add(hb.mesh(undefined, false, false));
    scene.add(hand);
    const seg = new Seg(4, 0.8, '#dcff1f');
    seg.mesh.position.set(CL.x, CL.y - 1.05, CL.z + 0.54);
    scene.add(seg.mesh);
    // the shutter (iris) with a big question mark
    const cover = new THREE.Group();
    cover.position.set(CL.x, CL.y, CL.z + 0.62);
    const cv = new THREE.Mesh(CYL, toon('#2a1258'));
    cv.rotation.x = Math.PI / 2;
    cv.scale.set(R + 0.05, 0.08, R + 0.05);
    const q = signMesh('?', 2.4, 2.4, '#ff7ad0', '', '');
    q.position.z = 0.06;
    const ring = new THREE.Mesh(TOR, toon('#ffd23f'));
    ring.scale.setScalar(R - 0.1);
    cover.add(cv, q, ring);
    cover.scale.setScalar(0.001);
    scene.add(cover);
    const goal = signMesh('ZIEL', 2.4, 0.8, '#1a0b33', '#dcff1f', '#1a0b33');
    goal.position.set(CL.x, CL.y + R + 2.0, CL.z + 0.3);
    scene.add(goal);
    // buzzer domes (instanced: one draw call) and rings that light up
    const dome = new THREE.InstancedMesh(HEMI, toon('#ffffff'), n);
    const halo = new THREE.InstancedMesh(TOR, new THREE.MeshBasicMaterial({ color: '#ffffff' }), n);
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) { dome.setColorAt(i, col.set(setup.players[i].color)); halo.setColorAt(i, col.set(setup.players[i].color)); }
    scene.add(dome, halo);
    const figs = mgFigures(scene, setup, 1.05);
    const tags = setup.players.map(() => new Tag(scene, 'name3'));
    const sparks = new Sparks(scene, 140, 0.2);
    const rings = new Rings(scene, 4, true);
    const d = new THREE.Object3D();
    const pushT = new Float32Array(n);
    const tagK = new Int32Array(n).fill(-1);
    let cele: boolean[] | null = null;
    let coverK = 0;
    const timerEl = () => document.getElementById('mgTimer');
    let timerHidden = false;
    const hideTimer = (h: boolean) => { if (h === timerHidden) return; const el = timerEl(); if (el) el.style.visibility = h ? 'hidden' : ''; timerHidden = h; };
    return {
      scene, cam,
      frame(s, dt, t, me) {
        const target = s.targets[s.round] ?? 0;
        const hidden = s.ph === 'run' && s.t >= s.hideAt;
        hideTimer(me >= 0 && (s.ph === 'run' || s.ph === 'pre'));
        coverK += ((hidden ? 1 : 0) - coverK) * (1 - Math.exp(-dt * (hidden ? 14 : 8)));
        cover.scale.setScalar(Math.max(0.001, coverK));
        cover.rotation.z = (1 - coverK) * 2;
        // the hand: one turn per 10 s while running, shows the target in pre and reveal
        const shownT = s.ph === 'run' ? s.t : s.ph === 'pre' ? 0 : target;
        hand.rotation.z = -(shownT / 10) * TAU;
        if (s.ph === 'pre') seg.num(target, 2, '#ffd23f');
        else if (s.ph === 'run') { if (hidden) seg.set('--.--', '#ff7ad0'); else seg.num(s.t, 2, '#dcff1f'); }
        else seg.num(target, 2, '#ffffff');
        goal.visible = s.ph === 'pre' || hidden;
        if (goal.visible) goal.scale.setScalar(1 + Math.sin(t * 7) * 0.04);
        for (let i = 0; i < n; i++) {
          const pressed = s.press[i] >= 0 && s.ph !== 'pre';
          if (pushT[i] > 0) pushT[i] = Math.max(0, pushT[i] - dt);
          const k = pressed ? 0.45 + pushT[i] : 1;
          d.position.set(px(i) + 0.95, 1.1, 2.35); d.rotation.set(0, 0, 0); d.scale.set(0.42, 0.42 * k, 0.42); d.updateMatrix();
          dome.setMatrixAt(i, d.matrix);
          const glow = pressed ? 1 + Math.sin(t * 10) * 0.05 : 0.001;
          d.position.set(px(i), 0.72, 1.4); d.rotation.set(Math.PI / 2, 0, 0); d.scale.setScalar(glow * 1.02); d.updateMatrix();
          halo.setMatrixAt(i, d.matrix);
          const f = figs[i];
          f.root.position.set(px(i), 0.7, 1.4);
          if (!cele) f.yawT = 0.25;
          // tags: "gedrückt" while hidden, the times in the reveal (only rebuilt when the state changes)
          const tagY = 3.3, key = cele ? -2 : s.round * 16 + (s.ph === 'run' ? 1 : s.ph === 'reveal' ? 2 : 3) * 2 + (s.press[i] >= 0 ? 1 : 0);
          if (key !== tagK[i]) {
            tagK[i] = key;
            if (cele) tags[i].hide();
            else if (s.ph === 'run' && s.press[i] >= 0) tags[i].set(i === me ? 'Gedrückt!' : 'Gedrückt', px(i), tagY, 1.4, setup.players[i].color);
            else if (s.ph === 'reveal' && s.last[i] >= 0) {
              const dd = s.press[i] - target;
              const txt = dd >= LATE - 1e-6 ? 'zu spät' : `${sec2(s.press[i])} s · ${dd >= 0 ? '+' : '−'}${sec2(Math.abs(dd))}`;
              tags[i].set(txt, px(i), tagY, 1.4, i === s.best ? '#dcff1f' : '#ffffff');
            } else tags[i].hide();
          }
        }
        dome.instanceMatrix.needsUpdate = true;
        halo.instanceMatrix.needsUpdate = true;
        if (cele) celebrate(figs, cele, t, cam);
        for (let q = 0; q < figs.length; q++) updateFigure(figs[q], dt, t);
        sparks.update(dt);
        rings.update(dt);
        const w = Math.max(n * gap + 1.6, 2 * R + 2.6), dist = fitDist(cam, w, 13.2);
        cam.position.set(0, 5.4 + dist * 0.06, 1.6 + dist);
        cam.lookAt(0, 4.9, 0);
      },
      fx(e, me) {
        if (e.k === 'pre') { sfx.pop(); floatText(new THREE.Vector3(CL.x, CL.y + R + 3.0, CL.z), `Ziel: ${sec2(e.v ?? 0)} s`, '#ffe14a', scene); }
        else if (e.k === 'go') sfx.beep(true);
        else if (e.k === 'hide') { sfx.whoosh(); rings.emit(CL.x, CL.y, CL.z + 0.7, '#ff7ad0', 4.5); }
        else if (e.k === 'press') {
          const i = e.p!;
          pushT[i] = 0.25;
          if (i === me || me < 0) sfx.pop(); else sfx.wheel();
          void squashLand(figs[i], 0.3);
          sparks.emit(px(i) + 0.95, 1.3, 2.35, setup.players[i].color, 10, 3, 4);
        } else if (e.k === 'reveal') {
          sfx.creak();
          rings.emit(CL.x, CL.y, CL.z + 0.7, '#dcff1f', 5);
          if (e.p !== undefined && e.p >= 0) {
            const i = e.p;
            window.setTimeout(() => { sfx.star(); sparks.emit(px(i), 2.6, 1.4, '#dcff1f', 26, 4, 7); floatText(new THREE.Vector3(px(i), 4.2, 1.4), 'Am nächsten!', '#dcff1f', scene); }, 380);
          }
        }
      },
      celebrate(w) { cele = w; if (!w) unCele(figs); },
      dispose() { hideTimer(false); tags.forEach((g) => g.hide()); tagK.fill(-1); },
    };
  },
};

export default stoppuhr;
