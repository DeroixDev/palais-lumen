// Inventar: everything you own, filters, multi-select, sell, detail + 3D.

import type { ItemInstance, Rarity, WeaponKind } from '../../contract';
import { weaponById } from '../lib/assets';
import { itemValue, rarityIndex, TIER_ORDER } from '../lib/economy';
import { findItem, onChange, save, sellItems, invValue } from '../lib/state';
import { sfx } from '../lib/sound';
import { esc, fmt } from '../lib/util';
import { itemCard, rColor, rName, skinOf, names } from '../ui/items';
import { openItemDetail } from '../ui/detail';
import { openModal } from '../ui/modal';
import { toast } from '../ui/toast';
import { pageHead, type Page } from './page';

const KIND_LABEL: Record<WeaponKind, string> = { pistol: 'Pistolen', smg: 'MPs', rifle: 'Gewehre', sniper: 'Scharfschützen', shotgun: 'Schrotflinten', heavy: 'Schwere Waffen', knife: 'Messer', gloves: 'Handschuhe' };
const ui = { rar: 'all', kind: 'all', sort: 'value', q: '', select: false };
const PAGE = 90;

export const inventoryPage: Page = (root) => {
  const selected = new Set<string>();
  let shown = PAGE;
  root.innerHTML = `
  ${pageHead('Inventar', 'Deine Skins. Tippe einen an für Details und die 3D-Ansicht.', `<div class="inv-total"><small>Gesamtwert</small><b class="mono tot">0,00</b><span class="mono inv-cnt"></span></div>`)}
  <div class="filters">
    <label class="search"><input type="search" placeholder="Skin suchen" aria-label="Skin suchen" value="${esc(ui.q)}"></label>
    <div class="chips rar-chips" role="group" aria-label="Seltenheit"></div>
    <select class="sel kind" aria-label="Waffentyp"><option value="all">Alle Waffen</option>${(Object.keys(KIND_LABEL) as WeaponKind[]).map((k) => `<option value="${k}">${KIND_LABEL[k]}</option>`).join('')}</select>
    <select class="sel sort" aria-label="Sortieren"><option value="value">Wert absteigend</option><option value="valueAsc">Wert aufsteigend</option><option value="new">Neueste</option><option value="rar">Seltenheit</option><option value="float">Float</option></select>
  </div>
  <div class="inv-tools">
    <button class="toggle sel-mode" type="button" aria-pressed="${ui.select}">Mehrfachauswahl</button>
    <button class="btn ghost sm sel-all" type="button">Alle sichtbaren auswählen</button>
    <span class="grow"></span>
    <button class="btn danger sm sell-all" type="button">Alles verkaufen</button>
  </div>
  <div class="inv-grid"></div>
  <div class="more-wrap"></div>
  <div class="selbar" hidden><span class="sb-txt"></span><button class="btn ghost sm sb-clear" type="button">Abwählen</button><button class="btn primary sb-sell" type="button">Verkaufen</button></div>`;

  const rarChips = root.querySelector('.rar-chips') as HTMLElement;
  const usedR = TIER_ORDER.filter((r) => save.inv.some((i) => skinOf(i).rarity === r));
  rarChips.innerHTML = [`<button type="button" class="chip${ui.rar === 'all' ? ' on' : ''}" data-r="all">Alle</button>`, ...usedR.map((r) => `<button type="button" class="chip rc${ui.rar === r ? ' on' : ''}" data-r="${r}" style="--rc:${rColor(r)}"><i></i>${esc(rName(r))}</button>`)].join('');
  (root.querySelector('.kind') as HTMLSelectElement).value = ui.kind;
  (root.querySelector('.sort') as HTMLSelectElement).value = ui.sort;
  const grid = root.querySelector('.inv-grid') as HTMLElement;
  const selbar = root.querySelector('.selbar') as HTMLElement;

  const filtered = (): ItemInstance[] => {
    const q = ui.q.trim().toLowerCase();
    const list = save.inv.filter((i) => {
      const s = skinOf(i);
      if (ui.rar !== 'all' && s.rarity !== ui.rar) return false;
      if (ui.kind !== 'all' && weaponById(s.weapon)?.kind !== ui.kind) return false;
      if (q && !names(i).full.toLowerCase().includes(q)) return false;
      return true;
    });
    const idx = new Map(save.inv.map((x, n) => [x.uid, n]));
    const sorters: Record<string, (a: ItemInstance, b: ItemInstance) => number> = {
      value: (a, b) => itemValue(b) - itemValue(a),
      valueAsc: (a, b) => itemValue(a) - itemValue(b),
      new: (a, b) => idx.get(a.uid)! - idx.get(b.uid)!,
      rar: (a, b) => rarityIndex(skinOf(b).rarity as Rarity) - rarityIndex(skinOf(a).rarity as Rarity) || itemValue(b) - itemValue(a),
      float: (a, b) => a.float - b.float,
    };
    return list.sort(sorters[ui.sort]);
  };

  const drawSel = () => {
    const ids = [...selected].filter((u) => findItem(u));
    selbar.hidden = ids.length === 0;
    const v = ids.reduce((a, u) => a + itemValue(findItem(u)!), 0);
    selbar.querySelector('.sb-txt')!.innerHTML = `<b>${ids.length}</b> ausgewählt · <span class="mono">${fmt(v)}</span> Coins`;
    grid.querySelectorAll<HTMLElement>('.icard').forEach((c) => c.classList.toggle('sel', selected.has(c.dataset.uid!)));
  };
  const draw = () => {
    const list = filtered();
    (root.querySelector('.tot') as HTMLElement).textContent = fmt(invValue());
    (root.querySelector(".inv-cnt") as HTMLElement).textContent = `${save.inv.length} Skins`;
    grid.replaceChildren();
    if (!save.inv.length) {
      grid.innerHTML = '<div class="empty-state"><b>Noch keine Skins.</b><span>Öffne deine erste Kiste, und hier hängt bald deine Sammlung.</span><a class="btn primary" href="#/cases">Zu den Kisten</a></div>';
    } else if (!list.length) grid.innerHTML = '<div class="empty-state"><b>Nichts passt zu diesem Filter.</b></div>';
    list.slice(0, shown).forEach((it) => grid.appendChild(itemCard(it, { selectable: true, selected: selected.has(it.uid) })));
    const more = root.querySelector('.more-wrap') as HTMLElement;
    more.innerHTML = list.length > shown ? `<button class="btn ghost more" type="button">Mehr laden (${list.length - shown})</button>` : '';
    drawSel();
  };
  draw();

  root.querySelector('.more-wrap')!.addEventListener('click', () => { shown += PAGE; draw(); });
  grid.addEventListener('click', (e) => {
    const card = (e.target as HTMLElement).closest('.icard') as HTMLElement | null;
    if (!card) return;
    const uid = card.dataset.uid!;
    const onCheck = (e.target as HTMLElement).closest('.ic-check');
    if (ui.select || onCheck || (e as MouseEvent).shiftKey || (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey) {
      if (selected.has(uid)) selected.delete(uid); else selected.add(uid);
      sfx.click();
      drawSel();
      return;
    }
    const it = findItem(uid);
    if (it) openItemDetail(it, [], () => { selected.delete(uid); draw(); });
  });
  rarChips.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('.chip') as HTMLElement | null;
    if (!b) return;
    ui.rar = b.dataset.r!;
    rarChips.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b));
    shown = PAGE; draw();
  });
  root.querySelector('.kind')!.addEventListener('change', (e) => { ui.kind = (e.target as HTMLSelectElement).value; shown = PAGE; draw(); });
  root.querySelector('.sort')!.addEventListener('change', (e) => { ui.sort = (e.target as HTMLSelectElement).value; draw(); });
  root.querySelector('.search input')!.addEventListener('input', (e) => { ui.q = (e.target as HTMLInputElement).value; shown = PAGE; draw(); });
  const selMode = root.querySelector('.sel-mode') as HTMLButtonElement;
  selMode.addEventListener('click', () => { ui.select = !ui.select; selMode.setAttribute('aria-pressed', String(ui.select)); if (!ui.select) { selected.clear(); drawSel(); } });
  root.querySelector('.sel-all')!.addEventListener('click', () => {
    const list = filtered();
    const all = list.every((i) => selected.has(i.uid));
    list.forEach((i) => (all ? selected.delete(i.uid) : selected.add(i.uid)));
    if (!ui.select) { ui.select = true; selMode.setAttribute('aria-pressed', 'true'); }
    drawSel();
  });
  root.querySelector('.sb-clear')!.addEventListener('click', () => { selected.clear(); drawSel(); });
  root.querySelector('.sb-sell')!.addEventListener('click', () => {
    const ids = [...selected].filter((u) => findItem(u));
    if (!ids.length) return;
    const v = sellItems(ids);
    sfx.sell();
    toast(`${ids.length} ${ids.length === 1 ? 'Skin' : 'Skins'} verkauft`, `+${fmt(v)} Coins`, 'good', '¢');
    selected.clear();
    draw();
  });
  root.querySelector('.sell-all')!.addEventListener('click', () => {
    if (!save.inv.length) return;
    const v = invValue();
    const m = openModal(`<div class="confirm"><h2>Alles verkaufen?</h2><p>${save.inv.length} Skins für <b class="mono">${fmt(v)}</b> Coins. Das lässt sich nicht rückgängig machen.</p><div class="actions"><button class="btn danger yes" type="button">Alles verkaufen</button><button class="btn ghost no" type="button">Abbrechen</button></div></div>`, { label: 'Alles verkaufen' });
    m.body.querySelector('.yes')!.addEventListener('click', () => {
      const n = save.inv.length;
      const got = sellItems(save.inv.map((i) => i.uid));
      sfx.sell();
      toast(`${n} Skins verkauft`, `+${fmt(got)} Coins`, 'good', '¢');
      m.close(); selected.clear(); draw();
    });
    m.body.querySelector('.no')!.addEventListener('click', () => m.close());
  });
  const off = onChange(() => { (root.querySelector('.tot') as HTMLElement).textContent = fmt(invValue()); });
  return off;
};
