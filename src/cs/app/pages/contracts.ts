// Verträge (trade-up): 3–10 skins of one rarity for a skin of the next rarity from their collections.
// The step up is not certain: its chance is set so the contract pays back about 90 % of what goes
// in (more or pricier inputs = higher chance, up to certain). A miss returns one skin of the same
// rarity. The output float is the inputs' average mapped into the target's range.

import type { ItemInstance, Rarity, SkinDef } from '../../contract';
import { SKINS, skinById } from '../lib/assets';
import { casesWithSkin, itemValue, makeItem, nextRarity, skinEV, rarityIndex } from '../lib/economy';
import { addItem, commit, emit, findItem, removeItems, save } from '../lib/state';
import { addXP, xpFor, checkAchievements } from '../lib/career';
import { pushMine } from '../lib/feed';
import { sfx } from '../lib/sound';
import { esc, fmt, pct, sleep } from '../lib/util';
import { itemCard, rColor, rName, skinOf, skinCard } from '../ui/items';
import { itemInfo, open3D } from '../ui/detail';
import { openModal } from '../ui/modal';
import { burstAt, flash } from '../ui/fx';
import { toast } from '../ui/toast';
import { pageHead, type Page } from './page';

const MIN = 3, MAX = 10;
const PAYBACK = 0.9;
/** Chance to step up so that the expected return is PAYBACK of the input value. */
export function contractChance(inputValue: number, evUp: number, evSame: number): number {
  if (evUp <= evSame) return 1;
  return Math.max(0.03, Math.min(1, (PAYBACK * inputValue - evSame) / (evUp - evSame)));
}

/** Candidate outputs of a set of inputs with their probabilities. */
export function contractPool(items: ItemInstance[], up: boolean): { s: SkinDef; p: number }[] {
  if (!items.length) return [];
  const r = skinOf(items[0]).rarity;
  const want: Rarity | null = up ? nextRarity(r) : r;
  if (!want) return [];
  const acc = new Map<string, number>();
  const share = 1 / items.length;
  for (const it of items) {
    const s = skinOf(it);
    let cands = SKINS.filter((x) => x.rarity === want && x.collection === s.collection);
    if (!cands.length) {
      const ids = new Set<string>();
      for (const c of casesWithSkin(s.id)) for (const id of c.contents[want] ?? []) ids.add(id);
      cands = [...ids].map((id) => skinById(id)).filter(Boolean) as SkinDef[];
    }
    for (const c of cands) acc.set(c.id, (acc.get(c.id) ?? 0) + share / cands.length);
  }
  const tot = [...acc.values()].reduce((a, b) => a + b, 0);
  return [...acc.entries()].map(([id, p]) => ({ s: skinById(id)!, p: p / tot })).sort((a, b) => b.s.basePrice - a.s.basePrice);
}
const eligible = (it: ItemInstance) => { const r = skinOf(it).rarity; return r !== 'gold' && !!nextRarity(r); };

export const contractsPage: Page = (root) => {
  const picked: string[] = [];
  let busy = false;
  let alive = true;
  let rarFilter: Rarity | 'all' = 'all';

  root.innerHTML = `
  ${pageHead('Verträge', 'Tausche 3 bis 10 Skins gleicher Seltenheit gegen einen Skin der nächsten Stufe. Mehr und wertvollere Skins = höhere Aufstiegs-Chance.')}
  <section class="contract">
    <div class="ct-paper">
      <div class="ct-head"><b>Tauschvertrag</b><span class="ct-rar"></span></div>
      <div class="ct-slots"></div>
      <div class="ct-stats">
        <div><small>Einsatz</small><b class="mono c-in">0,00</b></div>
        <div><small>Aufstiegs-Chance</small><b class="mono c-ch">–</b></div>
        <div><small>Ø Float</small><b class="mono c-fl">–</b></div>
        <div><small>Erwarteter Wert</small><b class="mono c-ev">–</b></div>
      </div>
      <div class="ct-actions"><button class="btn ghost sm c-clear" type="button">Leeren</button><button class="btn ghost sm c-fill" type="button">Automatisch füllen</button><button class="btn primary lg c-go" type="button" disabled>Vertrag unterschreiben</button></div>
    </div>
    <div class="ct-out panel"><h3 class="panel-h">Mögliche Ergebnisse</h3><div class="mini-grid outs"></div></div>
  </section>
  <section class="panel"><h3 class="panel-h">Deine Skins <span class="chips rchips"></span></h3><div class="mini-grid c-items"></div></section>`;

  const items = () => picked.map((u) => findItem(u)).filter(Boolean) as ItemInstance[];
  const rarity = () => (items()[0] ? skinOf(items()[0]).rarity : null);

  function stats() {
    const its = items();
    const n = its.length;
    const up = contractPool(its, true), same = contractPool(its, false);
    const avg = n ? its.reduce((a, i) => a + i.float, 0) / n : 0;
    const val = its.reduce((a, i) => a + itemValue(i), 0);
    const evUp = up.reduce((a, o) => a + o.p * skinEV(o.s), 0);
    const evSame = same.reduce((a, o) => a + o.p * skinEV(o.s), 0);
    const ch = n ? contractChance(val, evUp, evSame) : 0;
    const ev = evUp * ch + evSame * (1 - ch);
    return { n, ch, up, same, avg, ev, val };
  }
  function draw() {
    const st = stats();
    const r = rarity();
    const slots = root.querySelector('.ct-slots') as HTMLElement;
    slots.replaceChildren();
    for (let i = 0; i < MAX; i++) {
      const it = items()[i];
      if (it) slots.appendChild(itemCard(it, { selectable: true, size: 'sm' }));
      else slots.insertAdjacentHTML('beforeend', `<div class="slot-empty${i < MIN ? ' need' : ''}"><span>${i + 1}</span></div>`);
    }
    (root.querySelector('.ct-rar') as HTMLElement).innerHTML = r ? `<i class="rdot" style="background:${rColor(r)}"></i>${esc(rName(r))} → <i class="rdot" style="background:${rColor(nextRarity(r)!)}"></i>${esc(rName(nextRarity(r)!))}` : 'Wähle Skins unten';
    (root.querySelector('.c-in') as HTMLElement).textContent = fmt(st.val);
    (root.querySelector('.c-ch') as HTMLElement).textContent = st.n ? pct(st.ch, 0) : '–';
    (root.querySelector('.c-fl') as HTMLElement).textContent = st.n ? st.avg.toFixed(4) : '–';
    (root.querySelector('.c-ev') as HTMLElement).textContent = st.n ? fmt(st.ev) : '–';
    (root.querySelector('.c-go') as HTMLButtonElement).disabled = busy || st.n < MIN || !st.up.length;
    const outs = root.querySelector('.outs') as HTMLElement;
    outs.replaceChildren();
    if (!st.n) outs.innerHTML = '<div class="empty-state small"><b>Noch leer.</b><span>Die möglichen Skins erscheinen hier.</span></div>';
    for (const o of st.up.slice(0, 18)) {
      const f = o.s.floatMin + st.avg * (o.s.floatMax - o.s.floatMin);
      outs.appendChild(skinCard(o.s, `<div class="sk-foot"><span class="mono">F ${f.toFixed(3)}</span><span class="mono sk-p">${pct(o.p * st.ch, 1)}</span></div>`));
    }
    // Inventory list
    const g = root.querySelector('.c-items') as HTMLElement;
    const list = save.inv.filter(eligible).filter((i) => rarFilter === 'all' || skinOf(i).rarity === rarFilter).sort((a, b) => rarityIndex(skinOf(a).rarity) - rarityIndex(skinOf(b).rarity) || itemValue(a) - itemValue(b));
    g.replaceChildren();
    if (!list.length) g.innerHTML = '<div class="empty-state small"><b>Keine passenden Skins.</b><a href="#/cases">Kisten öffnen</a></div>';
    for (const it of list.slice(0, 150)) {
      const off = !!r && skinOf(it).rarity !== r;
      g.appendChild(itemCard(it, { selectable: true, size: 'sm', selected: picked.includes(it.uid), disabled: off || busy }));
    }
    const used = (['consumer', 'industrial', 'milspec', 'restricted', 'classified', 'covert'] as Rarity[]).filter((x) => save.inv.some((i) => skinOf(i).rarity === x));
    (root.querySelector('.rchips') as HTMLElement).innerHTML = [`<button type="button" class="chip${rarFilter === 'all' ? ' on' : ''}" data-r="all">Alle</button>`, ...used.map((x) => `<button type="button" class="chip rc${rarFilter === x ? ' on' : ''}" data-r="${x}" style="--rc:${rColor(x)}"><i></i>${esc(rName(x))}</button>`)].join('');
  }

  root.querySelector('.c-items')!.addEventListener('click', (e) => {
    const c = (e.target as HTMLElement).closest('.icard') as HTMLButtonElement | null;
    if (!c || c.disabled || busy) return;
    const uid = c.dataset.uid!;
    const i = picked.indexOf(uid);
    if (i >= 0) picked.splice(i, 1);
    else if (picked.length < MAX) picked.push(uid);
    else { sfx.error(); return; }
    sfx.click();
    draw();
  });
  root.querySelector('.ct-slots')!.addEventListener('click', (e) => {
    const c = (e.target as HTMLElement).closest('.icard') as HTMLElement | null;
    if (!c || busy) return;
    picked.splice(picked.indexOf(c.dataset.uid!), 1);
    draw();
  });
  root.querySelector('.rchips')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('.chip') as HTMLElement | null;
    if (!b) return;
    rarFilter = b.dataset.r as Rarity | 'all';
    draw();
  });
  root.querySelector('.c-clear')!.addEventListener('click', () => { if (!busy) { picked.length = 0; draw(); } });
  root.querySelector('.c-fill')!.addEventListener('click', () => {
    if (busy) return;
    // Fill with the cheapest skins of the chosen (or most common) rarity.
    let r = rarity();
    if (!r) {
      const counts = new Map<Rarity, number>();
      save.inv.filter(eligible).forEach((i) => counts.set(skinOf(i).rarity, (counts.get(skinOf(i).rarity) ?? 0) + 1));
      r = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    }
    if (!r) { toast('Keine passenden Skins', 'Öffne erst ein paar Kisten.', 'bad'); return; }
    const pool = save.inv.filter((i) => skinOf(i).rarity === r && !picked.includes(i.uid)).sort((a, b) => itemValue(a) - itemValue(b));
    while (picked.length < MAX && pool.length) picked.push(pool.shift()!.uid);
    sfx.click();
    draw();
  });
  root.querySelector('.c-go')!.addEventListener('click', async () => {
    const st = stats();
    if (busy || st.n < MIN || !st.up.length) return;
    busy = true;
    const its = items();
    const up = Math.random() < st.ch;
    const pool = up ? st.up : st.same.length ? st.same : st.up;
    let x = Math.random(), pickS = pool[0].s;
    for (const o of pool) { x -= o.p; if (x <= 0) { pickS = o.s; break; } }
    const f = pickS.floatMin + st.avg * (pickS.floatMax - pickS.floatMin);
    const out = makeItem(pickS, 'Vertrag', f);
    out.statTrak = its.every((i) => i.statTrak) && pickS.rarity !== 'gold';
    removeItems(its.map((i) => i.uid));
    picked.length = 0;
    const paper = root.querySelector('.ct-paper') as HTMLElement;
    paper.classList.add('signing');
    sfx.open();
    commit();
    draw();
    await sleep(save.settings.fast ? 500 : 1500);
    paper.classList.remove('signing');
    addItem(out);
    save.stats.contracts++;
    addXP(xpFor(st.val));
    emit({ t: 'contract', value: itemValue(out) });
    pushMine(out, 'Vertrag');
    checkAchievements();
    commit();
    busy = false;
    if (!alive) return;
    draw();
    sfx.reveal(pickS.rarity);
    if (up) { flash('rgba(255,138,31,.3)'); burstAt(paper, [rColor(pickS.rarity), '#fff', '#ff8a1f'], 90, 9); }
    const wrap = document.createElement('div');
    wrap.className = 'result single';
    wrap.innerHTML = `<div class="res-banner ${up ? 'up' : 'same'}">${up ? 'Aufgestiegen!' : 'Kein Aufstieg, gleiche Stufe'}</div>`;
    wrap.appendChild(itemInfo(out));
    wrap.insertAdjacentHTML('beforeend', '<div class="actions"><button class="btn primary ok" type="button">Super</button><button class="btn ghost i3d" type="button">Ansehen in 3D</button></div>');
    const m = openModal(wrap, { cls: `result-modal r-${pickS.rarity}`, label: 'Vertrag' });
    wrap.querySelector('.ok')!.addEventListener('click', () => m.close());
    wrap.querySelector('.i3d')!.addEventListener('click', () => void open3D(out));
  });

  draw();
  return () => { alive = false; };
};
