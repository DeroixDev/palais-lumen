// Unser Uno Spiel: the lobby (name, colour, mode, house rules), the online room and the table.

import { botMove } from './bot';
import { cardHTML, prepareCards, SPRITE } from './cards';
import { DEFAULT_RULES, TARGETS, cardCount, type Action, type Card, type Rules } from './engine';
import { cleanCode, inviteLink, makeTransport, MAX_SEATS, netText, UnoGuest, UnoHost, validCode, type LobbyInfo } from './net';
import { BOT_NAMES, PLAYER_COLORS, cleanName, hasProfile, loadProfile, loadRules, loadStats, saveProfile, saveRules, saveStats, type Profile } from './profile';
import { setMuted, sfx, unlock } from './sfx';
import { Table, type TableView } from './table';
import { TableUI } from './ui';

const app = document.getElementById('app')!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const params = new URLSearchParams(location.search);
const DEV = import.meta.env.DEV || params.has('dev');

let profile: Profile = loadProfile();
let stats = loadStats();
let rules: Rules = loadRules(DEFAULT_RULES);
setMuted(profile.mute);

let ui: TableUI | null = null;
let table: Table | null = null;
let host: UnoHost | null = null;
let guest: UnoGuest | null = null;
let lobbyMsg = '';
let devAuto = false;

const HOUSE: { key: keyof Omit<Rules, 'target'>; name: string; text: string }[] = [
  { key: 'stack', name: 'Stapeln', text: '+2 auf +2 und +4 auf +4. Wer nicht nachlegen kann, zieht alles.' },
  { key: 'drawUntil', name: 'Ziehen bis passt', text: 'Wer ziehen muss, zieht so lange, bis eine Karte passt.' },
  { key: 'sevenZero', name: '7-0 tauschen', text: 'Eine 7 tauscht deine Hand mit jemandem, bei einer 0 wandern alle Hände weiter.' },
  { key: 'jumpIn', name: 'Reinwerfen', text: 'Hast du genau die gleiche Karte wie die oberste, wirf sie sofort rein, auch wenn du nicht dran bist.' },
];

// ---------------- shared bits ----------------

function header() {
  return `<header class="lbar">
    <a class="back" href="./index.html"><span aria-hidden="true">←</span> Alle Spiele</a>
    <span class="lbrand" aria-hidden="true">Unser<b>Uno</b>Spiel</span>
  </header>`;
}

function rulesHTML(r: Rules, editable: boolean) {
  const dis = editable ? '' : ' disabled';
  return `<div class="rules">
    <div class="r-target"><span class="r-lbl">Gewonnen bei</span><div class="seg" role="radiogroup" aria-label="Punkte zum Sieg">${TARGETS.map((t) => `<button type="button" role="radio" class="seg-b${r.target === t ? ' on' : ''}" aria-checked="${r.target === t}" data-target="${t}"${dis}>${t}</button>`).join('')}</div><span class="r-unit">Punkten</span></div>
    <ul class="house">${HOUSE.map((h) => `<li><label class="tog"><input type="checkbox" data-rule="${h.key}"${r[h.key] ? ' checked' : ''}${dis}><span class="tog-ui" aria-hidden="true"></span><span class="tog-txt"><b>${h.name}</b><small>${h.text}</small></span></label></li>`).join('')}</ul>
  </div>`;
}

function wireRules(root: HTMLElement, get: () => Rules, set: (r: Rules) => void) {
  root.querySelectorAll<HTMLButtonElement>('[data-target]').forEach((b) => b.addEventListener('click', () => { set({ ...get(), target: Number(b.dataset.target) }); }));
  root.querySelectorAll<HTMLInputElement>('[data-rule]').forEach((i) => i.addEventListener('change', () => { set({ ...get(), [i.dataset.rule!]: i.checked }); }));
}

function statLine() {
  if (!stats.rounds) return 'Noch keine Runde gespielt.';
  return `${stats.wins} ${stats.wins === 1 ? 'Sieg' : 'Siege'} in ${stats.matches} ${stats.matches === 1 ? 'Partie' : 'Partien'} · ${stats.roundsWon}/${stats.rounds} Runden · beste Runde ${stats.best} Punkte`;
}

const FAN: Card[] = [
  { id: 1, c: 'r', k: 'num', n: 7 },
  { id: 2, c: 'b', k: 'rev' },
  { id: 3, c: 'w', k: 'd4' },
  { id: 4, c: 'y', k: 'skip' },
  { id: 5, c: 'g', k: 'd2' },
];

// ---------------- lobby ----------------

function showLobby(opts: { code?: string; focusName?: boolean } = {}) {
  teardown();
  document.title = 'Unser Uno Spiel';
  app.innerHTML = `${SPRITE}<div class="lobby">${header()}
  <section class="l-hero">
    <div class="l-glints" aria-hidden="true">${Array.from({ length: 14 }, (_, i) => `<svg class="tw" style="--x:${(i * 71) % 100}%;--y:${(i * 37) % 100}%;--d:${(i % 7) * 0.45}s;--s:${0.5 + (i % 4) * 0.25}"><use href="#u-glint"/></svg>`).join('')}</div>
    <div class="l-copy">
      <p class="kick"><span class="tag">Kartenspiel</span><span>2 bis 4 am Tisch</span></p>
      <h1 class="l-title"><span class="lt1">Unser</span><span class="lt2">Uno</span><span class="lt3">Spiel</span></h1>
      <p class="l-sub">Karten raus, Farbe ansagen, UNO rufen. Gegen Bots oder mit deinen Leuten über einen Link.</p>
    </div>
    <div class="l-fan" aria-hidden="true">${FAN.map((c, i) => cardHTML(c, ` style="--i:${i - 2}"`)).join('')}</div>
  </section>
  <section class="l-grid">
    <div class="panel p-me">
      <h2 class="ph">Du</h2>
      <label class="fld"><span>Dein Name</span><input id="nm" maxlength="14" autocomplete="nickname" placeholder="Name eingeben" value="${esc(profile.name)}"></label>
      <div class="fld"><span id="col-l">Deine Farbe</span><div class="swatches" role="radiogroup" aria-labelledby="col-l">${PLAYER_COLORS.map((c, i) => `<button type="button" role="radio" class="sw${profile.color === i ? ' on' : ''}" aria-checked="${profile.color === i}" aria-label="Farbe ${i + 1}" data-c="${i}" style="--pc:${c}"></button>`).join('')}</div></div>
      <p class="stats">${statLine()}</p>
    </div>
    <div class="panel p-solo">
      <h2 class="ph">Solo</h2>
      <p class="pt">Gegen Bots. Sie halten ihre Farben, sparen sich die +4 und merken, wenn du UNO vergisst.</p>
      <div class="fld"><span>Gegner</span><div class="seg bots" role="radiogroup" aria-label="Anzahl Bots">${[1, 2, 3].map((n) => `<button type="button" role="radio" class="seg-b${profile.bots === n ? ' on' : ''}" aria-checked="${profile.bots === n}" data-bots="${n}">${n} ${n === 1 ? 'Bot' : 'Bots'}</button>`).join('')}</div></div>
      <button class="btn-main go-solo" type="button"><span>Spiel starten</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M12.5 5.5 19 12l-6.5 6.5"/></svg></button>
    </div>
    <div class="panel p-online">
      <h2 class="ph">Mit Freunden</h2>
      <p class="pt">Einer öffnet einen Raum und teilt den Link. Bis zu vier Leute, freie Plätze füllen Bots.</p>
      <button class="btn-main alt go-host" type="button"><span>Raum öffnen</span></button>
      <form class="join"><label class="fld"><span>Code von deinen Freunden</span><input id="code" maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCDE" value="${esc(opts.code ?? '')}"></label><button class="btn-line" type="submit">Beitreten</button></form>
      <p class="err" role="alert">${esc(lobbyMsg)}</p>
    </div>
    <div class="panel p-rules">
      <h2 class="ph">Regeln</h2>
      <p class="pt">Offizielle Regeln: 7 Karten, gleiche Farbe oder gleiche Zahl, UNO bei der vorletzten Karte. Hausregeln schaltest du hier dazu.</p>
      ${rulesHTML(rules, true)}
    </div>
  </section>
  </div>`;
  lobbyMsg = '';
  const nm = app.querySelector<HTMLInputElement>('#nm')!;
  nm.addEventListener('input', () => { profile.name = cleanName(nm.value); saveProfile(profile); });
  app.querySelectorAll<HTMLButtonElement>('.sw').forEach((b) => b.addEventListener('click', () => {
    profile.color = Number(b.dataset.c);
    saveProfile(profile);
    app.querySelectorAll('.sw').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
  }));
  app.querySelectorAll<HTMLButtonElement>('[data-bots]').forEach((b) => b.addEventListener('click', () => {
    profile.bots = Number(b.dataset.bots);
    saveProfile(profile);
    app.querySelectorAll('[data-bots]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
  }));
  const rulesBox = app.querySelector<HTMLElement>('.p-rules')!;
  const setR = (r: Rules) => {
    rules = r;
    saveRules(r);
    rulesBox.querySelectorAll<HTMLButtonElement>('[data-target]').forEach((b) => { const on = Number(b.dataset.target) === r.target; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
  };
  wireRules(rulesBox, () => rules, setR);
  /** Online, friends need to see who you are. */
  const needName = () => {
    if (profile.name) return false;
    setErr('Gib zuerst deinen Namen ein.');
    nm.focus();
    return true;
  };
  app.querySelector('.go-solo')!.addEventListener('click', () => { unlock(); startSolo(); });
  app.querySelector('.go-host')!.addEventListener('click', () => { unlock(); if (!needName()) void openRoom(); });
  const code = app.querySelector<HTMLInputElement>('#code')!;
  code.addEventListener('input', () => { code.value = cleanCode(code.value); });
  app.querySelector('.join')!.addEventListener('submit', (e) => {
    e.preventDefault();
    unlock();
    if (needName()) return;
    const c = cleanCode(code.value);
    if (!validCode(c)) { setErr('Der Code hat fünf Buchstaben.'); code.focus(); return; }
    void joinRoom(c);
  });
  if (opts.focusName) nm.focus();
}

function setErr(t: string) {
  const e = app.querySelector('.err');
  if (e) e.textContent = t;
}

function busy(sel: string, text: string) {
  const b = app.querySelector<HTMLButtonElement>(sel);
  if (b) { b.disabled = true; b.dataset.label = b.textContent ?? ''; b.textContent = text; }
}

// ---------------- table ----------------

function teardown() {
  ui?.destroy();
  ui = null;
  table?.destroy();
  table = null;
}

function onEvent(e: { k: string } & Record<string, unknown>, v: TableView) {
  if (e.k === 'round') {
    stats.rounds++;
    if (e.winner === v.me) { stats.roundsWon++; stats.best = Math.max(stats.best, Number(e.points) || 0); }
    saveStats(stats);
  } else if (e.k === 'match') {
    stats.matches++;
    if (e.winner === v.me) stats.wins++;
    saveStats(stats);
  }
}

function makeUI(send: (a: Action) => void, owner: boolean, online: boolean, ownerName: string, onLobby: () => void, onLeave: () => void) {
  app.innerHTML = '';
  document.title = 'Unser Uno Spiel';
  ui = new TableUI(app, { send, owner, online, ownerName }, {
    muted: profile.mute,
    onMute: (m) => { profile.mute = m; saveProfile(profile); },
    onLeave,
    onLobby,
    onEvent: (e, v) => onEvent(e as never, v),
  });
  return ui;
}

function startSolo(seed?: number) {
  teardown();
  const n = profile.bots;
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  const colors = PLAYER_COLORS.map((_, i) => i).filter((i) => i !== profile.color).sort(() => Math.random() - 0.5);
  const seats = [{ id: profile.id, name: profile.name || 'Du', color: profile.color, bot: false }];
  for (let i = 0; i < n; i++) seats.push({ id: 'bot' + i, name: names[i], color: colors[i], bot: true });
  table = new Table(seats, rules, { seed, speed: devSpeed });
  const t = table;
  const u = makeUI(
    (a) => { const r = t.act(0, a); if (!r.ok) sfx.nope(); },
    true, false, profile.name,
    () => showLobby(),
    () => showLobby(),
  );
  t.listen(0, (v) => { u.update(v); devStep(v); });
}

// ---------------- online ----------------

async function openRoom() {
  busy('.go-host', 'Raum wird geöffnet …');
  try {
    host = await UnoHost.open(makeTransport(), profile, rules);
  } catch (e) {
    showLobby();
    setErr(netText(e));
    return;
  }
  const h = host;
  h.onLobby = () => { if (!h.table) showRoom(h.info(0), true); };
  h.onNote = (t) => { if (ui) ui.toast(t); else noteRoom(t); };
  history.replaceState(null, '', location.pathname + location.search.replace(/[?&]join=[A-Z]+/, ''));
  showRoom(h.info(0), true);
}

/** Seat id for joining: per browser tab (survives a reload, so a reloaded tab gets its seat back). */
function seatId() {
  let t = '';
  try {
    t = sessionStorage.getItem('unounser.tab') ?? '';
    if (!t) { t = Math.random().toString(36).slice(2, 8); sessionStorage.setItem('unounser.tab', t); }
  } catch { t = 'x'; }
  return `${profile.id}.${t}`;
}

async function joinRoom(code: string) {
  busy('.join button', 'Verbinde …');
  try {
    guest = await UnoGuest.join(makeTransport(), code, { ...profile, id: seatId() });
  } catch (e) {
    guest = null;
    lobbyMsg = netText(e);
    showLobby({ code });
    return;
  }
  const g = guest;
  g.onLobby = (l) => {
    if (!l.started) { if (ui) teardown(); showRoom(l, false); }
    else if (!ui) showRoom(l, false);
  };
  g.onView = (v) => {
    if (!ui) {
      const l = g.lobby;
      makeUI((a) => g.send(a), false, true, l?.seats[0]?.name ?? 'Der Gastgeber', () => { /* the host decides */ }, () => { g.leave(); guest = null; showLobby(); });
    }
    ui!.update(v);
  };
  g.onClosed = (why) => {
    guest = null;
    lobbyMsg = why === 'host' ? 'Der Gastgeber hat den Raum geschlossen.' : why === 'kicked' ? 'Der Gastgeber hat dich aus dem Raum genommen.' : 'Die Verbindung zum Gastgeber ist weg.';
    showLobby();
  };
  if (g.lobby && !g.lobby.started) showRoom(g.lobby, false);
}

function noteRoom(t: string) {
  const n = app.querySelector('.r-note');
  if (n) n.textContent = t;
}

function showRoom(l: LobbyInfo, isHost: boolean) {
  teardown();
  document.title = `Raum ${l.code} · Unser Uno Spiel`;
  const link = inviteLink(l.code);
  const seats = [...l.seats];
  const slots = Array.from({ length: MAX_SEATS }, (_, i) => seats[i] ?? null);
  app.innerHTML = `${SPRITE}<div class="lobby room">${header()}
  <section class="r-head">
    <h2 class="r-brand" aria-label="Unser Uno Spiel"><span>Unser</span><b>Uno</b><span>Spiel</span></h2>
    <p class="kick"><span class="tag">${isHost ? 'Dein Raum' : 'Raum'}</span><span>${isHost ? 'Teil den Link mit deinen Leuten' : `Gastgeber: ${esc(l.seats[0]?.name ?? '')}`}</span></p>
    <h1 class="r-code" aria-label="Raumcode ${l.code.split('').join(' ')}">${l.code}</h1>
    <div class="r-link"><input readonly value="${esc(link)}" aria-label="Einladungslink"><button class="btn-line copy" type="button">Link kopieren</button></div>
  </section>
  <section class="r-grid">
    <div class="panel">
      <h2 class="ph">Am Tisch <small>${seats.length}/${MAX_SEATS}</small></h2>
      <ol class="r-seats">${slots.map((s, i) => s ? `<li class="st ${s.kind}${s.online ? '' : ' off'}${i === l.you ? ' me' : ''}"><span class="ava" style="--pc:${PLAYER_COLORS[s.color] ?? PLAYER_COLORS[0]}">${esc([...s.name][0]?.toUpperCase() ?? '?')}</span><b>${esc(s.name)}</b><small>${s.kind === 'host' ? 'Gastgeber' : s.kind === 'bot' ? 'Bot' : s.online ? 'dabei' : 'weg'}${i === l.you ? ' · du' : ''}</small>${isHost && i > 0 ? `<button class="x" type="button" data-rm="${i}" aria-label="${esc(s.name)} entfernen">×</button>` : ''}</li>` : `<li class="st empty">${isHost ? `<button class="add" type="button">+ Bot dazu</button>` : '<span>frei</span>'}</li>`).join('')}</ol>
      <p class="r-note" aria-live="polite"></p>
    </div>
    <div class="panel p-rules"><h2 class="ph">Regeln</h2>${rulesHTML(l.rules, isHost)}${isHost ? '' : '<p class="pt">Die Regeln legt der Gastgeber fest.</p>'}</div>
  </section>
  <div class="r-actions">${isHost ? `<button class="btn-main go-start" type="button"${seats.length < 2 ? ' disabled' : ''}><span>${seats.length < 2 ? 'Warte auf Mitspieler' : 'Spiel starten'}</span></button>` : '<p class="wait">Warte, bis der Gastgeber startet …</p>'}<button class="btn-line leave" type="button">${isHost ? 'Raum schließen' : 'Raum verlassen'}</button></div>
  </div>`;
  app.querySelector('.copy')!.addEventListener('click', async (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    try { await navigator.clipboard.writeText(link); b.textContent = 'Kopiert'; } catch { app.querySelector<HTMLInputElement>('.r-link input')!.select(); b.textContent = 'Markiert'; }
    setTimeout(() => (b.textContent = 'Link kopieren'), 1600);
  });
  app.querySelector('.leave')!.addEventListener('click', () => {
    if (host) { host.close(); host = null; }
    if (guest) { guest.leave(); guest = null; }
    showLobby();
  });
  if (!isHost || !host) return;
  const h = host;
  wireRules(app.querySelector('.p-rules')!, () => h.rules, (r) => { rules = r; saveRules(r); h.setRules(r); });
  app.querySelectorAll('.add').forEach((b) => b.addEventListener('click', () => h.addBot()));
  app.querySelectorAll<HTMLButtonElement>('[data-rm]').forEach((b) => b.addEventListener('click', () => h.removeSeat(Number(b.dataset.rm))));
  app.querySelector('.go-start')?.addEventListener('click', () => {
    unlock();
    const t = h.start(devSpeed);
    if (!t) return;
    table = null; // owned by the host object
    const u = makeUI(
      (a) => { const r = t.act(0, a); if (!r.ok) sfx.nope(); },
      true, true, profile.name,
      () => { h.backToLobby(); showRoom(h.info(0), true); },
      () => { h.close(); host = null; showLobby(); },
    );
    t.listen(0, (v) => { u.update(v); devStep(v); });
  });
}

// ---------------- page lifecycle ----------------

document.addEventListener('visibilitychange', () => {
  // solo: the bots wait while the tab is hidden (online the host keeps the table running)
  table?.pause(document.hidden);
});

// ---------------- dev hook (tests: ?dev) ----------------

let devSpeed = 1;
function devStep(v: TableView) {
  if (!devAuto) return;
  const t = table ?? host?.table;
  if (!t) return;
  setTimeout(() => {
    const m = t.m;
    if (m.phase === 'roundEnd') t.act(0, { t: 'next' });
    else if ((m.phase === 'play' || m.phase === 'drawn') && m.turn === 0) t.act(0, botMove(m, 0));
    else if (m.open === 0) t.act(0, { t: 'uno' });
  }, 20 * devSpeed + 5);
  void v;
}

if (DEV) {
  Object.assign(window, {
    __uno: {
      get table() { return table ?? host?.table ?? null; },
      get ui() { return ui; },
      get host() { return host; },
      get guest() { return guest; },
      startSolo: (bots = 3, r: Partial<Rules> = {}, seed?: number, speed = 1) => { profile.bots = bots; rules = { ...DEFAULT_RULES, ...r }; devSpeed = speed; startSolo(seed); },
      speed: (s: number) => { devSpeed = s; (table ?? host?.table)?.setSpeed(s); },
      auto: (on: boolean) => { devAuto = on; const t = table ?? host?.table; if (on && t && ui?.v) devStep(ui.v); },
      count: () => { const t = table ?? host?.table; return t ? cardCount(t.m) : null; },
      lobby: () => showLobby(),
    },
  });
}

// ---------------- boot ----------------

prepareCards();

const joinCode = cleanCode(params.get('join') ?? '');
if (validCode(joinCode)) {
  if (hasProfile()) { showLobby({ code: joinCode }); void joinRoom(joinCode); }
  else { lobbyMsg = 'Gib deinen Namen ein und tritt dem Raum bei.'; showLobby({ code: joinCode, focusName: true }); }
} else showLobby();
