// The player's avatar, seen from above.

import { Container, Graphics } from 'pixi.js';

export class Player {
  readonly view = new Container();
  private body = new Container();
  private feet = new Graphics();
  private walk = 0;
  private facing = Math.PI / 2;

  constructor(color: number, look: { skin?: number; hair?: number; jacket?: number } = {}) {
    const shadow = new Graphics().ellipse(0, 10, 18, 9).fill({ color: 0x000000, alpha: 0.4 });
    this.feet.circle(-7, 0, 5).fill(0x1b1b22);
    this.feet.circle(7, 0, 5).fill(0x1b1b22);
    const g = new Graphics();
    // Shoulders / jacket.
    g.ellipse(0, 0, 17, 13).fill(look.jacket ?? 0x2a1630).stroke({ color, width: 3 });
    g.poly([-4, -12, 4, -12, 0, 2]).fill(0xfff6e6); // shirt
    g.poly([-2, -8, 2, -8, 0, -2]).fill(color); // bow tie
    // Head.
    g.circle(0, -2, 9).fill(look.skin ?? 0xe8b48a);
    g.ellipse(0, -5, 9, 6).fill(look.hair ?? 0x2a1a10); // hair
    this.body.addChild(g);
    this.view.addChild(shadow, this.feet, this.body);
    this.view.scale.set(1.45);
  }

  /** dir is the walking angle in radians, or null when standing still. */
  update(dtMs: number, dir: number | null) {
    if (dir !== null) {
      this.walk += dtMs / 1000;
      this.facing = dir;
    } else {
      this.walk = 0;
    }
    const swing = Math.sin(this.walk * 16);
    // Feet step along the walking direction.
    const fx = Math.cos(this.facing) * swing * 6;
    const fy = Math.sin(this.facing) * swing * 6;
    this.feet.clear();
    const px = -Math.sin(this.facing) * 7;
    const py = Math.cos(this.facing) * 7;
    this.feet.circle(px + fx, py + fy + 6, 5).fill(0x1b1b22);
    this.feet.circle(-px - fx, -py - fy + 6, 5).fill(0x1b1b22);
    this.body.y = dir !== null ? -Math.abs(swing) * 2.5 : 0;
    this.body.rotation = dir !== null ? Math.cos(this.facing) * 0.08 * swing : 0;
  }
}
