// "So geht's" for the games that had no rules card of their own (Mondflug, Funkenfall,
// Roulette): a brass button and the same card the card tables use. The card is built fresh on
// every open, so it always carries the current payout line (with an odds item, too). This is
// where those games say how much the house keeps; the table itself doesn't.

import type { Container } from 'pixi.js';
import { button, type Button } from '../core/ui';
import { RulesCard, infoButton } from './cards/tableKit';

export class RulesKnob {
  /** Round "?" (`pill: false`) or a small "So geht's" button. */
  readonly button: Button;
  private card: RulesCard | null = null;
  private w = 0;
  private h = 0;

  /** `host` is in screen coordinates (the game's own view); `lines` are read on every open. */
  constructor(
    private host: Container,
    private lines: () => string[],
    pill: { width: number; height: number; fontSize: number } | false = false,
  ) {
    const open = () => this.toggle();
    this.button = pill
      ? button({ label: 'So geht’s', ariaLabel: 'So geht’s: Regeln anzeigen', width: pill.width, height: pill.height, fontSize: pill.fontSize, color: 0x4a2a3a, textColor: 0xfff6e6, display: false, onClick: open })
      : infoButton(open);
  }

  /** The game's screen size, to centre the card. */
  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.card?.layout(w, h);
  }

  get open() {
    return !!this.card?.open;
  }

  toggle() {
    if (this.card?.open) return this.card.hide();
    this.card?.view.destroy({ children: true });
    this.card = new RulesCard('SO GEHT’S', this.lines());
    this.host.addChild(this.card.view);
    this.card.layout(this.w, this.h);
    this.card.show();
  }

  destroy() {
    this.card?.view.destroy({ children: true });
    this.card = null;
  }
}
