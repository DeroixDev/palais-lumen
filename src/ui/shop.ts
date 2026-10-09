// The souvenir shop in the foyer. Everything costs Mondsteine, which are only earned by
// playing; nothing here can be bought with money. Charms never touch the odds.

import { Container, Graphics, Sprite } from 'pixi.js';
import { COLORS, mothTexture, glowTexture } from '../core/fx';
import { tween, ease } from '../core/tween';
import { button } from '../core/ui';
import { sfx } from '../core/audio';
import { CHARMS, COMPANION_COLOR, WARDROBE, type Charm, type WardrobeOption } from '../core/items';
import type { GameState } from '../core/state';
import type { Particles } from '../core/fx';
import { Player } from '../world/player';
import { Panel } from './panel';
import { drawStone } from './stone';

const TABS: { label: string; items: () => (WardrobeOption | Charm)[] }[] = [
  { label: 'Farben', items: () => WARDROBE.filter((o) => o.slot === 'jacket' && o.price > 0) },
  { label: 'Haare', items: () => WARDROBE.filter((o) => (o.slot === 'hair' || o.slot === 'hairStyle') && o.price > 0) },
  { label: 'Hüte', items: () => WARDROBE.filter((o) => o.slot === 'hat' && o.price > 0) },
  { label: 'Begleiter', items: () => WARDROBE.filter((o) => o.slot === 'companion' && o.price > 0) },
  { label: 'Glücksbringer', items: () => CHARMS },
];

const CHARM_SIGN: Record<Charm['id'], string> = { startgeld: '+150', zinsen: '%', rabatt: '−10%', zweiteChance: '♥', bossbann: '♛' };

const isCharm = (x: WardrobeOption | Charm): x is Charm => !('slot' in x);

export class ShopPanel extends Panel {
  private tab = 0;

  constructor(
    private state: GameState,
    private particles: Particles,
    private toast: (t: string) => void,
    private onClose: () => void,
  ) {
    super();
  }

  protected build() {
    const n = this.narrow;
    const cols = n ? 2 : 3;
    const cw = n ? 250 : 280;
    const ch = 214;
    const gap = 18;
    this.W = cols * cw + (cols + 1) * gap + (n ? 20 : 40);
    const tabRows = n ? 2 : 1;
    const top = 150 + tabRows * 52;
    const items = TABS[this.tab].items();
    const rows = Math.ceil(items.length / cols) || 1;
    this.H = top + Math.max(rows, n ? 3 : 2) * (ch + gap) + (n ? 185 : 150);
    this.frame('ANDENKENLADEN', COLORS.cyan, this.onClose);
    const st = this.stones(this.state.data.moonstones, this.W / 2 - 90, 98);
    st.x = this.W / 2 - st.width / 2 + 16;
    this.tabs(TABS.map((t) => t.label), this.tab, 150, (i) => {
      this.tab = i;
      this.rebuild();
    }, n ? 3 : 5, n ? 160 : 158);

    const x0 = (this.W - (cols * cw + (cols - 1) * gap)) / 2;
    items.forEach((it, i) => {
      const card = this.card(it, cw, ch);
      card.position.set(x0 + (i % cols) * (cw + gap), top + Math.floor(i / cols) * (ch + gap));
      this.panel.addChild(card);
    });

    const note = this.text(
      this.tab === 4
        ? 'Glücksbringer gelten bis zum Ende der Saison. Sie ändern nie die Gewinnchancen der Spiele.'
        : 'Gekaufte Sachen ziehst du in der Umkleide an.',
      17,
      0xb69a6a,
      false,
      this.W - 80,
    );
    note.anchor.set(0.5, 0);
    note.position.set(this.W / 2, this.H - (n ? 175 : 140));
    this.panel.addChild(note);
    const note2 = this.text('Mondsteine gibt es nur fürs Spielen: Tagesmedaillen, Erfolge, die Mottenkönigin. Man kann sie nicht mit Geld kaufen.', 15, 0x8a7a6a, false, this.W - 80);
    note2.anchor.set(0.5, 0);
    note2.position.set(this.W / 2, this.H - (n ? 140 : 104));
    this.panel.addChild(note2);
    const close = button({ label: 'FERTIG', width: 220, height: 54, color: COLORS.brass, fontSize: 22, onClick: this.onClose });
    close.position.set(this.W / 2, this.H - 46);
    this.panel.addChild(close);
  }

  private card(it: WardrobeOption | Charm, w: number, h: number) {
    const c = new Container();
    const charm = isCharm(it);
    const owned = charm ? this.state.hasCharm(it.id) : this.state.isOwned(it.id);
    const afford = this.state.data.moonstones >= it.price;
    const g = new Graphics();
    g.roundRect(0, 0, w, h, 18).fill(owned ? 0x1d2a20 : 0x2a1630).stroke({ color: owned ? 0x7bd47b : COLORS.brassDark, width: 2 });
    g.roundRect(10, 10, w - 20, 92, 12).fill({ color: 0x000000, alpha: 0.35 });
    c.addChild(g);
    // Preview.
    const pv = new Container();
    pv.position.set(w / 2, 56);
    c.addChild(pv);
    const halo = new Sprite(glowTexture());
    halo.anchor.set(0.5);
    halo.width = halo.height = 150;
    halo.alpha = 0.25;
    halo.blendMode = 'add';
    pv.addChild(halo);
    if (charm) {
      halo.tint = COLORS.lamp;
      const m = new Graphics().circle(0, 0, 32).fill(COLORS.brass).stroke({ color: COLORS.brassDark, width: 3 });
      m.circle(0, 0, 25).stroke({ color: 0xfff1c4, width: 1.5, alpha: 0.6 });
      pv.addChild(m);
      const t = this.text(CHARM_SIGN[it.id], it.id === 'rabatt' ? 18 : 24, 0x3a2008, true);
      t.anchor.set(0.5);
      pv.addChild(t);
      this.tickers.push((time) => (m.rotation = Math.sin(time * 1.5 + w) * 0.12));
    } else if (it.slot === 'companion') {
      const col = COMPANION_COLOR[it.set.companion as keyof typeof COMPANION_COLOR];
      halo.tint = col;
      halo.alpha = 0.6;
      const m = new Sprite(mothTexture());
      m.anchor.set(0.5);
      m.width = m.height = 54;
      m.tint = col;
      pv.addChild(m);
      const base = m.scale.x;
      this.tickers.push((time) => {
        m.scale.x = base * (0.35 + 0.65 * Math.abs(Math.cos(time * 9)));
        m.y = Math.sin(time * 2) * 6;
      });
    } else {
      halo.tint = it.swatch ?? COLORS.lamp;
      const p = new Player(0xffcf7a, { ...this.state.look, ...it.set, skin: this.state.data.players.host?.skin });
      p.view.scale.set(1.9);
      pv.addChild(p.view);
      this.tickers.push((time, dt) => {
        p.faceTowards(Math.PI / 2 + Math.sin(time * 0.8 + w) * 0.6);
        p.update(dt, null);
      });
    }
    const name = this.text(it.name, 21, 0xfff6e6, true);
    name.anchor.set(0.5, 0);
    name.position.set(w / 2, 108);
    c.addChild(name);
    if (charm) {
      const d = this.text(it.desc, 14, 0xd9c6a0, false, w - 24);
      d.anchor.set(0.5, 0);
      d.position.set(w / 2, 134);
      c.addChild(d);
    }
    // Price and button.
    const py = h - 30;
    if (owned) {
      const t = this.text(charm ? '✓ AKTIV' : '✓ GEKAUFT', 20, 0x7bd47b, true);
      t.anchor.set(0.5);
      t.position.set(w / 2, py);
      c.addChild(t);
    } else {
      const s = drawStone(10, false);
      s.position.set(28, py);
      c.addChild(s);
      const pt = this.text(String(it.price), 22, afford ? 0xdff6ff : 0x8a7a8a, true);
      pt.anchor.set(0, 0.5);
      pt.position.set(42, py);
      c.addChild(pt);
      const b = button({
        label: 'KAUFEN',
        width: 120,
        height: 40,
        color: afford ? COLORS.brass : 0x4a3a4a,
        fontSize: 17,
        onClick: () => this.buy(it, c),
      });
      b.position.set(w - 76, py);
      if (!afford) b.alpha = 0.55;
      c.addChild(b);
    }
    return c;
  }

  private buy(it: WardrobeOption | Charm, card: Container) {
    const ok = isCharm(it) ? this.state.buyCharm(it.id) : this.state.buyItem(it.id);
    if (!ok) {
      sfx.lose();
      const need = it.price - this.state.data.moonstones;
      this.toast(`Dir fehlen noch ${need} ${need === 1 ? 'Mondstein' : 'Mondsteine'}.`);
      void tween(card, { x: card.x + 8 }, 60).then(() => tween(card, { x: card.x - 8 }, 60));
      return;
    }
    sfx.till();
    const gp = card.toGlobal({ x: card.width / 2, y: 56 });
    this.particles.sparkle(gp.x, gp.y, 30, 0x9fe8ff, 200);
    this.toast(isCharm(it) ? `${it.name} ist aktiv, bis die Saison endet.` : `${it.name} gekauft. Zieh es in der Umkleide an.`);
    void tween(card.scale, { x: 1.04, y: 1.04 }, 120, ease.outCubic).then(() => this.rebuild());
  }
}
