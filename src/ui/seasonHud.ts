// HTML bits of the season systems in the top bar: the Glücksbringer-Kette (small painted
// medallions next to the Mondsteine; tap for the full list), the moon pips of the season's
// Mondstufe next to the day label, and the boss bar colour per phase (set by boss.ts).

import { PERKS, RARITY_LABEL, perkById, perkCount } from '../core/perks';
import { MOON_LEVELS } from '../core/moon';
import type { GameState } from '../core/state';
import { perkDataUrl, RARITY_COLOR } from './perkArt';

const CSS = `
  .perkchain { cursor: pointer; padding: 0 12px 0 10px; gap: 0; position: relative; }
  .perkchain[hidden] { display: none; }
  .perkchain::before { content: ""; position: absolute; left: 10px; right: 12px; top: 50%; height: 3px; margin-top: -9px; border-radius: 2px;
    background: repeating-linear-gradient(90deg, #f0c868 0 5px, #8a5a18 5px 7px); box-shadow: 0 1px 0 rgba(22,10,20,.9); }
  .perkchain img { width: 30px; height: 30px; margin-left: -5px; position: relative; filter: drop-shadow(0 2px 1px rgba(0,0,0,.55)); transform-origin: 50% 0; animation: perksway 3.2s ease-in-out infinite; }
  .perkchain img:first-child { margin-left: 0; }
  .perkchain img:nth-child(2n) { animation-delay: -1.1s; }
  .perkchain img:nth-child(3n) { animation-delay: -2.1s; }
  .perkchain .more { font: 700 .95rem/1 var(--body); color: var(--cream-2); margin-left: 4px; position: relative; }
  .perkchain.bump img:last-of-type { animation: perkland .6s cubic-bezier(.34,1.8,.64,1); }
  @keyframes perksway { 50% { transform: rotate(5deg); } }
  @keyframes perkland { 0% { transform: translateY(-14px) scale(1.4); } }
  #ev-moon { margin-right: auto; display: inline-flex; gap: 3px; align-items: center; cursor: default; }
  #ev-moon[hidden] { display: none; }
  #ev-moon i { width: 9px; height: 9px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #fff, #cfe2ff 45%, #7a8ab0); box-shadow: 0 0 6px rgba(190,215,255,.7), 0 0 0 1px rgba(22,10,20,.8); }
  #ev-moon.blood i { background: radial-gradient(circle at 35% 35%, #ffd0b0, #e0503a 55%, #7a1a1a); box-shadow: 0 0 6px rgba(255,110,90,.7), 0 0 0 1px rgba(22,10,20,.8); }
  #ev-moon.pick { cursor: pointer; }
  #ev-moon.pick::after { content: "wählen"; font: 600 .78rem/1 var(--body); color: #cfe2ff; margin-left: 4px; text-decoration: underline; }
  .evening.boss-p2 #ev-bar.boss #ev-fill { background: linear-gradient(180deg, #ffd6f0, #ff6ad0 35%, #a02a8a 70%, #4a0a3a); box-shadow: 0 0 14px rgba(255,106,208,.8); }
  .evening.boss-p2 #ev-bar.boss .ev-track { box-shadow: inset 0 2px 3px rgba(0,0,0,.8), 0 0 0 2px #a02a8a, 0 0 0 3px rgba(22,10,20,.9), 0 0 16px rgba(255,106,208,.55); }
  .evening.boss.boss-p2 #ev-goal { color: #ffc6ec; }
  .evening.boss-p3 #ev-bar.boss #ev-fill { background: linear-gradient(180deg, #ffd8c8, #ff5a4a 35%, #a01a2a 70%, #4a0a10); box-shadow: 0 0 16px rgba(255,90,74,.9); animation: bosspulse 1.1s ease-in-out infinite; }
  .evening.boss-p3 #ev-bar.boss .ev-track { box-shadow: inset 0 2px 3px rgba(0,0,0,.8), 0 0 0 2px #c02a2a, 0 0 0 3px rgba(22,10,20,.9), 0 0 18px rgba(255,90,74,.6); }
  .evening.boss.boss-p3 #ev-goal { color: #ffb8a8; }
  @keyframes bosspulse { 50% { filter: brightness(1.3); } }
  @media (prefers-reduced-motion: reduce) { .perkchain img, .evening.boss-p3 #ev-bar.boss #ev-fill { animation: none; } }
  @media (max-width: 1100px) { .perkchain img { width: 24px; height: 24px; } .perkchain img:nth-of-type(n+4) { display: none; } }
  .perks-list { display: grid; gap: 8px; margin: 0; }
  .perk-row { display: grid; grid-template-columns: 48px 1fr; gap: 12px; align-items: center; padding: 8px 10px; border-radius: 12px; background: rgba(10,4,12,.4); box-shadow: inset 0 0 0 1px rgba(224,178,90,.25); }
  .perk-row img { width: 48px; height: 48px; }
  .perk-row strong { display: block; font-size: 1.1rem; }
  .perk-row em { font-style: normal; font-size: .8rem; letter-spacing: .1em; text-transform: uppercase; margin-left: 6px; }
  .perk-row span { display: block; color: var(--cream-2); opacity: .9; }
  .perks-note { margin: 10px 0 0; opacity: .75; font-size: .95rem; }
`;

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export class SeasonHud {
  private chain: HTMLElement;
  private moon: HTMLElement;
  private shown = '';
  private shownMoon = '';

  constructor(
    private state: GameState,
    private actions: { showPerks(body: HTMLElement): void; openDial(): void; canDial(): boolean },
  ) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.chain = document.createElement('div');
    this.chain.className = 'perkchain plaque';
    this.chain.setAttribute('role', 'button');
    this.chain.tabIndex = 0;
    this.chain.hidden = true;
    document.querySelector('#hud .stones')?.after(this.chain);
    this.chain.addEventListener('click', () => this.actions.showPerks(this.list()));
    this.chain.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && this.actions.showPerks(this.list()));
    this.moon = document.createElement('span');
    this.moon.id = 'ev-moon';
    this.moon.hidden = true;
    document.querySelector('#ev-num')?.after(this.moon);
    this.moon.addEventListener('click', () => this.actions.canDial() && this.actions.openDial());
    state.onChange(() => this.render());
    this.render();
  }

  render() {
    const d = this.state.data;
    const key = d.perks.join(',');
    if (key !== this.shown) {
      const grew = d.perks.length > this.shown.split(',').filter(Boolean).length;
      this.shown = key;
      this.chain.hidden = d.perks.length === 0;
      this.chain.innerHTML = '';
      const max = 6;
      d.perks.slice(-max).forEach((id) => {
        const img = document.createElement('img');
        img.src = perkDataUrl(id, 48);
        img.alt = perkById(id)?.name ?? '';
        this.chain.appendChild(img);
      });
      if (d.perks.length > max) {
        const more = document.createElement('span');
        more.className = 'more';
        more.textContent = `+${d.perks.length - max}`;
        this.chain.appendChild(more);
      }
      this.chain.title = `Glücksbringer-Kette: ${d.perks.map((id) => perkById(id)?.name).join(', ')}. Tippen für Details.`;
      this.chain.setAttribute('aria-label', this.chain.title);
      if (grew) {
        this.chain.classList.remove('bump');
        void this.chain.offsetWidth;
        this.chain.classList.add('bump');
      }
    }
    const mk = `${d.heat}-${this.actions.canDial()}`;
    if (mk !== this.shownMoon) {
      this.shownMoon = mk;
      const pick = this.actions.canDial();
      this.moon.hidden = d.heat <= 0 && !pick;
      this.moon.classList.toggle('blood', d.heat >= 5);
      this.moon.classList.toggle('pick', pick);
      this.moon.innerHTML = '<i></i>'.repeat(Math.max(0, d.heat));
      this.moon.title = d.heat > 0 ? `Mondstufe ${d.heat}: ${MOON_LEVELS[d.heat].name}` : 'Mondstufe wählen';
      this.moon.setAttribute('aria-label', this.moon.title);
    }
  }

  /** The full chain: every perk with its exact effect. */
  private list() {
    const d = this.state.data;
    const wrap = document.createElement('div');
    const list = document.createElement('div');
    list.className = 'perks-list';
    const seen = new Set<string>();
    for (const id of d.perks) {
      if (seen.has(id)) continue;
      seen.add(id);
      const p = perkById(id);
      if (!p) continue;
      const n = perkCount(d, id);
      const row = document.createElement('div');
      row.className = 'perk-row';
      row.innerHTML = `<img alt=""><div><strong></strong><span></span></div>`;
      (row.querySelector('img') as HTMLImageElement).src = perkDataUrl(id, 48);
      const st = row.querySelector('strong')!;
      st.textContent = n > 1 ? `${p.name} ×${n}` : p.name;
      const em = document.createElement('em');
      em.textContent = RARITY_LABEL[p.rarity];
      em.style.color = hex(RARITY_COLOR[p.rarity]);
      st.appendChild(em);
      row.querySelector('span')!.textContent = n > 1 && p.max > 1 ? `${p.desc} (${n}× gestapelt)` : p.desc;
      list.appendChild(row);
    }
    wrap.appendChild(list);
    const note = document.createElement('p');
    note.className = 'perks-note';
    note.textContent = `Nach jedem geschafften Tag wählst du einen neuen. Sie gelten bis zum Saisonende und ändern nie die Gewinnchancen. (${PERKS.length} verschiedene)`;
    wrap.appendChild(note);
    return wrap;
  }
}
