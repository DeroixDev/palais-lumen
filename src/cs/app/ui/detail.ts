// The item detail: big render, name, wear, float, value, and the 3D inspect.

import { wearOf, type ItemInstance } from '../../contract';
import { isRareSeed, itemValue, casesWithSkin } from '../lib/economy';
import { findItem, sellItems } from '../lib/state';
import { sfx } from '../lib/sound';
import { esc, fmt } from '../lib/util';
import { floatBar, names, rColor, rName, skinCanvas, skinOf } from './items';
import { openModal, type ModalHandle } from './modal';
import { toast } from './toast';

export interface DetailAction { label: string; cls?: string; run: (m: ModalHandle) => void }

/** HTML block describing an item (used in the drop result and the inventory detail). */
export function itemInfo(item: ItemInstance, big = true): HTMLElement {
  const s = skinOf(item);
  const n = names(item);
  const w = wearOf(item.float);
  const box = document.createElement('div');
  box.className = `iteminfo r-${s.rarity}`;
  box.style.setProperty('--rc', rColor(s.rarity));
  box.innerHTML = `
    <div class="ii-stage"><div class="ii-glow"></div><div class="ii-art"></div></div>
    <div class="ii-text">
      <div class="ii-rar">${esc(rName(s.rarity))}${item.statTrak ? ' · <span class="st">StatTrak™</span>' : ''}${isRareSeed(item.seed) ? ' · <span class="seed">Seltenes Muster</span>' : ''}</div>
      <h2 class="ii-name">${item.statTrak ? '<span class="st">StatTrak™ </span>' : ''}${esc(n.weapon)} <span class="sep">|</span> ${esc(n.skin)}</h2>
      <div class="ii-meta">
        <div><small>Zustand</small><b>${w.name}</b></div>
        <div><small>Float</small><b class="mono">${item.float.toFixed(6)}</b></div>
        <div><small>Muster</small><b class="mono">#${item.seed}</b></div>
        <div><small>Wert</small><b class="mono val"><span class="coin"></span>${fmt(itemValue(item))}</b></div>
      </div>
      ${floatBar(item.float, s.floatMin, s.floatMax)}
      <div class="ii-wearscale"><span>FN</span><span>MW</span><span>FT</span><span>WW</span><span>BS</span></div>
      <div class="ii-src">${item.source ? `Herkunft: ${esc(item.source)}` : ''}${s.collection ? `${item.source ? ' · ' : ''}Sammlung: ${esc(s.collection)}` : ''}</div>
    </div>`;
  box.querySelector('.ii-art')!.appendChild(skinCanvas(item, big ? 440 : 300, big ? 240 : 170));
  return box;
}

/** Opens the 3D inspect in its own modal (three.js is loaded on demand). */
export async function open3D(item: Pick<ItemInstance, 'skin' | 'float' | 'seed' | 'statTrak'>) {
  const n = names(item);
  const wrap = document.createElement('div');
  wrap.className = 'inspect3d';
  wrap.innerHTML = `<div class="i3-head"><b>${esc(n.full)}</b><span>${wearOf(item.float).name} · Ziehen zum Drehen, Mausrad zum Zoomen</span></div><div class="i3-host"><div class="i3-load"><div class="spinner"></div>3D-Ansicht lädt …</div></div>`;
  let handle: { dispose(): void } | null = null;
  openModal(wrap, { cls: 'wide dark3d', label: '3D-Ansicht', stack: true, onClose: () => handle?.dispose() });
  const host = wrap.querySelector('.i3-host') as HTMLElement;
  try {
    const { openInspect } = await import('../../viewer3d');
    if (!host.isConnected) return;
    host.querySelector('.i3-load')?.remove();
    handle = openInspect(host, { skin: item.skin, float: item.float, seed: item.seed, statTrak: item.statTrak });
  } catch (e) {
    console.warn('3D view failed', e);
    host.innerHTML = '<div class="i3-load">Die 3D-Ansicht konnte nicht geladen werden.</div>';
  }
}

/** The inventory detail modal for an owned item. */
export function openItemDetail(item: ItemInstance, extra: DetailAction[] = [], onChange?: () => void) {
  const wrap = document.createElement('div');
  wrap.className = 'detail';
  wrap.appendChild(itemInfo(item));
  const s = skinOf(item);
  const from = casesWithSkin(s.id);
  const acts = document.createElement('div');
  acts.className = 'actions';
  wrap.appendChild(acts);
  if (from.length) {
    const p = document.createElement('div');
    p.className = 'ii-from';
    p.innerHTML = `Enthalten in: ${from.slice(0, 4).map((c) => `<a href="#/case/${c.id}">${esc(c.name)}</a>`).join(', ')}`;
    wrap.appendChild(p);
  }
  const m = openModal(wrap, { cls: 'detail-modal', label: names(item).full });
  const owned = () => !!findItem(item.uid);
  const add = (a: DetailAction) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn ${a.cls ?? 'ghost'}`;
    b.innerHTML = a.label;
    b.addEventListener('click', () => a.run(m));
    acts.appendChild(b);
  };
  if (owned()) add({ label: `Verkaufen <span class="mono">${fmt(itemValue(item))}</span>`, cls: 'primary', run: (mm) => { const v = sellItems([item.uid]); sfx.sell(); toast('Verkauft', `+${fmt(v)} Coins`, 'good', '¢'); mm.close(); onChange?.(); } });
  add({ label: '3D ansehen', cls: 'ghost', run: () => void open3D(item) });
  extra.forEach(add);
  wrap.querySelectorAll('.ii-from a').forEach((a) => a.addEventListener('click', () => m.close()));
}
