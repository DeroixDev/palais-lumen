// Small Pixi UI helpers shared by all games.

import { Container, Graphics, Text } from 'pixi.js';
import { COLORS, FONT_BODY, FONT_DISPLAY } from './fx';
import { ease, tween } from './tween';
import { sfx } from './audio';

export interface ButtonOptions {
  label: string;
  width: number;
  height: number;
  color?: number;
  textColor?: number;
  fontSize?: number;
  display?: boolean;
  onClick: () => void;
}

export interface Button extends Container {
  setEnabled(on: boolean): void;
  setLabel(text: string): void;
  /** Crisp gold ring for the chosen option in a group (drawn as vectors, so it stays sharp). */
  setSelected(on: boolean): void;
}

export function button(o: ButtonOptions): Button {
  const c = new Container() as Button;
  const color = o.color ?? COLORS.brass;
  const bg = new Graphics();
  const draw = (hover: boolean) => {
    bg.clear();
    bg.roundRect(-o.width / 2, -o.height / 2 + 4, o.width, o.height, o.height / 2.6).fill({ color: 0x000000, alpha: 0.45 });
    bg.roundRect(-o.width / 2, -o.height / 2, o.width, o.height, o.height / 2.6).fill(color);
    bg.roundRect(-o.width / 2 + 3, -o.height / 2 + 3, o.width - 6, o.height / 2 - 3, o.height / 3).fill({
      color: 0xffffff,
      alpha: hover ? 0.32 : 0.2,
    });
    bg.roundRect(-o.width / 2, -o.height / 2, o.width, o.height, o.height / 2.6).stroke({ color: 0x000000, width: 2, alpha: 0.5 });
  };
  draw(false);
  const txt = new Text({
    text: o.label,
    style: {
      fontFamily: o.display === false ? FONT_BODY : FONT_DISPLAY,
      fontSize: o.fontSize ?? Math.round(o.height * 0.4),
      fontWeight: o.display === false ? '700' : '400',
      fill: o.textColor ?? COLORS.ink,
      letterSpacing: 1,
    },
  });
  txt.anchor.set(0.5);
  c.addChild(bg, txt);
  c.eventMode = 'static';
  c.cursor = 'pointer';
  let enabled = true;
  c.on('pointerover', () => enabled && draw(true));
  c.on('pointerout', () => draw(false));
  c.on('pointerdown', () => {
    if (!enabled) return;
    c.scale.set(0.94);
  });
  c.on('pointerup', () => {
    if (!enabled) return;
    void tween(c.scale, { x: 1, y: 1 }, 220, ease.outBack);
  });
  c.on('pointerupoutside', () => c.scale.set(1));
  c.on('pointertap', () => {
    if (!enabled) return;
    sfx.click();
    o.onClick();
  });
  c.setEnabled = (on: boolean) => {
    enabled = on;
    c.alpha = on ? 1 : 0.45;
    c.cursor = on ? 'pointer' : 'default';
  };
  c.setLabel = (t: string) => {
    txt.text = t;
  };
  const ring = new Graphics();
  const rw = o.width + 10;
  const rh = o.height + 10;
  ring.roundRect(-rw / 2 - 3, -rh / 2 - 3, rw + 6, rh + 6, rh / 2.6 + 3).stroke({ color: COLORS.lamp, width: 6, alpha: 0.22 });
  ring.roundRect(-rw / 2, -rh / 2, rw, rh, rh / 2.6).stroke({ color: COLORS.lamp, width: 2.5 });
  ring.visible = false;
  c.addChildAt(ring, 0);
  c.setSelected = (on: boolean) => {
    ring.visible = on;
  };
  return c;
}

export function label(text: string, size: number, color = COLORS.white, display = false) {
  const t = new Text({
    text,
    style: {
      fontFamily: display ? FONT_DISPLAY : FONT_BODY,
      fontSize: size,
      fontWeight: display ? '400' : '600',
      fill: color,
      letterSpacing: display ? 1 : 0.5,
    },
  });
  return t;
}
