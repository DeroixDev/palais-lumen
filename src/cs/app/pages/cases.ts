// Kisten: the shop front. Featured carousel, daily case, shelves (sections) with chips, sort and search.

import type { CaseDef, CaseSection } from '../../contract';
import { CASES, caseURL, caseURLNow } from '../lib/assets';
import { CASE_SECTIONS } from '../../data/catalog';
import { casePrice, tierOdds } from '../lib/economy';
import { dailyCase, dailyReadyIn, level, bonusReadyIn, bonusAmount, claimBonus, isBroke, claimRescue, rescueReadyIn } from '../lib/career';
import { save } from '../lib/state';
import * as M from '../lib/mods';
import { esc, fmt, hms } from '../lib/util';
import { icon } from '../ui/icons';
import { artImg, loadInto, rColor } from '../ui/items';
import { toast } from '../ui/toast';
import { sfx } from '../lib/sound';
import type { Page } from './page';
import './cases.css';

export const CAT_LABEL: Record<CaseDef['category'], string> = { starter: 'Einsteiger', standard: 'Standard', premium: 'Premium', gold: 'Gold', event: 'Event' };
const SEC_OF_CAT: Record<CaseDef['category'], CaseSection> = { starter: 'einsteiger', standard: 'klassiker', premium: 'premium', gold: 'messer', event: 'event' };
/** Shelf of a case (older or synthetic cases fall back to their category). */
export const sectionOf = (c: CaseDef): CaseSection => c.section ?? SEC_OF_CAT[c.category];
const SEC_NAME = new Map(CASE_SECTIONS.map((s) => [s.id, s.name]));
/** Shelf name for a case, e.g. "Waffen-Spezial". */
export const sectionLabel = (c: CaseDef) => SEC_NAME.get(sectionOf(c)) ?? CAT_LABEL[c.category];

type Sort = 'rec' | 'pop' | 'new' | 'asc' | 'desc' | 'lvl' | 'name';
const ui: { q: string; sec: CaseSection | 'all'; sort: Sort; unlocked: boolean } = { q: '', sec: 'all', sort: 'rec', unlocked: false };

/** Case art into a holder: an <img> drawn in the art worker; the skeleton shows until it is ready. */
export function caseArt(holder: HTMLElement, c: CaseDef, w: number, h: number, lazy = false) {
  const img = artImg(w, h);
  img.classList.remove('skin-cv');
  img.style.width = '100%';
  img.style.height = 'auto';
  img.style.aspectRatio = `${w} / ${h}`;
  const now = caseURLNow(c, w, h);
  if (now) { img.src = now; holder.replaceChildren(img); return; }
  holder.classList.add('skel');
  holder.replaceChildren(img);
  loadInto(img, () => caseURL(c, w, h).finally(() => holder.classList.remove('skel')), lazy);
}

const isNew = (c: CaseDef) => (c.added ?? 0) >= 100;

function caseCard(c: CaseDef, lvl: number): HTMLElement {
  const locked = c.level > lvl && !M.on('cs.unlock');
  const free = save.freeOpens[c.id] ?? 0;
  const a = document.createElement('a');
  a.className = `ccard${locked ? ' locked' : ''}`;
  a.href = `#/case/${c.id}`;
  a.style.setProperty('--ca', c.look.a);
  a.style.setProperty('--cb', c.look.b);
  const top = tierOdds(c).filter((t) => t.rarity !== 'milspec' && t.rarity !== 'consumer' && t.rarity !== 'industrial');
  const badge = c.badge ?? (isNew(c) ? 'NEU' : '');
  a.innerHTML = `
    <div class="cc-glow"></div>
    ${free ? `<span class="cc-free">${free}× gratis</span>` : badge ? `<span class="cc-badge b-${esc(badge.toLowerCase())}">${esc(badge)}</span>` : ''}
    ${c.contents.gold?.length ? '<span class="cc-gold" title="Enthält ★ Gegenstände">★</span>' : ''}
    <div class="cc-art"></div>
    <div class="cc-name">${esc(c.name)}</div>
    <div class="cc-tiers">${top.map((t) => `<i style="background:${rColor(t.rarity)}"></i>`).join('')}</div>
    <div class="cc-price">${locked ? `${icon('lock')} Stufe ${c.level}` : `<span class="coin"></span><span class="mono">${fmt(casePrice(c))}</span>`}</div>`;
  caseArt(a.querySelector('.cc-art') as HTMLElement, c, 220, 165, true);
  return a;
}

/** Cards follow the pointer a little (one card at a time, transform only, rAF-throttled). */
function tilt(host: HTMLElement) {
  let card: HTMLElement | null = null, raf = 0, px = 0, py = 0;
  const apply = () => {
    raf = 0;
    if (!card) return;
    const r = card.getBoundingClientRect();
    const x = (px - r.left) / r.width - 0.5, y = (py - r.top) / r.height - 0.5;
    card.style.setProperty('--rx', `${(-y * 7).toFixed(2)}deg`);
    card.style.setProperty('--ry', `${(x * 9).toFixed(2)}deg`);
  };
  const reset = (el: HTMLElement | null) => { if (el) { el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); } };
  host.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('.ccard');
    if (el !== card) { reset(card); card = el; }
    px = e.clientX; py = e.clientY;
    if (card && !raf) raf = requestAnimationFrame(apply);
  });
  host.addEventListener('pointerleave', () => { reset(card); card = null; });
}

/** Featured carousel: slides cross-fade with opacity/transform only; pauses on hover, tab hidden or offscreen. */
function carousel(root: HTMLElement, list: CaseDef[]): () => void {
  const car = root.querySelector('.hero-carousel') as HTMLElement;
  const track = car.querySelector('.hc-track') as HTMLElement;
  const dots = car.querySelector('.hc-dots') as HTMLElement;
  const btn = car.querySelector('.hc-pause') as HTMLButtonElement;
  track.innerHTML = list.map((c, i) => `
    <a class="hc-slide${i === 0 ? ' on' : ''}" href="#/case/${c.id}" style="--ca:${c.look.a};--cb:${c.look.b}"${i ? ' aria-hidden="true" tabindex="-1"' : ''}>
      <div class="hero-bg"></div>
      <div class="hero-text"><span class="eyebrow">${esc(c.badge ?? 'Empfohlen')} · ${esc(sectionLabel(c))}</span><h1>${esc(c.name)}</h1>
        <p>${esc(CASE_SECTIONS.find((s) => s.id === sectionOf(c))?.blurb ?? '')}</p>
        <span class="btn primary lg">Jetzt öffnen · <span class="mono">${fmt(casePrice(c))}</span></span></div>
      <div class="hero-art"></div>
    </a>`).join('');
  dots.innerHTML = list.map((c, i) => `<button type="button" class="hc-dot${i === 0 ? ' on' : ''}" aria-label="${esc(c.name)}"></button>`).join('');
  const slides = [...track.querySelectorAll<HTMLElement>('.hc-slide')];
  const dotEls = [...dots.querySelectorAll<HTMLElement>('.hc-dot')];
  slides.forEach((s, i) => caseArt(s.querySelector('.hero-art') as HTMLElement, list[i], 420, 315, i > 0));
  let cur = 0, userPaused = false, hover = false, visible = true;
  const show = (i: number) => {
    cur = (i + slides.length) % slides.length;
    slides.forEach((s, k) => {
      const on = k === cur;
      s.classList.toggle('on', on);
      if (on) s.removeAttribute('aria-hidden'); else s.setAttribute('aria-hidden', 'true');
      s.tabIndex = on ? 0 : -1;
    });
    dotEls.forEach((d, k) => d.classList.toggle('on', k === cur));
  };
  const running = () => !userPaused && !hover && visible && !document.hidden;
  const sync = () => car.classList.toggle('paused', !running());
  const iv = setInterval(() => { if (running()) show(cur + 1); }, 5000);
  dotEls.forEach((d, i) => d.addEventListener('click', () => show(i)));
  btn.addEventListener('click', () => {
    userPaused = !userPaused;
    btn.textContent = userPaused ? '▶' : '❚❚';
    btn.setAttribute('aria-label', userPaused ? 'Abspielen' : 'Pausieren');
    btn.setAttribute('aria-pressed', String(userPaused));
    sync();
  });
  car.addEventListener('pointerenter', () => { hover = true; sync(); });
  car.addEventListener('pointerleave', () => { hover = false; sync(); });
  car.addEventListener('focusin', () => { hover = true; sync(); });
  car.addEventListener('focusout', () => { hover = false; sync(); });
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; sync(); });
  io.observe(car);
  return () => { clearInterval(iv); io.disconnect(); };
}

export const casesPage: Page = (root) => {
  const lvl = level();
  const open = (c: CaseDef) => c.level <= lvl || M.on('cs.unlock');
  const score = (c: CaseDef) => (c.pop ?? 0) + (c.badge ? 8 : 0);
  const featured = CASES.filter(open).sort((a, b) => score(b) - score(a)).slice(0, 6);
  if (!featured.length) featured.push(CASES[0]);
  const daily = dailyCase();
  const counts = new Map<string, number>();
  for (const c of CASES) counts.set(sectionOf(c), (counts.get(sectionOf(c)) ?? 0) + 1);
  const chips: [string, string, number][] = [['all', 'Alle', CASES.length], ...CASE_SECTIONS.filter((s) => counts.get(s.id)).map((s) => [s.id, s.name, counts.get(s.id)!] as [string, string, number])];
  root.innerHTML = `
  <div class="cases-page">
  <section class="hero">
    <div class="hero-carousel">
      <div class="hc-track"></div>
      <div class="hc-ctl"><div class="hc-dots" role="group" aria-label="Empfohlene Kisten"></div><button class="hc-pause" type="button" aria-label="Pausieren" aria-pressed="false">❚❚</button></div>
    </div>
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
  <a class="pl-promo" href="#/palette">
    <div class="pl-promo-t"><span class="eyebrow">Spezial</span><b>Die Palette</b><span>10 bis 100 Kisten auf einmal. Der Kran liefert, die Kisten platzen in einer Kettenreaktion auf, und dein bester Drop kommt ins Rampenlicht.</span></div>
    <div class="pl-promo-r"><div class="pl-promo-stack" aria-hidden="true"></div><span class="btn primary">Zur Palette</span></div>
  </a>
  <div class="broke-bar" hidden></div>
  <div class="cs-filters">
    <div class="filters">
      <label class="search">${icon('search')}<input type="search" placeholder="Kiste suchen" aria-label="Kiste suchen" value="${esc(ui.q)}"></label>
      <label class="check"><input type="checkbox" class="only-open" ${ui.unlocked ? 'checked' : ''}> Nur freigeschaltet</label>
      <select class="sel sort" aria-label="Sortieren">
        <option value="rec">Empfohlen</option><option value="pop">Beliebt</option><option value="new">Neu</option>
        <option value="asc">Preis aufsteigend</option><option value="desc">Preis absteigend</option><option value="lvl">Stufe</option><option value="name">Name</option>
      </select>
    </div>
    <div class="chips sec-chips" role="group" aria-label="Regal">${chips.map(([id, l, n]) => `<button type="button" class="chip${ui.sec === id ? ' on' : ''}" data-sec="${id}">${esc(l)}<small>${n}</small></button>`).join('')}</div>
  </div>
  <div class="case-groups"></div>
  </div>`;
  (root.querySelector('.sort') as HTMLSelectElement).value = ui.sort;
  caseArt(root.querySelector('.dc-art') as HTMLElement, daily, 140, 105);
  // the pallet teaser: one case render, stacked eight times
  const stack = root.querySelector('.pl-promo-stack') as HTMLElement;
  void caseURL(featured[0], 88, 66).then((u) => { stack.innerHTML = Array.from({ length: 8 }, () => `<img src="${u}" alt="" width="44" height="33" decoding="async">`).join(''); }, () => undefined);
  const stopCarousel = carousel(root, featured);

  const groups = root.querySelector('.case-groups') as HTMLElement;
  tilt(groups);
  const sorters: Record<Sort, (a: CaseDef, b: CaseDef) => number> = {
    rec: (a, b) => a.level - b.level || casePrice(a) - casePrice(b),
    pop: (a, b) => (b.pop ?? 0) - (a.pop ?? 0),
    new: (a, b) => (b.added ?? 0) - (a.added ?? 0),
    asc: (a, b) => casePrice(a) - casePrice(b),
    desc: (a, b) => casePrice(b) - casePrice(a),
    lvl: (a, b) => a.level - b.level || casePrice(a) - casePrice(b),
    name: (a, b) => a.name.localeCompare(b.name, 'de'),
  };
  const draw = () => {
    const q = ui.q.trim().toLowerCase();
    const list = CASES.filter((c) => (!q || c.name.toLowerCase().includes(q) || sectionLabel(c).toLowerCase().includes(q))
      && (ui.sec === 'all' || sectionOf(c) === ui.sec) && (!ui.unlocked || open(c))).sort(sorters[ui.sort]);
    groups.innerHTML = '';
    if (!list.length) { groups.innerHTML = '<div class="empty-state"><b>Keine Kiste gefunden.</b><span>Andere Suche oder ein anderes Regal probieren.</span></div>'; return; }
    // grouped by shelf, unless a search or a global sort (popular / new) asks for one flat list
    const flat = !!q || ui.sort === 'pop' || ui.sort === 'new';
    const shelves: { id: string; name: string; blurb: string; items: CaseDef[] }[] = flat
      ? [{ id: 'all', name: q ? 'Suchergebnisse' : ui.sort === 'pop' ? 'Beliebt' : 'Neu', blurb: '', items: list }]
      : CASE_SECTIONS.map((s) => ({ ...s, items: list.filter((c) => sectionOf(c) === s.id) }));
    const frag = document.createDocumentFragment();
    const todo: [HTMLElement, CaseDef][] = [];
    for (const sh of shelves) {
      if (!sh.items.length) continue;
      const sec = document.createElement('section');
      sec.className = 'cgroup';
      sec.dataset.sec = sh.id;
      sec.innerHTML = `<h2 class="sec-h"><span>${esc(sh.name)}</span><small>${sh.items.length} ${sh.items.length === 1 ? 'Kiste' : 'Kisten'}</small>${sh.blurb ? `<em>${esc(sh.blurb)}</em>` : ''}</h2>`;
      const grid = document.createElement('div');
      grid.className = 'case-grid';
      sh.items.forEach((c) => todo.push([grid, c]));
      sec.appendChild(grid);
      frag.appendChild(sec);
    }
    // the first screens of cards now, the rest in small slices so opening the page never blocks long
    const run = ++gen;
    const fill = (n: number) => { for (const [grid, c] of todo.splice(0, n)) grid.appendChild(caseCard(c, lvl)); };
    fill(18);
    groups.appendChild(frag);
    const step = () => {
      if (run !== gen || !todo.length) return;
      fill(10);
      if (todo.length) setTimeout(step, 16);
    };
    setTimeout(step, 50);
  };
  let gen = 0;
  draw();

  let qt = 0;
  root.querySelector('.search input')!.addEventListener('input', (e) => {
    ui.q = (e.target as HTMLInputElement).value;
    clearTimeout(qt); qt = window.setTimeout(draw, 120);
  });
  root.querySelectorAll<HTMLButtonElement>('.sec-chips .chip').forEach((b) => b.addEventListener('click', () => {
    ui.sec = b.dataset.sec as CaseSection | 'all';
    root.querySelectorAll('.sec-chips .chip').forEach((x) => x.classList.toggle('on', x === b));
    draw();
  }));
  root.querySelector('.only-open')!.addEventListener('change', (e) => { ui.unlocked = (e.target as HTMLInputElement).checked; draw(); });
  root.querySelector('.sort')!.addEventListener('change', (e) => { ui.sort = (e.target as HTMLSelectElement).value as Sort; draw(); });

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
  return () => { gen++; clearInterval(iv); clearTimeout(qt); stopCarousel(); };
};
