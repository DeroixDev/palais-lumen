// How an item looks everywhere: tiles, names, float bars, rarity colours.

import { wearOf, type ItemInstance, type Rarity, type SkinDef } from '../../contract';
import { rarityColor, rarityName, renderSkin, skinById, skinURL, skinURLNow, weaponById } from '../lib/assets';
import { insiderLabel, isRareSeed, itemValue } from '../lib/economy';
import { esc, fmt } from '../lib/util';

export const rColor = (r: Rarity) => { try { return rarityColor(r); } catch { return '#888'; } };
export const rName = (r: Rarity) => { try { return rarityName(r); } catch { return r; } };

export function skinOf(item: Pick<ItemInstance, 'skin'>): SkinDef {
  return skinById(item.skin) ?? { id: item.skin, weapon: '?', name: 'Unbekannt', rarity: 'milspec', pattern: { kind: 'fade', colors: ['#555', '#222'] }, floatMin: 0, floatMax: 1, basePrice: 0, collection: '' };
}
export function weaponName(s: SkinDef): string { return weaponById(s.weapon)?.name ?? s.weapon; }
export function names(item: Pick<ItemInstance, 'skin' | 'statTrak'>) {
  const s = skinOf(item);
  const w = weaponName(s);
  const star = s.rarity === 'gold' && !w.startsWith('★') ? '★ ' : '';
  return { weapon: star + w, skin: s.name, full: `${star}${w} | ${s.name}`, st: item.statTrak };
}

/**
 * The weapon render as an <img> (drawn in a worker, see art/async.ts); never throws.
 * `lazy`: only render once the image comes near the viewport (long grids).
 * Images instead of canvases: canvases are composited layers each, images are not.
 */
export function skinArt(item: Pick<ItemInstance, 'skin' | 'float' | 'seed' | 'statTrak'>, width: number, height: number, lazy = false): HTMLImageElement {
  const img = artImg(width, height);
  const o = { skin: item.skin, float: item.float, seed: item.seed, width, height, statTrak: item.statTrak };
  const now = skinURLNow(o);
  if (now) img.src = now;
  else loadInto(img, () => skinURL(o), lazy);
  return img;
}

/** Synchronous canvas render (blocks the main thread; prefer skinArt). Never throws. */
export function skinCanvas(item: Pick<ItemInstance, 'skin' | 'float' | 'seed' | 'statTrak'>, width: number, height: number): HTMLCanvasElement {
  try {
    const c = renderSkin({ skin: item.skin, float: item.float, seed: item.seed, width, height, statTrak: item.statTrak });
    c.classList.add('skin-cv');
    c.style.width = width + 'px';
    c.style.height = height + 'px';
    return c;
  } catch {
    const c = document.createElement('canvas');
    c.width = width; c.height = height; c.className = 'skin-cv';
    return c;
  }
}

export function artImg(width: number, height: number): HTMLImageElement {
  const img = document.createElement('img');
  img.className = 'art skin-cv';
  img.alt = '';
  img.decoding = 'async';
  img.draggable = false;
  img.width = width; img.height = height;
  return img;
}

let io: IntersectionObserver | null = null;
const pendingLoad = new WeakMap<Element, () => void>();
/** Sets img.src from `get` now, or when the image nears the viewport (lazy). Fades it in. */
export function loadInto(img: HTMLImageElement, get: () => Promise<string>, lazy = false) {
  img.classList.add('loading');
  const go = () => {
    get().then((u) => {
      if (!u) return;
      img.src = u;
      // fade in once decoded (decode() keeps the main thread free)
      img.decode().catch(() => undefined).then(() => img.classList.remove('loading'));
    }, () => img.classList.remove('loading'));
  };
  if (!lazy || typeof IntersectionObserver === 'undefined') { go(); return; }
  io ??= new IntersectionObserver((list) => {
    for (const en of list) {
      if (!en.isIntersecting) continue;
      io!.unobserve(en.target);
      const f = pendingLoad.get(en.target);
      pendingLoad.delete(en.target);
      f?.();
    }
  }, { rootMargin: '400px 0px' });
  pendingLoad.set(img, go);
  io.observe(img);
}

export function floatBar(f: number, min = 0, max = 1): string {
  return `<div class="floatbar" title="Float ${f.toFixed(6)}"><span class="fb-range" style="left:${min * 100}%;right:${(1 - max) * 100}%"></span><i style="left:${f * 100}%"></i></div>`;
}

export interface CardOpts { selectable?: boolean; selected?: boolean; showValue?: boolean; size?: 'sm' | 'md'; extra?: string; disabled?: boolean }
/** An inventory-style card. data-uid carries the item's uid. */
export function itemCard(item: ItemInstance, o: CardOpts = {}): HTMLElement {
  const s = skinOf(item);
  const n = names(item);
  const w = wearOf(item.float);
  const card = document.createElement(o.selectable ? 'button' : 'div');
  card.className = `icard r-${s.rarity}${o.selected ? ' sel' : ''}${o.size === 'sm' ? ' sm' : ''}${o.disabled ? ' off' : ''}`;
  card.style.setProperty('--rc', rColor(s.rarity));
  card.dataset.uid = item.uid;
  if (o.selectable) (card as HTMLButtonElement).type = 'button';
  if (o.disabled && o.selectable) (card as HTMLButtonElement).disabled = true;
  card.innerHTML = `
    <div class="ic-top"><span class="ic-wear">${w.short}</span>${item.statTrak ? '<span class="ic-st">ST</span>' : ''}${isRareSeed(item.seed) ? `<span class="ic-seed" title="${insiderLabel(item.seed)} #${item.seed}">◆</span>` : ''}</div>
    <div class="ic-art"></div>
    <div class="ic-name"><small>${esc(n.weapon)}</small><b>${esc(n.skin)}</b></div>
    ${o.showValue !== false ? `<div class="ic-val"><span class="coin"></span>${fmt(itemValue(item))}</div>` : ''}
    ${o.extra ?? ''}
    <span class="ic-check" aria-hidden="true">✓</span>`;
  const sz = o.size === 'sm' ? [104, 62] : [150, 88];
  card.querySelector('.ic-art')!.appendChild(skinArt(item, sz[0], sz[1], true));
  return card;
}

/** A catalog skin (no concrete instance): used by Inhalt grids and the upgrader target list. */
export function skinCard(s: SkinDef, extra = '', tag: 'div' | 'button' = 'div'): HTMLElement {
  const card = document.createElement(tag);
  card.className = `icard skin r-${s.rarity}`;
  card.style.setProperty('--rc', rColor(s.rarity));
  card.dataset.skin = s.id;
  if (tag === 'button') (card as HTMLButtonElement).type = 'button';
  const mid = (s.floatMin + s.floatMax) / 2;
  card.innerHTML = `<div class="ic-art"></div><div class="ic-name"><small>${esc(names({ skin: s.id, statTrak: false }).weapon)}</small><b>${esc(s.name)}</b></div>${extra}`;
  card.querySelector('.ic-art')!.appendChild(skinArt({ skin: s.id, float: Math.min(mid, 0.1), seed: 7, statTrak: false }, 150, 88, true));
  return card;
}
