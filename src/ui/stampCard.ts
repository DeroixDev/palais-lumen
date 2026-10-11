// The regulars' stamp card: a cream paper card per floor with eight circles; each stamp is
// a red ink moth pressed in at a slight angle. The panel shows all five floors (from the
// reception in the foyer); a small single card pops in at the top right when a stamp lands.

import { Container, Sprite, Text, type Texture } from 'pixi.js';
import { drawEmblem, reducedMotion } from '../core/fx';
import { animate, ease, wait } from '../core/tween';
import { sfx } from '../core/audio';
import { getRoom } from '../core/registry';
import type { GameState } from '../core/state';
import { REFILL_STONES, ROUNDS_PER_STAMP, STAMPS_PER_CARD, STAMP_FLOORS, STAMP_REWARDS, hasReward, stampsOnCard, type StampNews } from '../core/stamps';
import { fillInk, paint, rrect, seeded } from '../world/painted/brush';
import { brass } from '../core/ui';
import { Panel } from './panel';
import { CREAM, MUTED, bodyText } from './kit';

const INK_RED = '#b8243a';
const FLOOR_ACCENT: Record<string, number> = { f1: 0x7a1d34, f2: 0x1f5a44, f3: 0x6a4a1c, f4: 0x26407a, f5: 0x4a2a6a };

const cache = new Map<string, Texture>();
const cached = (k: string, make: () => Texture) => cache.get(k) ?? (cache.set(k, make()), cache.get(k)!);

/** Plain paper card with a coloured header band; text and circles go on top as sprites. */
export function paperTexture(w: number, h: number, accent: number) {
  return cached(`paper-${w}x${h}-${accent}`, () =>
    paint(w + 10, h + 12, (c) => {
      c.translate(4, 3);
      rrect(c, 2, 5, w - 2, h, 8);
      c.fillStyle = 'rgba(6,2,8,0.45)';
      c.fill();
      rrect(c, 0, 0, w, h, 8);
      const g = c.createLinearGradient(0, 0, w * 0.3, h);
      g.addColorStop(0, '#fbf3df');
      g.addColorStop(1, '#e6d3a8');
      fillInk(c, g, 1.8);
      c.save();
      rrect(c, 0, 0, w, h, 8);
      c.clip();
      // Header band in the floor's colour with a gold rule.
      const r = (accent >> 16) & 255;
      const gg = (accent >> 8) & 255;
      const b = accent & 255;
      c.fillStyle = `rgb(${r},${gg},${b})`;
      c.fillRect(0, 0, w, 30);
      c.fillStyle = '#e0b25a';
      c.fillRect(0, 30, w, 2);
      // Paper fibres and a soft age stain.
      const rnd = seeded(w * 7 + h);
      for (let i = 0; i < 90; i++) {
        c.fillStyle = `rgba(120,90,50,${0.03 + rnd() * 0.04})`;
        c.fillRect(rnd() * w, 34 + rnd() * (h - 34), 1 + rnd() * 6, 0.8);
      }
      const st = c.createRadialGradient(w * 0.85, h * 0.8, 0, w * 0.85, h * 0.8, w * 0.4);
      st.addColorStop(0, 'rgba(160,110,50,0.12)');
      st.addColorStop(1, 'rgba(160,110,50,0)');
      c.fillStyle = st;
      c.fillRect(0, 0, w, h);
      c.restore();
      // Punched hole like a real loyalty card.
      c.beginPath();
      c.arc(w - 14, 15, 4.5, 0, Math.PI * 2);
      c.fillStyle = 'rgba(30,14,20,0.55)';
      c.fill();
    }, 2),
  );
}

/** Empty printed circle for a stamp. */
function slotTexture(r: number) {
  return cached(`slot-${r}`, () =>
    paint(r * 2 + 6, r * 2 + 6, (c) => {
      const o = r + 3;
      c.beginPath();
      c.arc(o, o, r, 0, Math.PI * 2);
      c.setLineDash([3, 2.5]);
      c.strokeStyle = 'rgba(122,29,52,0.55)';
      c.lineWidth = 1.4;
      c.stroke();
      c.setLineDash([]);
      drawEmblem(c, o, o, r * 1.1, 'rgba(122,29,52,0.12)', 'rgba(122,29,52,0.15)');
    }, 3),
  );
}

/** A red ink stamp: ring, moth, uneven ink. `seed` varies the ink. */
export function stampTexture(r: number, seed: number) {
  return cached(`stamp-${r}-${seed % 6}`, () =>
    paint(r * 2 + 8, r * 2 + 8, (c) => {
      const o = r + 4;
      const rnd = seeded(seed % 6 + 3);
      c.beginPath();
      c.arc(o, o, r, 0, Math.PI * 2);
      c.strokeStyle = INK_RED;
      c.lineWidth = 2.6;
      c.stroke();
      c.beginPath();
      c.arc(o, o, r - 4, 0, Math.PI * 2);
      c.lineWidth = 1;
      c.stroke();
      drawEmblem(c, o, o + 1, r * 1.35, INK_RED, INK_RED);
      // Missing ink: knock out a few specks.
      c.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 26; i++) {
        c.beginPath();
        c.arc(o + (rnd() - 0.5) * r * 2, o + (rnd() - 0.5) * r * 2, 0.5 + rnd() * 1.6, 0, Math.PI * 2);
        c.fillStyle = `rgba(0,0,0,${0.4 + rnd() * 0.6})`;
        c.fill();
      }
      c.globalCompositeOperation = 'source-over';
    }, 3),
  );
}

/** Gold ribbon seal for a card whose reward is unlocked. */
function sealTexture() {
  return cached('seal', () =>
    paint(48, 56, (c) => {
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(24 + s * 4, 30);
        c.lineTo(24 + s * 14, 54);
        c.lineTo(24 + s * 8, 50);
        c.lineTo(24 + s * 2, 54);
        c.closePath();
        c.fillStyle = '#7a1d34';
        c.fill();
      }
      c.beginPath();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const rr = i % 2 ? 17 : 20;
        c.lineTo(24 + Math.cos(a) * rr, 22 + Math.sin(a) * rr);
      }
      c.closePath();
      fillInk(c, brass(c, 4, 2, 44, 42, 0.1), 1.6);
      c.font = '700 20px "Barlow Condensed", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#5a3208';
      c.fillText('✓', 24, 23);
    }, 3),
  );
}

/**
 * One floor's card as a container (w×h, origin top left). The circles are children named
 * 'slot0'…'slot7' so a fresh stamp can be animated onto one of them.
 */
export function floorCard(state: GameState, floor: string, w: number, h: number, upTo = Infinity, rewardShown?: boolean) {
  const d = state.data;
  const c = new Container();
  c.addChild(new Sprite(paperTexture(w, h, FLOOR_ACCENT[floor] ?? 0x7a1d34))).position.set(-4, -3);
  const room = getRoom(floor);
  const n = Number(floor.slice(1));
  const title = new Text({ text: `ETAGE ${n} · ${room.name.toUpperCase()}`, style: { fontFamily: '"Barlow Condensed", sans-serif', fontSize: 16, fontWeight: '700', fill: 0xfff1c4, letterSpacing: 1.5 } });
  title.position.set(12, 6);
  c.addChild(title);
  const onCard = Math.min(stampsOnCard(d, floor), upTo);
  const count = new Text({ text: `${onCard} / ${STAMPS_PER_CARD}`, style: { fontFamily: '"Barlow Condensed", sans-serif', fontSize: 15, fontWeight: '700', fill: 0xfff1c4 } });
  count.anchor.set(1, 0);
  count.label = 'count';
  count.position.set(w - 26, 7);
  c.addChild(count);
  // Circles in one row.
  const r = Math.min(16, (w - 40) / STAMPS_PER_CARD / 2 - 3);
  const step = (w - 24) / STAMPS_PER_CARD;
  for (let i = 0; i < STAMPS_PER_CARD; i++) {
    const x = 12 + step * (i + 0.5);
    const y = 34 + r + 10;
    const slot = new Sprite(slotTexture(Math.round(r)));
    slot.anchor.set(0.5);
    slot.position.set(x, y);
    slot.label = `slot${i}`;
    c.addChild(slot);
    if (i < onCard) {
      const s = new Sprite(stampTexture(Math.round(r), i + n * 3));
      s.anchor.set(0.5);
      s.position.set(x, y);
      s.rotation = ((i * 37 + n * 11) % 9 - 4) * 0.06;
      s.alpha = 0.92;
      c.addChild(s);
    }
  }
  const rw = STAMP_REWARDS[floor];
  const got = rewardShown ?? hasReward(d, floor);
  const line = got ? `Freigeschaltet: ${rw.name}. Jede weitere volle Karte: +${REFILL_STONES} Mondsteine.` : `Volle Karte: ${rw.text}`;
  const t = new Text({
    text: line,
    style: { fontFamily: '"Barlow Condensed", sans-serif', fontSize: 15, fontWeight: '600', fill: got ? 0x2f5a2a : 0x4a2a1a, wordWrap: true, wordWrapWidth: w - (got ? 70 : 24), lineHeight: 17 },
  });
  t.position.set(12, 34 + r * 2 + 18);
  c.addChild(t);
  if (got) {
    const seal = new Sprite(sealTexture());
    seal.anchor.set(0.5);
    seal.position.set(w - 30, h - 26);
    seal.scale.set(0.8);
    c.addChild(seal);
  }
  return c;
}

// ---- Panel ----------------------------------------------------------------------------------------

export class StampCardPanel extends Panel {
  constructor(
    private state: GameState,
    private onClose: () => void,
  ) {
    super();
  }

  protected build() {
    const n = this.narrow;
    const cw = n ? 372 : 420;
    const ch = 128;
    const gap = n ? 10 : 16;
    const cols = n ? 1 : 2;
    const rows = Math.ceil(STAMP_FLOORS.length / cols);
    const top = n ? 84 : 92;
    this.W = cols * cw + (cols - 1) * gap + (n ? 32 : 72);
    this.H = top + rows * (ch + gap) + (n ? 96 : 84);
    this.frame('STAMMKUNDEN-KARTE', 0xb8243a, this.onClose);
    const intro = this.text('Eine Karte je Etage. Acht Stempel füllen sie.', n ? 16 : 18, MUTED);
    intro.anchor.set(0.5, 0);
    intro.position.set(this.W / 2, n ? 46 : 52);
    this.panel.addChild(intro);
    const x0 = (this.W - (cols * cw + (cols - 1) * gap)) / 2;
    const cards: Container[] = [];
    STAMP_FLOORS.forEach((f, i) => {
      const card = floorCard(this.state, f, cw, ch);
      const col = i % cols;
      const row = Math.floor(i / cols);
      // An odd last card sits in the middle.
      const lone = cols > 1 && i === STAMP_FLOORS.length - 1 && STAMP_FLOORS.length % cols === 1;
      card.pivot.set(cw / 2, ch / 2);
      card.position.set((lone ? this.W / 2 - cw / 2 : x0 + col * (cw + gap)) + cw / 2, top + row * (ch + gap) + ch / 2);
      card.rotation = ((i * 5) % 3 - 1) * 0.006;
      this.panel.addChild(card);
      cards.push(card);
    });
    this.popIn(cards);
    const note = bodyText(
      `1 Stempel für ${ROUNDS_PER_STAMP} Runden auf der Etage, 1 für jeden geschafften Tag dort, dazu Stempel aus Gäste-Aufträgen. Die erste volle Karte schaltet das Etagen-Upgrade frei, jede weitere bringt ${REFILL_STONES} Mondsteine.`,
      n ? 15 : 16,
      CREAM,
      { wrap: this.W - 70 },
    );
    note.anchor.set(0.5, 0);
    note.position.set(this.W / 2, top + rows * (ch + gap) + 4);
    note.alpha = 0.85;
    this.panel.addChild(note);
  }
}

// ---- Popup when a stamp lands ---------------------------------------------------------------------

/**
 * A single floor card that drops in at the top right, the new stamp is pressed onto it
 * (scale down with a thud of ink), then it leaves. Several stamps queue up.
 */
export class StampPopup {
  readonly view = new Container();
  private queue: StampNews[] = [];
  private busy = false;
  private x = 0;
  private y = 0;
  private scale = 1;

  constructor(private state: GameState) {
    this.view.eventMode = 'none';
  }

  layout(w: number, top: number) {
    this.scale = Math.min(1, (w - 24) / 330);
    this.x = w - 12 - 320 * this.scale;
    this.y = top + 10;
  }

  push(n: StampNews) {
    this.queue.push(n);
  }

  /** Runs the next popup when allowed (only in the room or a game). */
  tick(allowed: boolean) {
    if (!allowed || this.busy || !this.queue.length) return;
    void this.show(this.queue.shift()!);
  }

  get pending() {
    return this.queue.length > 0 || this.busy;
  }

  private async show(n: StampNews) {
    this.busy = true;
    const W = 320;
    const H = 128;
    const card = floorCard(this.state, n.floor, W, H, n.onCard - 1, n.had);
    const c = new Container();
    c.addChild(card);
    const why = bodyText(n.unlocked ? 'Karte voll! Upgrade freigeschaltet.' : n.stones ? `Karte voll! +${n.stones} Mondsteine.` : `Stempel: ${n.reason}`, 16, CREAM, { bold: true });
    why.style.stroke = { color: 0x14080f, width: 4, join: 'round' };
    why.position.set(6, H + 6);
    c.addChild(why);
    c.scale.set(this.scale);
    c.position.set(this.x, this.y - 30);
    c.alpha = 0;
    this.view.addChild(c);
    const calm = reducedMotion();
    await animate(260, (k) => {
      c.alpha = k;
      c.y = this.y - 30 * (1 - k);
    }, ease.outCubic);
    // Press the stamp.
    const slot = card.children.find((ch) => ch.label === `slot${n.onCard - 1}`);
    if (slot) {
      const r = Math.round((slot as Sprite).width / 2 - 3);
      const s = new Sprite(stampTexture(r, n.onCard + Number(n.floor.slice(1)) * 3));
      s.anchor.set(0.5);
      s.position.copyFrom(slot.position);
      s.rotation = ((n.onCard * 37) % 9 - 4) * 0.06;
      card.addChild(s);
      if (calm) {
        s.alpha = 0;
        await animate(200, (k) => (s.alpha = k * 0.92));
      } else {
        await animate(220, (k) => {
          s.scale.set(2.2 - 1.2 * k);
          s.alpha = Math.min(0.92, k * 1.4);
        }, ease.inCubic);
        sfx.thud();
        await animate(160, (k) => s.scale.set(1 + Math.sin(k * Math.PI) * 0.06));
      }
      const count = card.children.find((ch) => ch.label === 'count') as Text | undefined;
      if (count) count.text = `${n.onCard} / ${STAMPS_PER_CARD}`;
      if (n.full) sfx.medal();
    }
    await wait(n.full ? 2600 : 1700);
    await animate(220, (k) => {
      c.alpha = 1 - k;
      c.y = this.y - 20 * k;
    }, ease.inCubic);
    c.destroy({ children: true });
    this.busy = false;
  }
}
