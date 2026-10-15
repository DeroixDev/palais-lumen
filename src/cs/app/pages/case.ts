// One case: art, opener with 1–5 stacked reels, result, and the "Inhalt" grid.

import type { CaseDef, ItemInstance, SkinDef } from '../../contract';
import { skinById, warmSkinsAsync } from '../lib/assets';
import { caseRTP, itemValue, rarityIndex, rollCase, skinRange, tierOdds } from '../lib/economy';
import { DAILY_ID, addXP, dailyReadyIn, getCase, level, priceOf, xpFor, checkAchievements } from '../lib/career';
import { luck } from '../lib/panel';
import * as M from '../lib/mods';
import { commit, emit, save, sellItems, spend, findItem } from '../lib/state';
import { pushMine } from '../lib/feed';
import { sfx } from '../lib/sound';
import { esc, fmt, fmtInt, hms, pct, sleep } from '../lib/util';
import { icon } from '../ui/icons';
import { itemCard, rColor, rName, skinCard, names } from '../ui/items';
import { Reel } from '../ui/reel';
import { burstAt, flash, shake } from '../ui/fx';
import { openModal, type ModalHandle } from '../ui/modal';
import { itemInfo, open3D, openItemDetail } from '../ui/detail';
import { toast } from '../ui/toast';
import { caseArt, sectionLabel } from './cases';
import type { Page } from './page';

/** Records one opened item everywhere (stats, XP, missions, feed). Item must already be in the inventory. */
export function recordDrop(c: CaseDef, it: ItemInstance, price: number, via = c.name, toFeed = true) {
  const v = itemValue(it);
  const s = skinById(it.skin)!;
  save.stats.opened++;
  save.stats.dropValue += v;
  if (s.rarity === 'gold') save.stats.golds++;
  if (s.rarity === 'covert') save.stats.coverts++;
  if (!save.stats.best || v > save.stats.best.value) save.stats.best = { item: { ...it }, value: v, caseId: c.id, ts: Date.now() };
  save.recent.unshift({ item: { ...it }, value: v, caseId: c.id, ts: Date.now() });
  if (save.recent.length > 30) save.recent.pop();
  addXP(xpFor(price));
  emit({ t: 'open', caseId: c.id, item: it, value: v, price });
  if (toFeed) pushMine(it, via, c.id === DAILY_ID ? undefined : c.id);
}

function infoModal(c: CaseDef) {
  const odds = tierOdds(c);
  const rows = odds.map((o) => `<tr><td><i class="rdot" style="background:${rColor(o.rarity)}"></i>${esc(rName(o.rarity))}</td><td class="mono">${c.contents[o.rarity]?.length ?? 0}</td><td class="mono">${pct(o.p, o.p < 0.01 ? 3 : 2)}</td></tr>`).join('');
  openModal(`<div class="rules">
    <h2>${esc(c.name)} · Regeln</h2>
    <table class="tbl"><thead><tr><th>Seltenheit</th><th>Skins</th><th>Chance</th></tr></thead><tbody>${rows}</tbody></table>
    <ul>
      <li>Jede Seltenheitsstufe wird zuerst gezogen, dann ein Skin daraus mit gleicher Chance.</li>
      <li>Der Float (Abnutzung) liegt gleichverteilt im Bereich des Skins. Niedriger Float = mehr Wert.</li>
      <li>10 % aller Drops sind StatTrak™ (×1,6 bis ×2 Wert). ★ Gegenstände gibt es nicht als StatTrak™.</li>
      <li>Seltene Muster (bestimmte Muster-Nummern) bringen +25 % Wert.</li>
      ${c.id === DAILY_ID ? '<li>Die Tageskiste ist alle 24 Stunden gratis. Mit jedem neuen Rang wird ihr Inhalt besser.</li>' : `<li>Erwartete Auszahlung dieser Kiste: <b class="mono">${pct(caseRTP(c), 1)}</b> des Preises.</li>`}
    </ul></div>`, { label: 'Regeln' });
}

export const casePage: Page = (root, args) => {
  const found = getCase(args[0] ?? '');
  if (!found) {
    root.innerHTML = `<div class="empty-state"><b>Diese Kiste gibt es nicht.</b><a class="btn primary" href="#/cases">Zu den Kisten</a></div>`;
    return;
  }
  const c: CaseDef = found;
  const daily = c.id === DAILY_ID;
  const price = priceOf(c);
  let count = daily ? 1 : Math.min(5, Math.max(1, Number(sessionStorageGet('csg.count')) || 1));
  let busy = false;
  let alive = true;
  const pending: string[] = [];

  root.innerHTML = `
  <a class="crumb" href="#/cases">${icon('back')} Alle Kisten</a>
  <section class="case-top" style="--ca:${c.look.a};--cb:${c.look.b}">
    <div class="ct-bg"></div>
    <div class="ct-art"></div>
    <div class="ct-info">
      <span class="eyebrow">${daily ? 'Gratis alle 24 Stunden' : esc(sectionLabel(c))}</span>
      <h1>${esc(c.name)}</h1>
      <div class="ct-meta">${daily ? '' : `<span class="pricetag"><span class="coin"></span><span class="mono">${fmt(price)}</span></span>`}<button class="btn ghost sm info-btn" type="button">Info</button></div>
    </div>
  </section>
  <section class="opener">
    <div class="reels"></div>
    <div class="op-controls">
      <div class="counts" role="group" aria-label="Anzahl"></div>
      ${daily || (c.level > level() && !M.on('cs.unlock')) ? '' : `<a class="pl-entry" href="#/palette/${esc(c.id)}" title="Die Palette: 10 bis 100 Kisten auf einmal">${icon('cases')}Palette<small>×10–100</small></a>`}
      <button class="btn primary xl open-btn" type="button"></button>
      <div class="op-toggles">
        <button class="toggle fast-btn" type="button" aria-pressed="${save.settings.fast}">${icon('bolt')} Schnell</button>
      </div>
    </div>
  </section>
  <section class="contents">
    <h2 class="sec-h"><span>Inhalt</span><small>${Object.values(c.contents).reduce((a, l) => a + (l?.length ?? 0), 0)} Skins</small></h2>
    <div class="tier-strip"></div>
    <div class="skin-grid"></div>
  </section>`;

  caseArt(root.querySelector('.ct-art') as HTMLElement, c, 300, 225);
  try { void warmSkinsAsync(Object.values(c.contents).flat().filter(Boolean) as string[]); } catch { /* optional */ }
  root.querySelector('.info-btn')!.addEventListener('click', () => infoModal(c));

  // ----- contents -----
  const odds = tierOdds(c);
  root.querySelector('.tier-strip')!.innerHTML = [...odds].reverse().map((o) => `<span class="tchip" style="--rc:${rColor(o.rarity)}"><i></i>${esc(rName(o.rarity))}<b class="mono">${pct(o.p, o.p < 0.01 ? 2 : 2)}</b></span>`).join('');
  const grid = root.querySelector('.skin-grid') as HTMLElement;
  const skins: { s: SkinDef; p: number }[] = [];
  for (const o of odds) for (const id of c.contents[o.rarity] ?? []) { const s = skinById(id); if (s) skins.push({ s, p: o.p / c.contents[o.rarity]!.length }); }
  skins.sort((a, b) => rarityIndex(b.s.rarity) - rarityIndex(a.s.rarity) || b.s.basePrice - a.s.basePrice);
  // Render in small batches so the page appears at once.
  let gi = 0;
  const batch = () => {
    if (!alive) return;
    for (let k = 0; k < 12 && gi < skins.length; k++, gi++) {
      const { s, p } = skins[gi];
      const [lo, hi] = skinRange(s);
      grid.appendChild(skinCard(s, `<div class="sk-foot"><span class="mono sk-range">${short(lo)} – ${short(hi)}</span><span class="mono sk-p">${pct(p, p < 0.001 ? 3 : 2)}</span></div>`));
    }
    if (gi < skins.length) requestAnimationFrame(batch);
  };
  batch();

  // ----- opener -----
  const reelsBox = root.querySelector('.reels') as HTMLElement;
  let reels: Reel[] = [];
  const buildReels = () => {
    reels = [];
    reelsBox.replaceChildren();
    reelsBox.className = `reels n${count}`;
    for (let i = 0; i < count; i++) { const r = new Reel(false); reels.push(r); reelsBox.appendChild(r.el); r.idle(c); }
  };
  const countsBox = root.querySelector('.counts') as HTMLElement;
  const openBtn = root.querySelector('.open-btn') as HTMLButtonElement;
  const free = () => (daily ? (dailyReadyIn() === 0 ? 1 : 0) : save.freeOpens[c.id] ?? 0);
  const locked = c.level > level() && !M.on('cs.unlock');
  const drawControls = () => {
    countsBox.innerHTML = daily ? '' : [1, 2, 3, 4, 5].map((n) => `<button type="button" class="cnt${n === count ? ' on' : ''}" data-n="${n}" ${busy ? 'disabled' : ''}>×${n}</button>`).join('');
    const f = free();
    openBtn.disabled = busy;
    openBtn.classList.remove('locked');
    if (locked) { openBtn.innerHTML = `${icon('lock')} Ab Stufe ${c.level}`; openBtn.disabled = true; openBtn.classList.add('locked'); }
    else if (daily && !f) { openBtn.innerHTML = `Wieder in <span class="mono">${hms(dailyReadyIn())}</span>`; openBtn.disabled = true; }
    else if (f && (count === 1 || daily)) openBtn.innerHTML = `${icon('gift')} Gratis öffnen${daily ? '' : ` <small>(${f})</small>`}`;
    else {
      const cost = price * count;
      openBtn.innerHTML = `Öffnen <span class="mono">${fmt(cost)}</span>`;
      if (save.balance + 1e-9 < cost) { openBtn.disabled = true; openBtn.innerHTML = `Zu wenig Coins · <span class="mono">${fmt(cost)}</span>`; }
    }
  };
  countsBox.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('.cnt') as HTMLElement | null;
    if (!b || busy) return;
    count = Number(b.dataset.n);
    sessionStorageSet('csg.count', String(count));
    sfx.click();
    buildReels();
    drawControls();
  });
  const fastBtn = root.querySelector('.fast-btn') as HTMLButtonElement;
  fastBtn.addEventListener('click', () => { save.settings.fast = !save.settings.fast; fastBtn.setAttribute('aria-pressed', String(save.settings.fast)); commit(); });

  async function open() {
    if (busy || locked) return;
    const f = free();
    const useFree = f > 0 && (count === 1 || daily);
    const n = daily ? 1 : count;
    const cost = useFree ? 0 : price * n;
    if (!useFree && !spend(cost)) { sfx.error(); shake(openBtn); return; }
    if (useFree) {
      if (daily) save.daily.caseAt = Date.now();
      else save.freeOpens[c.id] = f - 1;
    }
    busy = true;
    commit();
    drawControls();
    sfx.open();
    const wins = Array.from({ length: n }, () => rollCase(c, luck(), daily ? 'Tageskiste' : c.name, 'you'));
    // Into the inventory now (the save keeps them even if the page is left mid-spin); shown after the reveal.
    for (const w of wins.slice().reverse()) { save.inv.unshift(w); pending.push(w.uid); }
    if (reels.length !== n) buildReels();
    const anyGold = wins.some((w) => skinById(w.skin)?.rarity === 'gold');
    const fast = save.settings.fast;
    const base = (fast ? 1400 : anyGold ? 7600 : 5600) / Math.max(0.05, M.num('cs.speed'));
    const tiles = await Promise.all(reels.map((r, i) => r.spin(c, wins[i], { duration: base + (fast ? i * 80 : i * 260), sound: i === 0 && save.settings.sound })));
    if (!alive) return;
    const per = useFree ? 0 : price;
    wins.forEach((w) => recordDrop(c, w, per || (daily ? 1 : price), daily ? 'Tageskiste' : c.name));
    pending.length = 0;
    const best = wins.reduce((a, w) => (rarityIndex(skinById(w.skin)!.rarity) > rarityIndex(skinById(a.skin)!.rarity) ? w : a), wins[0]);
    const br = skinById(best.skin)!.rarity;
    sfx.reveal(br);
    if (br === 'gold') {
      flash('rgba(255,209,74,.55)');
      tiles.forEach((t, i) => { if (skinById(wins[i].skin)?.rarity === 'gold') burstAt(t, ['#ffd14a', '#fff2c0', '#ff8a1f', '#ffe9a0'], 140, 12); });
      shake(reelsBox);
    } else if (br === 'covert') {
      flash('rgba(235,75,75,.28)');
      tiles.forEach((t, i) => { if (skinById(wins[i].skin)?.rarity === 'covert') burstAt(t, ['#eb4b4b', '#ff9a8a', '#fff'], 70, 8); });
    } else if (br === 'classified') tiles.forEach((t, i) => { if (skinById(wins[i].skin)?.rarity === 'classified') burstAt(t, ['#d32ce6', '#f7a8ff'], 36, 6); });
    checkAchievements();
    commit();
    await sleep(br === 'gold' ? 900 : fast ? 250 : 450);
    if (!alive) return;
    busy = false;
    drawControls();
    showResult(wins);
  }
  openBtn.addEventListener('click', () => void open());

  function showResult(wins: ItemInstance[]) {
    const again = (m: ModalHandle) => { m.close(); setTimeout(() => void open(), 120); };
    const canAgain = () => !locked && (free() > 0 || save.balance + 1e-9 >= price * (daily ? 1 : count)) && !(daily && !free());
    if (wins.length === 1) {
      const it = wins[0];
      const wrap = document.createElement('div');
      wrap.className = 'result single';
      wrap.appendChild(itemInfo(it));
      const acts = document.createElement('div');
      acts.className = 'actions';
      acts.innerHTML = `<button class="btn primary sell" type="button">Verkaufen <span class="mono">${fmt(itemValue(it))}</span></button><button class="btn ghost keep" type="button">Behalten</button><button class="btn ghost i3d" type="button">Ansehen in 3D</button>${canAgain() ? `<button class="btn ghost again" type="button">Nochmal öffnen</button>` : ''}`;
      wrap.appendChild(acts);
      const r = skinById(it.skin)!.rarity;
      const m = openModal(wrap, { cls: `result-modal r-${r}`, label: names(it).full });
      acts.querySelector('.sell')!.addEventListener('click', () => { if (findItem(it.uid)) { const v = sellItems([it.uid]); sfx.sell(); toast('Verkauft', `+${fmt(v)} Coins`, 'good', '¢'); } m.close(); drawControls(); });
      acts.querySelector('.keep')!.addEventListener('click', () => m.close());
      acts.querySelector('.i3d')!.addEventListener('click', () => void open3D(it));
      acts.querySelector('.again')?.addEventListener('click', () => { if (findItem(it.uid)) { /* keep it */ } again(m); });
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'result multi';
    const total = wins.reduce((a, w) => a + itemValue(w), 0);
    const spent = price * wins.length;
    wrap.innerHTML = `<h2>Deine Drops <small class="mono ${total >= spent ? 'pos' : 'neg'}">${fmt(total)} Coins</small></h2><div class="res-grid"></div><div class="actions"><button class="btn primary sellall" type="button">Alle verkaufen <span class="mono">${fmt(total)}</span></button><button class="btn ghost keep" type="button">Alle behalten</button>${canAgain() ? `<button class="btn ghost again" type="button">Nochmal öffnen</button>` : ''}</div><p class="hint">Tippe einen Skin an für Details und 3D.</p>`;
    const g = wrap.querySelector('.res-grid') as HTMLElement;
    wins.forEach((w, i) => { const card = itemCard(w, { selectable: true }); card.style.animationDelay = `${i * 70}ms`; card.classList.add('pop'); g.appendChild(card); });
    const m = openModal(wrap, { cls: 'result-modal wide', label: 'Deine Drops' });
    g.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest('.icard') as HTMLElement | null;
      const it = card && findItem(card.dataset.uid!);
      if (it) openItemDetail(it);
    });
    wrap.querySelector('.sellall')!.addEventListener('click', () => {
      const ids = wins.map((w) => w.uid).filter((u) => findItem(u));
      if (ids.length) { const v = sellItems(ids); sfx.sell(); toast(`${ids.length} Skins verkauft`, `+${fmt(v)} Coins`, 'good', '¢'); }
      m.close(); drawControls();
    });
    wrap.querySelector('.keep')!.addEventListener('click', () => m.close());
    wrap.querySelector('.again')?.addEventListener('click', () => again(m));
  }

  buildReels();
  drawControls();
  const iv = setInterval(() => { if (!busy && daily) drawControls(); }, 1000);
  return () => {
    alive = false;
    clearInterval(iv);
    // Left mid-spin: the drops are already in the inventory; count them now.
    if (pending.length) {
      const items = pending.map((u) => findItem(u)).filter(Boolean) as ItemInstance[];
      items.forEach((w) => recordDrop(c, w, price || 1));
      pending.length = 0;
      commit();
    }
  };
};

const short = (v: number) => (v >= 100 ? fmtInt(v) : fmt(v));
function sessionStorageGet(k: string) { try { return sessionStorage.getItem(k); } catch { return null; } }
function sessionStorageSet(k: string, v: string) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } }
