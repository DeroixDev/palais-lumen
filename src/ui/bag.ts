// The bag: a velvet pouch key in the HUD rail (always there, in the rooms and at the tables),
// a strip of active items under the rail with their rounds left and the honest payout share,
// the bag dialog to use items, the reaction offer with its little reel after a round
// (Engelsrolle, Teufelsrolle, Zeitmaschine), and the floating Mondsteine for won rounds.
// All in the DOM overlay, painted with the same medallions as the shop.

import { sfx } from '../core/audio';
import { reducedMotion } from '../core/fx';
import { allItems, bagCount, itemDef } from '../core/modifiers';
import { LOSS_SHARE } from '../core/lossShare';
import {
  REACTION_IDS,
  TIER_LABEL,
  activeList,
  currentGame,
  dismissOffer,
  fmtPct,
  installItems,
  itemRtp,
  itemRtpLabel,
  onItemEvent,
  pendingOffer,
  reactionChance,
  setCurrentGame,
  setGameLabel,
  useBagItem,
  useBlocked,
  type Offer,
} from '../core/itemsCore';
import { formatChips, type GameState } from '../core/state';
import { luckBias, luckLabel, luckOn, luckStats, onLuckChange } from '../core/debugLuck';
import { itemUrl, pouchUrl } from './itemArt';
import { stoneDataUrl } from './stone';

export interface BagHost {
  toast(text: string): void;
  modal(title: string, body: HTMLElement, buttons: { label: string; primary?: boolean; onClick: () => void }[]): void;
  closeModal(): void;
  modalOpen(): boolean;
  /** A round is running in the open game. */
  busy(): boolean;
  /** Display name of a game id. */
  gameName(id: string): string;
}

const TITLE = 'Beutel';
const TIER_ORDER = { legendaer: 0, gross: 1, mittel: 2, klein: 3 } as const;

export class Bag {
  private key: HTMLButtonElement;
  private badge: HTMLElement;
  private rail: HTMLElement;
  private offerEl: HTMLElement;
  private offerTimer = 0;
  private spinning = false;
  /** Last spot of a win on screen (from the shared celebration), for the floating stones. */
  private winSpot: { x: number; y: number; at: number } | null = null;
  private lastRtp = new Map<string, number>();
  private stoneUrl = stoneDataUrl(48);

  constructor(
    private state: GameState,
    private host: BagHost,
  ) {
    installItems(state);
    setGameLabel((id) => host.gameName(id));
    injectStyle();
    // The pouch key sits right after the Mondsteine in the HUD rail.
    const key = document.createElement('button');
    key.id = 'btn-bag';
    key.type = 'button';
    key.className = 'hud-btn bag-key';
    key.innerHTML = `<span class="bag-ic" aria-hidden="true"></span><span class="lbl">Beutel</span><span class="bag-n" aria-hidden="true"></span>`;
    (key.querySelector('.bag-ic') as HTMLElement).style.backgroundImage = `url(${pouchUrl()})`;
    key.addEventListener('click', () => {
      sfx.rustle();
      this.open();
    });
    const stones = document.querySelector('#hud .stones');
    stones?.after(key);
    this.key = key;
    this.badge = key.querySelector('.bag-n')!;

    this.rail = document.createElement('div');
    this.rail.id = 'items-rail';
    this.rail.setAttribute('aria-label', 'Aktive Items');
    document.body.appendChild(this.rail);

    this.offerEl = document.createElement('div');
    this.offerEl.id = 'item-offer';
    this.offerEl.hidden = true;
    this.offerEl.setAttribute('role', 'dialog');
    this.offerEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.offerEl);

    state.onChange(() => this.refresh());
    state.onRound((r) => this.lastRtp.set(r.game, r.rtp));
    onLuckChange(() => this.refresh());
    onItemEvent((e) => {
      if (e.type === 'note') host.toast(e.text);
      else if (e.type === 'stones') this.floatStones(e.n, e.why);
      else if (e.type === 'offer') this.showOffer(e.offer);
      else this.refresh();
    });
    // I opens the bag (Inventar), like the pouch key.
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyI' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t?.closest?.('input, textarea, select')) return;
      if (document.getElementById('hud')?.hidden) return;
      if (host.modalOpen()) return;
      e.preventDefault();
      this.open();
    });
    this.refresh();
  }

  /** The open game changed (null: back in the rooms). */
  setGame(id: string | null) {
    setCurrentGame(id);
    if (!id) this.hideOffer();
    this.refresh();
  }

  /** Where a win was celebrated (screen px), so the stones rise from there. */
  winAt(x: number, y: number) {
    this.winSpot = { x, y, at: performance.now() };
  }

  // ---- HUD key and the active strip ------------------------------------------------------------

  private refresh() {
    const d = this.state.data;
    const n = Object.values(d.bag).reduce((s, k) => s + k, 0);
    this.badge.textContent = n ? String(n) : '';
    this.badge.hidden = !n;
    this.key.setAttribute('aria-label', `Beutel, ${n} ${n === 1 ? 'Item' : 'Items'}${d.active.length ? `, ${d.active.length} aktiv` : ''}`);
    this.key.classList.toggle('has-active', d.active.length > 0);
    // Active items with rounds left, then the honest payout share at the open game.
    const act = activeList(this.state).filter((a) => !a.game || a.game === currentGame() || !currentGame());
    const g = currentGame();
    const rtp = g ? itemRtp(this.state, g, this.lastRtp.get(g)) : null;
    const luck = luckOn() ? { b: luckBias(), g, m: g ? luckStats(g) : null } : null;
    const sig = JSON.stringify([act.map((a) => [a.id, a.left, a.game]), rtp && [rtp.rtp, rtp.approx], luck]);
    if (sig === this.rail.dataset.sig) return;
    this.rail.dataset.sig = sig;
    this.rail.innerHTML = '';
    for (const a of act) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'it-chip';
      const left = a.left < 0 ? 'heute' : `${a.left}`;
      b.innerHTML = `<img alt="" src="${itemUrl(a.id)}"><span>${left}</span>`;
      const where = a.game ? ` (${this.host.gameName(a.game)})` : '';
      b.setAttribute('aria-label', `${a.def.name}${where}: ${a.left < 0 ? 'wirkt heute' : `noch ${a.left} ${a.left === 1 ? 'Runde' : 'Runden'}`}`);
      b.title = `${a.def.name}${where}: ${a.def.desc}`;
      b.addEventListener('click', () => this.open());
      this.rail.appendChild(b);
    }
    if (rtp) {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'it-chip rtp' + (rtp.rtp > 1 ? ' up' : '');
      c.innerHTML = `<b>${itemRtpLabel(rtp)}</b><small>statt ${fmtPct(rtp.plain)} %</small>`;
      c.title = this.rtpNote(g!, rtp);
      c.setAttribute('aria-label', `Auszahlungsquote ${itemRtpLabel(rtp)}, ohne Items ${fmtPct(rtp.plain)} %. ${c.title}`);
      c.addEventListener('click', () => this.open());
      this.rail.appendChild(c);
    }
    if (luck) {
      // Mod-Menü: the odds are steered. Say so at every table, with the measured payout share.
      const c = document.createElement('div');
      c.className = 'it-chip rtp dbg-luck';
      c.setAttribute('role', 'status');
      c.setAttribute('aria-label', `Mod-Menü aktiv: Gewinnchance ${luckLabel()}, die Auszahlungsquote ist manipuliert.`);
      const m = luck.m;
      const measured = m ? `Quote manipuliert · gemessen ${fmtPct(m.rtp)} % in ${m.rounds} ${m.rounds === 1 ? 'Runde' : 'Runden'}` : g ? 'Quote manipuliert · noch nicht gemessen' : 'Quote an allen Spielen manipuliert';
      c.innerHTML = '<b></b><small></small>';
      c.querySelector('b')!.textContent = `Mod-Menü: Gewinnchance ${luckLabel()}`;
      c.querySelector('small')!.textContent = measured;
      c.title = 'Mod-Menü: Die Gewinnchance ist verstellt. Die angezeigten Auszahlungsquoten der Spiele gelten gerade nicht; oben steht die gemessene Quote seit dem letzten Verstellen.';
      this.rail.appendChild(c);
    }
    this.rail.classList.toggle('on', this.rail.childElementCount > 0);
  }

  private rtpNote(game: string, r: NonNullable<ReturnType<typeof itemRtp>>) {
    const parts = [`Mit ${r.items.join(', ')}.`];
    if (r.approx && r.how) parts.push(`${r.how}; bei anderer Spielweise ändert sich der Wert etwas.`);
    if (r.cap) parts.push(`Gilt für Einsätze bis ${formatChips(r.cap)} Falter.`);
    if (r.rtp > 1) parts.push('Über 100 %: Mit diesen Items liegt der Vorteil bei dir.');
    void game;
    return parts.join(' ');
  }

  // ---- The bag dialog -----------------------------------------------------------------------------

  open() {
    const body = document.createElement('div');
    body.className = 'bag';
    this.fill(body);
    this.host.modal(TITLE, body, [{ label: 'Schließen', primary: true, onClick: () => this.host.closeModal() }]);
  }

  private reopen() {
    if (!this.host.modalOpen()) return;
    this.open();
  }

  private fill(body: HTMLElement) {
    const d = this.state.data;
    const g = currentGame();
    // Active items.
    const act = activeList(this.state);
    if (act.length) {
      const h = document.createElement('h3');
      h.textContent = 'Wirkt gerade';
      body.appendChild(h);
      const row = document.createElement('div');
      row.className = 'bag-active';
      for (const a of act) {
        const el = document.createElement('div');
        el.className = 'bag-on';
        const where = a.game ? ` · ${this.host.gameName(a.game)}` : '';
        el.innerHTML = `<img alt="" src="${itemUrl(a.id)}"><div><strong></strong><span></span></div>`;
        el.querySelector('strong')!.textContent = a.def.name;
        el.querySelector('span')!.textContent = `${a.left < 0 ? 'heute' : `noch ${a.left} ${a.left === 1 ? 'Runde' : 'Runden'}`}${where}`;
        row.appendChild(el);
      }
      body.appendChild(row);
    }
    if (g) {
      const r = itemRtp(this.state, g, this.lastRtp.get(g));
      const ls = LOSS_SHARE[g];
      const p = document.createElement('p');
      p.className = 'bag-rtp';
      const base = r?.base ?? this.lastRtp.get(g) ?? ls?.rtp;
      p.textContent = r
        ? `${this.host.gameName(g)}: Auszahlungsquote ohne Items ${fmtPct(r.plain)} %, mit Items ${r.approx ? 'ca. ' : ''}${fmtPct(r.rtp)} %. ${this.rtpNote(g, r)}`
        : base !== undefined
          ? `${this.host.gameName(g)}: Auszahlungsquote ${fmtPct(base)} %. Items, die Verluste abfedern oder Gewinne erhöhen, zeigen hier und oben links die Quote mit Item.`
          : '';
      if (p.textContent) body.appendChild(p);
    }
    // The bag itself.
    const owned = allItems()
      .filter((x) => bagCount(d, x.id) > 0)
      .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || b.price - a.price);
    const h = document.createElement('h3');
    h.textContent = 'Im Beutel';
    body.appendChild(h);
    if (!owned.length) {
      const p = document.createElement('p');
      p.className = 'bag-empty';
      p.textContent = 'Dein Beutel ist leer. Glücksgriffe gibt es für Mondsteine im Andenkenladen im Foyer.';
      body.appendChild(p);
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'bag-grid';
    for (const def of owned) {
      const why = useBlocked(this.state, def.id, this.host.busy());
      const card = document.createElement('div');
      card.className = `bag-item t-${def.tier}`;
      card.innerHTML = `<img alt="" src="${itemUrl(def.id)}"><div class="bi-txt"><div class="bi-head"><strong></strong><em></em><b></b></div><p></p></div><div class="bi-act"><button type="button"></button><small></small></div>`;
      card.querySelector('strong')!.textContent = def.name;
      card.querySelector('em')!.textContent = TIER_LABEL[def.tier];
      card.querySelector('b')!.textContent = `×${bagCount(d, def.id)}`;
      card.querySelector('p')!.textContent = def.desc;
      const btn = card.querySelector('button')!;
      const reaction = REACTION_IDS.includes(def.id) || def.id === 'wundertuete';
      btn.textContent = def.id === 'wundertuete' ? 'Öffnen' : reaction ? 'Drehen' : 'Benutzen';
      if (def.id === 'zeitmaschine') btn.textContent = 'Zurückdrehen';
      btn.setAttribute('aria-label', `${def.name} ${btn.textContent}`);
      if (why) {
        btn.disabled = true;
        card.querySelector('small')!.textContent = why;
        btn.setAttribute('aria-describedby', '');
      } else btn.className = 'primary';
      btn.addEventListener('click', () => this.use(def.id));
      grid.appendChild(card);
    }
    body.appendChild(grid);
  }

  private use(id: string) {
    if (REACTION_IDS.includes(id) || id === 'wundertuete') {
      this.host.closeModal();
      void this.spin(id);
      return;
    }
    const res = useBagItem(this.state, id, this.host.busy());
    if (res.ok) {
      sfx.shimmer();
      this.host.toast(res.text);
      this.host.closeModal();
    } else {
      sfx.lose();
      this.host.toast(res.text);
      this.reopen();
    }
  }

  // ---- Reaction offer and reels -------------------------------------------------------------------

  private showOffer(o: Offer | null) {
    if (this.spinning) return;
    if (!o || !o.ids.length) return this.hideOffer();
    // Only where the round was played (an offer from a game closed meanwhile stays quiet).
    if (o.game !== currentGame()) return;
    const el = this.offerEl;
    el.innerHTML = '';
    el.className = o.kind;
    const head = document.createElement('div');
    head.className = 'of-head';
    head.textContent = o.kind === 'loss' ? `Verloren: −${formatChips(o.amount)} Falter` : `Gewonnen: +${formatChips(o.amount)} Falter`;
    el.appendChild(head);
    const row = document.createElement('div');
    row.className = 'of-row';
    for (const id of o.ids) {
      const def = itemDef(id)!;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'of-btn';
      const chance = reactionChance(this.state, id);
      const sub =
        id === 'engel' ? `${fmtPct(chance).replace(',0', '')} % Chance: alles zurück` : id === 'teufel' ? '1 zu 3: Gewinn ×3, sonst weg' : 'Runde ungeschehen machen';
      b.innerHTML = `<img alt="" src="${itemUrl(id)}"><span><strong></strong><small></small></span><i>×${bagCount(this.state.data, id)}</i>`;
      b.querySelector('strong')!.textContent = def.name;
      b.querySelector('small')!.textContent = sub;
      b.setAttribute('aria-label', `${def.name}: ${sub}. Noch ${bagCount(this.state.data, id)} im Beutel.`);
      b.addEventListener('click', () => void this.spin(id));
      row.appendChild(b);
    }
    el.appendChild(row);
    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'of-no';
    no.textContent = 'Nein danke';
    no.addEventListener('click', () => {
      sfx.click();
      dismissOffer();
      this.hideOffer();
    });
    el.appendChild(no);
    el.hidden = false;
    el.classList.remove('out');
    sfx.chime();
    clearTimeout(this.offerTimer);
    // The offer waits a while, and always ends with the next round.
    this.offerTimer = window.setTimeout(() => this.hideOffer(), 12000);
  }

  private hideOffer() {
    clearTimeout(this.offerTimer);
    if (this.spinning || this.offerEl.hidden) return;
    const el = this.offerEl;
    el.classList.add('out');
    setTimeout(() => {
      if (el.classList.contains('out')) el.hidden = true;
    }, 160);
  }

  /** The reel: spins, lands on the outcome, then the item does its thing. */
  private async spin(id: string) {
    if (this.spinning) return;
    const why = useBlocked(this.state, id, false);
    if (why) {
      this.host.toast(why);
      return;
    }
    clearTimeout(this.offerTimer);
    this.spinning = true;
    const el = this.offerEl;
    el.hidden = false;
    el.classList.remove('out', 'loss', 'win');
    el.className = 'spin';
    const def = itemDef(id)!;
    el.innerHTML = `<div class="of-head"></div><div class="reel-win"><div class="reel-strip"></div></div><div class="of-res" aria-live="polite"></div>`;
    el.querySelector('.of-head')!.textContent = def.name;
    const strip = el.querySelector('.reel-strip') as HTMLElement;
    const res = el.querySelector('.of-res') as HTMLElement;
    // Decide first (same chance the item states), then let the reel land there.
    let hit = true;
    let face: (good: boolean, i: number) => string;
    let got = '';
    if (id === 'wundertuete') {
      const r = useBagItem(this.state, id, false);
      got = r.got ?? '';
      const pool = allItems().filter((x) => x.id !== 'wundertuete').map((x) => x.id);
      face = (good, i) => `<img alt="" src="${itemUrl(good ? got : pool[(i * 7) % pool.length])}">`;
    } else if (id === 'zeitmaschine') {
      face = (good) => (good ? `<img alt="" src="${itemUrl('zeitmaschine')}">` : '<span class="f-x">✕</span>');
    } else {
      hit = Math.random() < reactionChance(this.state, id);
      face = (good) => (good ? (id === 'engel' ? `<img alt="" src="${itemUrl('engel')}">` : '<span class="f-3">×3</span>') : '<span class="f-x">✕</span>');
    }
    const N = 18;
    const cells: string[] = [];
    for (let i = 0; i < N; i++) {
      const good = i === N - 2 ? hit : id === 'wundertuete' ? false : i % 2 === 0;
      cells.push(`<div class="cell">${face(good, i)}</div>`);
    }
    strip.innerHTML = cells.join('');
    const calm = reducedMotion();
    const cellH = 64;
    sfx.spinStart();
    if (calm) strip.style.transform = `translateY(${-(N - 2) * cellH}px)`;
    else {
      strip.style.transform = 'translateY(0)';
      void strip.offsetWidth;
      strip.style.transition = 'transform 1.5s cubic-bezier(.12,.62,.18,1)';
      strip.style.transform = `translateY(${-(N - 2) * cellH}px)`;
    }
    await new Promise((r) => setTimeout(r, calm ? 250 : 1550));
    let text = '';
    let good = hit;
    if (id === 'wundertuete') {
      text = `In der Wundertüte: ${itemDef(got)?.name ?? got}!`;
    } else {
      const r = useBagItem(this.state, id, false, hit);
      text = r.text;
      good = r.ok && r.hit !== false;
      if (!r.ok) good = false;
    }
    res.textContent = text;
    el.classList.add(good ? 'hit' : 'miss');
    if (good) {
      sfx.win();
      const rect = el.getBoundingClientRect();
      this.sparkleAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
    } else sfx.lose();
    this.host.toast(text);
    await new Promise((r) => setTimeout(r, calm ? 1200 : 1700));
    this.spinning = false;
    this.hideOffer();
    // A second reaction item may still fit the same round (Zeitmaschine after a missed Engel).
    const o = pendingOffer();
    if (o && o.ids.some((x) => bagCount(this.state.data, x) > 0)) this.showOffer({ ...o, ids: o.ids.filter((x) => bagCount(this.state.data, x) > 0) });
  }

  private sparkleAt(x: number, y: number) {
    if (reducedMotion()) return;
    for (let i = 0; i < 10; i++) {
      const s = document.createElement('i');
      s.className = 'of-spark';
      const a = (i / 10) * Math.PI * 2;
      s.style.left = `${x}px`;
      s.style.top = `${y}px`;
      s.style.setProperty('--dx', `${Math.cos(a) * 90}px`);
      s.style.setProperty('--dy', `${Math.sin(a) * 60}px`);
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 700);
    }
  }

  // ---- Floating Mondsteine ------------------------------------------------------------------------

  private floatStones(n: number, why: string) {
    const spot = this.winSpot && performance.now() - this.winSpot.at < 2500 ? this.winSpot : null;
    const x = spot?.x ?? innerWidth / 2;
    const y = spot?.y ?? innerHeight * 0.42;
    const el = document.createElement('div');
    el.className = 'stone-float';
    el.innerHTML = `<i style="background-image:url(${this.stoneUrl})"></i><b>+${n}</b><small></small>`;
    el.querySelector('small')!.textContent = why;
    el.style.left = `${x}px`;
    el.style.top = `${y - 30}px`;
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    if (spot) spot.y -= 46; // a second stone in the same round floats a bit higher
    setTimeout(() => el.remove(), reducedMotion() ? 1400 : 1800);
    sfx.chime();
  }
}

/** The bag's look: brass and velvet like the HUD, from the shared --nf-* materials. */
function injectStyle() {
  if (document.getElementById('bag-style')) return;
  const s = document.createElement('style');
  s.id = 'bag-style';
  s.textContent = `
  .bag-key { gap: 6px; padding: 0 12px 0 6px; }
  .bag-key .bag-ic { width: 34px; height: 34px; background: center / contain no-repeat; flex: none; filter: drop-shadow(0 2px 1px rgba(0,0,0,.5)); }
  .bag-key .bag-n { position: absolute; top: -6px; right: -6px; min-width: 20px; height: 20px; padding: 0 5px; box-sizing: border-box; border-radius: 10px; font: 700 .8rem/20px var(--body); text-align: center; color: #2a1406; background: var(--brass-grad); box-shadow: 0 0 0 1.5px rgba(22,10,20,.9); }
  .bag-key.has-active .bag-ic { animation: bagglow 2.4s ease-in-out infinite; }
  @keyframes bagglow { 50% { filter: drop-shadow(0 0 6px rgba(255,207,122,.9)); } }
  @media (max-width: 1100px) {
    #hud .bag-key { order: 9; width: 48px; height: 44px; min-height: 44px; padding: 0; justify-content: center; align-self: end; }
    #hud .bag-key .lbl { display: none; }
    #hud .evening { flex-basis: calc(100% - 56px); }
  }
  @media (max-width: 1100px) and (max-height: 500px) and (orientation: landscape) {
    #hud .bag-key { order: 0; align-self: center; }
    #hud .evening { flex-basis: auto; }
  }

  /* Desktop: top right under the rail (the dealer's quip bubble lives top left). Phones: top left. */
  #items-rail { position: fixed; right: max(12px, env(safe-area-inset-right, 0px)); top: calc(var(--hud-h) + 8px); z-index: 33; display: none; flex-wrap: wrap; justify-content: flex-end; gap: 6px; max-width: min(60vw, 520px); pointer-events: none; }
  @media (max-width: 1100px) { #items-rail { right: auto; left: max(10px, env(safe-area-inset-left, 0px)); justify-content: flex-start; } }
  #items-rail.on { display: flex; }
  body.hud-off #items-rail, body.modal-open #items-rail { display: none; }
  .it-chip { pointer-events: auto; display: inline-flex; align-items: center; gap: 4px; min-height: 0; height: 36px; padding: 0 9px 0 2px; border-radius: 18px; font: 700 .95rem/1 var(--body); color: var(--cream); }
  .it-chip img { width: 32px; height: 32px; }
  .it-chip.rtp { padding: 0 12px; flex-direction: column; justify-content: center; gap: 1px; height: 40px; border-radius: 12px; }
  .it-chip.rtp b { font: 700 .98rem/1 var(--body); color: var(--lamp); }
  .it-chip.rtp.up b { color: #9ff0a8; }
  .it-chip.dbg-luck { background: linear-gradient(180deg, #7a1030, #3a0618); border: 2px solid #ff6a8a; box-shadow: 0 0 12px rgba(255, 80, 120, .55); }
  .it-chip.dbg-luck b { color: #ffd0dc; }
  .it-chip.dbg-luck small { color: #ffb0c0; }
  .it-chip.rtp small { font: 600 .72rem/1 var(--body); color: var(--muted); letter-spacing: .04em; }
  .it-chip::before { content: ""; position: absolute; inset: -6px -3px; }
  .it-chip { position: relative; }

  #modal .bag h3 { margin: 6px 0 8px; font: 700 .9rem/1 var(--body); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  #modal .bag .bag-rtp { margin: 4px 0 10px; padding: 8px 10px; border-radius: 10px; background: rgba(10,4,12,.45); box-shadow: inset 0 0 0 1px rgba(224,178,90,.35); font-size: 1rem; line-height: 1.3; }
  #modal .bag .bag-empty { opacity: .85; }
  .bag-active { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
  .bag-on { display: flex; align-items: center; gap: 6px; padding: 4px 10px 4px 4px; border-radius: 12px; background: rgba(10,4,12,.45); box-shadow: inset 0 0 0 1px rgba(159,232,255,.35); }
  .bag-on img { width: 40px; height: 40px; }
  .bag-on strong { display: block; font-size: 1rem; }
  .bag-on span { font-size: .88rem; color: var(--muted); }
  .bag-grid { display: grid; gap: 8px; }
  .bag-item { display: grid; grid-template-columns: 64px 1fr auto; gap: 10px; align-items: center; padding: 8px 10px 8px 6px; border-radius: 12px; background: linear-gradient(180deg, rgba(58,18,40,.75), rgba(26,6,18,.75)); box-shadow: inset 0 0 0 1.5px rgba(224,178,90,.55), 0 2px 0 rgba(22,10,20,.6); }
  .bag-item.t-gross { box-shadow: inset 0 0 0 1.5px rgba(159,200,255,.7), 0 2px 0 rgba(22,10,20,.6); }
  .bag-item.t-legendaer { box-shadow: inset 0 0 0 2px #c9a0ff, 0 0 14px rgba(201,160,255,.35); }
  .bag-item img { width: 64px; height: 64px; }
  .bi-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .bi-head strong { font-size: 1.1rem; }
  .bi-head em { font: 700 .7rem/1 var(--body); font-style: normal; letter-spacing: .12em; text-transform: uppercase; padding: 3px 6px 2px; border-radius: 5px; color: #2a1406; background: var(--brass-grad); }
  .t-klein .bi-head em { background: linear-gradient(180deg, #e8d8c0, #a89070); }
  .t-gross .bi-head em { background: linear-gradient(180deg, #e6f4ff, #6a9ad8); }
  .t-legendaer .bi-head em { background: linear-gradient(180deg, #f4e8ff, #9a6ad8); color: #1a0a2a; }
  .bi-head b { font: 1rem var(--display); color: var(--lamp); }
  .bag-item p { margin: 3px 0 0; font-size: .95rem; line-height: 1.22; color: #e6d6b4; }
  .bi-act { display: grid; justify-items: end; gap: 4px; max-width: 150px; }
  .bi-act small { font-size: .8rem; line-height: 1.15; color: var(--muted); text-align: right; }
  @media (max-width: 560px) {
    .bag-item { grid-template-columns: 52px 1fr; }
    .bag-item img { width: 52px; height: 52px; }
    .bi-act { grid-column: 1 / -1; justify-items: stretch; max-width: none; }
    .bi-act small { text-align: left; }
  }

  #item-offer { --ox: 0px; position: fixed; z-index: 37; right: max(14px, env(safe-area-inset-right, 0px)); top: calc(var(--hud-h) + 58px); transform: translateX(var(--ox)); width: min(calc(100vw - 20px), 380px); box-sizing: border-box; padding: 12px 14px 12px; display: grid; gap: 8px; justify-items: stretch;
    border: 4px solid transparent; border-image: var(--nf-plate, none) 24 fill / 12px stretch; border-radius: 14px; background: linear-gradient(180deg, #3a1428, #1a0612) padding-box;
    filter: drop-shadow(0 12px 22px rgba(0,0,0,.65)); animation: offerin .28s cubic-bezier(.3,1.25,.55,1) both; }
  #item-offer.out { animation: offerout .16s ease-in both; }
  @media (max-width: 1100px) { #item-offer { --ox: -50%; right: auto; left: 50%; top: calc(var(--hud-h) + 50px); } }
  @keyframes offerin { from { opacity: 0; transform: translateX(var(--ox)) translateY(-12px) scale(.94); } }
  @keyframes offerout { to { opacity: 0; transform: translateX(var(--ox)) translateY(-6px); } }
  body.hud-off #item-offer { display: none; }
  #item-offer .of-head { font: 1.05rem/1.1 var(--display); letter-spacing: .04em; text-align: center; color: var(--lamp); }
  #item-offer.loss .of-head { color: #ffb0a0; }
  #item-offer .of-row { display: grid; gap: 6px; }
  #item-offer .of-btn { display: grid; grid-template-columns: 48px 1fr auto; align-items: center; gap: 8px; text-align: left; min-height: 56px; padding: 4px 12px 4px 4px; }
  #item-offer .of-btn img { width: 48px; height: 48px; }
  #item-offer .of-btn strong { display: block; font-size: 1.08rem; }
  #item-offer .of-btn small { display: block; font: 600 .88rem/1.15 var(--body); color: var(--muted); }
  #item-offer .of-btn i { font: .95rem var(--display); color: var(--lamp); font-style: normal; }
  #item-offer .of-no { min-height: 44px; justify-self: center; padding: 0 1.4em; font-size: 1rem; }
  #item-offer .reel-win { position: relative; height: 64px; width: 120px; justify-self: center; overflow: hidden; border-radius: 10px;
    background: linear-gradient(180deg, #c8b898, #fffaf0 30%, #fffaf0 70%, #c8b898); box-shadow: inset 0 0 0 3px #a8741f, inset 0 0 0 5px rgba(22,10,20,.8), inset 0 8px 10px -6px rgba(0,0,0,.6), inset 0 -8px 10px -6px rgba(0,0,0,.6); }
  #item-offer .reel-win::after { content: ""; position: absolute; left: 6px; right: 6px; top: 50%; height: 2px; margin-top: -1px; background: rgba(200,40,90,.35); }
  #item-offer .reel-strip { will-change: transform; }
  #item-offer .cell { height: 64px; display: grid; place-items: center; }
  #item-offer .cell img { width: 54px; height: 54px; }
  #item-offer .f-x { font: 2rem/1 var(--display); color: #5a2a3a; }
  #item-offer .f-3 { font: 1.9rem/1 var(--display); color: #b0201a; }
  #item-offer .of-res { min-height: 1.3em; text-align: center; font: 700 1.05rem/1.25 var(--body); }
  #item-offer.hit .reel-win { box-shadow: inset 0 0 0 3px #ffe08a, inset 0 0 0 5px rgba(22,10,20,.8), 0 0 18px rgba(255,224,138,.8); }
  #item-offer.hit .of-res { color: #9ff0a8; }
  #item-offer.miss .of-res { color: #ffb0a0; }
  .of-spark { position: fixed; z-index: 38; width: 8px; height: 8px; margin: -4px; border-radius: 50%; background: #fff1c4; box-shadow: 0 0 8px #ffcf7a; pointer-events: none; animation: ofspark .7s ease-out forwards; }
  @keyframes ofspark { to { transform: translate(var(--dx), var(--dy)) scale(.3); opacity: 0; } }

  .stone-float { position: fixed; z-index: 33; transform: translate(-50%, -50%); display: grid; grid-template-columns: auto auto; align-items: center; column-gap: 4px; pointer-events: none; animation: stonefloat 1.8s cubic-bezier(.2,.8,.3,1) forwards; }
  .stone-float i { width: 38px; height: 38px; background: center / contain no-repeat; filter: drop-shadow(0 0 6px rgba(159,232,255,.8)); }
  .stone-float b { font: 1.7rem/1 var(--display); color: #dff6ff; text-shadow: 0 2px 0 #0a1a2a, 0 0 10px rgba(159,232,255,.7); }
  .stone-float small { grid-column: 1 / -1; text-align: center; font: 700 .95rem/1.1 var(--body); color: #bfefff; text-shadow: 0 1px 2px #000; }
  @keyframes stonefloat { 0% { opacity: 0; transform: translate(-50%, -30%) scale(.6); } 15% { opacity: 1; transform: translate(-50%, -50%) scale(1.08); } 70% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -150%) scale(.95); } }
  @media (prefers-reduced-motion: reduce) {
    .bag-key.has-active .bag-ic { animation: none; }
    #item-offer, #item-offer.out { animation-name: fadein; }
    .stone-float { animation: stonefade 1.4s linear forwards; }
    @keyframes stonefade { 0%, 80% { opacity: 1; } 100% { opacity: 0; } }
  }
  `;
  document.head.appendChild(s);
}

