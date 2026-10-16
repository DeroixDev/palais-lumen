// Schnellziehen (Duell): two figures face each other under a big signal lamp. When it turns
// green ("JETZT!"), press first. Pressing too early loses the round. First to two rounds wins.
// The host decides who was first by its own clock.

import { sfx } from '../sfx';
import { FONT, GLOW, Batch, BOX, CYL, CYL8, SPH, THREE, ctex, skyTex, toon } from '../view3d/kit';
import { celebrate, squashLand, updateFigure } from '../view3d/figures';
import { VH, VW, floatText } from '../view3d/stage';
import { KBD, mgFigures, mgLights } from './common';
import { NO_INPUT, WIN_COINS, type MinigameDef } from './types';

interface S {
  round: number;
  wins: number[];
  /** wait = lamp red, go = lamp green, gap = round decided. */
  ph: 'wait' | 'go' | 'gap';
  t: number;
  signal: number;
  roundWin: number;
  why: string;
  reaction: number;
  _ai: { at: number }[];
}

const REACT = { leicht: [0.42, 0.1, 0.06], normal: [0.31, 0.06, 0.025], stark: [0.24, 0.035, 0.01] } as const;

function newRound(s: S, rng: () => number) {
  s.ph = 'wait';
  s.t = 0;
  s.signal = 1.4 + rng() * 2.6;
  s.roundWin = -1;
  s.why = '';
  s._ai.forEach((a) => { a.at = -1; });
}

const schnellziehen: MinigameDef<S> = {
  id: 'schnellziehen',
  name: 'Schnellziehen',
  type: 'duell',
  seconds: 30,
  players: [2, 2],
  pro: true,
  online: 'gut',
  card: {
    sub: 'Wartet auf das Signal. Wird die Lampe grün, drückt zuerst. Wer zu früh drückt, verliert die Runde.',
    rules: () => ['<b>Zwei Runden gewinnen</b> gewinnt das Duell.', '<b>Fehlstart:</b> Drücken bei Rot kostet die Runde.', 'Wer am Ende vorn liegt, gewinnt. Gleichstand ist unentschieden.'],
    controls: () => ({ keys: `${KBD('Leertaste')} drücken, wenn die Lampe grün ist`, touch: 'Großer Knopf unten rechts' }),
    touch: () => ({ joy: false, buttons: [{ key: 'a', label: 'Jetzt!' }] }),
  },
  init(ctx) {
    const s: S = { round: 1, wins: [0, 0], ph: 'wait', t: 0, signal: 2, roundWin: -1, why: '', reaction: 0, _ai: ctx.setup.players.map(() => ({ at: -1 })) };
    newRound(s, ctx.rng);
    return s;
  },
  step(s, dt, inputs, ctx) {
    s.t += dt;
    if (s.ph === 'gap') {
      if (s.t > 1.6 && s.wins[0] < 2 && s.wins[1] < 2) { s.round++; newRound(s, ctx.rng); ctx.fx({ k: 'round' }); }
      return;
    }
    if (s.ph === 'wait' && s.t >= s.signal) { s.ph = 'go'; ctx.fx({ k: 'go' }); }
    const pressed = [0, 1].filter((i) => inputs[i]?.aP);
    if (!pressed.length) return;
    // both on the same step: the host's coin decides
    const who = pressed.length === 2 ? (ctx.rng() < 0.5 ? 0 : 1) : pressed[0];
    if (s.ph === 'wait') { s.roundWin = 1 - who; s.why = `Fehlstart von ${ctx.setup.players[who].name}`; }
    else { s.roundWin = who; s.reaction = s.t - s.signal; s.why = `${(s.reaction * 1000).toFixed(0)} ms`; }
    s.wins[s.roundWin]++;
    s.ph = 'gap';
    s.t = 0;
    ctx.fx({ k: 'win', p: s.roundWin, text: s.why });
  },
  bot(s, i, ctx) {
    const [m, sd, early] = REACT[ctx.setup.players[i].bot ?? 'normal'];
    const a = s._ai[i];
    if (s.ph === 'gap') return NO_INPUT;
    if (a.at < 0) a.at = ctx.rng() < early ? s.signal * (0.5 + ctx.rng() * 0.4) : s.signal + Math.max(0.12, m + (ctx.rng() - 0.5) * 2 * sd);
    if (s.t >= a.at) { a.at = 1e9; return { ...NO_INPUT, a: true, aP: true }; }
    return NO_INPUT;
  },
  over: (s) => s.ph === 'gap' && s.t > 1.2 && (s.wins[0] >= 2 || s.wins[1] >= 2),
  result(s, ctx) {
    const win = s.wins[0] === s.wins[1] ? -1 : s.wins[0] > s.wins[1] ? 0 : 1;
    const rows = ctx.setup.players.map((_, i) => ({ i, win: i === win, coins: i === win ? WIN_COINS : 0, score: s.wins[i] * 10 + (i === win ? 100 : 0), note: `${s.wins[i]} ${s.wins[i] === 1 ? 'Runde' : 'Runden'} gewonnen` }));
    return { rows, title: win < 0 ? 'Unentschieden!' : `${ctx.setup.players[win].name} zieht schneller!` };
  },
  score: (s, i) => ({ v: `${s.wins[i] ?? 0}` }),
  view(setup) {
    const scene = new THREE.Scene();
    scene.background = skyTex(['#140a3a', '#5b2bd6', '#ff7ab8']);
    scene.fog = new THREE.Fog('#7a3fb0', 40, 120);
    mgLights(scene, 12);
    const cam = new THREE.PerspectiveCamera(40, 1, 0.5, 300);
    const st = new Batch(), gl = new Batch();
    st.add(BOX, '#3a1690', 0, -0.5, 0, 0, 0, 0, 30, 1, 14);
    st.add(BOX, '#e6dcff', 0, 0.02, 0, 0, 0, 0, 22, 0.06, 3.4);
    for (let x = -10; x <= 10; x += 2) st.add(BOX, '#ffd23f', x, 0.07, 0, 0, 0, 0, 0.9, 0.04, 0.16);
    // saloon fronts left and right (our own neon street)
    // (only behind the street: the camera looks in from the front)
    for (const side of [-1]) for (let k = 0; k < 4; k++) {
      const x = -9 + k * 6, z = side * 6.5, h = 4 + (k % 2) * 1.6;
      st.add(BOX, ['#ffd0e8', '#c8f0ff', '#fff0b8', '#dccbff'][k], x, h / 2, z, 0, 0, 0, 5, h, 2.4);
      st.add(BOX, ['#ff4fb0', '#35d4ff', '#b8f02a', '#ffd23f'][k], x, h + 0.2, z, 0, 0, 0, 5.4, 0.4, 2.8);
      gl.add(BOX, k % 2 ? '#7af0ff' : '#ff7ad0', x, h * 0.6, z - side * 1.25, 0, 0, 0, 3, 0.25, 0.05);
    }
    // low neon rail in front
    for (let x = -12; x <= 12; x += 3) gl.add(CYL8, x % 6 === 0 ? '#ff4fb0' : '#35d4ff', x, 0.45, 5.2, 0, 0, 0, 0.1, 0.9, 0.1);
    st.add(BOX, '#2a1258', 0, 0.9, 5.2, 0, 0, 0, 26, 0.12, 0.12);
    // the signal lamp
    st.add(CYL8, '#2a1258', 0, 3, -2.8, 0, 0, 0, 0.18, 6, 0.18);
    st.add(BOX, '#1a0b33', 0, 6.4, -2.8, 0, 0, 0, 2.6, 1.6, 0.6);
    scene.add(st.mesh(), gl.mesh(GLOW, false, false));
    const lampMat = new THREE.MeshBasicMaterial({ color: '#ff3d6e' });
    const lamp = new THREE.Mesh(SPH, lampMat);
    lamp.scale.setScalar(0.62);
    lamp.position.set(0, 6.4, -2.4);
    scene.add(lamp);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), new THREE.MeshBasicMaterial({ color: '#ff3d6e', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.set(0, 6.4, -2.45);
    scene.add(glow);
    const jetzt = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.4), new THREE.MeshBasicMaterial({ transparent: true, map: ctex(360, 100, (g) => { g.font = `italic 900 84px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 10; g.strokeStyle = '#1a0b33'; g.strokeText('JETZT!', 180, 54); g.fillStyle = '#dcff1f'; g.fillText('JETZT!', 180, 54); }) }));
    jetzt.position.set(0, 8.4, -2.4);
    jetzt.visible = false;
    scene.add(jetzt);
    const pads = [-1, 1].map((s, i) => { const m = new THREE.Mesh(CYL, toon(setup.players[i]?.color ?? '#fff')); m.scale.set(1.1, 0.08, 1.1); m.position.set(s * 4.5, 0.05, 0.6); scene.add(m); return m; });
    void pads;
    const figs = mgFigures(scene, setup, 1.15);
    let cele: boolean[] | null = null;
    return {
      scene, cam,
      frame(s, dt, t) {
        const green = s.ph === 'go' || (s.ph === 'gap' && s.roundWin >= 0 && s.why.endsWith('ms'));
        lampMat.color.set(green ? '#5dff8a' : '#ff3d6e');
        (glow.material as THREE.MeshBasicMaterial).color.set(green ? '#5dff8a' : '#ff3d6e');
        jetzt.visible = s.ph === 'go';
        if (jetzt.visible) jetzt.scale.setScalar(1 + Math.sin(t * 18) * 0.06);
        figs.forEach((f, i) => {
          f.root.position.set(i === 0 ? -4.5 : 4.5, 0, 0.6);
          if (!cele) f.yawT = i === 0 ? Math.PI / 2 - 0.35 : -Math.PI / 2 + 0.35;
          if (s.ph === 'wait' && !cele) { const q = Math.sin(t * 9 + i) * 0.02; f.sq.scale.set(1 + q, 1 - q, 1 + q); f.idle = false; } else f.idle = true;
        });
        if (cele) celebrate(figs, cele, t, cam);
        figs.forEach((f) => updateFigure(f, dt, t));
        const aspect = VW / VH, d = aspect < 1 ? 24 : 15;
        cam.position.set(0, 4.4, d);
        cam.lookAt(0, 2.6, 0);
      },
      fx(e) {
        if (e.k === 'go') sfx.beep(true);
        else if (e.k === 'round') sfx.pop();
        else if (e.k === 'win') {
          const f = figs[e.p!];
          sfx.hit();
          void squashLand(f, 0.3);
          floatText(f.root.position.clone().setY(3.2), e.text?.startsWith('Fehlstart') ? 'Punkt!' : e.text ?? '', '#dcff1f', scene);
          if (e.text?.startsWith('Fehlstart')) floatText(new THREE.Vector3(0, 5, 0), 'Fehlstart!', '#ff8fb0', scene);
        }
      },
      celebrate(w) { cele = w; if (!w) figs.forEach((f) => { f.busy = false; f.hop.position.y = 0; f.sq.scale.set(1, 1, 1); }); },
    };
  },
};

export default schnellziehen;
