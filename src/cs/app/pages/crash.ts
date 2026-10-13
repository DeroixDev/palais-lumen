// Crash: the multiplier climbs until it crashes. Cash out in time. P(reach x) = 0.96 / x.

import { addCoins, commit, emit, save, spend } from '../lib/state';
import { addXP, xpFor, checkAchievements } from '../lib/career';
import { avatarSVG, randomBots, type Player } from '../lib/bots';
import { sfx } from '../lib/sound';
import { clamp, esc, fmt, reducedMotion } from '../lib/util';
import { burstAt, shake } from '../ui/fx';
import { toast } from '../ui/toast';
import { pageHead, type Page } from './page';

const GROWTH = 0.11;               // m(t) = e^(GROWTH t)
const WAIT_MS = 6000;
const AFTER_MS = 3000;
const multAt = (ms: number) => Math.exp(GROWTH * (ms / 1000));
const timeFor = (m: number) => (Math.log(m) / GROWTH) * 1000;
export function crashPoint(): number {
  const u = Math.random();
  return Math.max(1, Math.floor((0.96 / Math.max(u, 1e-9)) * 100) / 100);
}
const fmtX = (m: number) => `${m.toFixed(2).replace('.', ',')}×`;

interface BotBet { p: Player; stake: number; target: number; out?: number }

export const crashPage: Page = (root) => {
  let phase: 'wait' | 'run' | 'crash' = 'wait';
  let phaseT0 = performance.now();
  let point = crashPoint();
  let mult = 1;
  let myBet = 0, myAuto = 0, myOut = 0;
  let queued: { stake: number; auto: number } | null = null;
  let stake = Math.min(2, Math.floor(save.balance * 100) / 100) || 1;
  let auto = 0;
  let bots: BotBet[] = [];
  let raf = 0;
  let alive = true;

  root.innerHTML = `
  ${pageHead('Crash', 'Die Kurve steigt, bis sie abstürzt. Steig rechtzeitig aus.')}
  <div class="cr-hist"></div>
  <section class="crash">
    <div class="cr-stage">
      <canvas class="cr-canvas"></canvas>
      <div class="cr-mult mono">1,00×</div>
      <div class="cr-sub"></div>
    </div>
    <aside class="cr-side panel">
      <label class="lbl">Einsatz</label>
      <label class="amt"><span class="coin"></span><input type="number" class="cr-stake" min="0.1" step="0.1" inputmode="decimal" aria-label="Einsatz"></label>
      <div class="quick"><button type="button" class="chip" data-q="half">½</button><button type="button" class="chip" data-q="double">×2</button><button type="button" class="chip" data-q="max">Max</button></div>
      <label class="lbl">Automatisch aussteigen bei</label>
      <label class="amt"><span class="x">×</span><input type="number" class="cr-auto" min="1.01" step="0.01" inputmode="decimal" placeholder="aus" aria-label="Automatisch aussteigen bei"></label>
      <button class="btn primary xl cr-btn" type="button">Einsetzen</button>
      <div class="cr-players"><h4 class="sub-h">Spieler <small class="mono cr-pn"></small></h4><div class="cr-plist"></div></div>
    </aside>
  </section>`;

  const cv = root.querySelector('.cr-canvas') as HTMLCanvasElement;
  const g = cv.getContext('2d')!;
  const multEl = root.querySelector('.cr-mult') as HTMLElement;
  const subEl = root.querySelector('.cr-sub') as HTMLElement;
  const btn = root.querySelector('.cr-btn') as HTMLButtonElement;
  const stakeIn = root.querySelector('.cr-stake') as HTMLInputElement;
  const autoIn = root.querySelector('.cr-auto') as HTMLInputElement;
  const stage = root.querySelector('.cr-stage') as HTMLElement;
  stakeIn.value = String(stake);

  const size = () => {
    const d = Math.min(2, devicePixelRatio || 1);
    const r = cv.getBoundingClientRect();
    cv.width = Math.max(1, r.width * d); cv.height = Math.max(1, r.height * d);
    g.setTransform(d, 0, 0, d, 0, 0);
  };
  const ro = new ResizeObserver(size);
  ro.observe(cv);

  function drawHist() {
    root.querySelector('.cr-hist')!.innerHTML = `<span class="lbl">Letzte Runden</span>${save.crashHistory.slice(0, 16).map((x) => `<span class="hchip mono ${x >= 10 ? 'gold' : x >= 2 ? 'good' : 'bad'}">${fmtX(x)}</span>`).join('')}`;
  }
  function newBots() {
    const n = 4 + Math.floor(Math.random() * 6);
    bots = randomBots(n).map((p) => ({ p, stake: Math.round((0.5 + Math.random() * Math.random() * 40) * 100) / 100, target: Math.round((1.1 + Math.random() * Math.random() * 6) * 100) / 100 }));
  }
  function drawPlayers() {
    const rows: string[] = [];
    if (myBet) rows.push(`<div class="cp me ${myOut ? 'out' : phase === 'crash' ? 'bust' : ''}">${avatarSVG(save.avatar, save.name)}<span>${esc(save.name)}</span><b class="mono">${fmt(myBet)}</b><em class="mono">${myOut ? fmtX(myOut) : phase === 'crash' ? '✕' : ''}</em></div>`);
    for (const b of bots) rows.push(`<div class="cp ${b.out ? 'out' : phase === 'crash' ? 'bust' : ''}">${avatarSVG(b.p.avatar, b.p.name)}<span>${esc(b.p.name)}</span><b class="mono">${fmt(b.stake)}</b><em class="mono">${b.out ? fmtX(b.out) : phase === 'crash' ? '✕' : ''}</em></div>`);
    root.querySelector('.cr-plist')!.innerHTML = rows.join('');
    root.querySelector('.cr-pn')!.textContent = String(rows.length);
  }
  function drawBtn() {
    if (phase === 'run' && myBet && !myOut) { btn.innerHTML = `Aussteigen <span class="mono">${fmt(myBet * mult)}</span>`; btn.className = 'btn cash xl cr-btn'; btn.disabled = false; return; }
    btn.className = 'btn primary xl cr-btn';
    if (queued) { btn.innerHTML = 'Einsatz platziert · Abbrechen'; btn.disabled = false; return; }
    if (phase === 'wait' && !myBet) { btn.textContent = 'Einsetzen'; btn.disabled = stake <= 0 || stake > save.balance + 1e-9; return; }
    btn.textContent = myBet ? (myOut ? `Ausgestiegen bei ${fmtX(myOut)}` : 'Läuft …') : 'Für nächste Runde setzen';
    btn.disabled = !!myBet;
  }

  function cashOut(at: number) {
    if (!myBet || myOut) return;
    myOut = at;
    const win = Math.round(myBet * at * 100) / 100;
    addCoins(win);
    save.stats.crashWon++;
    save.stats.crashBest = Math.max(save.stats.crashBest, at);
    emit({ t: 'crash', won: true, mult: at, stake: myBet });
    checkAchievements();
    commit();
    if (alive) {
      sfx.win();
      burstAt(multEl, ['#3fdc7a', '#ffd14a', '#fff'], 60, 8);
      toast(`Ausgestiegen bei ${fmtX(at)}`, `+${fmt(win)} Coins`, 'good', '🚀');
    }
  }

  function draw(now: number) {
    const w = cv.clientWidth, h = cv.clientHeight;
    g.clearRect(0, 0, w, h);
    const el = now - phaseT0;
    const tNow = phase === 'run' ? el : phase === 'crash' ? timeFor(point) : 0;
    const maxT = Math.max(8000, tNow * 1.15);
    const maxM = Math.max(2, multAt(maxT) * 1.05);
    const pad = { l: 44, b: 26, r: 14, t: 14 };
    const X = (t: number) => pad.l + (t / maxT) * (w - pad.l - pad.r);
    const Y = (m: number) => h - pad.b - ((m - 1) / (maxM - 1)) * (h - pad.b - pad.t);
    // grid
    g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1; g.fillStyle = 'rgba(200,210,225,.45)'; g.font = '11px "JetBrains Mono", monospace';
    const stepM = maxM > 20 ? 5 : maxM > 8 ? 2 : maxM > 4 ? 1 : 0.5;
    for (let m = 1; m <= maxM; m += stepM) { const y = Y(m); g.beginPath(); g.moveTo(pad.l, y); g.lineTo(w - pad.r, y); g.stroke(); g.fillText(`${m.toFixed(1)}×`, 4, y + 4); }
    const stepT = maxT > 30000 ? 10000 : maxT > 14000 ? 4000 : 2000;
    for (let t = 0; t <= maxT; t += stepT) { const x = X(t); g.fillText(`${Math.round(t / 1000)}s`, x - 6, h - 8); }
    if (phase === 'wait') return;
    // curve
    const col = phase === 'crash' ? '#eb4b4b' : '#ff8a1f';
    const grad = g.createLinearGradient(0, Y(mult), 0, h - pad.b);
    grad.addColorStop(0, phase === 'crash' ? 'rgba(235,75,75,.35)' : 'rgba(255,138,31,.35)');
    grad.addColorStop(1, 'rgba(255,138,31,0)');
    g.beginPath(); g.moveTo(X(0), Y(1));
    const N = 80;
    for (let i = 1; i <= N; i++) { const t = (tNow * i) / N; g.lineTo(X(t), Y(multAt(t))); }
    g.lineTo(X(tNow), h - pad.b); g.lineTo(X(0), h - pad.b); g.closePath(); g.fillStyle = grad; g.fill();
    g.beginPath(); g.moveTo(X(0), Y(1));
    for (let i = 1; i <= N; i++) { const t = (tNow * i) / N; g.lineTo(X(t), Y(multAt(t))); }
    g.strokeStyle = col; g.lineWidth = 3.5; g.shadowColor = col; g.shadowBlur = 14; g.stroke(); g.shadowBlur = 0;
    // tip
    const tx = X(tNow), ty = Y(multAt(tNow));
    g.fillStyle = '#fff'; g.beginPath(); g.arc(tx, ty, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = col; g.beginPath(); g.arc(tx, ty, 9, 0, Math.PI * 2); g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1;
    // cash-out markers
    const marks = bots.filter((b) => b.out).map((b) => b.out!);
    if (myOut) marks.push(myOut);
    for (const m of marks) { const x = X(timeFor(m)), y = Y(m); g.fillStyle = '#3fdc7a'; g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill(); }
  }

  function loop(now: number) {
    if (!alive) return;
    const el = now - phaseT0;
    if (phase === 'wait') {
      multEl.textContent = '1,00×';
      multEl.className = 'cr-mult mono wait';
      subEl.innerHTML = `Nächste Runde in <b class="mono">${Math.max(0, (WAIT_MS - el) / 1000).toFixed(1).replace('.', ',')} s</b>`;
      if (el >= WAIT_MS) {
        phase = 'run'; phaseT0 = now; mult = 1;
        if (queued) {
          if (spend(queued.stake)) { myBet = queued.stake; myAuto = queued.auto; myOut = 0; save.stats.crash++; addXP(xpFor(myBet) * 0.6); commit(); }
          queued = null;
        }
        drawBtn(); drawPlayers();
      }
    } else if (phase === 'run') {
      mult = multAt(el);
      if (mult >= point) {
        mult = point;
        phase = 'crash'; phaseT0 = now;
        save.crashHistory.unshift(point);
        if (save.crashHistory.length > 30) save.crashHistory.pop();
        if (myBet && !myOut) { emit({ t: 'crash', won: false, mult: point, stake: myBet }); sfx.lose(); }
        if (save.settings.sound) sfx.boom();
        shake(stage);
        commit();
        drawHist(); drawBtn(); drawPlayers();
      } else {
        if (myBet && !myOut && myAuto > 1 && mult >= myAuto) { cashOut(myAuto); drawBtn(); drawPlayers(); }
        let changed = false;
        for (const b of bots) if (!b.out && mult >= b.target) { b.out = b.target; changed = true; }
        if (changed) drawPlayers();
        if (myBet && !myOut) btn.querySelector('.mono')!.textContent = fmt(myBet * mult);
      }
      multEl.textContent = fmtX(mult);
      multEl.className = `cr-mult mono run${mult >= 10 ? ' hot' : mult >= 2 ? ' warm' : ''}`;
      subEl.textContent = myBet ? (myOut ? `Ausgestiegen: +${fmt(myBet * myOut)}` : `Dein Einsatz: ${fmt(myBet)}`) : '';
    } else {
      multEl.textContent = fmtX(point);
      multEl.className = 'cr-mult mono crashed';
      subEl.innerHTML = 'Abgestürzt';
      if (el >= AFTER_MS) {
        phase = 'wait'; phaseT0 = now; point = crashPoint();
        myBet = 0; myOut = 0; myAuto = 0;
        newBots();
        drawBtn(); drawPlayers();
      }
    }
    draw(now);
    raf = requestAnimationFrame(loop);
  }

  btn.addEventListener('click', () => {
    if (phase === 'run' && myBet && !myOut) { cashOut(Math.floor(mult * 100) / 100); drawBtn(); drawPlayers(); return; }
    if (queued) { queued = null; drawBtn(); return; }
    if (myBet) return;
    if (stake <= 0 || stake > save.balance + 1e-9) { sfx.error(); return; }
    queued = { stake, auto };
    sfx.click();
    // In the waiting phase the bet is placed right away.
    if (phase === 'wait') { /* placed at round start */ }
    drawBtn();
  });
  stakeIn.addEventListener('input', () => { stake = clamp(Math.round((parseFloat(stakeIn.value.replace(',', '.')) || 0) * 100) / 100, 0, 1e9); drawBtn(); });
  autoIn.addEventListener('input', () => { const v = parseFloat(autoIn.value.replace(',', '.')); auto = v > 1 ? v : 0; });
  root.querySelector('.quick')!.addEventListener('click', (e) => {
    const q = ((e.target as HTMLElement).closest('.chip') as HTMLElement | null)?.dataset.q;
    if (!q) return;
    stake = q === 'half' ? stake / 2 : q === 'double' ? stake * 2 : save.balance;
    stake = Math.round(Math.min(stake, save.balance) * 100) / 100;
    stakeIn.value = String(stake);
    drawBtn();
  });

  newBots();
  drawHist(); drawBtn(); drawPlayers();
  size();
  if (reducedMotion()) multEl.style.transition = 'none';
  raf = requestAnimationFrame(loop);
  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    // Leaving mid-round cashes out at the current multiplier.
    if (phase === 'run' && myBet && !myOut) cashOut(Math.floor(mult * 100) / 100);
  };
};
