// The end of the evening: bonus star cards, the 3D podium (places 3, 2, 1 rise; the winner gets
// the crown and confetti), place 4, and the evening's statistics.

import type { GameState } from '../engine/state';
import { BONUS } from '../engine/tables';
import { sfx, startMusic } from '../sfx';
import type { Seat } from '../types';
import { $, $$, E, TAU, esc, rand, reduced, tween, wait } from '../util';
import { makeFigure, squashLand, updateFigure, type Fig } from '../view3d/figures';
import { BOX, Batch, CONE, CYL, FONT, GLOW, GRAD, OUT, SPH_LO, THREE, TOR_THIN, VC_EMI, addLights, ctex, skyTex, toon } from '../view3d/kit';
import { VH, VW, addLabel, clearLabels, getView, resize, setView, type Label, type View } from '../view3d/stage';
import { starSVG } from './avatars';
import type { BonusList } from './presenter';

const _c = new THREE.Color();

class Podium implements View {
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(40, 1, 0.5, 200);
  blocks: Record<number, { grp: THREE.Group; h: number; x: number }> = {};
  figs: Fig[] = [];
  crown: THREE.Mesh;
  conf: THREE.InstancedMesh;
  cs: { x: number; y: number; z: number; vy: number; rx: number; ry: number; s: number }[];
  spots: THREE.Mesh[];
  confOn = false;
  winner: Fig | null = null;
  d = new THREE.Object3D();
  place: Label[] = [];

  constructor(seats: Seat[]) {
    const scene = this.scene;
    scene.background = skyTex(['#1c0750', '#5b2bd6', '#ff6fb5']);
    addLights(scene, 10, 2048, [-6, 16, 12], 2.4);
    const b = new Batch(), g = new Batch();
    b.add(CYL, '#3a1690', 0, -0.25, 0, 0, 0, 0, 13, 0.5, 9);
    b.add(CYL, '#5b2bd6', 0, -0.02, 0, 0, 0, 0, 11, 0.1, 7.4);
    for (let k = 0; k < 28; k++) { const a = Math.PI + (k / 27) * Math.PI; g.add(SPH_LO, k % 2 ? '#ffe680' : '#ff7ad0', Math.cos(a) * 9, 4 + Math.sin(a) * -5.5, -6, 0, 0, 0, 0.22); }
    g.add(TOR_THIN, '#ff4fb0', 0, 4.4, -6.5, 0, 0, 0, 6.4);
    g.add(TOR_THIN, '#35e6ff', 0, 4.4, -6.6, 0, 0, 0, 5.6);
    b.add(BOX, '#24086e', 0, 4, -7.2, 0, 0, 0, 26, 9, 0.4);
    scene.add(b.mesh(), g.mesh(GLOW, false, false));
    const BCOL: Record<number, string> = { 1: '#ffd23f', 2: '#9fdcff', 3: '#ff9a5c' }, H: Record<number, number> = { 1: 3, 2: 2.1, 3: 1.4 }, X: Record<number, number> = { 1: 0, 2: -3.1, 3: 3.1 };
    for (const n of [1, 2, 3]) {
      const front = new THREE.MeshToonMaterial({ gradientMap: GRAD, map: ctex(128, 128, (c) => { c.fillStyle = BCOL[n]; c.fillRect(0, 0, 128, 128); c.font = `italic 900 96px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 10; c.strokeStyle = '#1a0b33'; c.strokeText(String(n), 64, 70); c.fillStyle = '#ffffff'; c.fillText(String(n), 64, 70); }) });
      const side = toon(BCOL[n]);
      const grp = new THREE.Group();
      grp.position.set(X[n], 0, 0);
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1, 2.4).translate(0, 0.5, 0), [side, side, side, side, front, side]);
      m.castShadow = m.receiveShadow = true;
      const o = new THREE.Mesh(new THREE.BoxGeometry(2.95, 1.03, 2.55).translate(0, 0.5, 0), OUT);
      grp.add(m, o);
      grp.scale.y = 0.001;
      scene.add(grp);
      this.blocks[n] = { grp, h: H[n], x: X[n] };
    }
    this.figs = seats.map((p) => { const f = makeFigure({ color: p.color, acc: p.acc, feat: p.feat }, 1.25); f.root.visible = false; scene.add(f.root); return f; });
    const cb = new Batch();
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; cb.add(CONE, '#ffd23f', Math.cos(a) * 0.42, 0.4, Math.sin(a) * 0.42, 0, 0, 0, 0.14, 0.5, 0.14); cb.add(SPH_LO, k % 2 ? '#ff3d9a' : '#35e6ff', Math.cos(a) * 0.44, 0.2, Math.sin(a) * 0.44, 0, 0, 0, 0.08); }
    cb.add(CYL, '#ffd23f', 0, 0.1, 0, 0, 0, 0, 0.5, 0.25, 0.5);
    this.crown = cb.mesh(VC_EMI);
    this.crown.visible = false;
    scene.add(this.crown);
    const N = 170;
    this.conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.26), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), N);
    this.conf.frustumCulled = false;
    this.conf.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.cs = Array.from({ length: N }, (_, i) => { this.conf.setColorAt(i, _c.set(['#ff3d9a', '#dcff1f', '#2fe6ff', '#ffe14a', '#8a4bff'][i % 5])); return { x: 0, y: -50, z: 0, vy: 0, rx: 0, ry: 0, s: 0 }; });
    scene.add(this.conf);
    this.spots = [-3.1, 0, 3.1].map((x) => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(1.8, 10, 20, 1, true).translate(0, -5, 0), new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.position.set(x, 11, 1);
      scene.add(m);
      return m;
    });
  }

  update(dt: number, t: number) {
    const a = VW / VH, dist = a < 1 ? 15 + (1 - a) * 16 : 14;
    this.cam.position.set(Math.sin(t * 0.15) * 1.2, 5 + (a < 1 ? 2 : 0), dist + 1.5);
    this.cam.lookAt(0, 3.7 + (a < 1 ? 0.6 : 0), 0);
    this.figs.forEach((f) => updateFigure(f, dt, t));
    const w = this.winner;
    if (w) {
      const k = Math.abs(Math.sin(t * 5));
      w.hop.position.y = k * 0.8;
      w.sq.scale.set(1 - k * 0.07, 1 + k * 0.12, 1 - k * 0.07);
      w.busy = true;
      this.crown.position.set(w.root.position.x, w.root.position.y + w.hop.position.y + 2.15 * 1.25 * w.sq.scale.y, w.root.position.z);
      this.crown.rotation.y = t;
    }
    for (let i = 0; i < this.cs.length; i++) {
      const c = this.cs[i];
      if (this.confOn && c.y < -1) { c.x = rand(-9, 9); c.y = rand(9, 16); c.z = rand(-3, 4); c.vy = rand(1.6, 3); c.s = rand(0.7, 1.3); }
      c.y -= c.vy * dt;
      c.rx += dt * 4;
      c.ry += dt * 3;
      c.x += Math.sin(t * 2 + i) * dt * 0.6;
      this.d.position.set(c.x, c.y, c.z);
      this.d.rotation.set(c.rx, c.ry, 0);
      this.d.scale.setScalar(c.y > -1 ? c.s : 0);
      this.d.updateMatrix();
      this.conf.setMatrixAt(i, this.d.matrix);
    }
    this.conf.instanceMatrix.needsUpdate = true;
  }
}

export interface PodiumOpts { seats: Seat[]; st: GameState; bonus: BonusList; order: number[]; me: number; boardName: string; canAgain: boolean }

/** Shows the podium; resolves with what the player picked. */
export async function openPodium(o: PodiumOpts): Promise<'again' | 'title'> {
  const P = new Podium(o.seats);
  const prev = getView();
  setView(P);
  document.body.classList.add('full', 'in-pod');
  resize();
  startMusic('menu');
  const { st, seats, order } = o;
  $('#podK').textContent = `Ende des Abends · ${o.boardName}`;
  $('#bonus').innerHTML = o.bonus.map((b) => {
    const def = BONUS[b.id];
    const who = b.winners.length ? b.winners.map((w) => esc(seats[w].name)).join(', ') : 'niemand';
    const col = b.winners.length ? seats[b.winners[0]].color : '#7f739a';
    return `<div class="bcard" style="--pc:${col}"><small>Bonus-Stern</small><b>${esc(def.name)}: ${who}</b><em>${esc(def.text)}</em><span class="plus">${b.winners.length ? '+1' : '–'} ${starSVG()}</span></div>`;
  }).join('');
  const four = order[3];
  $('#fourth').innerHTML = four !== undefined ? `Platz 4 · <span style="color:${seats[four].color}">${esc(seats[four].name)}</span> · ${st.players[four].stars} Sterne · ${st.players[four].coins} Münzen` : '';
  $('#fourth').style.opacity = '0';
  const sb = $('#statbox');
  sb.hidden = true;
  sb.innerHTML = statsTable(o);
  $('#podAgain').hidden = !o.canAgain;
  $('#ovPod').classList.add('open');
  $('#ovPod').scrollTop = 0;
  let alive = true;
  const result = new Promise<'again' | 'title'>((res) => {
    $('#podAgain').onclick = () => { alive = false; res('again'); };
    $('#podTitleBtn').onclick = () => { alive = false; res('title'); };
    $('#podStats').onclick = () => { sb.hidden = !sb.hidden; sfx.pop(); if (!sb.hidden) sb.scrollIntoView({ block: 'nearest' }); };
  });
  void (async () => {
    sfx.whoosh();
    for (const c of $$('.bcard')) {
      c.animate([{ opacity: 0, transform: 'translateY(14px) rotateX(70deg)' }, { opacity: 1, transform: 'none' }], { duration: reduced ? 1 : 520, easing: 'cubic-bezier(.3,1.35,.45,1)', fill: 'forwards' });
      sfx.pop();
      await wait(420);
      if (!alive) return;
    }
    await wait(300);
    for (const n of [3, 2, 1]) {
      if (!alive) return;
      const p = order[n - 1];
      if (p === undefined) continue;
      const bl = P.blocks[n], f = P.figs[p];
      (P.spots[n === 1 ? 1 : n === 2 ? 0 : 2].material as THREE.MeshBasicMaterial).opacity = 0.22;
      await tween(0.5, (k) => { bl.grp.scale.y = Math.max(0.001, k * bl.h); }, E.back);
      f.root.visible = true;
      f.root.position.set(bl.x, bl.h + 8, 0.2);
      f.yaw = f.yawT = 0;
      f.busy = true;
      await tween(0.45, (k) => { f.root.position.y = bl.h + 8 * (1 - k * k); });
      f.root.position.y = bl.h;
      if (n === 1) sfx.fanfare(); else sfx.land();
      void squashLand(f, 0.35);
      const L = addLabel('name3', `${esc(seats[p].name)} · ${st.players[p].stars}★ · ${st.players[p].coins}`, (v) => v.copy(f.root.position).setY(bl.h + 2.75), P.scene);
      L.inner.style.setProperty('--pc', seats[p].color);
      P.place.push(L);
      await wait(380);
    }
    if (!alive) return;
    if (four !== undefined) {
      const f4 = P.figs[four];
      f4.root.visible = true;
      f4.root.position.set(6.4, 0, 1.2);
      f4.yaw = f4.yawT = -0.4;
      f4.busy = true;
      f4.sq.scale.set(1.1, 0.85, 1.1);
      $('#fourth').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: 'forwards' });
    }
    P.winner = P.figs[order[0]];
    P.crown.visible = true;
    if (!reduced) P.confOn = true;
  })();
  const pick = await result;
  $('#ovPod').classList.remove('open');
  clearLabels(P.scene);
  document.body.classList.remove('full', 'in-pod');
  setView(prev);
  resize();
  return pick;
}

function statsTable(o: PodiumOpts) {
  const { st, seats, order } = o;
  const cols: [string, (i: number) => number][] = [
    ['Sterne', (i) => st.players[i].stars], ['Münzen', (i) => st.players[i].coins], ['Minispiel-Siege', (i) => st.players[i].stats.mgWins],
    ['Münzen gesammelt', (i) => st.players[i].stats.coinsGot], ['Felder', (i) => st.players[i].stats.steps], ['Sterne gekauft', (i) => st.players[i].stats.starsBought],
    ['Duelle gewonnen', (i) => st.players[i].stats.duelsWon], ['Laden', (i) => st.players[i].stats.spent], ['Ereignisse', (i) => st.players[i].stats.events], ['Minusfelder', (i) => st.players[i].stats.minus],
  ];
  return `<table><thead><tr><th>Platz</th>${cols.map(([h]) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${order.map((i, n) => `<tr><td><b style="color:${seats[i].color}">${n + 1}. ${esc(seats[i].name)}</b>${i === o.me ? ' (du)' : ''}</td>${cols.map(([, f]) => `<td>${f(i)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
