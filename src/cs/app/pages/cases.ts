// Kisten: the shop front. Featured banner, daily case, grouped grid with filters, sort and search.

import type { CaseDef } from '../../contract';
import { CASES, renderCase } from '../lib/assets';
import { casePrice, tierOdds } from '../lib/economy';
import { dailyCase, dailyReadyIn, level, bonusReadyIn, bonusAmount, claimBonus, isBroke, claimRescue, rescueReadyIn } from '../lib/career';
import { save } from '../lib/state';
import * as M from '../lib/mods';
import { esc, fmt, hms } from '../lib/util';
import { icon } from '../ui/icons';
import { rColor } from '../ui/items';
import { toast } from '../ui/toast';
import { sfx } from '../lib/sound';
import type { Page } from './page';

export const CAT_LABEL: Record<CaseDef['category'], string> = { starter: 'Einsteiger', standard: 'Standard', premium: 'Premium', gold: 'Gold', event: 'Event' };
const CAT_ORDER: CaseDef['category'][] = ['starter', 'standard', 'premium', 'gold', 'event'];

let ui = { q: '', cat: 'all', sort: 'rec', unlocked: false };

/** Case art into a holder, after a frame so the skeleton shows first. */
export function caseArt(holder: HTMLElement, c: CaseDef, w: number, h: number) {
  holder.classList.add('skel');
  const go = () => {
    try {
      const cv = renderCase(c, w, h);
      cv.style.width = '100%';
      cv.style.height = 'auto';
      cv.style.aspectRatio = `${w} / ${h}`;
      holder.replaceChildren(cv);
    } catch { /* keep the skeleton */ }
    holder.classList.remove('skel');
  };
  if ('requestIdleCallback' in window) (window as unknown as { requestIdleCallback(f: () => void, o?: object): void }).requestIdleCallback(go, { timeout: 300 });
  else setTimeout(go, 16);
}

function caseCard(c: CaseDef, lvl: number): HTMLElement {
  const locked = c.level > lvl && !M.on('cs.unlock');
  const free = save.freeOpens[c.id] ?? 0;
  const a = document.createElement('a');
  a.className = `ccard${locked ? ' locked' : ''}`;
  a.href = `#/case/${c.id}`;
  a.style.setProperty('--ca', c.look.a);
  a.style.setProperty('--cb', c.look.b);
  const top = tierOdds(c).filter((t) => t.rarity !== 'milspec');
  a.innerHTML = `
    <div class="cc-glow"></div>
    ${free ? `<span class="cc-free">${free}× gratis</span>` : ''}
    ${c.contents.gold?.length ? '<span class="cc-gold" title="Enthält ★ Gegenstände">★</span>' : ''}
    <div class="cc-art"></div>
    <div class="cc-name">${esc(c.name)}</div>
    <div class="cc-tiers">${top.map((t) => `<i style="background:${rColor(t.rarity)}"></i>`).join('')}</div>
    <div class="cc-price">${locked ? `${icon('lock')} Stufe ${c.level}` : `<span class="coin"></span><span class="mono">${fmt(casePrice(c))}</span>`}</div>`;
  caseArt(a.querySelector('.cc-art') as HTMLElement, c, 220, 165);
  return a;
}

export const casesPage: Page = (root) => {
  const lvl = level();
  const featured = [...CASES].filter((c) => c.level <= lvl).sort((a, b) => casePrice(b) - casePrice(a))[0] ?? CASES[0];
  const daily = dailyCase();
  root.innerHTML = `
  <section class="hero">
    <a class="hero-main" href="#/case/${featured.id}" style="--ca:${featured.look.a};--cb:${featured.look.b}">
      <div class="hero-bg"></div>
      <div class="hero-text"><span class="eyebrow">Empfohlen</span><h1>${esc(featured.name)}</h1><p>Messer, Handschuhe und die seltensten Muster. Wer traut sich?</p><span class="btn primary lg">Jetzt öffnen · <span class="mono">${fmt(casePrice(featured))}</span></span></div>
      <div class="hero-art"></div>
    </a>
    <div class="hero-side">
      <a class="daily-card" href="#/case/${daily.id}">
        <div class="dc-art"></div>
        <div class="dc-text"><span class="eyebrow">Gratis</span><b>${esc(daily.name)}</b><span class="dc-time"></span></div>
      </a>
      <div class="bonus-card">
        <div><span class="eyebrow">Tagesbonus</span><b class="mono">+${bonusAmount()} Coins</b></div>
        <button class="btn primary sm bonus-btn" type="button"></button>
      </div>
    </div>
  </section>
  <div class="broke-bar" hidden></div>
  <div class="filters">
    <label class="search">${icon('search')}<input type="search" placeholder="Kiste suchen" aria-label="Kiste suchen" value="${esc(ui.q)}"></label>
    <div class="chips" role="group" aria-label="Kategorie">${[['all', 'Alle'], ...CAT_ORDER.map((c) => [c, CAT_LABEL[c]])].map(([id, l]) => `<button type="button" class="chip${ui.cat === id ? ' on' : ''}" data-cat="${id}">${l}</button>`).join('')}</div>
    <label class="check"><input type="checkbox" class="only-open" ${ui.unlocked ? 'checked' : ''}> Nur freigeschaltet</label>
    <select class="sel sort" aria-label="Sortieren">
      <option value="rec">Empfohlen</option><option value="asc">Preis aufsteigend</option><option value="desc">Preis absteigend</option><option value="lvl">Stufe</option><option value="name">Name</option>
    </select>
  </div>
  <div class="case-groups"></div>`;
  (root.querySelector('.sort') as HTMLSelectElement).value = ui.sort;
  caseArt(root.querySelector('.hero-art') as HTMLElement, featured, 420, 315);
  caseArt(root.querySelector('.dc-art') as HTMLElement, daily, 140, 105);

  const groups = root.querySelector('.case-groups') as HTMLElement;
  const draw = () => {
    const q = ui.q.trim().toLowerCase();
    let list = CASES.filter((c) => (!q || c.name.toLowerCase().includes(q)) && (ui.cat === 'all' || c.category === ui.cat) && (!ui.unlocked || c.level <= lvl));
    const sorters: Record<string, (a: CaseDef, b: CaseDef) => number> = {
      rec: (a, b) => a.level - b.level || casePrice(a) - casePrice(b),
      asc: (a, b) => casePrice(a) - casePrice(b),
      desc: (a, b) => casePrice(b) - casePrice(a),
      lvl: (a, b) => a.level - b.level,
      name: (a, b) => a.name.localeCompare(b.name, 'de'),
    };
    list = list.sort(sorters[ui.sort]);
    groups.innerHTML = '';
    if (!list.length) { groups.innerHTML = '<div class="empty-state"><b>Keine Kiste gefunden.</b><span>Andere Suche oder Kategorie probieren.</span></div>'; return; }
    const cats = ui.sort === 'rec' ? CAT_ORDER : (['all'] as const);
    for (const cat of cats) {
      const items = cat === 'all' ? list : list.filter((c) => c.category === cat);
      if (!items.length) continue;
      const sec = document.createElement('section');
      sec.className = 'cgroup';
      if (cat !== 'all') sec.innerHTML = `<h2 class="sec-h"><span>${CAT_LABEL[cat]}</span><small>${items.length} Kisten</small></h2>`;
      const grid = document.createElement('div');
      grid.className = 'case-grid';
      items.forEach((c) => grid.appendChild(caseCard(c, lvl)));
      sec.appendChild(grid);
      groups.appendChild(sec);
    }
  };
  draw();

  root.querySelector('.search input')!.addEventListener('input', (e) => { ui.q = (e.target as HTMLInputElement).value; draw(); });
  root.querySelectorAll<HTMLButtonElement>('.chip').forEach((b) => b.addEventListener('click', () => {
    ui.cat = b.dataset.cat!;
    root.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b));
    draw();
  }));
  root.querySelector('.only-open')!.addEventListener('change', (e) => { ui.unlocked = (e.target as HTMLInputElement).checked; draw(); });
  root.querySelector('.sort')!.addEventListener('change', (e) => { ui.sort = (e.target as HTMLSelectElement).value; draw(); });

  // Live timers for the daily case, bonus and rescue.
  const bonusBtn = root.querySelector('.bonus-btn') as HTMLButtonElement;
  const dcTime = root.querySelector('.dc-time') as HTMLElement;
  const broke = root.querySelector('.broke-bar') as HTMLElement;
  const tick = () => {
    const d = dailyReadyIn();
    dcTime.innerHTML = d ? `wieder in <span class="mono">${hms(d)}</span>` : '<span class="ready">Bereit!</span>';
    const b = bonusReadyIn();
    bonusBtn.disabled = b > 0;
    bonusBtn.innerHTML = b ? `<span class="mono">${hms(b)}</span>` : 'Abholen';
    if (isBroke()) {
      broke.hidden = false;
      const r = rescueReadyIn();
      broke.innerHTML = `<span>${icon('bolt')} Knapp bei Kasse? Hol dir eine Finanzspritze und mach weiter.</span><button class="btn primary sm" type="button" ${r ? 'disabled' : ''}>${r ? `in ${hms(r)}` : 'Finanzspritze holen'}</button>`;
    } else broke.hidden = true;
  };
  broke.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('button')) return;
    const n = claimRescue();
    if (n) { sfx.coin(); toast('Finanzspritze', `+${fmt(n)} Coins`, 'good', '¢'); tick(); }
  });
  bonusBtn.addEventListener('click', () => {
    const n = claimBonus();
    if (n) { sfx.coin(); toast('Tagesbonus abgeholt', `+${fmt(n)} Coins`, 'good', '¢'); tick(); }
  });
  tick();
  const iv = setInterval(tick, 1000);
  return () => clearInterval(iv);
};
