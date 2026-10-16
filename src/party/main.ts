// Unser Party Spiel: screens (title, lobby solo/online, settings), starting and resuming an
// evening, and the glue to the network. The rules live in ./engine, the show in ./ui, the
// minigames in ./minigames, the boards in ./boards.

import './party.css';
import { BOARDS, getBoard } from './boards';
import { newGame } from './engine/engine';
import { ranking } from './engine/state';
import { MINIGAMES } from './minigames';
import { minigamePhase, runFreeMinigame } from './minigames/flow';
import type { MgPlayer } from './minigames/types';
import { MAX_SEATS, PartyGuest, PartyHost, cleanCode, inviteLink, makeTransport, netText, validCode, type LobbyInfo } from './net/net';
import { GuestSession, HostSession, type FullState, type GameMsg, type SessionEnd } from './session';
import { setVolumes, sfx, startMusic, unlock } from './sfx';
import { clearSave, cleanName, loadProfile, loadSave, loadSettings, loadStats, saveProfile, saveSettings, saveStats, writeSave, type Profile } from './store';
import { BOT_NAMES, COLORS, FEATS, MG_TYPE_NAME, type BotLevel, type MgType, type Quality, type Rules, type Seat } from './types';
import { charSVG } from './ui/avatars';
import { initInput } from './ui/input';
import { buildShell } from './ui/shell';
import { $, $$, AUTO, esc, newSeed } from './util';
import { quality } from './view3d/quality';
import { initStage, perf, setView } from './view3d/stage';

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

const coarseQ = matchMedia('(pointer: coarse)');
const syncCoarse = () => document.body.classList.toggle('coarse', coarseQ.matches || innerWidth < 760);
syncCoarse();
addEventListener('resize', syncCoarse);
addEventListener('pointerdown', () => unlock(), { once: true });
addEventListener('keydown', () => unlock(), { once: true });

// ---------------- screens ----------------
type Screen = 'title' | 'lobby' | 'game';
let screen: Screen = 'title';
function show(s: Screen) {
  screen = s;
  $('#scrTitle').hidden = s !== 'title';
  $('#scrLobby').hidden = s !== 'lobby';
  $('#app').hidden = s !== 'game';
  if (s !== 'game') startMusic('menu');
  scrollTo(0, 0);
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

// ---------------- settings ----------------
function openSettings() {
  const card = $('#setCard');
  const qs: [Quality, string][] = [['auto', 'Auto'], ['hoch', 'Hoch'], ['mittel', 'Mittel'], ['niedrig', 'Niedrig']];
  card.innerHTML = `
    <h2 id="setTitle">Einstellungen</h2>
    <label class="rng"><span>Effekte</span><input type="range" min="0" max="100" value="${Math.round(settings.sound * 100)}" id="sSound"><output id="oSound">${Math.round(settings.sound * 100)}</output></label>
    <label class="rng"><span>Musik</span><input type="range" min="0" max="100" value="${Math.round(settings.music * 100)}" id="sMusic"><output id="oMusic">${Math.round(settings.music * 100)}</output></label>
    <div class="fld"><span>Grafik</span><div class="seg" role="radiogroup" id="sQual">${qs.map(([q, n]) => `<button type="button" role="radio" aria-checked="${settings.quality === q}" data-q="${q}">${n}</button>`).join('')}</div>
    <span class="q-now" id="qNow"></span></div>
    <div class="start-row"><button class="btn go" type="button" id="setClose">Fertig</button></div>`;
  const qNow = () => { const c = quality.current(); $('#qNow').textContent = `Gerade: Pixeldichte ${c.dpr.toFixed(2)} · Schatten ${c.shadow ? Math.round(c.shadow * 100) + ' %' : 'aus'} · ${Math.round(perf.fps) || '–'} Bilder/s${settings.quality === 'auto' ? ' · passt sich selbst an' : ''}`; };
  qNow();
  const iv = window.setInterval(qNow, 1000);
  const vol = () => { if (!muted) setVolumes(settings.sound, settings.music); saveSettings(settings); };
  $<HTMLInputElement>('#sSound').oninput = (e) => { settings.sound = Number((e.target as HTMLInputElement).value) / 100; $('#oSound').textContent = String(Math.round(settings.sound * 100)); vol(); sfx.coin(); };
  $<HTMLInputElement>('#sMusic').oninput = (e) => { settings.music = Number((e.target as HTMLInputElement).value) / 100; $('#oMusic').textContent = String(Math.round(settings.music * 100)); vol(); };
  $('#sQual').onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-q]');
    if (!b) return;
    settings.quality = b.dataset.q as Quality;
    quality.set(settings.quality);
    saveSettings(settings);
    $$('#sQual button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    qNow();
  };
  const ov = $('#ovSet');
  const close = () => { ov.classList.remove('open'); clearInterval(iv); removeEventListener('keydown', esc1); };
  const esc1 = (e: KeyboardEvent) => { if (e.code === 'Escape') close(); };
  addEventListener('keydown', esc1);
  $('#setClose').onclick = close;
  ov.onclick = (e) => { if (e.target === ov || (e.target as HTMLElement).classList.contains('ov-in')) close(); };
  ov.classList.add('open');
  $<HTMLButtonElement>('#setClose').focus({ preventScroll: true });
}

// ---------------- title ----------------
interface Saved { seats: Seat[]; me: number; st: FullState }
function renderTitle() {
  $('#cast').innerHTML = FEATS.map((f, i) => charSVG({ color: COLORS[[1, 0, 2, 3][i]], acc: f.acc, feat: f.id })).join('');
  const save = loadSave<Saved>();
  const items: [string, string, string][] = [];
  if (save) {
    const st = save.data.st;
    items.push(['resume', 'Weiterspielen', `Runde ${st.round} / ${st.rules.rounds} · ${getBoard(st.rules.board).name}`]);
  }
  items.push(['solo', 'Solo mit Bots', '1 bis 3 Bots'], ['online', 'Online spielen', 'Raum mit Code, bis zu 3 Freunde'], ['practice', 'Minispiele üben', `${MINIGAMES.length} Spiele`], ['settings', 'Einstellungen', 'Ton, Grafik']);
  $('#menu').innerHTML = items.map(([id, t, s], i) => `<button class="btn ${i === 0 ? 'go' : 'ghost'}" type="button" data-m="${id}"><span>${t}</span><small>${esc(s)}</small></button>`).join('');
  const stats = loadStats();
  $('#menuNote').textContent = stats.evenings ? `Bisher ${stats.evenings} Abend${stats.evenings > 1 ? 'e' : ''}, ${stats.wins} gewonnen, ${stats.stars} Sterne gesammelt.` : 'Neu hier? Ein Abend mit 10 Runden dauert etwa 30 Minuten.';
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
  if (AUTO) setTimeout(() => { if (screen === 'title') ($('#menu [data-m]') as HTMLElement | null)?.focus(); }, 0);
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

function openLobby(l: Lobby) {
  lobby = l;
  show('lobby');
  renderLobby();
}

const segHTML = <T extends string | number>(id: string, opts: [T, string][], cur: T, dis = false) =>
  `<div class="seg" role="radiogroup" data-seg="${id}">${opts.map(([v, n]) => `<button type="button" role="radio" aria-checked="${v === cur}" data-v="${v}"${dis ? ' disabled' : ''}>${n}</button>`).join('')}</div>`;

function usedColors(): Set<string> {
  if (lobby.kind === 'host') return new Set(lobby.host.seats.slice(1).map((s) => s.color));
  if (lobby.kind === 'guest' && lobby.info) { const you = lobby.info.you; return new Set(lobby.info.seats.filter((_, i) => i !== you).map((s) => s.color)); }
  return new Set();
}

function meHTML() {
  const used = usedColors();
  return `<section class="pnl"><h2>Du</h2>
    <label class="fld"><span>Name</span><input type="text" id="lName" maxlength="12" value="${esc(profile.name)}" autocomplete="nickname"></label>
    <div class="fld"><span>Figur</span><div class="figs" role="radiogroup">${FEATS.map((f) => `<button type="button" role="radio" aria-checked="${profile.feat === f.id}" data-feat="${f.id}">${charSVG({ color: profile.color, acc: f.acc, feat: f.id })}${f.name}</button>`).join('')}</div></div>
    <div class="fld"><span>Farbe · jede Farbe gibt es nur einmal am Tisch</span><div class="sws" role="radiogroup">${COLORS.map((c) => `<button type="button" class="sw" role="radio" aria-label="Farbe ${c}" aria-checked="${profile.color === c}" data-col="${c}" style="--pc:${c}"${used.has(c) ? ' disabled' : ''}></button>`).join('')}</div></div>
  </section>`;
}

function rulesHTML(r: Rules, ro: boolean) {
  const types = (Object.keys(MG_TYPE_NAME) as MgType[]);
  const avail = new Set(MINIGAMES.map((m) => m.type));
  return `<section class="pnl"><h2>Regeln</h2>
    <div class="fld"><span>Runden</span>${segHTML('rounds', [[10, '10'], [15, '15'], [20, '20']], r.rounds, ro)}</div>
    <div class="fld"><span>Brett</span><div class="boards" role="radiogroup">${BOARDS.map((b) => `<button type="button" role="radio" aria-checked="${r.board === b.id}" data-board="${b.id}"${ro ? ' disabled' : ''}><b>${esc(b.name)}</b><small>${esc(b.blurb)}</small></button>`).join('')}</div></div>
    <label class="tog"><input type="checkbox" id="lProfi"${r.profi ? ' checked' : ''}${ro ? ' disabled' : ''}><span class="tog-ui"></span><span class="tog-txt"><b>Profi-Regeln</b><small>Weniger Glück: keine Platztausch-Ereignisse, keine Glücks-Minispiele, kein Sterneklau.</small></span></label>
    <div class="fld"><span>Minispiel-Arten</span><div class="types">${types.map((t) => `<label class="tog"><input type="checkbox" data-type="${t}"${r.types[t] !== false ? ' checked' : ''}${ro ? ' disabled' : ''}><span class="tog-ui"></span><span class="tog-txt"><b>${MG_TYPE_NAME[t]}</b>${avail.has(t) || t === 'muenz' ? '' : '<small>noch keins dabei</small>'}</span></label>`).join('')}</div></div>
  </section>`;
}

function seatsHTML(list: { name: string; color: string; acc: string; feat: Seat['feat']; sub: string; x?: number }[]) {
  return `<ul class="seats">${list.map((s) => `<li class="seat" style="--pc:${s.color}"><span class="r-ava">${charSVG(s, true)}</span><span><b>${esc(s.name)}</b><small>${esc(s.sub)}</small></span>${s.x !== undefined ? `<button class="x" type="button" data-rm="${s.x}" aria-label="${esc(s.name)} entfernen">×</button>` : '<span></span>'}</li>`).join('')}</ul>`;
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

function renderLobby() {
  const L = lobby, el = $('#lobby');
  const back = '<button class="btn ghost" type="button" data-l="back">Zurück</button>';
  if (L.kind === 'practice') {
    $('#lobbyKind').textContent = 'Minispiele üben';
    el.innerHTML = `<div class="l-head"><h2>Minispiele üben</h2>${back}</div>
      <p class="hero-sub">Jedes Minispiel mit Bots ausprobieren. Zählt nicht für den Abend.</p>
      <section class="pnl"><div class="boards">${MINIGAMES.map((m) => `<button type="button" data-mg="${m.id}"><b>${esc(m.name)}</b><small>${MG_TYPE_NAME[m.type]} · ${esc(m.card.sub)}</small></button>`).join('')}</div></section>`;
  } else if (L.kind === 'online') {
    $('#lobbyKind').textContent = 'Online spielen';
    el.innerHTML = `<div class="l-head"><h2>Online spielen</h2>${back}</div>
      <div class="l-grid">${meHTML()}
      <section class="pnl"><h2>Raum</h2>
        <p class="hero-sub">Öffne einen Raum und schick deinen Freunden den Code. Bis zu drei können mitspielen, freie Plätze übernehmen Bots.</p>
        <div class="start-row"><button class="btn go" type="button" data-l="host"${L.busy ? ' disabled' : ''}>Raum öffnen</button></div>
        <div class="join" style="margin-top:16px"><label class="fld"><span>Code von einem Freund</span><input type="text" id="lCode" maxlength="40" placeholder="z. B. KXMPR" autocomplete="off" autocapitalize="characters"></label><button class="btn ghost" type="button" data-l="join"${L.busy ? ' disabled' : ''}>Beitreten</button></div>
        <p class="err" role="alert">${esc(L.err ?? '')}</p>
      </section></div>`;
  } else if (L.kind === 'solo') {
    $('#lobbyKind').textContent = 'Solo mit Bots';
    const bots = soloBots(settings.bots, settings.botLevel);
    el.innerHTML = `<div class="l-head"><h2>Solo mit Bots</h2>${back}</div>
      <div class="l-grid">${meHTML()}
      <section class="pnl"><h2>Mitspieler</h2>
        <div class="fld"><span>Bots</span>${segHTML('bots', [[1, '1 Bot'], [2, '2 Bots'], [3, '3 Bots']], settings.bots)}</div>
        <div class="fld"><span>Stärke</span>${segHTML('level', [['leicht', 'Leicht'], ['normal', 'Normal'], ['stark', 'Stark']], settings.botLevel)}</div>
        ${seatsHTML([{ ...profile, acc: FEATS.find((f) => f.id === profile.feat)!.acc, sub: 'Du · hier am Gerät' }, ...bots.map((b) => ({ ...b, sub: `Bot · ${b.bot}` }))])}
      </section>
      ${rulesHTML(settings.rules, false)}
      <section class="pnl wide"><div class="start-row"><span class="hint">Gespeichert wird nach jedem Zug. Du kannst jederzeit aufhören und später weiterspielen.</span><button class="btn go" type="button" data-l="start">Los geht’s!</button></div></section>
      </div>`;
  } else if (L.kind === 'host') {
    const H = L.host;
    $('#lobbyKind').textContent = `Raum ${H.code}`;
    el.innerHTML = `<div class="l-head"><h2>Dein Raum</h2><button class="btn ghost" type="button" data-l="close">Raum schließen</button></div>
      <div class="l-grid">${meHTML()}
      <section class="pnl"><h2>Raum</h2>
        <div class="code"><b id="roomCode">${H.code}</b><button class="btn ghost" type="button" data-l="copy">Link kopieren</button></div>
        ${seatsHTML(H.seats.map((s, i) => ({ ...s, sub: i === 0 ? 'Gastgeber · du' : s.kind === 'bot' ? `Bot · ${s.bot}` : s.online ? 'Freund · verbunden' : 'Freund · weg', x: i > 0 ? i : undefined })))}
        <div class="start-row"><span class="hint">${H.seats.length}/${MAX_SEATS} Plätze</span>${segHTML('level', [['leicht', 'Leicht'], ['normal', 'Normal'], ['stark', 'Stark']], settings.botLevel)}<button class="btn ghost" type="button" data-l="addbot"${H.seats.length >= MAX_SEATS ? ' disabled' : ''}>Bot dazu</button></div>
        <label class="tog"><input type="checkbox" id="lFill"${fillBots ? ' checked' : ''}><span class="tog-ui"></span><span class="tog-txt"><b>Freie Plätze mit Bots füllen</b><small>Beim Start bis 4 Plätze.</small></span></label>
        <p class="err" role="status">${esc(L.note ?? '')}</p>
      </section>
      ${rulesHTML(H.rules, false)}
      <section class="pnl wide"><div class="start-row"><span class="hint">Einladungslink: <span id="invite">${esc(inviteLink(H.code))}</span></span><button class="btn go" type="button" data-l="hstart">Abend starten</button></div></section>
      </div>`;
  } else {
    const I = L.info;
    $('#lobbyKind').textContent = `Raum ${L.guest.code}`;
    el.innerHTML = `<div class="l-head"><h2>Raum ${L.guest.code}</h2><button class="btn ghost" type="button" data-l="leave">Raum verlassen</button></div>
      <div class="l-grid">${meHTML()}
      <section class="pnl"><h2>Am Tisch</h2>
        ${I ? seatsHTML(I.seats.map((s, i) => ({ ...s, sub: (i === I.you ? 'Du · ' : '') + (s.kind === 'host' ? 'Gastgeber' : s.kind === 'bot' ? `Bot · ${s.bot}` : s.online ? 'Freund · verbunden' : 'Freund · weg') }))) : '<p>Verbinde …</p>'}
        <p class="hint">${I?.started ? 'Der Abend läuft gerade.' : 'Warte, bis der Gastgeber den Abend startet …'}</p>
      </section>
      ${I ? rulesHTML(I.rules, true) : ''}
      </div>`;
  }
}

// lobby events (delegated once)
$('#lobby').addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === 'lName') { profile.name = cleanName(t.value) || 'Du'; saveProfile(profile); pushMe(); }
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
  const b = t.closest<HTMLButtonElement>('button');
  if (!b || b.disabled) return;
  unlock();
  const L = lobby;
  if (b.dataset.feat) { profile.feat = b.dataset.feat as Profile['feat']; saveProfile(profile); sfx.pop(); pushMe(); renderLobby(); return; }
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
  if (end.pick === 'again') openLobby({ kind: 'solo' }); else renderTitle();
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
      lobby = { kind: 'online', err: why === 'kicked' ? 'Der Gastgeber hat dich aus dem Raum genommen.' : why === 'host' ? 'Der Gastgeber hat den Raum geschlossen.' : 'Die Verbindung zum Gastgeber ist weg.' };
      openLobby(lobby);
    };
    sess.onStart = () => { guestSession = sess; show('game'); };
    void sess.ended.then((end) => {
      countStats(end);
      guestSession = null;
      setView(null);
      if (lobby === L) {
        const next = new GuestSession(guest);
        L.session = next;
        next.onStart = () => { guestSession = next; show('game'); };
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
};

// ---------------- start ----------------
const joinCode = new URLSearchParams(location.search).get('join');
renderTitle();
if (joinCode) { lobby = { kind: 'online' }; void join(joinCode); }
