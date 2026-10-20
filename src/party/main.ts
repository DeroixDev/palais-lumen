// Unser Party Spiel: screens (title, lobby solo/online, settings), starting and resuming an
// evening, and the glue to the network. The rules live in ./engine, the show in ./ui, the
// minigames in ./minigames, the boards in ./boards.

import './party.css';
import './ui/menus.css';
import { BOARDS, getBoard } from './boards';
import { newGame } from './engine/engine';
import { ranking } from './engine/state';
import { MINIGAMES } from './minigames';
import { minigamePhase, runFreeMinigame } from './minigames/flow';
import type { MgPlayer } from './minigames/types';
import { MAX_SEATS, PartyGuest, PartyHost, cleanCode, inviteLink, makeTransport, netText, validCode, type LobbyInfo } from './net/net';
import type { Presenter } from './ui/presenter';
import { GuestSession, HostSession, type FullState, type GameMsg, type SessionEnd } from './session';
import { setVolumes, sfx, startMusic, unlock } from './sfx';
import { clearSave, cleanName, loadProfile, loadSave, loadSettings, loadStats, saveProfile, saveSettings, saveStats, writeSave, type Profile } from './store';
import { BOT_NAMES, COLORS, FEATS, MG_TYPE_NAME, type BotLevel, type MgType, type Quality, type Rules, type Seat } from './types';
import { charSVG, starSVG } from './ui/avatars';
import { initInput } from './ui/input';
import { menu3d } from './ui/menu3d';
import { initMenuNav } from './ui/menunav';
import { buildShell } from './ui/shell';
import { $, $$, AUTO, esc, newSeed } from './util';
import { quality } from './view3d/quality';
import { disposeScene } from './view3d/kit';
import { initStage, perf, setView } from './view3d/stage';
import type { WeatherKind } from './view3d/atmo';

document.title = 'Unser Party Spiel';
buildShell($('#root'));

const settings = loadSettings();
const profile: Profile = loadProfile();
if (!profile.name) profile.name = 'Du';
setVolumes(settings.sound, settings.music);

let webgl = true;
try { initStage($('#stage'), $<HTMLCanvasElement>('#gl'), $('#labels')); quality.set(settings.quality); }
catch (e) { webgl = false; console.warn(e); $('#nogl').hidden = false; }
initInput();
initMenuNav();
if (!webgl) document.body.classList.add('nogl');

const coarseQ = matchMedia('(pointer: coarse)');
const syncCoarse = () => document.body.classList.toggle('coarse', coarseQ.matches || innerWidth < 760);
syncCoarse();
addEventListener('resize', syncCoarse);
addEventListener('pointerdown', () => unlock(), { once: true });
addEventListener('keydown', () => unlock(), { once: true });

// ---------------- screens ----------------
// The menus sit on the live 3D backdrop (./ui/menu3d): a board at night with a slow camera
// drift; the game screen (#app) stays underneath and shows the backdrop while a menu is open.
type Screen = 'title' | 'lobby' | 'game';
let screen: Screen = 'title';
const wideQ = matchMedia('(min-width: 900px)');
function show(s: Screen) {
  screen = s;
  $('#scrTitle').hidden = s !== 'title';
  $('#scrLobby').hidden = s !== 'lobby';
  document.body.classList.toggle('in-menu', s !== 'game');
  if (s !== 'game') {
    startMusic('menu');
    if (webgl) menu3d.show(backdropBoard());
  } else menu3d.hide();
  scrollTo(0, 0);
}
/** The board behind the menu: the one picked for the next evening. */
function backdropBoard() {
  if (lobby.kind === 'host') return lobby.host.rules.board;
  if (lobby.kind === 'guest' && lobby.info) return lobby.info.rules.board;
  return settings.rules.board;
}

// top bar buttons (all screens)
document.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'settings') { unlock(); openSettings(); }
  else if (act === 'mute') { unlock(); toggleMute(); }
});
let muted = false;
function toggleMute() {
  muted = !muted;
  setVolumes(muted ? 0 : settings.sound, muted ? 0 : settings.music);
  $$('.ib.mute').forEach((b) => { b.classList.toggle('off', muted); b.setAttribute('aria-pressed', String(muted)); b.setAttribute('aria-label', muted ? 'Ton an' : 'Ton aus'); });
}

/** Re-renders a part of the menu and gives the focus back to the same control (keyboard, controller). */
function keepFocus(root: HTMLElement, render: () => void) {
  const a = document.activeElement as HTMLElement | null;
  let sel: string | null = null, caret: number | null = null;
  if (a && root.contains(a)) {
    if (a.id) sel = '#' + a.id;
    else {
      const d = Object.entries(a.dataset)[0];
      if (d) {
        sel = `[data-${d[0].replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}="${CSS.escape(d[1] ?? '')}"]`;
        const seg = a.closest<HTMLElement>('[data-seg]');
        if (seg && seg !== a) sel = `[data-seg="${seg.dataset.seg}"] ${sel}`;
      }
    }
    if (a instanceof HTMLInputElement && a.type === 'text') caret = a.selectionStart;
  }
  render();
  if (!sel) return;
  const n = root.querySelector<HTMLElement>(sel);
  if (!n) return;
  n.focus({ preventScroll: true });
  if (caret !== null && n instanceof HTMLInputElement) n.setSelectionRange(caret, caret);
}

// ---------------- icons ----------------
const IC = {
  play: '<svg viewBox="0 0 48 48"><path d="M15 9 L39 24 L15 39 Z" fill="#0b0614"/></svg>',
  dice: '<svg viewBox="0 0 48 48"><rect x="7" y="7" width="34" height="34" rx="8" fill="#fff" stroke="#0b0614" stroke-width="3.5"/><circle cx="17" cy="17" r="3.4" fill="#0b0614"/><circle cx="31" cy="31" r="3.4" fill="#0b0614"/><circle cx="24" cy="24" r="3.4" fill="#0b0614"/><circle cx="31" cy="17" r="3.4" fill="#0b0614"/><circle cx="17" cy="31" r="3.4" fill="#0b0614"/></svg>',
  online: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="17" fill="#fff" stroke="#0b0614" stroke-width="3.5"/><path d="M7 24h34M24 7c-8 9-8 25 0 34M24 7c8 9 8 25 0 34" stroke="#0b0614" stroke-width="3" fill="none"/></svg>',
  pad: '<svg viewBox="0 0 48 48"><path d="M12 15h24a9 9 0 0 1 9 9l-1 9a6 6 0 0 1-11 2l-2-3H17l-2 3a6 6 0 0 1-11-2l-1-9a9 9 0 0 1 9-9z" fill="#fff" stroke="#0b0614" stroke-width="3.2" stroke-linejoin="round"/><path d="M14 21v8M10 25h8" stroke="#0b0614" stroke-width="3.2" stroke-linecap="round"/><circle cx="32" cy="22" r="2.6" fill="#ff3d9a"/><circle cx="36" cy="28" r="2.6" fill="#2fe6ff"/></svg>',
  gear: '<svg viewBox="0 0 48 48"><path d="M24 6l4 5 6-2 1 6 6 2-2 6 5 4-5 4 2 6-6 2-1 6-6-2-4 5-4-5-6 2-1-6-6-2 2-6-5-4 5-4-2-6 6-2 1-6 6 2z" fill="#fff" stroke="#0b0614" stroke-width="3" stroke-linejoin="round"/><circle cx="24" cy="24" r="6" fill="#ff3d9a" stroke="#0b0614" stroke-width="3"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// ---------------- settings ----------------
function openSettings() {
  const card = $('#setCard');
  const qs: [Quality, string, string][] = [['auto', 'Auto', 'passt sich an'], ['hoch', 'Hoch', 'Bloom, Schatten'], ['mittel', 'Mittel', 'ausgewogen'], ['niedrig', 'Niedrig', 'schwache Geräte']];
  card.innerHTML = `
    <div class="set-head"><span class="kick">Pause-Menü</span><h2 id="setTitle">Einstellungen</h2><button class="xbtn" type="button" id="setX" aria-label="Schließen" data-back>×</button></div>
    <div class="set-sec"><h3>Ton</h3>
      <label class="rng"><span>Effekte</span><input type="range" min="0" max="100" value="${Math.round(settings.sound * 100)}" id="sSound" style="--v:${Math.round(settings.sound * 100)}%"><output id="oSound">${Math.round(settings.sound * 100)}</output></label>
      <label class="rng"><span>Musik</span><input type="range" min="0" max="100" value="${Math.round(settings.music * 100)}" id="sMusic" style="--v:${Math.round(settings.music * 100)}%"><output id="oMusic">${Math.round(settings.music * 100)}</output></label>
    </div>
    <div class="set-sec"><h3>Grafik</h3>
      <div class="seg big q4" role="radiogroup" id="sQual" aria-label="Grafik">${qs.map(([q, n, sub]) => `<button type="button" role="radio" aria-checked="${settings.quality === q}" data-q="${q}"><b>${n}</b><small>${sub}</small></button>`).join('')}</div>
      <span class="q-now" id="qNow"></span>
    </div>
    <div class="set-foot"><button class="mbtn go" type="button" id="setClose">Fertig</button></div>`;
  const qNow = () => { const c = quality.current(); $('#qNow').textContent = `Gerade: Pixeldichte ${c.dpr.toFixed(2)} · Schatten ${c.shadow ? Math.round(c.shadow * 100) + ' %' : 'aus'} · ${Math.round(perf.fps) || '–'} Bilder/s${settings.quality === 'auto' ? ' · passt sich selbst an' : ''}${screen !== 'game' ? ' · im Menü sparsamer' : ''}`; };
  qNow();
  const iv = window.setInterval(qNow, 1000);
  const vol = () => { if (!muted) setVolumes(settings.sound, settings.music); saveSettings(settings); };
  const fill = (e: Event) => { const t = e.target as HTMLInputElement; t.style.setProperty('--v', t.value + '%'); };
  $<HTMLInputElement>('#sSound').oninput = (e) => { fill(e); settings.sound = Number((e.target as HTMLInputElement).value) / 100; $('#oSound').textContent = String(Math.round(settings.sound * 100)); vol(); sfx.coin(); };
  $<HTMLInputElement>('#sMusic').oninput = (e) => { fill(e); settings.music = Number((e.target as HTMLInputElement).value) / 100; $('#oMusic').textContent = String(Math.round(settings.music * 100)); vol(); };
  $('#sQual').onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-q]');
    if (!b) return;
    sfx.pop();
    settings.quality = b.dataset.q as Quality;
    quality.set(settings.quality);
    saveSettings(settings);
    $$('#sQual button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    qNow();
  };
  const ov = $('#ovSet');
  const back = document.activeElement as HTMLElement | null;
  const close = () => { ov.classList.remove('open'); clearInterval(iv); removeEventListener('keydown', esc1); if (back?.isConnected) back.focus({ preventScroll: true }); };
  const esc1 = (e: KeyboardEvent) => { if (e.code === 'Escape') close(); };
  addEventListener('keydown', esc1);
  $('#setClose').onclick = close;
  $('#setX').onclick = close;
  ov.onclick = (e) => { if (e.target === ov || (e.target as HTMLElement).classList.contains('ov-in')) close(); };
  ov.classList.add('open');
  $<HTMLButtonElement>('#setClose').focus({ preventScroll: true });
}

// ---------------- title ----------------
interface Saved { seats: Seat[]; me: number; st: FullState }
function renderTitle() {
  lobby = { kind: 'solo' };
  const save = loadSave<Saved>();
  const items: { id: string; t: string; s: string; ic: string; cls: string }[] = [];
  if (save) {
    const st = save.data.st, b = getBoard(st.rules.board);
    const me = save.data.seats[save.data.me];
    const pos = ranking(st).indexOf(save.data.me) + 1;
    items.push({ id: 'resume', t: 'Weiterspielen', s: `Runde ${st.round} / ${st.rules.rounds} · ${b.name}${me ? ` · Platz ${pos}` : ''}`, ic: IC.play, cls: 'resume' });
  }
  items.push(
    { id: 'solo', t: 'Solo mit Bots', s: '1 bis 3 Bots, sofort los', ic: IC.dice, cls: save ? '' : 'go' },
    { id: 'online', t: 'Online spielen', s: 'Raum mit Code, bis zu 3 Freunde', ic: IC.online, cls: '' },
    { id: 'practice', t: 'Minispiele üben', s: `${MINIGAMES.length} Spiele, zählt nicht`, ic: IC.pad, cls: '' },
    { id: 'settings', t: 'Einstellungen', s: 'Ton, Grafik', ic: IC.gear, cls: 'small' },
  );
  const thumb = save ? boardThumb(save.data.st.rules.board) : '';
  $('#menu').innerHTML = items.map((m, i) => `<button class="mitem ${m.cls}" type="button" data-m="${m.id}" style="--i:${i}">
      ${m.id === 'resume' && thumb ? `<span class="mi-thumb"><img src="${thumb}" alt=""></span>` : ''}
      <span class="mi-ic">${m.ic}</span><span class="mi-txt"><b>${m.t}</b><small>${esc(m.s)}</small></span>
      ${m.id === 'resume' ? `<span class="mi-seats">${save!.data.seats.map((p) => `<i style="--pc:${p.color}">${charSVG(p, true)}</i>`).join('')}</span>` : ''}
      <span class="mi-chev">${IC.chev}</span></button>`).join('');
  const stats = loadStats();
  $('#menuNote').innerHTML = stats.evenings
    ? `<span class="pill"><b>${stats.evenings}</b> Abend${stats.evenings > 1 ? 'e' : ''}</span><span class="pill"><b>${stats.wins}</b> gewonnen</span><span class="pill"><b>${stats.stars}</b> ${starSVG()} gesammelt</span>`
    : '<span class="pill">Neu hier? Ein Abend mit 10 Runden dauert etwa 30 Minuten.</span>';
  $('#menu').onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-m]');
    if (!b) return;
    unlock();
    sfx.pop();
    const m = b.dataset.m;
    if (m === 'resume' && save) startSolo(save.data);
    else if (m === 'solo') openLobby({ kind: 'solo' });
    else if (m === 'online') openLobby({ kind: 'online' });
    else if (m === 'practice') openLobby({ kind: 'practice' });
    else if (m === 'settings') openSettings();
  };
  show('title');
  if (webgl) menu3d.board(save ? save.data.st.rules.board : settings.rules.board);
  if (!webgl) $('#cast').innerHTML = FEATS.map((f, i) => charSVG({ color: COLORS[[1, 0, 2, 3][i]], acc: f.acc, feat: f.id })).join('');
  else { menu3d.slot($('#cast'), 'cast', '', null); titleLook(); }
  setTimeout(() => { if (screen === 'title' && (AUTO || document.body.classList.contains('kbnav'))) ($('#menu [data-m]') as HTMLElement | null)?.focus(); }, 0);
}

// ---------------- lobby ----------------
type Lobby =
  | { kind: 'solo' }
  | { kind: 'online'; err?: string; busy?: boolean }
  | { kind: 'host'; host: PartyHost; note?: string }
  | { kind: 'guest'; guest: PartyGuest; info: LobbyInfo | null; session: GuestSession }
  | { kind: 'practice' };
let lobby: Lobby = { kind: 'solo' };
let fillBots = true;
/** The open tab of the lobby ('figur' only on narrow screens: wide ones show the figure beside). */
let tab = 'figur';
const TABS: Record<Lobby['kind'], [string, string][]> = {
  solo: [['figur', 'Figur'], ['brett', 'Brett'], ['regeln', 'Regeln'], ['mit', 'Mitspieler']],
  online: [['figur', 'Figur'], ['raum', 'Raum']],
  host: [['figur', 'Figur'], ['raum', 'Raum'], ['brett', 'Brett'], ['regeln', 'Regeln']],
  guest: [['figur', 'Figur'], ['tisch', 'Am Tisch'], ['regeln', 'Regeln']],
  practice: [],
};
const DEF_TAB: Record<Lobby['kind'], string> = { solo: 'figur', online: 'raum', host: 'raum', guest: 'tisch', practice: '' };

function openLobby(l: Lobby) {
  if (l.kind !== lobby.kind) tab = DEF_TAB[l.kind];
  lobby = l;
  show('lobby');
  renderLobby();
  if (AUTO || document.body.classList.contains('kbnav')) ($('#lobby .tab[aria-selected="true"]') ?? $('#lobby button')) ?.focus?.({ preventScroll: true });
}

const segHTML = <T extends string | number>(id: string, opts: [T, string, string?][], cur: T, dis = false, cls = '') =>
  `<div class="seg ${cls}" role="radiogroup" data-seg="${id}">${opts.map(([v, n, sub]) => `<button type="button" role="radio" aria-checked="${v === cur}" data-v="${v}"${dis ? ' disabled' : ''}><b>${n}</b>${sub ? `<small>${sub}</small>` : ''}</button>`).join('')}</div>`;

function usedColors(): Set<string> {
  if (lobby.kind === 'host') return new Set(lobby.host.seats.slice(1).map((s) => s.color));
  if (lobby.kind === 'guest' && lobby.info) { const you = lobby.info.you; return new Set(lobby.info.seats.filter((_, i) => i !== you).map((s) => s.color)); }
  return new Set();
}

/** Board thumbnails (rendered from the boards, see devpages/_party-menu-thumbs.mjs). */
const THUMBS = import.meta.glob('./ui/thumbs/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const boardThumb = (id: string) => THUMBS[`./ui/thumbs/${id}.jpg`] ?? '';

function meHTML() {
  const used = usedColors();
  const f = FEATS.find((x) => x.id === profile.feat) ?? FEATS[0];
  return `<section class="me" aria-label="Deine Figur">
    <div class="me-stage">
      <div class="stage3d" id="pickSlot">${webgl ? '' : `<div class="svgcast">${charSVG({ color: profile.color, acc: f.acc, feat: f.id })}</div>`}</div>
      <span class="me-name" style="--pc:${profile.color}">${esc(profile.name || 'Du')}</span>
    </div>
    <div class="card me-body">
    <div class="figs" role="radiogroup" aria-label="Figur">${FEATS.map((x) => `<button type="button" role="radio" aria-checked="${profile.feat === x.id}" data-feat="${x.id}">${webgl ? '' : charSVG({ color: profile.color, acc: x.acc, feat: x.id })}<b>${x.name}</b></button>`).join('')}</div>
    <label class="fld"><span>Name</span><input type="text" id="lName" maxlength="12" value="${esc(profile.name)}" autocomplete="nickname"></label>
    <div class="fld"><span>Farbe · jede gibt es nur einmal am Tisch</span><div class="sws" role="radiogroup" aria-label="Farbe">${COLORS.map((c) => `<button type="button" class="sw" role="radio" aria-label="Farbe ${c}" aria-checked="${profile.color === c}" data-col="${c}" style="--pc:${c}"${used.has(c) ? ' disabled' : ''}></button>`).join('')}</div></div>
    </div>
  </section>`;
}

function boardsHTML(r: Rules, ro: boolean) {
  const list = ro ? BOARDS.filter((b) => b.id === r.board) : BOARDS;
  return `<div class="bpicks${ro ? ' ro' : ''}" role="radiogroup" aria-label="Brett">${list.map((b) => `<button type="button" class="bpick" role="radio" aria-checked="${r.board === b.id}" data-board="${b.id}"${ro ? ' disabled' : ''}>
      <span class="bp-img">${boardThumb(b.id) ? `<img src="${boardThumb(b.id)}" alt="" loading="lazy">` : ''}<em class="bp-tag">Gewählt</em></span>
      <span class="bp-txt"><b>${esc(b.name)}</b><small>${esc(b.blurb)}</small></span></button>`).join('')}</div>`;
}

function rulesHTML(r: Rules, ro: boolean) {
  const types = (Object.keys(MG_TYPE_NAME) as MgType[]);
  const avail = new Set(MINIGAMES.map((m) => m.type));
  return `<div class="fld"><span>Runden</span>${segHTML('rounds', [[10, '10', 'ca. 30 Min'], [15, '15', 'ca. 45 Min'], [20, '20', 'ca. 60 Min']], r.rounds, ro, 'big')}</div>
    <label class="tog big"><input type="checkbox" id="lProfi"${r.profi ? ' checked' : ''}${ro ? ' disabled' : ''}><span class="tog-ui"></span><span class="tog-txt"><b>Profi-Regeln</b><small>Weniger Glück: keine Platztausch-Ereignisse, keine Glücks-Minispiele, kein Sterneklau.</small></span></label>
    <div class="fld"><span>Minispiel-Arten</span><div class="types">${types.map((t) => `<label class="tog chip-t"><input type="checkbox" data-type="${t}"${r.types[t] !== false ? ' checked' : ''}${ro ? ' disabled' : ''}><span class="tog-ui"></span><span class="tog-txt"><b>${MG_TYPE_NAME[t]}</b>${avail.has(t) || t === 'muenz' ? '' : '<small>noch keins dabei</small>'}</span></label>`).join('')}</div></div>`;
}

function seatsHTML(list: { name: string; color: string; acc: string; feat: Seat['feat']; sub: string; x?: number }[], max = 0) {
  const free = Math.max(0, max - list.length);
  return `<ul class="seats">${list.map((s, i) => `<li class="seat" style="--pc:${s.color};--i:${i}"><span class="r-ava">${charSVG(s, true)}</span><span><b>${esc(s.name)}</b><small>${esc(s.sub)}</small></span>${s.x !== undefined ? `<button class="x" type="button" data-rm="${s.x}" aria-label="${esc(s.name)} entfernen">×</button>` : '<span></span>'}</li>`).join('')}${'<li class="seat free"><span class="r-ava"></span><span><b>Freier Platz</b><small>wartet auf einen Freund</small></span><span></span></li>'.repeat(free)}</ul>`;
}

function soloBots(n: number, level: BotLevel): Seat[] {
  const out: Seat[] = [];
  const cols = COLORS.filter((c) => c !== profile.color);
  for (let i = 0; i < n; i++) {
    const f = FEATS[(FEATS.findIndex((x) => x.id === profile.feat) + 1 + i) % 4];
    out.push({ id: 'bot-' + i, name: BOT_NAMES[i], color: cols[i], feat: f.id, acc: f.acc, kind: 'bot', bot: level });
  }
  return out;
}

const LVL: [BotLevel, string, string][] = [['leicht', 'Leicht', 'gemütlich'], ['normal', 'Normal', 'fair'], ['stark', 'Stark', 'gnadenlos']];

/** One pane of the lobby. */
function paneHTML(t: string): string {
  const L = lobby;
  if (L.kind === 'solo') {
    if (t === 'brett') return `<h3 class="ph">Wähle das Brett</h3>${boardsHTML(settings.rules, false)}`;
    if (t === 'regeln') return `<h3 class="ph">Regeln</h3>${rulesHTML(settings.rules, false)}`;
    const bots = soloBots(settings.bots, settings.botLevel);
    return `<h3 class="ph">Mitspieler</h3>
      <div class="fld"><span>Bots</span>${segHTML('bots', [[1, '1 Bot'], [2, '2 Bots'], [3, '3 Bots']], settings.bots, false, 'big')}</div>
      <div class="fld"><span>Stärke</span>${segHTML('level', LVL, settings.botLevel, false, 'big')}</div>
      ${seatsHTML([{ ...profile, acc: FEATS.find((f) => f.id === profile.feat)!.acc, sub: 'Du · hier am Gerät' }, ...bots.map((b) => ({ ...b, sub: `Bot · ${b.bot}` }))])}`;
  }
  if (L.kind === 'online') {
    return `<h3 class="ph">Online spielen</h3>
      <p class="lead">Öffne einen Raum und schick deinen Freunden den Code. Bis zu drei können mitspielen, freie Plätze übernehmen Bots.</p>
      <button class="mbtn go wide" type="button" data-l="host"${L.busy ? ' disabled' : ''}><span class="mi-ic">${IC.online}</span><span><b>Raum öffnen</b><small>Du bist Gastgeber</small></span></button>
      <div class="or"><span>oder</span></div>
      <div class="join"><label class="fld"><span>Code von einem Freund</span><input type="text" id="lCode" maxlength="40" placeholder="z. B. KXMPR" autocomplete="off" autocapitalize="characters"></label><button class="mbtn" type="button" data-l="join"${L.busy ? ' disabled' : ''}>Beitreten</button></div>
      <p class="err" role="alert">${esc(L.err ?? '')}</p>`;
  }
  if (L.kind === 'host') {
    const H = L.host;
    if (t === 'brett') return `<h3 class="ph">Wähle das Brett</h3>${boardsHTML(H.rules, false)}`;
    if (t === 'regeln') return `<h3 class="ph">Regeln</h3>${rulesHTML(H.rules, false)}`;
    return `<div class="code"><span class="code-k">Raum-Code</span><b id="roomCode">${H.code}</b><button class="mbtn sm" type="button" data-l="copy">Link kopieren</button></div>
      <p class="invite">Einladungslink: <span id="invite">${esc(inviteLink(H.code))}</span></p>
      ${seatsHTML(H.seats.map((s, i) => ({ ...s, sub: i === 0 ? 'Gastgeber · du' : s.kind === 'bot' ? `Bot · ${s.bot}` : s.online ? 'Freund · verbunden' : 'Freund · weg', x: i > 0 ? i : undefined })), MAX_SEATS)}
      <div class="botrow">${segHTML('level', LVL.map(([v, n]) => [v, n] as [BotLevel, string]), settings.botLevel)}<button class="mbtn sm" type="button" data-l="addbot"${H.seats.length >= MAX_SEATS ? ' disabled' : ''}>+ Bot dazu</button></div>
      <label class="tog"><input type="checkbox" id="lFill"${fillBots ? ' checked' : ''}><span class="tog-ui"></span><span class="tog-txt"><b>Freie Plätze mit Bots füllen</b><small>Beim Start bis 4 Plätze.</small></span></label>
      <p class="err" role="status">${esc(L.note ?? '')}</p>`;
  }
  if (L.kind === 'guest') {
    const I = L.info;
    if (t === 'regeln') return I ? `<h3 class="ph">Brett und Regeln</h3><p class="lead">Der Gastgeber legt die Regeln fest.</p>${boardsHTML(I.rules, true)}${rulesHTML(I.rules, true)}` : '<p class="lead">Verbinde …</p>';
    return `<h3 class="ph">Am Tisch</h3>${I ? seatsHTML(I.seats.map((s, i) => ({ ...s, sub: (i === I.you ? 'Du · ' : '') + (s.kind === 'host' ? 'Gastgeber' : s.kind === 'bot' ? `Bot · ${s.bot}` : s.online ? 'Freund · verbunden' : 'Freund · weg') })), MAX_SEATS) : '<p class="lead">Verbinde …</p>'}`;
  }
  return '';
}

function renderLobby() {
  const L = lobby, el = $('#lobby');
  const wide = wideQ.matches;
  keepFocus(el, () => {
    if (L.kind === 'practice') {
      $('#lobbyKind').textContent = 'Minispiele üben';
      el.innerHTML = `<div class="lb-wrap" data-kind="practice">
        <header class="lb-head"><button class="mbtn sm ghost" type="button" data-l="back" data-back>${IC.back}<span>Zurück</span></button><div class="lb-tt"><small>Training</small><h2>Minispiele üben</h2></div></header>
        <p class="lead">Jedes Minispiel mit Bots ausprobieren. Zählt nicht für den Abend.</p>
        <div class="mgrid">${MINIGAMES.map((m, i) => `<button type="button" class="mgtile t-${m.type}" data-mg="${m.id}" style="--i:${i}"><em>${MG_TYPE_NAME[m.type]}</em><b>${esc(m.name)}</b><small>${esc(m.card.sub)}</small></button>`).join('')}</div>
      </div>`;
      return;
    }
    const tabs = TABS[L.kind].filter(([id]) => !(wide && id === 'figur'));
    if (!tabs.some(([id]) => id === tab)) tab = tabs[0][0];
    const kick = L.kind === 'solo' ? 'Neuer Abend' : L.kind === 'online' ? 'Mit Freunden' : L.kind === 'host' ? 'Gastgeber' : 'Gast';
    const title = L.kind === 'solo' ? 'Solo mit Bots' : L.kind === 'online' ? 'Online spielen' : L.kind === 'host' ? `Raum ${L.host.code}` : `Raum ${L.guest.code}`;
    $('#lobbyKind').textContent = L.kind === 'host' || L.kind === 'guest' ? title : title;
    const backBtn = L.kind === 'host' ? `<button class="mbtn sm ghost" type="button" data-l="close" data-back>${IC.back}<span>Raum schließen</span></button>`
      : L.kind === 'guest' ? `<button class="mbtn sm ghost" type="button" data-l="leave" data-back>${IC.back}<span>Raum verlassen</span></button>`
        : `<button class="mbtn sm ghost" type="button" data-l="back" data-back>${IC.back}<span>Zurück</span></button>`;
    let foot = '';
    if (L.kind === 'solo') foot = `<span class="hint">Gespeichert wird nach jedem Zug. Du kannst jederzeit aufhören und später weiterspielen.</span><button class="mbtn go xl" type="button" data-l="start">Los geht’s!</button>`;
    else if (L.kind === 'host') foot = `<span class="hint">${L.host.seats.length}/${MAX_SEATS} Plätze · ${esc(getBoard(L.host.rules.board).name)} · ${L.host.rules.rounds} Runden</span><button class="mbtn go xl" type="button" data-l="hstart">Abend starten</button>`;
    else if (L.kind === 'guest') foot = `<span class="hint wait">${L.info?.started ? 'Der Abend läuft gerade.' : 'Warte, bis der Gastgeber den Abend startet …'}</span>`;
    const showMe = wide || tab === 'figur';
    const pane = tab === 'figur' ? '' : paneHTML(tab);
    el.innerHTML = `<div class="lb-wrap" data-kind="${L.kind}" data-tab="${tab}">
      <header class="lb-head">${backBtn}<div class="lb-tt"><small>${kick}</small><h2>${esc(title)}</h2></div></header>
      <nav class="tabs" role="tablist" aria-label="Vorbereitung">${tabs.map(([id, n]) => `<button type="button" class="tab" role="tab" aria-selected="${id === tab}" data-tab="${id}">${n}</button>`).join('')}</nav>
      <div class="lb-grid">${showMe ? meHTML() : ''}${pane ? `<section class="card pane" role="tabpanel">${pane}</section>` : ''}</div>
      ${foot ? `<footer class="lb-foot">${foot}</footer>` : ''}
    </div>`;
  });
  if (webgl) {
    menu3d.board(backdropBoard());
    menu3d.shift(0);
    menu3d.shade('lobby');
    const slot = document.getElementById('pickSlot');
    menu3d.slot(slot, 'pick', profile.color, profile.feat);
  }
}
wideQ.addEventListener('change', () => { if (screen === 'lobby') renderLobby(); else if (screen === 'title') titleLook(); });
function titleLook() { menu3d.shift(wideQ.matches ? 0.22 : 0); menu3d.shade(wideQ.matches ? 'title' : 'titleNarrow'); }

// lobby events (delegated once)
$('#lobby').addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === 'lName') { profile.name = cleanName(t.value) || 'Du'; saveProfile(profile); pushMe(); const n = document.querySelector('.me-name'); if (n) n.textContent = profile.name; }
});
$('#lobby').addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement;
  const r = rulesOf();
  if (t.id === 'lFill') { fillBots = t.checked; return; }
  if (!r) return;
  if (t.id === 'lProfi') r.profi = t.checked;
  else if (t.dataset.type) {
    r.types[t.dataset.type as MgType] = t.checked;
    if (!Object.values(r.types).some(Boolean)) { r.types.ffa = true; t.checked = t.dataset.type === 'ffa'; }
  } else return;
  commitRules(r);
});
$('#lobby').addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  // a click on the figure stage picks the figure under it
  if (t.id === 'pickSlot' && webgl) {
    const i = menu3d.pickAt((e as MouseEvent).clientX);
    if (i >= 0 && FEATS[i].id !== profile.feat) { unlock(); profile.feat = FEATS[i].id; saveProfile(profile); sfx.jump(); pushMe(); renderLobby(); }
    return;
  }
  const b = t.closest<HTMLButtonElement>('button');
  if (!b || b.disabled) return;
  unlock();
  const L = lobby;
  if (b.dataset.tab) { if (b.dataset.tab !== tab) { tab = b.dataset.tab; sfx.pop(); renderLobby(); } return; }
  if (b.dataset.feat) { profile.feat = b.dataset.feat as Profile['feat']; saveProfile(profile); sfx.jump(); pushMe(); renderLobby(); return; }
  if (b.dataset.col) { profile.color = b.dataset.col; saveProfile(profile); sfx.pop(); pushMe(); renderLobby(); return; }
  if (b.dataset.board) { const r = rulesOf(); if (r) { r.board = b.dataset.board; commitRules(r); } return; }
  if (b.dataset.mg) { void practice(b.dataset.mg); return; }
  if (b.dataset.rm && L.kind === 'host') { L.host.removeSeat(Number(b.dataset.rm)); renderLobby(); return; }
  const seg = b.closest<HTMLElement>('[data-seg]');
  if (seg && b.dataset.v !== undefined) {
    sfx.pop();
    const v = b.dataset.v, id = seg.dataset.seg;
    if (id === 'bots') settings.bots = Number(v);
    else if (id === 'level') settings.botLevel = v as BotLevel;
    else if (id === 'rounds') { const r = rulesOf(); if (r) { r.rounds = Number(v) as Rules['rounds']; commitRules(r); } return; }
    saveSettings(settings);
    renderLobby();
    return;
  }
  switch (b.dataset.l) {
    case 'back': renderTitle(); break;
    case 'start': if (L.kind === 'solo') startNewSolo(); break;
    case 'host': void openHost(); break;
    case 'join': void join($<HTMLInputElement>('#lCode').value); break;
    case 'copy': if (L.kind === 'host') void navigator.clipboard?.writeText(inviteLink(L.host.code)).then(() => { L.note = 'Link kopiert.'; renderLobby(); }, () => { L.note = 'Kopieren ging nicht. Schick den Code.'; renderLobby(); }); break;
    case 'addbot': if (L.kind === 'host') { L.host.addBot(settings.botLevel); renderLobby(); } break;
    case 'close': if (L.kind === 'host') { L.host.close(); renderTitle(); } break;
    case 'leave': if (L.kind === 'guest') { L.guest.leave(); renderTitle(); } break;
    case 'hstart': if (L.kind === 'host') startHost(L.host); break;
  }
});
$('#lobby').addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (t.id === 'lCode' && e.key === 'Enter') { e.preventDefault(); void join((t as HTMLInputElement).value); }
});

function rulesOf(): Rules | null {
  if (lobby.kind === 'solo') return settings.rules;
  if (lobby.kind === 'host') return structuredClone(lobby.host.rules);
  return null;
}
function commitRules(r: Rules) {
  sfx.pop();
  settings.rules = structuredClone(r);
  saveSettings(settings);
  if (lobby.kind === 'host') lobby.host.setRules(r);
  renderLobby();
}
function pushMe() {
  const me = { name: profile.name, feat: profile.feat, color: profile.color };
  if (lobby.kind === 'host') lobby.host.setMe(me);
  else if (lobby.kind === 'guest') lobby.guest.pick(me);
}

// ---------------- solo ----------------
function startNewSolo() {
  const me: Seat = { id: profile.id, name: profile.name || 'Du', color: profile.color, feat: profile.feat, acc: FEATS.find((f) => f.id === profile.feat)!.acc, kind: 'local', bot: 'normal' };
  const seats = [me, ...soloBots(settings.bots, settings.botLevel)];
  const st = newGame(seats, structuredClone(settings.rules), newSeed());
  clearSave();
  writeSave({ seats, me: 0, st });
  startSolo({ seats, me: 0, st });
}

let session: HostSession | null = null;
let guestSession: GuestSession | null = null;

async function startSolo(saved: Saved) {
  if (!webgl) { alert('Ohne WebGL geht Unser Party Spiel leider nicht.'); return; }
  show('game');
  const s = new HostSession(saved.seats, saved.me, saved.st, null);
  session = s;
  void s.run();
  const end = await s.ended;
  clearSave();
  countStats(end);
  session = null;
  setView(null);
  endShow(s.pres);
  if (end.pick === 'again') openLobby({ kind: 'solo' }); else renderTitle();
}

/** The evening's board and HUD are done: free them (the menu builds its own backdrop). */
function endShow(pres: Presenter | null) {
  if (!pres) return;
  try { pres.dispose(); disposeScene(pres.view.scene); } catch (e) { console.warn(e); }
}

function countStats(end: SessionEnd) {
  const stats = loadStats();
  stats.evenings++;
  if (ranking(end.st)[0] === end.me) stats.wins++;
  stats.stars += end.st.players[end.me]?.stars ?? 0;
  saveStats(stats);
}

async function practice(id: string) {
  if (!webgl) return;
  const def = MINIGAMES.find((m) => m.id === id)!;
  const [, max] = def.players ?? [2, 4];
  const n = def.type === 'duell' ? 2 : def.type === '2v2' ? 4 : Math.min(4, max);
  const teams = def.type === '1v3' ? [0, 1, 1, 1] : def.type === '2v2' ? [0, 0, 1, 1] : [0, 1, 2, 3];
  const meAcc = FEATS.find((f) => f.id === profile.feat)!.acc;
  const bots = soloBots(3, settings.botLevel);
  const players: MgPlayer[] = [{ seat: 0, name: profile.name || 'Du', color: profile.color, acc: meAcc, feat: profile.feat, team: teams[0], bot: null },
    ...bots.slice(0, n - 1).map((b, i) => ({ seat: i + 1, name: b.name, color: b.color, acc: b.acc, feat: b.feat, team: teams[i + 1], bot: b.bot }))];
  show('game');
  setView(null);
  await runFreeMinigame(id, players);
  show('lobby');
  renderLobby();
}

// ---------------- online ----------------
/** Online id: the profile plus this tab (two tabs of one browser are two players; a reload keeps the seat). */
function netId() {
  let t = '';
  try { t = sessionStorage.getItem('partyunser.tab') ?? ''; if (!t) { t = newSeed().toString(36); sessionStorage.setItem('partyunser.tab', t); } } catch { t = newSeed().toString(36); }
  return `${profile.id}-${t}`;
}
async function openHost() {
  if (lobby.kind !== 'online') return;
  lobby.busy = true;
  lobby.err = '';
  renderLobby();
  try {
    const host = await PartyHost.open(makeTransport(), { id: netId(), name: profile.name, feat: profile.feat, color: profile.color }, structuredClone(settings.rules));
    host.onLobby = () => { if (lobby.kind === 'host' && lobby.host === host && screen === 'lobby') renderLobby(); };
    host.onNote = (t) => { if (lobby.kind === 'host' && lobby.host === host) { lobby.note = t; if (screen === 'lobby') renderLobby(); } };
    openLobby({ kind: 'host', host });
  } catch (e) {
    lobby = { kind: 'online', err: netText(e) };
    renderLobby();
  }
}

async function startHost(host: PartyHost) {
  if (!webgl) return;
  if (fillBots) while (host.seats.length < MAX_SEATS) host.addBot(settings.botLevel);
  if (host.seats.length < 2) host.addBot(settings.botLevel);
  host.started = true;
  host.broadcastLobby();
  const seats: Seat[] = host.seats.map((s) => ({ id: s.id, name: s.name, color: s.color, feat: s.feat, acc: s.acc, kind: s.kind === 'host' ? 'local' : s.kind === 'bot' ? 'bot' : 'remote', bot: s.bot, away: s.kind === 'friend' && !s.online }));
  const st = newGame(seats, structuredClone(host.rules), newSeed());
  show('game');
  const s = new HostSession(seats, 0, st, host);
  session = s;
  void s.run();
  const end = await s.ended;
  countStats(end);
  session = null;
  setView(null);
  endShow(s.pres);
  host.onGame = null;
  host.onPresence = null;
  host.started = false;
  host.onLobby = () => { if (lobby.kind === 'host' && lobby.host === host && screen === 'lobby') renderLobby(); };
  host.onNote = (t) => { if (lobby.kind === 'host' && lobby.host === host) { lobby.note = t; if (screen === 'lobby') renderLobby(); } };
  // the bots that filled the seats leave again
  for (let i = host.seats.length - 1; i > 0; i--) if (host.seats[i].kind === 'bot') host.removeSeat(i);
  if (end.pick === 'again') { host.broadcastLobby(); openLobby({ kind: 'host', host }); }
  else { host.close(); renderTitle(); }
}

async function join(raw: string) {
  const code = cleanCode(raw);
  if (!validCode(code)) { lobby = { kind: 'online', err: 'Der Code hat 5 Buchstaben, z. B. KXMPR.' }; openLobby(lobby); return; }
  lobby = { kind: 'online', busy: true };
  openLobby(lobby);
  try {
    const guest = await PartyGuest.join(makeTransport(), code, { id: netId(), name: profile.name, feat: profile.feat, color: profile.color });
    const sess = new GuestSession(guest);
    const L: Lobby = { kind: 'guest', guest, info: guest.lobby, session: sess };
    guest.onLobby = (info) => {
      if (lobby !== L) return;
      L.info = info;
      const mine = info.seats[info.you];
      if (mine && mine.color !== profile.color) { profile.color = mine.color; saveProfile(profile); }
      if (screen === 'lobby') renderLobby();
    };
    guest.onGame = (m) => sess.onMsg(m as GameMsg);
    guest.onClosed = (why) => {
      if (lobby !== L) return;
      guestSession = null;
      setView(null);
      endShow(L.session.pres);
      lobby = { kind: 'online', err: why === 'kicked' ? 'Der Gastgeber hat dich aus dem Raum genommen.' : why === 'host' ? 'Der Gastgeber hat den Raum geschlossen.' : 'Die Verbindung zum Gastgeber ist weg.' };
      openLobby(lobby);
    };
    sess.onStart = () => { guestSession = sess; show('game'); };
    void sess.ended.then((end) => {
      countStats(end);
      guestSession = null;
      setView(null);
      endShow(sess.pres);
      if (lobby === L) {
        const next = new GuestSession(guest);
        L.session = next;
        next.onStart = () => { guestSession = next; show('game'); };
        void next.ended.then(() => endShow(next.pres));
        guest.onGame = (m) => next.onMsg(m as GameMsg);
        openLobby(L);
      }
    });
    openLobby(L);
    history.replaceState(null, '', location.pathname + location.search.replace(/([?&])join=[^&]*&?/, '$1').replace(/[?&]$/, ''));
  } catch (e) {
    lobby = { kind: 'online', err: netText(e) };
    openLobby(lobby);
  }
}

// ---------------- debug / tests ----------------
(window as unknown as { __party: unknown }).__party = {
  get screen() { return screen; },
  get state() { return session?.game.st ?? guestSession?.st ?? null; },
  get mg() { return minigamePhase(); },
  get lobby() { return lobby.kind; },
  get code() { return lobby.kind === 'host' ? lobby.host.code : lobby.kind === 'guest' ? lobby.guest.code : null; },
  perf, quality,
  force(n: number) { (globalThis as { __partyForce?: number }).__partyForce = n; },
  practice: (id: string) => practice(id),
  menu3d,
  /** Tests: sets the sky of the running evening and plays the weather announcement. */
  wx(kind: WeatherKind, tod?: number) {
    const pres = session?.pres ?? guestSession?.pres;
    if (!pres) return null;
    if (tod !== undefined) pres.view.atmo.setTime(tod);
    pres.view.atmo.setWeather(kind);
    pres.hud.weather(true);
    return pres.view.weather;
  },
};

// ---------------- start ----------------
const joinCode = new URLSearchParams(location.search).get('join');
renderTitle();
if (joinCode) { lobby = { kind: 'online' }; void join(joinCode); }
