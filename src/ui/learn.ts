// "Wie das Haus gewinnt": a parchment book page in a brass frame, opened from the HUD menu and
// from the house-rules plaque in the foyer. The text is real HTML (crisp, scrollable, readable
// on a phone); the paper and the charts are painted once on a canvas with the brush helpers.
// Shows the player's own long-run curve against the expected one, the payout share of every
// game, a "1.000 Runden" simulation and short plain-language explanations.

import { Container } from 'pixi.js';
import { allGames } from '../core/registry';
import { formatChips, type GameState } from '../core/state';
import { longRunCurve } from '../core/longRun';
import { sfx } from '../core/audio';
import { reducedMotion } from '../core/fx';
import { glowAt, grain, seeded } from '../world/painted/brush';

import { CURRENCY_PLURAL, LEARN_MOTTO } from '../core/brand';
const pct = (x: number, digits = 1) => (x * 100).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '±') + formatChips(Math.abs(Math.round(n)));

const CSS = `
#learn { position: fixed; inset: 0; z-index: 45; display: grid; place-items: center; box-sizing: border-box; padding: calc(env(safe-area-inset-top, 0px) + 14px) 14px calc(env(safe-area-inset-bottom, 0px) + 14px); background: rgba(8,4,10,.66); animation: fadein .25s ease-out both; grid-template-columns: minmax(0, 1fr); }
#learn.closing { animation: fadeout .18s ease-in both; pointer-events: none; }
.lb-book { position: relative; box-sizing: border-box; width: min(100%, 760px); height: 100%; max-height: 980px; display: flex; flex-direction: column; border: 18px solid transparent; border-radius: 22px; border-image: var(--nf-frame, none) 80 / 40px stretch; background: var(--lb-paper, #ead8ac) center / cover border-box, linear-gradient(180deg, #efdfb6, #d9bf8c) border-box; box-shadow: 0 30px 70px rgba(0,0,0,.65); animation: panelin .3s cubic-bezier(.3,1.25,.55,1) both; color: #33200f; padding-top: 34px; }
.lb-x { position: absolute; top: -12px; right: -12px; width: 48px; height: 48px; min-height: 0; padding: 0; border-radius: 50%; display: grid; place-items: center; z-index: 2; }
.lb-x svg { width: 20px; height: 20px; stroke-width: 2.6; }
.lb-scroll { overflow: auto; overflow-x: hidden; min-height: 0; min-width: 0; padding: 0 clamp(14px, 4vw, 34px) 24px; scrollbar-width: thin; scrollbar-color: #a8741f transparent; overscroll-behavior: contain; }
.lb-scroll h2 { font: clamp(1.45rem, 5vw, 2rem)/1.1 var(--display); color: #6b1a2e; margin: 0 0 4px; letter-spacing: .02em; text-shadow: 0 1px 0 rgba(255,246,220,.7); }
.lb-sub { font-size: 1.15rem; color: #6a4a2a; margin: 0 0 14px; }
.lb-scroll h3 { font: 1.08rem/1.15 var(--display); color: #6b1a2e; letter-spacing: .03em; margin: 26px 0 8px; padding-bottom: 6px; background: linear-gradient(90deg, rgba(107,26,46,.55), rgba(107,26,46,.08) 70%, transparent) bottom / 100% 2px no-repeat; }
.lb-scroll p, .lb-scroll li { font: 500 1.16rem/1.42 var(--body); margin: 0 0 10px; max-width: 62ch; }
.lb-scroll strong { color: #4a1420; }
.lb-scroll ul { padding-left: 1.1em; margin: 0 0 10px; }
.lb-chart { display: block; width: 100%; height: auto; margin: 6px 0 8px; border-radius: 8px; }
.lb-legend { display: flex; flex-wrap: wrap; gap: 6px 18px; font: 600 1rem var(--body); color: #4a3018; margin: 0 0 10px; }
.lb-legend i { display: inline-block; width: 22px; height: 0; border-top: 3px solid; vertical-align: middle; margin-right: 6px; }
.lb-legend i.dash { border-top-style: dashed; }
.lb-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin: 4px 0 12px; }
.lb-fact { padding: 8px 10px; border-radius: 8px; background: rgba(120,80,30,.1); box-shadow: inset 0 0 0 1px rgba(120,80,30,.28); }
.lb-fact span { display: block; font: 600 .9rem var(--body); letter-spacing: .08em; text-transform: uppercase; color: #7a5a32; }
.lb-fact small { display: block; font: 600 .95rem var(--body); color: #6a4a2a; margin-top: 2px; }
.lb-facts { align-items: start; }
.lb-fact b { font: 1.15rem var(--display); color: #33200f; font-variant-numeric: tabular-nums; }
.lb-table { width: 100%; border-collapse: collapse; font: 500 1.08rem var(--body); font-variant-numeric: tabular-nums; margin: 4px 0 8px; }
.lb-table th { text-align: left; font: 600 .88rem var(--body); letter-spacing: .08em; text-transform: uppercase; color: #7a5a32; padding: 4px 6px; border-bottom: 2px solid rgba(107,26,46,.45); }
.lb-table td { padding: 5px 6px; border-bottom: 1px solid rgba(120,80,30,.2); }
.lb-table td.n, .lb-table th.n { text-align: right; white-space: nowrap; }
.lb-table tr:nth-child(even) td { background: rgba(120,80,30,.06); }
.lb-bar { display: inline-block; height: 9px; border-radius: 4px; background: linear-gradient(90deg, #2f6a3a, #6aa860); vertical-align: middle; margin-right: 6px; box-shadow: 0 0 0 1px rgba(30,50,20,.4); }
.lb-sim { display: flex; flex-wrap: wrap; gap: 10px; margin: 4px 0 6px; }
.lb-sim button[aria-pressed="true"] { box-shadow: inset 0 0 0 1px rgba(255,248,220,.6), 0 0 0 2px rgba(22,10,20,.92), 0 0 0 4px #6b1a2e; }
.lb-out { font: 600 1.1rem/1.4 var(--body); min-height: 3em; }
.lb-note { margin-top: 22px; padding: 12px 14px; border-radius: 10px; background: rgba(107,26,46,.09); box-shadow: inset 0 0 0 1px rgba(107,26,46,.3); }
.lb-note p { margin: 0 0 6px; }
.lb-note p:last-child { margin: 0; }
@media (max-width: 600px) {
  #learn { padding: calc(env(safe-area-inset-top, 0px) + 8px) 8px calc(env(safe-area-inset-bottom, 0px) + 8px); }
  .lb-book { border-width: 12px; border-image-width: 28px; }
  .lb-scroll p, .lb-scroll li { font-size: 1.1rem; }
  .lb-table .hide-s { display: none; }
  .lb-table { font-size: 1rem; }
  .lb-table th { font-size: .78rem; letter-spacing: .04em; }
  .lb-bar { display: none; }
}
`;

let styled = false;
function injectStyle() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

let paperUrl = '';
/** Old book paper: warm gradient, foxing at the edges, brush grain. Painted once. */
function paper() {
  if (paperUrl) return paperUrl;
  const W = 512;
  const H = 768;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, '#f3e5bf');
  g.addColorStop(0.6, '#e9d4a4');
  g.addColorStop(1, '#dcc08a');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  grain(c, 0, 0, W, H, 1600, 17, 0.05);
  const r = seeded(29);
  for (let i = 0; i < 14; i++) glowAt(c, r() * W, r() * H, 20 + r() * 50, 16 + r() * 40, 0xb08040, 0.06);
  // Darker, burnt edges.
  const e = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.72);
  e.addColorStop(0, 'rgba(120,70,20,0)');
  e.addColorStop(1, 'rgba(120,70,20,0.32)');
  c.fillStyle = e;
  c.fillRect(0, 0, W, H);
  paperUrl = cv.toDataURL('image/jpeg', 0.85);
  return paperUrl;
}

interface Series {
  values: number[];
  color: string;
  width: number;
  dash?: number[];
  alpha?: number;
}

/** Ink curves on a ruled ledger strip: a zero line, the y range at the left, rounds below. */
function drawChart(cv: HTMLCanvasElement, series: Series[], xLabel: string, rounds: number) {
  const cssW = Math.max(260, Math.round(cv.parentElement?.clientWidth ?? 600));
  const cssH = Math.round(Math.min(300, Math.max(180, cssW * 0.46)));
  const res = Math.min(2, window.devicePixelRatio || 1);
  cv.width = cssW * res;
  cv.height = cssH * res;
  cv.style.aspectRatio = `${cssW} / ${cssH}`;
  const c = cv.getContext('2d')!;
  c.setTransform(res, 0, 0, res, 0, 0);
  c.clearRect(0, 0, cssW, cssH);
  // Ledger card.
  c.fillStyle = 'rgba(255,248,226,0.55)';
  c.fillRect(0, 0, cssW, cssH);
  grain(c, 0, 0, cssW, cssH, Math.round((cssW * cssH) / 300), 5, 0.05);
  const pl = 64;
  const pr = 14;
  const pt = 14;
  const pb = 30;
  const pw = cssW - pl - pr;
  const ph = cssH - pt - pb;
  let lo = 0;
  let hi = 0;
  let n = 2;
  for (const s of series) {
    n = Math.max(n, s.values.length);
    for (const v of s.values) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  const pad = Math.max(10, (hi - lo) * 0.08);
  lo -= pad;
  hi += pad;
  const X = (i: number, len: number) => pl + (i / Math.max(1, len - 1)) * pw * ((len - 1) / Math.max(1, n - 1));
  const Y = (v: number) => pt + (1 - (v - lo) / (hi - lo)) * ph;
  // Ruled lines.
  c.strokeStyle = 'rgba(70,90,120,0.16)';
  c.lineWidth = 1;
  for (let y = pt + 18; y < pt + ph; y += 22) {
    c.beginPath();
    c.moveTo(pl, y);
    c.lineTo(pl + pw, y);
    c.stroke();
  }
  // Red margin line and the zero line.
  c.strokeStyle = 'rgba(160,40,40,0.35)';
  c.beginPath();
  c.moveTo(pl - 6, pt - 4);
  c.lineTo(pl - 6, pt + ph + 4);
  c.stroke();
  c.strokeStyle = 'rgba(51,32,15,0.55)';
  c.lineWidth = 1.5;
  c.setLineDash([2, 4]);
  c.beginPath();
  c.moveTo(pl, Y(0));
  c.lineTo(pl + pw, Y(0));
  c.stroke();
  c.setLineDash([]);
  c.fillStyle = '#5a3a1a';
  c.font = '600 13px "Barlow Condensed", sans-serif';
  c.textAlign = 'right';
  c.textBaseline = 'middle';
  c.fillText('0', pl - 12, Y(0));
  if (Y(hi - pad) < Y(0) - 16) c.fillText(signed(hi - pad), pl - 12, Y(hi - pad));
  if (Y(lo + pad) > Y(0) + 16) c.fillText(signed(lo + pad), pl - 12, Y(lo + pad));
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.fillText('0', pl, cssH - 9);
  c.textAlign = 'right';
  c.fillText(`${formatChips(rounds)} ${xLabel}`, pl + pw, cssH - 9);
  // Curves: a darker ink pass under a lighter one, like a nib.
  c.lineJoin = 'round';
  c.lineCap = 'round';
  for (const s of series) {
    if (s.values.length < 2) continue;
    c.globalAlpha = s.alpha ?? 1;
    c.strokeStyle = s.color;
    c.lineWidth = s.width;
    c.setLineDash(s.dash ?? []);
    c.beginPath();
    s.values.forEach((v, i) => (i ? c.lineTo(X(i, s.values.length), Y(v)) : c.moveTo(X(i, s.values.length), Y(v))));
    c.stroke();
  }
  c.setLineDash([]);
  c.globalAlpha = 1;
}

// ---- The simulation: European roulette, exact odds ------------------------------------------

type Bet = 'rot' | 'zahl';
const BETS: Record<Bet, { label: string; p: number; pays: number }> = {
  rot: { label: 'Auf Rot', p: 18 / 37, pays: 2 },
  zahl: { label: 'Auf eine Zahl', p: 1 / 37, pays: 36 },
};

function simulate(bet: Bet, rounds: number, stake: number) {
  const b = BETS[bet];
  const curve = [0];
  let net = 0;
  let won = 0;
  let streak = 0;
  let bestStreak = 0;
  let loseStreak = 0;
  let worstStreak = 0;
  let peak = 0;
  const shareAt: Record<number, number> = {};
  for (let i = 1; i <= rounds; i++) {
    const hit = Math.random() < b.p;
    const pay = hit ? stake * b.pays : 0;
    won += pay;
    net += pay - stake;
    if (hit) {
      streak++;
      loseStreak = 0;
    } else {
      loseStreak++;
      streak = 0;
    }
    bestStreak = Math.max(bestStreak, streak);
    worstStreak = Math.max(worstStreak, loseStreak);
    peak = Math.max(peak, net);
    curve.push(net);
    if (i === 10 || i === 100 || i === rounds) shareAt[i] = won / (i * stake);
  }
  return { curve, net, bestStreak, worstStreak, peak, shareAt };
}

/** The page. Works as an overlay for main.ts (an empty Pixi view; the page itself is DOM). */
export class LearnPage {
  readonly view = new Container();
  private root: HTMLElement;
  private onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape') {
      e.stopPropagation();
      this.close();
    }
  };
  private redraw: (() => void)[] = [];
  private onResize = () => this.redraw.forEach((f) => f());
  private closed = false;

  constructor(
    private state: GameState,
    private onClose: () => void,
  ) {
    injectStyle();
    this.root = document.createElement('div');
    this.root.id = 'learn';
    this.root.innerHTML = '';
    document.body.appendChild(this.root);
    this.build();
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('resize', this.onResize);
    sfx.click();
  }

  private build() {
    const d = this.state.data;
    const book = document.createElement('article');
    book.className = 'lb-book';
    book.setAttribute('role', 'dialog');
    book.setAttribute('aria-modal', 'true');
    book.setAttribute('aria-labelledby', 'lb-title');
    book.style.setProperty('--lb-paper', `url(${paper()})`);
    const x = document.createElement('button');
    x.className = 'lb-x';
    x.setAttribute('aria-label', 'Schließen');
    x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    x.addEventListener('click', () => this.close());
    book.appendChild(x);
    const sc = document.createElement('div');
    sc.className = 'lb-scroll';
    book.appendChild(sc);
    this.root.appendChild(book);
    this.root.addEventListener('pointerdown', (e) => e.target === this.root && this.close());

    const html = (tag: string, text: string, cls = '') => {
      const el = document.createElement(tag);
      el.innerHTML = text;
      if (cls) el.className = cls;
      sc.appendChild(el);
      return el;
    };

    html('h2', 'Wie das Haus gewinnt').id = 'lb-title';
    html('p', `${LEARN_MOTTO}: ein Blick hinter die Theke. Die Mathematik dahinter ist dieselbe wie in jedem echten Casino.`, 'lb-sub');

    // ---- 1. The player's own long run ------------------------------------------------------
    html('h3', 'Deine Langzeitkurve');
    const lr = longRunCurve(d);
    const { wagered, won } = d.stats;
    if (lr.rounds < 2) {
      html('p', 'Sobald du ein paar Runden gespielt hast, erscheint hier deine Kurve: was du insgesamt gewonnen oder verloren hast, Runde für Runde, neben dem, was die Auszahlungsquoten erwarten lassen.');
    } else {
      const cv = document.createElement('canvas');
      cv.className = 'lb-chart';
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-label', `Deine Kurve über ${lr.rounds} Runden: tatsächlich ${signed(lr.net[lr.net.length - 1])} ${CURRENCY_PLURAL}, erwartet ${signed(lr.exp[lr.exp.length - 1])} ${CURRENCY_PLURAL}.`);
      sc.appendChild(cv);
      const draw = () => drawChart(cv, [
        { values: lr.exp, color: '#a0302a', width: 2.5, dash: [7, 6] },
        { values: lr.net, color: '#24427a', width: 3 },
      ], 'Runden', lr.rounds);
      this.redraw.push(draw);
      requestAnimationFrame(draw);
      html('div', '<span><i style="border-color:#24427a"></i>Dein Ergebnis</span><span><i class="dash" style="border-color:#a0302a"></i>Erwartet (Einsatz × Hausvorteil)</span>', 'lb-legend');
      const net = lr.net[lr.net.length - 1];
      const exp = lr.exp[lr.exp.length - 1];
      html('p', net >= exp
        ? `Du liegst gerade <strong>${formatChips(net - exp)} ${CURRENCY_PLURAL} über</strong> der erwarteten Linie. Das ist Glück, und Glück schwankt. Je mehr Runden dazukommen, desto näher rückt die blaue Linie an die rote.`
        : `Du liegst <strong>${formatChips(exp - net)} ${CURRENCY_PLURAL} unter</strong> der erwarteten Linie: eine Pechsträhne. Auf lange Sicht pendelt sich die blaue Linie um die rote ein, in beide Richtungen.`);
    }
    const facts = document.createElement('div');
    facts.className = 'lb-facts';
    const fact = (label: string, value: string, sub = '') => {
      const f = document.createElement('div');
      f.className = 'lb-fact';
      f.innerHTML = `<span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}`;
      facts.appendChild(f);
    };
    fact('Eingesetzt', `${formatChips(wagered)} F`);
    fact('Ausgezahlt', `${formatChips(won)} F`);
    fact('Deine Quote', wagered > 0 ? `${pct(won / wagered)} %` : '–');
    const today = d.history.length > 1 ? d.history[d.history.length - 1] - d.history[0] : 0;
    fact('Heute', d.history.length > 1 ? `${signed(today)} F` : '–', d.history.length > 1 ? `erwartet ${signed(-d.houseExpected)} F` : 'noch keine Runde');
    sc.appendChild(facts);

    // ---- 2. House edge and payout share ---------------------------------------------------
    html('h3', 'Hausvorteil und Auszahlungsquote');
    html('p', `Jedes Spiel zahlt im Schnitt etwas weniger aus, als eingesetzt wird. Die <strong>Auszahlungsquote</strong> sagt, wie viel: Bei 97 % kommen von 100 eingesetzten ${CURRENCY_PLURAL} auf lange Sicht 97 zurück. Die restlichen 3 % sind der <strong>Hausvorteil</strong>. Er ist klein genug, dass man ihn in einer Runde nicht spürt, und groß genug, dass das Haus über tausende Runden sicher gewinnt.`);
    html('p', 'Das ist kein Trick und kein Betrug, sondern einfach eingebaut: Beim Roulette zum Beispiel zahlt ein Treffer auf eine Zahl 36-fach, aber es gibt 37 Fächer. Das eine Fach zu viel, die grüne Null, ist der Hausvorteil.');

    // ---- 3. Table of all games -------------------------------------------------------------
    html('h3', 'Alle Spiele im Haus');
    const games = allGames()
      .map((g) => ({ name: g.name, rtp: 1 - g.houseEdge }))
      .sort((a, b) => b.rtp - a.rtp);
    const best = Math.max(...games.map((g) => g.rtp));
    const worst = Math.min(...games.map((g) => g.rtp));
    const table = document.createElement('table');
    table.className = 'lb-table';
    table.innerHTML = '<thead><tr><th>Spiel</th><th class="n">Quote</th><th class="n hide-s">Hausvorteil</th><th class="n">Von 1.000 F behält das Haus</th></tr></thead>';
    const tb = document.createElement('tbody');
    for (const g of games) {
      const tr = document.createElement('tr');
      const w = Math.round(14 + ((g.rtp - worst) / Math.max(0.001, best - worst)) * 46);
      tr.innerHTML = `<td></td><td class="n"><i class="lb-bar" style="width:${w}px" aria-hidden="true"></i>${pct(g.rtp)} %</td><td class="n hide-s">${pct(1 - g.rtp)} %</td><td class="n">≈ ${formatChips(Math.round((1 - g.rtp) * 1000))} F</td>`;
      (tr.firstChild as HTMLElement).textContent = g.name;
      tb.appendChild(tr);
    }
    table.appendChild(tb);
    sc.appendChild(table);
    html('p', 'Die Werte gelten für die Grundeinstellung. Wo ein Spiel Modi, Risikostufen oder Items hat, zeigt es dir am Tisch die genaue Quote für deine Wahl.');

    // ---- 4. Simulation ---------------------------------------------------------------------
    html('h3', '1.000 Runden simulieren');
    html('p', `Fünf Gäste setzen je 1.000-mal 10 ${CURRENCY_PLURAL} beim Roulette. Die gestrichelte Linie ist das, was die Quote von 97,3 % erwarten lässt: am Ende etwa −270 ${CURRENCY_PLURAL}. Probier beide Wetten aus und drück ruhig öfter.`);
    const btns = document.createElement('div');
    btns.className = 'lb-sim';
    sc.appendChild(btns);
    const simCv = document.createElement('canvas');
    simCv.className = 'lb-chart';
    simCv.setAttribute('role', 'img');
    sc.appendChild(simCv);
    html('div', '<span><i style="border-color:#24427a"></i>Gast 1</span><span><i style="border-color:#6a8a5a"></i>Gäste 2 bis 5</span><span><i class="dash" style="border-color:#a0302a"></i>Erwartet</span>', 'lb-legend');
    const out = html('div', '', 'lb-out');
    out.setAttribute('aria-live', 'polite');
    let bet: Bet = 'rot';
    let lastRuns: ReturnType<typeof simulate>[] = [];
    const ROUNDS = 1000;
    const STAKE = 10;
    const expected = Array.from({ length: ROUNDS + 1 }, (_, i) => -i * STAKE * (1 / 37));
    const drawSim = (k = 1) => {
      const len = Math.max(2, Math.round(ROUNDS * k) + 1);
      drawChart(simCv, [
        ...lastRuns.slice(1).map((r) => ({ values: r.curve.slice(0, len), color: '#6a8a5a', width: 1.6, alpha: 0.75 })),
        { values: expected, color: '#a0302a', width: 2.5, dash: [7, 6] },
        { values: lastRuns[0]?.curve.slice(0, len) ?? [0], color: '#24427a', width: 3 },
      ], 'Runden', ROUNDS);
    };
    this.redraw.push(() => drawSim());
    const run = () => {
      lastRuns = Array.from({ length: 5 }, () => simulate(bet, ROUNDS, STAKE));
      const r = lastRuns[0];
      const finals = lastRuns.map((x) => signed(x.net)).join(', ');
      const ahead = lastRuns.filter((x) => x.net > 0).length;
      out.innerHTML = `Gast 1 endet bei <strong>${signed(r.net)} ${CURRENCY_PLURAL}</strong> (erwartet −270). Zwischendurch lag er bis zu ${signed(r.peak)} vorn; längste Glückssträhne ${r.bestStreak}, längste Pechsträhne ${r.worstStreak} Runden.<br>Seine Quote nach 10 Runden: ${pct(r.shareAt[10], 0)} %, nach 100: ${pct(r.shareAt[100], 0)} %, nach 1.000: ${pct(r.shareAt[ROUNDS])} %.<br>Alle fünf: ${finals}. ${ahead === 0 ? 'Keiner liegt vorn.' : ahead === 1 ? 'Einer liegt vorn.' : `${ahead} liegen vorn.`}`;
      simCv.setAttribute('aria-label', `Simulation ${BETS[bet].label}: Gast 1 endet bei ${signed(r.net)} ${CURRENCY_PLURAL}.`);
      // Ink the curves in over half a second (or at once with reduced motion).
      if (reducedMotion()) return drawSim();
      const t0 = performance.now();
      const step = (t: number) => {
        if (this.closed) return;
        const k = Math.min(1, (t - t0) / 600);
        drawSim(k);
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const setBtns: (() => void)[] = [];
    for (const id of Object.keys(BETS) as Bet[]) {
      const b = document.createElement('button');
      b.textContent = BETS[id].label;
      b.addEventListener('click', () => {
        bet = id;
        sfx.chip();
        setBtns.forEach((f) => f());
        run();
      });
      setBtns.push(() => b.setAttribute('aria-pressed', String(bet === id)));
      btns.appendChild(b);
    }
    const again = document.createElement('button');
    again.className = 'primary';
    again.textContent = 'Nochmal 1.000 Runden';
    again.addEventListener('click', () => {
      sfx.chip();
      run();
    });
    btns.appendChild(again);
    setBtns.forEach((f) => f());
    requestAnimationFrame(run);

    // ---- 5. Plain explanations -------------------------------------------------------------
    html('h3', 'Warum Serien täuschen');
    html('p', 'Fünfmal Rot hintereinander? Die Kugel weiß davon nichts. Beim sechsten Mal ist Rot genauso wahrscheinlich wie beim ersten. Serien fühlen sich an wie ein Muster, sind aber ganz normaler Zufall: In 1.000 Runden auf Rot gibt es fast immer eine Strähne von 7 oder mehr Treffern, und meist eine noch längere Pechsträhne. Keine Strategie und kein Einsatzsystem ändert die Quote einer Wette.');
    html('h3', 'Warum Items über 100 % nur kurz und teuer sind');
    const slots = allGames().find((g) => g.id === 'slots');
    const slotTxt = slots ? ` statt ${pct(1 - slots.houseEdge)} %` : '';
    html('p', `Manche Items heben die echte Quote eines Spiels über 100 %, die Glücksfeder etwa auf 105,3 %${slotTxt} am Automaten. Dann bist du kurz im Vorteil. Aber nur für ein paar Runden, und die Items kosten Mondsteine, die du dir vorher erspielen musst. Bei 10 Runden mit 20 ${CURRENCY_PLURAL} Einsatz bringen 5 % Vorteil im Schnitt rund 10 ${CURRENCY_PLURAL}. Das Haus gibt diesen Vorteil gern her, weil er so kurz ist. In einem echten Casino gibt es so etwas übrigens nicht.`);
    html('h3', 'Das Gesetz der großen Zahlen');
    html('p', 'Nach 10 Runden kann alles passieren: doppelt so viel oder gar nichts. Nach 100 Runden wird es ruhiger, nach 10.000 Runden liegt die Quote fast genau beim angeschriebenen Wert. Das ist das Gesetz der großen Zahlen. Für einen einzelnen Abend bedeutet es: Glück ist möglich. Für das Haus, das jeden Abend Millionen Runden sieht, bedeutet es: Der Gewinn ist sicher.');
    html('ul', '<li><strong>Kurz gespielt:</strong> Das Ergebnis ist vor allem Glück.</li><li><strong>Lang gespielt:</strong> Das Ergebnis ist vor allem der Hausvorteil.</li><li><strong>Für immer gespielt:</strong> Das Haus gewinnt.</li>');

    // ---- 6. Help contact -------------------------------------------------------------------
    const note = html('div', '', 'lb-note');
    note.innerHTML = `<p>Wenn echtes Glücksspiel für dich oder jemanden in deiner Nähe ein Thema ist: Die BZgA berät kostenlos und anonym, auf check-dein-spiel.de oder unter 0800 1 37 27 00.</p>`;

    const done = document.createElement('div');
    done.style.cssText = 'display:flex;justify-content:flex-end;margin-top:16px';
    const ok = document.createElement('button');
    ok.className = 'primary';
    ok.textContent = 'Buch schließen';
    ok.addEventListener('click', () => this.close());
    done.appendChild(ok);
    sc.appendChild(done);
    requestAnimationFrame(() => x.focus());
  }

  close() {
    if (this.closed) return;
    sfx.click();
    this.onClose();
  }

  resize() {}
  update() {}

  destroy() {
    this.closed = true;
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('resize', this.onResize);
    const r = this.root;
    r.classList.add('closing');
    setTimeout(() => r.remove(), 180);
    this.view.destroy();
  }
}

/** Adds the "Wie das Haus gewinnt" key to the HUD menu, before Hilfe. */
export function addLearnButton(onClick: () => void) {
  const menu = document.getElementById('hud-menu');
  if (!menu || document.getElementById('btn-learn')) return;
  const b = document.createElement('button');
  b.id = 'btn-learn';
  b.className = 'hud-btn icon';
  b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v16h16"/><path d="M7 15l3.5-4 3 2.5L19 7"/><path d="M7 9.5h12" stroke-dasharray="2 2"/></svg><span class="lbl">Wie das Haus gewinnt</span>';
  b.addEventListener('click', onClick);
  const help = document.getElementById('btn-help');
  menu.insertBefore(b, help);
}
