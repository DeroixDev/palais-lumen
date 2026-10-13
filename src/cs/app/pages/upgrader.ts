// Upgrader: stake 1–6 of your skins (plus coins) for a chance at a pricier skin.

import type { ItemInstance, SkinDef } from '../../contract';
import { SKINS } from '../lib/assets';
import { itemValue, makeItem, valueOf } from '../lib/economy';
import { luck } from '../lib/panel';
import { addItem, commit, emit, findItem, removeItems, save, spend } from '../lib/state';
import { addXP, xpFor, checkAchievements } from '../lib/career';
import { pushMine } from '../lib/feed';
import { sfx } from '../lib/sound';
import { clamp, fmt, pct, reducedMotion } from '../lib/util';
import { itemCard, rColor, names, skinOf } from '../ui/items';
import { burstAt, flash, shake } from '../ui/fx';
import { openItemDetail } from '../ui/detail';
import { toast } from '../ui/toast';
import { pageHead, type Page } from './page';

const MAX_IN = 6;
const HOUSE = 0.9;
const CAP = 0.75;

export function upgradeChance(stake: number, target: number): number {
  if (target <= 0 || stake <= 0) return 0;
  const fair = Math.min(CAP, (stake / target) * HOUSE);
  return clamp(fair * luck(), 0, luck() > 1 ? 0.95 : CAP);
}

export const upgraderPage: Page = (root) => {
  const picked: string[] = [];
  let coins = 0;
  let target: ItemInstance | null = null;
  let busy = false;
  let alive = true;
  let tq = '';
  let tsort: 'asc' | 'desc' = 'asc';

  root.innerHTML = `
  ${pageHead('Upgrader', 'Setze bis zu 6 Skins ein und wähle ein teureres Ziel. Je größer der Sprung, desto kleiner die Chance.')}
  <section class="upg">
    <div class="upg-side upg-in"><h3>Dein Einsatz</h3><div class="upg-slots"></div>
      <label class="upg-coins">+ Coins <input type="number" min="0" step="0.5" inputmode="decimal" value="0" aria-label="Coins dazulegen"></label>
      <div class="upg-sum">Wert <b class="mono in-v">0,00</b></div></div>
    <div class="upg-ring">
      <svg viewBox="0 0 200 200" class="ring" aria-hidden="true">
        <circle cx="100" cy="100" r="84" class="ring-bg"/>
        <circle cx="100" cy="100" r="84" class="ring-arc" pathLength="1000" stroke-dasharray="0 1000"/>
        <g class="ring-ticks"></g>
        <g class="needle"><path d="M100 28 L91 2 L109 2 Z"/></g>
      </svg>
      <div class="ring-center"><b class="mono chance">0,00 %</b><small>Chance</small><span class="mult mono"></span></div>
      <button class="btn primary xl upg-go" type="button" disabled>Upgrade</button>
    </div>
    <div class="upg-side upg-out"><h3>Ziel</h3><div class="upg-target"></div></div>
  </section>
  <div class="upg-lists">
    <section class="panel"><h3 class="panel-h">Deine Skins <small class="mono inv-n"></small></h3><div class="mini-grid my-items"></div></section>
    <section class="panel"><h3 class="panel-h">Ziel wählen
      <span class="quick">${[1.5, 2, 5, 10, 20].map((m) => `<button type="button" class="chip q" data-m="${m}">×${String(m).replace('.', ',')}</button>`).join('')}</span></h3>
      <div class="filters tight"><label class="search"><input type="search" class="tq" placeholder="Ziel suchen" aria-label="Ziel suchen"></label><select class="sel tsort" aria-label="Sortieren"><option value="asc">Preis aufsteigend</option><option value="desc">Preis absteigend</option></select></div>
      <div class="mini-grid targets"></div></section>
  </div>`;

  const ticks = root.querySelector('.ring-ticks')!;
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const r1 = i % 5 ? 94 : 92, r2 = 98;
    ticks.insertAdjacentHTML('beforeend', `<line x1="${100 + Math.sin(a) * r1}" y1="${100 - Math.cos(a) * r1}" x2="${100 + Math.sin(a) * r2}" y2="${100 - Math.cos(a) * r2}"/>`);
  }
  const arc = root.querySelector('.ring-arc') as SVGCircleElement;
  const needle = root.querySelector('.needle') as SVGGElement;
  const ringBox = root.querySelector('.upg-ring') as HTMLElement;
  const goBtn = root.querySelector('.upg-go') as HTMLButtonElement;
  const coinIn = root.querySelector('.upg-coins input') as HTMLInputElement;
  let arcStart = 0;

  const stakeValue = () => picked.reduce((a, u) => a + (findItem(u) ? itemValue(findItem(u)!) : 0), 0) + coins;
  const targetValue = () => (target ? itemValue(target) : 0);
  const chance = () => upgradeChance(stakeValue(), targetValue());

  function drawRing() {
    const ch = chance();
    arc.setAttribute('stroke-dasharray', `${ch * 1000} 1000`);
    arc.style.transform = `rotate(${arcStart * 360 - 90}deg)`;
    (root.querySelector('.chance') as HTMLElement).textContent = pct(ch);
    const m = stakeValue() > 0 && target ? targetValue() / stakeValue() : 0;
    (root.querySelector('.mult') as HTMLElement).textContent = m ? `×${m.toFixed(2).replace('.', ',')}` : '';
    goBtn.disabled = busy || !target || stakeValue() <= 0 || targetValue() <= stakeValue();
  }
  function drawSlots() {
    const slots = root.querySelector('.upg-slots') as HTMLElement;
    slots.replaceChildren();
    for (let i = 0; i < MAX_IN; i++) {
      const it = picked[i] ? findItem(picked[i]) : undefined;
      if (it) { const c = itemCard(it, { selectable: true, size: 'sm' }); c.classList.add('slot-item'); slots.appendChild(c); }
      else slots.insertAdjacentHTML('beforeend', '<div class="slot-empty"><span>+</span></div>');
    }
    (root.querySelector('.in-v') as HTMLElement).textContent = fmt(stakeValue());
  }
  function drawTarget() {
    const box = root.querySelector('.upg-target') as HTMLElement;
    box.replaceChildren();
    if (!target) { box.innerHTML = '<div class="slot-empty big"><span>?</span><small>Wähle unten ein Ziel</small></div>'; return; }
    const c = itemCard(target, {});
    c.classList.add('target-card');
    box.appendChild(c);
  }
  function drawMine() {
    const g = root.querySelector('.my-items') as HTMLElement;
    const list = save.inv.slice().sort((a, b) => itemValue(b) - itemValue(a));
    (root.querySelector('.inv-n') as HTMLElement).textContent = `${list.length}`;
    g.replaceChildren();
    if (!list.length) { g.innerHTML = '<div class="empty-state small"><b>Keine Skins.</b><a href="#/cases">Kisten öffnen</a></div>'; return; }
    list.slice(0, 120).forEach((it) => g.appendChild(itemCard(it, { selectable: true, size: 'sm', selected: picked.includes(it.uid), disabled: busy })));
  }
  const targetFor = (s: SkinDef): ItemInstance => {
    const f = clamp(0.2, s.floatMin, s.floatMax - 0.0001);
    const it = makeItem(s, 'Upgrader', f);
    it.statTrak = false;
    it.seed = 500;
    return it;
  };
  function drawTargets() {
    const g = root.querySelector('.targets') as HTMLElement;
    const min = Math.max(stakeValue() * 1.05, 0.05);
    const q = tq.trim().toLowerCase();
    let list = SKINS.map((s) => ({ s, v: valueOf(s, clamp(0.2, s.floatMin, s.floatMax - 0.0001), 500, false) }))
      .filter((x) => x.v > min && (!q || `${names({ skin: x.s.id, statTrak: false }).full}`.toLowerCase().includes(q)));
    list.sort((a, b) => (tsort === 'asc' ? a.v - b.v : b.v - a.v));
    list = list.slice(0, 60);
    g.replaceChildren();
    if (!list.length) { g.innerHTML = '<div class="empty-state small"><b>Kein Ziel in dieser Preisklasse.</b></div>'; return; }
    for (const { s } of list) {
      const t = targetFor(s);
      const card = itemCard(t, { selectable: true, size: 'sm', selected: target?.skin === s.id });
      card.dataset.skin = s.id;
      g.appendChild(card);
    }
  }
  const drawAll = () => { drawSlots(); drawTarget(); drawMine(); drawTargets(); drawRing(); };

  root.querySelector('.my-items')!.addEventListener('click', (e) => {
    const card = (e.target as HTMLElement).closest('.icard') as HTMLElement | null;
    if (!card || busy) return;
    const uid = card.dataset.uid!;
    const i = picked.indexOf(uid);
    if (i >= 0) picked.splice(i, 1);
    else if (picked.length < MAX_IN) picked.push(uid);
    else { sfx.error(); toast('Höchstens 6 Skins', '', 'bad'); return; }
    sfx.click();
    if (target && targetValue() <= stakeValue()) target = null;
    drawAll();
  });
  root.querySelector('.upg-slots')!.addEventListener('click', (e) => {
    const card = (e.target as HTMLElement).closest('.icard') as HTMLElement | null;
    if (!card || busy) return;
    picked.splice(picked.indexOf(card.dataset.uid!), 1);
    drawAll();
  });
  root.querySelector('.targets')!.addEventListener('click', (e) => {
    const card = (e.target as HTMLElement).closest('.icard') as HTMLElement | null;
    if (!card || busy) return;
    const s = SKINS.find((x) => x.id === card.dataset.skin);
    if (!s) return;
    target = targetFor(s);
    sfx.click();
    arcStart = Math.random();
    drawTarget(); drawRing();
    root.querySelectorAll('.targets .icard').forEach((c) => c.classList.toggle('sel', c === card));
  });
  root.querySelector('.quick')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('.q') as HTMLElement | null;
    if (!b || busy) return;
    const want = stakeValue() * Number(b.dataset.m);
    if (!stakeValue()) { toast('Erst Einsatz wählen', 'Wähle links Skins oder lege Coins dazu.', 'bad'); return; }
    let best: SkinDef | null = null, bd = Infinity;
    for (const s of SKINS) {
      const v = valueOf(s, clamp(0.2, s.floatMin, s.floatMax - 0.0001), 500, false);
      if (v <= stakeValue()) continue;
      const d = Math.abs(Math.log(v / want));
      if (d < bd) { bd = d; best = s; }
    }
    if (best) { target = targetFor(best); arcStart = Math.random(); sfx.click(); drawTarget(); drawTargets(); drawRing(); }
  });
  root.querySelector('.tq')!.addEventListener('input', (e) => { tq = (e.target as HTMLInputElement).value; drawTargets(); });
  root.querySelector('.tsort')!.addEventListener('change', (e) => { tsort = (e.target as HTMLSelectElement).value as 'asc' | 'desc'; drawTargets(); });
  coinIn.addEventListener('input', () => {
    coins = clamp(Math.round((parseFloat(coinIn.value.replace(',', '.')) || 0) * 100) / 100, 0, save.balance);
    drawSlots(); drawRing();
  });
  coinIn.addEventListener('change', () => { coinIn.value = String(coins); drawTargets(); });
  root.querySelector('.upg-target')!.addEventListener('click', () => { if (target && !busy) openItemDetail(target); });

  goBtn.addEventListener('click', async () => {
    if (busy || !target) return;
    const stake = stakeValue();
    const ch = chance();
    const items = picked.map((u) => findItem(u)).filter(Boolean) as ItemInstance[];
    if (coins > 0 && !spend(coins)) { sfx.error(); return; }
    busy = true;
    removeItems(items.map((i) => i.uid));
    commit();
    goBtn.disabled = true;
    drawMine();
    const u = Math.random();
    const won = u < ch;
    // Needle fraction: inside the arc on a win, outside on a loss.
    const frac = won ? arcStart + u : arcStart + ch + ((u - ch) / (1 - ch || 1)) * (1 - ch);
    const turns = reducedMotion() ? 0 : 5;
    const dur = save.settings.fast || reducedMotion() ? 1100 : 4200;
    needle.style.transition = 'none';
    needle.style.transform = 'rotate(0deg)';
    void needle.getBoundingClientRect();
    needle.style.transition = `transform ${dur}ms cubic-bezier(.12,.78,.18,1)`;
    needle.style.transform = `rotate(${(turns + (frac % 1)) * 360}deg)`;
    ringBox.classList.add('spinning');
    // Ticks while it turns.
    const t0 = performance.now();
    let lastSeg = -1;
    const tk = () => {
      if (!alive) return;
      const m = getComputedStyle(needle).transform;
      if (m && m !== 'none') {
        const [a, b] = m.slice(7, -1).split(',').map(Number);
        const seg = Math.floor(((Math.atan2(b, a) * 180) / Math.PI + 360) / 12);
        if (seg !== lastSeg) { lastSeg = seg; if (save.settings.sound) sfx.tick(); }
      }
      if (performance.now() - t0 < dur) requestAnimationFrame(tk);
    };
    requestAnimationFrame(tk);
    await new Promise((r) => setTimeout(r, dur + 120));
    if (!alive && !won) { finish(); return; }
    ringBox.classList.remove('spinning');
    finish();
    function finish() {
      save.stats.upgrades++;
      if (won) {
        const got = { ...target!, uid: target!.uid + 'w' };
        addItem(got);
        save.stats.upgradesWon++;
        pushMine(got, 'Upgrader');
        if (alive) {
          ringBox.classList.add('win');
          sfx.win();
          sfx.reveal(skinOf(got).rarity);
          flash('rgba(80,220,120,.35)');
          burstAt(ringBox, ['#3fdc7a', '#ffd14a', '#fff', rColor(skinOf(got).rarity)], 120, 11);
          toast('Upgrade geschafft!', `${names(got).full} · ${fmt(itemValue(got))} Coins`, 'good', '⬆');
        }
      } else if (alive) {
        ringBox.classList.add('lose');
        sfx.lose();
        shake(ringBox);
        toast('Daneben', `${fmt(stake)} Coins Einsatz verloren`, 'bad', '✕');
      }
      addXP(xpFor(stake));
      emit({ t: 'upgrade', won, value: stake });
      checkAchievements();
      commit();
      if (!alive) return;
      setTimeout(() => {
        if (!alive) return;
        ringBox.classList.remove('win', 'lose');
        busy = false;
        picked.length = 0;
        coins = 0; coinIn.value = '0';
        target = null;
        drawAll();
      }, 1400);
    }
  });

  drawAll();
  return () => { alive = false; };
};
