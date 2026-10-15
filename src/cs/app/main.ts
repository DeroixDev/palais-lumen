// CS Gambler: the site shell (top bar, live feed, routing) and boot.

import './styles.css';
import { save, onChange, commit, invValue } from './lib/state';
import { levelInfo, ensureMissions, checkAchievements, bonusReadyIn, dailyReadyIn, missionDef, migrateCareer, onLevelUp, rankName, stageOf } from './lib/career';
import { feed, onFeed, startFeed, type FeedEntry } from './lib/feed';
import { skinById } from './lib/assets';
import { countUp, el, esc, fmt, reducedMotion } from './lib/util';
import { avatarSVG } from './lib/bots';
import { icon } from './ui/icons';
import { rColor, skinArt, names } from './ui/items';
import { closeAllModals } from './ui/modal';
import { armLive, pulseBadge, rankBadge, stageCeremony } from './ui/rank';
import { sfx } from './lib/sound';
import { openPanelPad } from './ui/admin';
import { devUnlocked, setLuck } from './lib/panel';
import type { Page, Cleanup } from './pages/page';

import { casesPage } from './pages/cases';
import { casePage } from './pages/case';
import { palettePage } from './pages/palette';
import { inventoryPage } from './pages/inventory';
import { upgraderPage } from './pages/upgrader';
import { contractsPage } from './pages/contracts';
import { battlesPage, battlePage } from './pages/battles';
import { coinflipPage } from './pages/coinflip';
import { crashPage } from './pages/crash';
import { careerPage } from './pages/career';
import { settingsPage } from './pages/settings';

const NAV: { id: string; label: string; icon: string; page: Page; group?: 'me' }[] = [
  { id: 'cases', label: 'Kisten', icon: 'cases', page: casesPage },
  { id: 'battles', label: 'Battles', icon: 'battles', page: battlesPage },
  { id: 'upgrader', label: 'Upgrader', icon: 'upgrader', page: upgraderPage },
  { id: 'contracts', label: 'Verträge', icon: 'contracts', page: contractsPage },
  { id: 'coinflip', label: 'Coinflip', icon: 'coinflip', page: coinflipPage },
  { id: 'crash', label: 'Crash', icon: 'crash', page: crashPage },
  { id: 'inventory', label: 'Inventar', icon: 'inventory', page: inventoryPage, group: 'me' },
  { id: 'career', label: 'Karriere', icon: 'career', page: careerPage, group: 'me' },
];
// The fountain loads on demand (its own chunk), only behind the code pad.
const brunnenPage: Page = (root) => {
  let off: Cleanup;
  let dead = false;
  import('./pages/fountain').then((m) => { if (!dead) off = m.fountainPage(root); }, (err) => console.error(err));
  return () => { dead = true; if (typeof off === 'function') off(); };
};
const EXTRA: Record<string, { page: Page; nav: string; label: string }> = {
  case: { page: casePage, nav: 'cases', label: 'Kiste' },
  palette: { page: palettePage, nav: 'cases', label: 'Die Palette' },
  battle: { page: battlePage, nav: 'battles', label: 'Battle' },
  settings: { page: settingsPage, nav: '', label: 'Einstellungen' },
  brunnen: { page: brunnenPage, nav: '', label: 'Zauberbrunnen' },
};

const navLink = (n: (typeof NAV)[number]) => `<a href="#/${n.id}" data-nav="${n.id}" title="${n.label}">${icon(n.icon)}<span>${n.label}</span></a>`;
const app = document.getElementById('app')!;
app.innerHTML = `
<a class="skip" href="#page">Zum Inhalt</a>
<header class="topbar">
  <div class="tb-inner">
    <a class="logo" href="#/cases" aria-label="CS Gambler, Startseite"><span class="logo-mark"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 11l11-6 11 6v11l-11 6-11-6z" fill="#ff8a1f"/><path d="M5 11l11 6 11-6M16 17v11" stroke="#1a0d02" stroke-width="2.2" fill="none"/><path d="M16 5l11 6-11 6-11-6z" fill="#ffb15e"/></svg></span><span class="logo-txt">CS<b>Gambler</b></span></a>
    <div class="tb-right">
      <a class="tb-gift" href="#/career" aria-label="Belohnungen">${icon('gift')}<i class="dot" hidden></i></a>
      <a class="wallet" href="#/inventory" aria-label="Kontostand"><span class="coin big"></span><span class="w-col"><span class="w-num mono">0,00</span><span class="w-inv mono"><span class="w-invv">0,00</span> im Inventar</span></span></a>
      <a class="lvl" href="#/career" aria-label="Karriere"><span class="lvl-rank"><span class="lvl-b"></span><span class="lvl-mini"><i></i></span></span><span class="lvl-info"><small class="lvl-title"></small><span class="lvl-bar"><i></i></span></span></a>
      <button class="tb-sound" type="button" aria-label="Ton an/aus"></button>
      <a class="tb-avatar" href="#/settings" aria-label="Profil und Einstellungen"></a>
    </div>
  </div>
</header>
<nav class="sidenav" aria-label="Spiele">
  <div class="sn-group">${NAV.filter((n) => !n.group).map(navLink).join('')}</div>
  <div class="sn-group sn-me">${NAV.filter((n) => n.group).map(navLink).join('')}</div>
  <a class="sn-palais" href="./index.html" title="Palais Lumen">${icon('palace')}<span>Palais</span></a>
</nav>
<div class="feed" aria-label="Live-Drops"><div class="feed-live"><i></i>LIVE</div><div class="feed-track"></div></div>
<main id="page" tabindex="-1"></main>
<footer class="foot">
  <div class="foot-inner">
    <div class="foot-brand"><span class="logo-txt">CS<b>Gambler</b></span><span>Kisten, Battles und Karriere für dich und deine Freunde.</span></div>
    <div class="foot-links"><a href="./index.html" class="to-palais">${icon('palace')} Palais Lumen</a><a href="#/career">Karriere</a><a href="#/settings">Einstellungen</a></div>
  </div>
</footer>`;

const pageEl = document.getElementById('page')!;
const $h = (s: string) => app.querySelector(s) as HTMLElement;

// ---------- top bar ----------
function drawTop() {
  countUp($h('.w-num'), save.balance);
  countUp($h('.w-invv'), invValue());
  drawRank();
  $h('.tb-sound').innerHTML = icon(save.settings.sound ? 'sound' : 'mute');
  $h('.tb-sound').setAttribute('aria-pressed', String(save.settings.sound));
  $h('.tb-avatar').innerHTML = avatarSVG(save.avatar, save.name);
  ensureMissions();
  const missionReady = save.missions.list.some((m) => !m.claimed && m.progress >= (missionDef(m.id)?.target ?? 1));
  $h('.tb-gift .dot').hidden = !(bonusReadyIn() === 0 || dailyReadyIn() === 0 || missionReady);
}

// The rank badge only changes its picture on a new level; the XP bars move by transform only.
let shownLvl = 0;
let barTimer = 0;
function drawRank() {
  const li = levelInfo();
  const st = stageOf(li.level);
  const lvlEl = $h('.lvl');
  lvlEl.style.setProperty('--nc', st.color);
  lvlEl.setAttribute('aria-label', `Karriere: ${rankName(li.level)}, Stufe ${li.level}`);
  $h('.lvl-title').innerHTML = `<b>${rankName(li.level)}</b> · ${li.need ? `${Math.floor(li.into).toLocaleString('de-DE')}/${li.need.toLocaleString('de-DE')} XP` : 'Höchste Stufe'}`;
  const bars = [$h('.lvl-bar i'), $h('.lvl-mini i')];
  const up = shownLvl > 0 && li.level > shownLvl;
  if (li.level !== shownLvl) {
    const b = $h('.lvl-b');
    b.innerHTML = rankBadge(li.level, 52, { live: true, title: false });
    armLive(b);
  }
  clearTimeout(barTimer);
  if (up && !reducedMotion()) {
    // fill to the end, snap back, then fill to the new progress
    pulseBadge($h('.lvl-rank'), st.color);
    bars.forEach((i) => (i.style.transform = 'scaleX(1)'));
    barTimer = window.setTimeout(() => {
      bars.forEach((i) => { i.style.transition = 'none'; i.style.transform = 'scaleX(0)'; });
      void bars[0].offsetWidth;
      bars.forEach((i) => { i.style.transition = ''; i.style.transform = `scaleX(${li.frac})`; });
    }, 720);
  } else bars.forEach((i) => (i.style.transform = `scaleX(${li.frac})`));
  shownLvl = li.level;
}
onLevelUp((e) => { if (e.stage) stageCeremony(e.stage); });

let lastBal = save.balance;
onChange(() => {
  if ((save.careerV ?? 1) < 2) { migrateCareer(); return; }
  const w = $h('.wallet');
  if (Math.abs(save.balance - lastBal) > 0.001) {
    w.classList.remove('up', 'down');
    void w.offsetWidth;
    w.classList.add(save.balance > lastBal ? 'up' : 'down');
  }
  lastBal = save.balance;
  drawTop();
});
$h('.tb-sound').addEventListener('click', () => { save.settings.sound = !save.settings.sound; commit(); if (save.settings.sound) sfx.click(); });

// Seven quick taps on the logo open the code pad.
let taps = 0, tapT = 0;
$h('.logo').addEventListener('click', () => {
  const now = performance.now();
  taps = now - tapT < 700 ? taps + 1 : 1;
  tapT = now;
  if (taps >= 7) { taps = 0; openPanelPad(); }
});

// ---------- live feed ----------
const track = $h('.feed-track');
function feedTile(e: FeedEntry): HTMLElement {
  const s = skinById(e.item.skin);
  const r = s?.rarity ?? 'milspec';
  const n = names(e.item);
  const t = el<HTMLAnchorElement>(`<a class="ftile r-${r}${e.you ? ' you' : ''}" href="#/case/${e.caseId ?? ''}" title="${esc(`${e.who} (${rankName(e.lvl)}, Stufe ${e.lvl}): ${n.full} · ${fmt(e.value)} Coins · ${e.via}`)}"><span class="ft-art"></span><span class="ft-txt"><small>${esc(n.weapon)}</small><b>${esc(n.skin)}</b></span><span class="ft-who">${rankBadge(e.lvl, 16, { title: false })}<span class="ft-n" style="--nc:${stageOf(e.lvl).color}">${esc(e.who)}</span></span></a>`);
  t.style.setProperty('--rc', rColor(r));
  if (!e.caseId) t.removeAttribute('href');
  t.querySelector('.ft-art')!.appendChild(skinArt(e.item, 84, 50));
  return t;
}
function drawFeed() { track.replaceChildren(...feed.slice(0, feedMax()).map(feedTile)); }
// Only as many tiles as fit (plus one to slide in); the track never grows.
let feedVW = innerWidth;
let feedTileW = 0;
addEventListener('resize', () => { feedVW = innerWidth; feedTileW = 0; });
const feedMax = () => Math.min(24, Math.ceil(feedVW / 140) + 2);
let slide: Animation | null = null;
onFeed((e) => {
  const t = feedTile(e);
  const anim = !reducedMotion() && document.visibilityState === 'visible';
  if (anim) t.classList.add('new');
  track.prepend(t);
  while (track.children.length > feedMax()) track.lastElementChild!.remove();
  if (anim && typeof track.animate === 'function') {
    // slide the whole strip by one tile with a transform (compositor only, no relayout per frame)
    // (tile width read once per viewport size: offsetWidth forces a layout)
    const w = (feedTileW ||= t.offsetWidth) + 6;
    slide?.cancel();
    slide = track.animate([{ transform: `translateX(${-w}px)` }, { transform: 'none' }], { duration: 550, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
});

// ---------- router ----------
let cleanup: Cleanup;
function route() {
  const hash = location.hash.replace(/^#\/?/, '') || 'cases';
  const parts = hash.split('/').map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  if (parts[0] === 'page') return; // skip link
  // Without the code in this session the dev page is just the start page.
  if (parts[0] === 'brunnen' && !devUnlocked()) parts[0] = 'cases';
  const [id, ...args] = parts;
  const nav = NAV.find((n) => n.id === id);
  const extra = EXTRA[id];
  const page = nav?.page ?? extra?.page ?? casesPage;
  const navId = nav?.id ?? extra?.nav ?? 'cases';
  if (typeof cleanup === 'function') cleanup();
  cleanup = undefined;
  closeAllModals();
  app.querySelectorAll<HTMLElement>('[data-nav]').forEach((a) => {
    const on = a.dataset.nav === navId;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  // Scroll up while the old page's layout is still clean: doing it after the new page is in forced
  // a synchronous layout of the whole new page inside this task. The nav is centred in the next
  // frame, where the layout happens anyway.
  if (scrollY) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  requestAnimationFrame(() => {
    const navLink = app.querySelector('.sidenav .on') as HTMLElement | null;
    if (navLink) { const nv = app.querySelector('.sidenav') as HTMLElement; if (nv.scrollWidth > nv.clientWidth) nv.scrollLeft = navLink.offsetLeft - nv.clientWidth / 2 + navLink.clientWidth / 2; }
  });
  const fresh = document.createElement('div');
  fresh.className = 'page page-in';
  pageEl.replaceChildren(fresh);
  try {
    cleanup = page(fresh, args);
  } catch (err) {
    console.error(err);
    fresh.innerHTML = '<div class="empty-state"><b>Hier ist etwas schiefgelaufen.</b><a class="btn primary" href="#/cases">Zu den Kisten</a></div>';
  }
  const label = nav?.label ?? extra?.label ?? '';
  document.title = label ? `${label} · CS Gambler` : 'CS Gambler';
}
addEventListener('hashchange', route);

// ---------- boot ----------
// Dev-only hook for the walkthrough scripts in devpages/.
if (import.meta.env.DEV) (window as unknown as { __csg: object }).__csg = { save, commit, setLuck };
migrateCareer();
ensureMissions();
checkAchievements();
startFeed();
drawFeed();
drawTop();
route();
// Bonus-ready dot refreshes once a minute.
setInterval(drawTop, 60_000);
