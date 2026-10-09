// The day card: a brass-and-velvet plaque that announces the evening when you first reach a
// floor that day. Painted once (see plaqueTexture), it pops in like a panel (280 ms,
// ease-out-back), holds, and fades out; with reduced motion it only fades.

import { Container, Sprite } from 'pixi.js';
import { announce, glowTexture, plaqueTexture, reducedMotion } from '../core/fx';
import { ease, tween, wait } from '../core/tween';
import { leavePhoto } from './photo';

/** Builds the card, centred in the upper third of the screen below the HUD, and runs its animation. */
export function dayCard(title: string, sub: string, screenW: number, screenH: number, top = 64, extra: Container | null = null, games: Container | null = null) {
  leavePhoto();
  // On narrow screens the goal line breaks in two, so it stays at least 14 px tall.
  const narrow = screenW < 560;
  const { tex, fullW, visW } = plaqueTexture(title, 0xff5fa2, { size: 60, sub: narrow ? sub.replace(' · ', '\n') : sub, subSize: narrow ? 30 : 26 });
  const c = new Container();
  const glow = new Sprite(glowTexture());
  glow.anchor.set(0.5);
  glow.tint = 0xffcf7a;
  glow.blendMode = 'add';
  glow.width = fullW * 1.2;
  glow.height = tex.height * 1.3;
  glow.alpha = 0.35;
  const s = new Sprite(tex);
  s.anchor.set(0.5);
  c.addChild(glow, s);
  // Today's event hangs under the plaque as a velvet ribbon (src/ui/dayBoard.ts).
  if (extra) {
    extra.y = tex.height / 2 - 46;
    c.addChild(extra);
  }
  // Today's games on this floor ("Spielplan", src/ui/schedule.ts) below that.
  if (games) {
    games.y = extra ? extra.y + extra.height + 8 : tex.height / 2 - 40;
    c.addChild(games);
  }
  // Everything has to fit between the HUD and the bottom edge (landscape phones).
  const bottom = Math.max(tex.height / 2, ...[extra, games].map((x) => (x ? x.y + x.height : 0)));
  const fit = Math.min(1, (screenW - 24) / visW, (screenH - top - 16) / (bottom + tex.height / 2));
  c.position.set(screenW / 2, Math.max(top + 8 + (tex.height * fit) / 2, Math.min(screenH * 0.34, screenH - 8 - bottom * fit)));
  c.alpha = 0;
  c.eventMode = 'none';
  announce(`${title.charAt(0)}${title.slice(1).toLowerCase()}. ${sub.replace('\n', ' ')}`);
  const calm = reducedMotion();
  c.scale.set(calm ? fit : fit * 0.92);
  const done = () => {
    tex.destroy(true);
  };
  void Promise.all([tween(c, { alpha: 1 }, 280, ease.outCubic), calm ? Promise.resolve() : tween(c.scale, { x: fit, y: fit }, 280, ease.outBack)])
    .then(() => wait(extra || games ? 3600 + (extra && games ? 1200 : 0) : 2400))
    .then(() => Promise.all([tween(c, { alpha: 0 }, 180, ease.inCubic), calm ? Promise.resolve() : tween(c.scale, { x: fit * 0.97, y: fit * 0.97 }, 180, ease.inCubic)]))
    .then(() => {
      if (!c.destroyed) c.destroy({ children: true });
      done();
    });
  return c;
}
