// The spinning reel: horizontal on the case page, vertical in battles.

import type { CaseDef, ItemInstance } from '../../contract';
import { skinById } from '../lib/assets';
import { rollFiller } from '../lib/economy';
import { sfx } from '../lib/sound';
import { hash01, reducedMotion, sleep } from '../lib/util';
import { rColor, skinCanvas } from './items';

const TILES = 56;
const WIN_AT = 48;

export interface SpinOpts { duration: number; sound: boolean; reveal?: boolean }

export class Reel {
  readonly el: HTMLElement;
  private strip: HTMLElement;
  private tiles: ItemInstance[] = [];
  private pos = 0;
  private vertical: boolean;

  constructor(vertical = false) {
    this.vertical = vertical;
    this.el = document.createElement('div');
    this.el.className = `reel-win${vertical ? ' vert' : ''}`;
    this.el.innerHTML = '<div class="reel-strip"></div><div class="reel-marker"></div><div class="reel-shade"></div>';
    this.strip = this.el.querySelector('.reel-strip') as HTMLElement;
  }

  private tileFor(it: ItemInstance, hideGold: boolean): HTMLElement {
    const s = skinById(it.skin);
    const r = s?.rarity ?? 'milspec';
    const d = document.createElement('div');
    d.className = `rtile r-${r}`;
    d.style.setProperty('--rc', rColor(r));
    if (r === 'gold' && hideGold) {
      d.classList.add('mystery');
      d.innerHTML = '<span class="rt-star">★</span>';
    } else {
      d.appendChild(skinCanvas(it, this.vertical ? 104 : 128, this.vertical ? 62 : 76));
      if (!this.vertical && s) d.insertAdjacentHTML('beforeend', `<span class="rt-name">${s.name}</span>`);
    }
    return d;
  }

  /** Filler tiles share a few seeds so the art cache can serve them. */
  private filler(c: CaseDef): ItemInstance {
    const f = rollFiller(c);
    f.seed = Math.floor(hash01(f.skin) * 5) * 100 + 7;
    f.float = 0.12;
    f.statTrak = false;
    return f;
  }

  private build(c: CaseDef, win?: ItemInstance) {
    this.tiles = [];
    for (let i = 0; i < TILES; i++) this.tiles.push(i === WIN_AT && win ? win : this.filler(c));
    // A near miss next to the real drop now and then: the reel feels alive.
    if (win && Math.random() < 0.35) {
      const ids = c.contents.gold?.length ? c.contents.gold : c.contents.covert;
      if (ids?.length) {
        const nb = WIN_AT + (Math.random() < 0.5 ? 1 : -1);
        const f = this.filler(c);
        f.skin = ids[Math.floor(Math.random() * ids.length)];
        this.tiles[nb] = f;
      }
    }
    this.strip.replaceChildren(...this.tiles.map((t) => this.tileFor(t, true)));
  }

  private metrics() {
    const first = this.strip.firstElementChild as HTMLElement;
    const r = first.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(this.strip).gap || '0') || 0;
    const size = (this.vertical ? r.height : r.width) + gap;
    const view = this.vertical ? this.el.clientHeight : this.el.clientWidth;
    return { size, tile: this.vertical ? r.height : r.width, view };
  }
  private place(px: number) {
    this.pos = px;
    this.strip.style.transform = this.vertical ? `translate3d(0,${px}px,0)` : `translate3d(${px}px,0,0)`;
  }
  /** Offset that puts the centre of tile i under the marker (plus `off` px within the tile). */
  private offsetFor(i: number, off = 0) {
    const m = this.metrics();
    return m.view / 2 - (i * m.size + m.tile / 2 + off);
  }

  idle(c: CaseDef) {
    this.build(c);
    this.el.classList.remove('done', 'gold-win', 'suspense');
    requestAnimationFrame(() => this.place(this.offsetFor(6)));
  }

  /** Spins to `win`; resolves when the reel has stopped and the winner is revealed. */
  async spin(c: CaseDef, win: ItemInstance, o: SpinOpts): Promise<HTMLElement> {
    this.build(c, win);
    this.el.classList.remove('done', 'gold-win', 'suspense');
    const m = this.metrics();
    const start = this.offsetFor(3);
    const jitter = (Math.random() - 0.5) * (m.tile * 0.8);
    const end = this.offsetFor(WIN_AT, jitter);
    const gold = skinById(win.skin)?.rarity === 'gold';
    const dur = reducedMotion() ? Math.min(o.duration, 900) : o.duration;
    this.place(start);
    const tickCenter = m.view / 2;
    let lastIdx = -1;
    let suspense = false;
    await new Promise<void>((resolve) => {
      const t0 = performance.now();
      const frame = (now: number) => {
        const t = Math.min(1, (now - t0) / dur);
        // Quartic ease-out; gold gets a longer creep at the end.
        const e = gold ? 1 - Math.pow(1 - t, 5) : 1 - Math.pow(1 - t, 4);
        const x = start + (end - start) * e;
        this.place(x);
        const idx = Math.floor((tickCenter - x) / m.size);
        if (idx !== lastIdx) {
          lastIdx = idx;
          if (o.sound) sfx.tick(1 - t);
        }
        if (gold && !suspense && t > 0.72 && dur > 1500) {
          suspense = true;
          this.el.classList.add('suspense');
          if (o.sound) sfx.suspense();
        }
        if (t < 1) requestAnimationFrame(frame); else resolve();
      };
      requestAnimationFrame(frame);
    });
    // Settle to the tile's centre.
    if (!reducedMotion()) {
      this.strip.style.transition = 'transform .35s cubic-bezier(.2,.8,.2,1)';
      this.place(this.offsetFor(WIN_AT));
      await sleep(360);
      this.strip.style.transition = '';
    }
    let tile = this.strip.children[WIN_AT] as HTMLElement;
    this.el.classList.remove('suspense');
    if (o.reveal !== false) tile = this.revealWin();
    this.el.classList.add('done');
    if (gold) this.el.classList.add('gold-win');
    return tile;
  }

  /** Swaps the ★ placeholder for the real item and lights the winning tile. */
  revealWin() {
    const tile = this.strip.children[WIN_AT] as HTMLElement;
    const it = this.tiles[WIN_AT];
    if (tile.classList.contains('mystery')) {
      const fresh = this.tileFor(it, false);
      fresh.classList.add('flip-in');
      tile.replaceWith(fresh);
      fresh.classList.add('win');
      return fresh;
    }
    tile.classList.add('win');
    return tile;
  }
  get winTile() { return this.strip.children[WIN_AT] as HTMLElement; }
  get offset() { return this.pos; }
}
