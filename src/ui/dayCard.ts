// The day card: a brass-and-velvet plaque that announces the evening when you first reach a
// floor that day. Painted once (see plaqueTexture), it pops in like a panel (280 ms,
// ease-out-back), holds, and fades out; with reduced motion it only fades.

import { Container, Sprite } from 'pixi.js';
import { announce, glowTexture, plaqueTexture, reducedMotion } from '../core/fx';
import { ease, tween, wait } from '../core/tween';

/** Builds the card, centred in the upper third of the screen below the HUD, and runs its animation. */
export function dayCard(title: string, sub: string, screenW: number, screenH: number, top = 64) {
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
  const fit = Math.min(1, (screenW - 24) / visW);
  c.position.set(screenW / 2, Math.max(top + (tex.height * fit) / 2, screenH * 0.34));
  c.alpha = 0;
  c.eventMode = 'none';
  announce(`${title.charAt(0)}${title.slice(1).toLowerCase()}. ${sub.replace('\n', ' ')}`);
  const calm = reducedMotion();
  c.scale.set(calm ? fit : fit * 0.92);
  const done = () => {
    tex.destroy(true);
  };
  void Promise.all([tween(c, { alpha: 1 }, 280, ease.outCubic), calm ? Promise.resolve() : tween(c.scale, { x: fit, y: fit }, 280, ease.outBack)])
    .then(() => wait(2400))
    .then(() => Promise.all([tween(c, { alpha: 0 }, 180, ease.inCubic), calm ? Promise.resolve() : tween(c.scale, { x: fit * 0.97, y: fit * 0.97 }, 180, ease.inCubic)]))
    .then(() => {
      if (!c.destroyed) c.destroy({ children: true });
      done();
    });
  return c;
}
