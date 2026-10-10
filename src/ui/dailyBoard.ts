// The Tagesherausforderung card on the start screen: today's conditions, whether today's
// counted attempt is still open, and the painted "Bestenliste" board with today and the last
// 14 days. The board is painted once per open on a canvas (brass frame, velvet, engraved rows);
// the card around it is the same framed HTML card as the reception lobby.

import { formatChips, type SaveData } from '../core/state';
import { readSlot } from '../core/save';
import { sfx } from '../core/audio';
import { dailyMoonName, dateLabel, isDailyRun, isPractice, lastDays, reachedDay, todayKey } from '../core/daily';
import { MOON_LEVELS } from '../core/moon';
import { INK, glowAt, gold, grain, rrect, seeded } from '../world/painted/brush';

export type DailyStart = 'new' | 'practice' | 'continue';

const CSS = `
.daily { width: min(100%, 620px); max-height: calc(100dvh - 32px); }
.daily .card-body p { font-size: 1.08rem; }
.daily-cond { display: flex; flex-wrap: wrap; gap: 6px 8px; margin: 0 0 10px; }
.daily-cond .tag { font-size: .78rem; }
.daily-status { font: 1.05rem/1.3 var(--display); color: var(--lamp); margin: 4px 0 8px; letter-spacing: .02em; }
.daily-board { display: block; width: 100%; height: auto; margin: 6px 0 8px; }
.daily-local { color: var(--muted); font-size: .98rem !important; }
#m-daily { min-width: 180px; }
#daily-line { color: var(--cream-2); font-size: 1rem; text-shadow: 0 1px 3px #000; margin-top: -4px; }
`;

let styled = false;
function injectStyle() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

/** The daily save as it is on this device, plus the board of results (normal and daily saves merged). */
export function dailyInfo(normal: SaveData) {
  const today = todayKey();
  const run = readSlot('daily');
  const best = { ...normal.dailyBest, ...run?.dailyBest };
  const entry = best[today];
  // Today's counted run still going?
  const openToday = !!run && run.dailySeed === today && isDailyRun(run) && !isPractice(run);
  const practiceOpen = !!run && run.dailySeed === today && isDailyRun(run) && isPractice(run);
  const staleOpen = !!run && run.dailySeed !== today && isDailyRun(run);
  return { today, run, best, entry, openToday, practiceOpen, staleOpen };
}

/** One short line for the main menu under the button. */
export function dailyLine(normal: SaveData) {
  const i = dailyInfo(normal);
  if (i.entry) return `Heute schon gespielt: ${i.entry.day >= 13 ? 'Saison gewonnen!' : `Tag ${reachedDay(i.entry.day)}`}`;
  if (i.openToday) return `Läuft: Tag ${i.run!.evening.number} · ${formatChips(i.run!.balance)} Falter`;
  return `Heute (${dateLabel(i.today, true)}): ${dailyMoonName(i.today)} · für alle gleich`;
}

/** The painted board: today's result on a brass plate, then 14 engraved rows. */
function paintBoard(cv: HTMLCanvasElement, rows: ReturnType<typeof lastDays>, today: string, practice: { day: number; bal: number } | null) {
  const W = Math.max(280, Math.round(cv.parentElement?.clientWidth ?? 560));
  const rowH = W < 420 ? 24 : 26;
  const headH = 98;
  const H = headH + rows.length * rowH + 22;
  const res = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * res;
  cv.height = H * res;
  cv.style.aspectRatio = `${W} / ${H}`;
  const c = cv.getContext('2d')!;
  c.setTransform(res, 0, 0, res, 0, 0);
  c.clearRect(0, 0, W, H);
  c.lineJoin = 'round';
  // Brass frame and green velvet.
  rrect(c, 2, 2, W - 4, H - 4, 14);
  c.fillStyle = gold(c, 0, 0, W * 0.6, H);
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 2.4;
  c.stroke();
  rrect(c, 11, 11, W - 22, H - 22, 9);
  const v = c.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0, '#1f4a40');
  v.addColorStop(1, '#0e2620');
  c.fillStyle = v;
  c.fill();
  c.strokeStyle = 'rgba(22,10,20,0.9)';
  c.lineWidth = 2;
  c.stroke();
  c.save();
  rrect(c, 11, 11, W - 22, H - 22, 9);
  c.clip();
  grain(c, 11, 11, W - 22, H - 22, Math.round((W * H) / 220), 41, 0.07);
  glowAt(c, W * 0.3, 40, W * 0.5, 80, 0xfff4dc, 0.1);
  c.restore();
  // Screws in the corners.
  for (const [x, y] of [[7, 7], [W - 7, 7], [7, H - 7], [W - 7, H - 7]]) {
    c.beginPath();
    c.arc(x, y, 3.2, 0, Math.PI * 2);
    c.fillStyle = '#7a4e18';
    c.fill();
  }
  // Title.
  c.textAlign = 'center';
  c.fillStyle = '#ffdf9a';
  c.font = `${W < 420 ? 17 : 20}px Bungee, Impact, sans-serif`;
  c.fillText('BESTENLISTE', W / 2, 38);
  // Today's plate.
  const e = rows[0];
  const pw = Math.min(W - 48, 380);
  const px = (W - pw) / 2;
  rrect(c, px, 48, pw, 38, 7);
  c.fillStyle = gold(c, px, 48, px + pw * 0.4, 86);
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 1.8;
  c.stroke();
  c.fillStyle = '#3a2008';
  c.font = `700 ${W < 420 ? 15 : 17}px "Barlow Condensed", sans-serif`;
  const txt = e && e.day >= 0
    ? `Heute: ${e.day >= 13 ? 'Saison gewonnen' : `Tag ${reachedDay(e.day)}`} · ${formatChips(e.balance)} Falter`
    : practice
    ? `Heute: noch kein Versuch · Übung: Tag ${reachedDay(practice.day)}`
    : 'Heute: noch kein Versuch';
  c.fillText(txt, W / 2, 72);
  // Rows.
  const top = headH;
  const colDate = 26;
  const colPips = W < 420 ? 82 : 110;
  const pipGap = Math.min(14, (W - colPips - 110) / 13);
  const rnd = seeded(7);
  rows.forEach((r, k) => {
    const y = top + k * rowH;
    if (k % 2 === 0) {
      c.fillStyle = 'rgba(255,244,220,0.05)';
      c.fillRect(16, y, W - 32, rowH);
    }
    if (r.key === today) {
      rrect(c, 16, y + 1, W - 32, rowH - 2, 5);
      c.strokeStyle = 'rgba(255,207,122,0.7)';
      c.lineWidth = 1.5;
      c.stroke();
    }
    const mid = y + rowH / 2 + 5;
    c.textAlign = 'left';
    c.font = `600 ${W < 420 ? 14 : 15}px "Barlow Condensed", sans-serif`;
    c.fillStyle = r.key === today ? '#ffdf9a' : '#e8dcc0';
    c.fillText(r.key === today ? 'Heute' : dateLabel(r.key, true), colDate, mid);
    // 13 pips: one per day of the season, filled up to the day reached; a crown pip when won.
    for (let i = 0; i < 13; i++) {
      const cx = colPips + i * pipGap + pipGap / 2;
      const cy = y + rowH / 2;
      const filled = r.day >= 0 && i < Math.min(13, r.day);
      const failed = r.day >= 0 && r.day < 13 && i === r.day;
      c.beginPath();
      c.arc(cx, cy, Math.max(2.5, pipGap * 0.28) + (rnd() - 0.5) * 0.3, 0, Math.PI * 2);
      c.fillStyle = filled ? (i === 12 ? '#ff9ac0' : '#f0c868') : failed ? 'rgba(220,90,90,0.75)' : 'rgba(255,244,220,0.12)';
      c.fill();
      if (filled) {
        c.strokeStyle = 'rgba(22,10,20,0.8)';
        c.lineWidth = 1;
        c.stroke();
      }
    }
    c.textAlign = 'right';
    c.fillStyle = r.day >= 0 ? '#e8dcc0' : 'rgba(232,220,192,0.4)';
    c.fillText(r.day >= 0 ? (r.day >= 13 ? `Sieg · ${formatChips(r.balance)}` : `T${reachedDay(r.day)} · ${formatChips(r.balance)}`) : '–', W - 24, mid);
  });
}

export interface DailyBoardActions {
  start(kind: DailyStart): void;
  close(): void;
}

/** Shows the card inside the title overlay. `normal` is the player's normal save (name, board). */
export function showDailyBoard(normal: SaveData, actions: DailyBoardActions, justEnded: SaveData | null = null) {
  injectStyle();
  const title = document.getElementById('title')!;
  document.getElementById('daily-card')?.remove();
  title.hidden = false;
  title.classList.remove('out', 'arriving');
  document.getElementById('menu-main')!.hidden = true;
  const i = dailyInfo(normal);
  const card = document.createElement('div');
  card.className = 'card daily';
  card.id = 'daily-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-labelledby', 'daily-h');
  const h = document.createElement('h2');
  h.id = 'daily-h';
  h.textContent = `Tagesherausforderung · ${dateLabel(i.today)}`;
  card.appendChild(h);
  const body = document.createElement('div');
  body.className = 'card-body';
  card.appendChild(body);
  const p = (text: string, cls = '') => {
    const el = document.createElement('p');
    el.textContent = text;
    if (cls) el.className = cls;
    body.appendChild(el);
    return el;
  };
  const heat = MOON_LEVELS.findIndex((m) => m.name === dailyMoonName(i.today));
  const cond = document.createElement('div');
  cond.className = 'daily-cond';
  for (const t of ['1.000 Falter Start', `Mondstufe: ${dailyMoonName(i.today)}`, 'Gleiche Spiele, Ereignisse, Aufträge']) {
    const s = document.createElement('span');
    s.className = 'tag';
    s.textContent = t;
    cond.appendChild(s);
  }
  body.appendChild(cond);
  p(`Heute bekommen alle denselben Start: dieselben Spiele auf den Etagen, dieselben Ereignisse und Gäste-Aufträge${heat > 0 ? ` und Mondstufe ${MOON_LEVELS[heat].name} (${MOON_LEVELS[heat].twist.replace(/\.$/, '')})` : ''}. Die Runden selbst bleiben echter Zufall. Ein Versuch pro Tag zählt; der Lauf endet, wenn ein Tagesziel verfehlt wird oder die Saison gewonnen ist. Dein normaler Spielstand bleibt dabei unberührt.`);

  // Status line and the main button.
  const status = document.createElement('div');
  status.className = 'daily-status';
  body.appendChild(status);
  let primary: { label: string; kind: DailyStart } | null = null;
  let second: { label: string; kind: DailyStart } | null = null;
  if (justEnded) {
    const day = justEnded.counters.dailyEndDay ?? 0;
    const bal = justEnded.counters.dailyEndBal ?? 0;
    const won = day >= 13;
    status.textContent = `${isPractice(justEnded) ? 'Übungslauf' : 'Gewerteter Lauf'} vorbei: ${won ? 'Saison gewonnen!' : `Tag ${reachedDay(day)} erreicht`} · ${formatChips(bal)} Falter`;
  }
  if (i.openToday) {
    if (!justEnded) status.textContent = `Dein Versuch läuft: Tag ${i.run!.evening.number} · ${formatChips(i.run!.balance)} Falter`;
    primary = { label: 'Fortsetzen', kind: 'continue' };
  } else if (i.entry) {
    if (!justEnded) status.textContent = `Heute schon gespielt: ${i.entry.day >= 13 ? 'Saison gewonnen!' : `Tag ${reachedDay(i.entry.day)}`} · ${formatChips(i.entry.balance)} Falter`;
    if (i.practiceOpen) {
      primary = { label: 'Übung fortsetzen', kind: 'continue' };
      second = { label: 'Neue Übung', kind: 'practice' };
    } else primary = { label: 'Üben (zählt nicht)', kind: 'practice' };
  } else {
    if (!justEnded) status.textContent = i.staleOpen ? `Dein Lauf vom ${dateLabel(i.run!.dailySeed, true)} wird mit Tag ${i.run!.evening.number} gewertet, wenn du heute startest.` : 'Dein Versuch für heute ist noch offen.';
    primary = { label: 'Herausforderung starten', kind: 'new' };
  }
  if (!status.textContent) status.remove();

  p('Ehrlich gesagt: Die Bestenliste liegt nur auf diesem Gerät, es gibt keinen Server. Wer am selben Tag spielt, hat aber genau denselben Start, ihr könnt eure Ergebnisse also fair vergleichen.', 'daily-local');
  const cv = document.createElement('canvas');
  cv.className = 'daily-board';
  body.appendChild(cv);
  const rows = lastDays(i.best, i.today, 15);
  const pDay = i.run?.dailySeed === i.today ? i.run.counters.dailyPDay : undefined;
  const practice = pDay !== undefined && (i.run?.counters.dailyPBal ?? 0) > 0 ? { day: pDay, bal: i.run!.counters.dailyPBal ?? 0 } : null;
  const draw = () => paintBoard(cv, rows, i.today, practice);
  const played = rows.filter((r) => r.day >= 0);
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', `Bestenliste: ${played.length ? played.map((r) => `${dateLabel(r.key, true)} Tag ${reachedDay(r.day)}, ${formatChips(r.balance)} Falter`).join('; ') : 'noch keine Einträge'}`);

  const acts = document.createElement('div');
  acts.className = 'actions';
  const back = document.createElement('button');
  back.textContent = 'Zurück';
  back.addEventListener('click', () => {
    sfx.click();
    close();
    actions.close();
  });
  acts.appendChild(back);
  for (const b of [second, primary]) {
    if (!b) continue;
    const el = document.createElement('button');
    el.textContent = b.label;
    if (b === primary) el.className = 'primary';
    el.addEventListener('click', () => {
      sfx.click();
      close();
      actions.start(b.kind);
    });
    acts.appendChild(el);
  }
  card.appendChild(acts);
  title.appendChild(card);
  const onResize = () => draw();
  window.addEventListener('resize', onResize);
  requestAnimationFrame(draw);
  (acts.lastElementChild as HTMLElement).focus();
  function close() {
    window.removeEventListener('resize', onResize);
    card.remove();
  }
}
