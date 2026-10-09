// Control bar for Straßenwürfel, Großes Rad and Drei Laternen (inside the SceneShell bar):
// a stake stepper, one secondary button, the main button and the payout line, laid out for
// phone portrait ('tall'), desktop ('wide') and short landscape screens ('side', a column).

import type { Container, Text } from 'pixi.js';
import type { Button } from '../core/ui';
import { betStepper, caption, type Layout } from './sceneShell';

export interface BarParts {
  stepCaption: string;
  onStep(d: number): void;
  secCaption: string;
  /** Makes the secondary button for a width. */
  secondary(width: number): Button;
  /** Makes the main button for a size. */
  main(width: number, height: number, fontSize: number): Button;
  rtp: Text;
}

export interface Bar {
  minus: Button;
  plus: Button;
  text: Text;
  secondary: Button;
  main: Button;
}

export function barSize(layout: Layout) {
  return layout === 'tall' ? 164 : layout === 'side' ? 236 : 104;
}

export function layoutBar(c: Container, width: number, height: number, layout: Layout, fs: (px: number) => number, p: BarParts): Bar {
  const st = betStepper(fs, p.onStep, layout === 'wide' ? 52 : 50);
  const stepCap = caption(p.stepCaption, fs(14));
  const secCap = caption(p.secCaption, fs(14));
  const rtp = p.rtp;
  let secondary: Button;
  let main: Button;
  if (layout === 'tall') {
    const row = 46;
    stepCap.position.set(16, 6);
    st.minus.position.set(16 + 25, row);
    st.text.position.set(16 + 50 + 44, row);
    st.plus.position.set(16 + 50 + 88 + 25, row);
    const sw = Math.min(170, width - 16 - (16 + 50 + 88 + 50) - 14);
    secondary = p.secondary(sw);
    secondary.position.set(width - 16 - sw / 2, row);
    secCap.position.set(width - 16 - sw, 6);
    main = p.main(width - 32, 58, fs(22));
    main.position.set(width / 2, 106);
    rtp.style.align = 'center';
    rtp.anchor.set(0.5, 1);
    rtp.position.set(width / 2, height - 2);
    if (rtp.width > width - 20) rtp.scale.set((width - 20) / rtp.width);
  } else if (layout === 'side') {
    // A column: captions sit above their controls, spaced by the (screen-lifted) font size.
    const inner = width - 32;
    const capH = stepCap.height;
    stepCap.position.set(16, 8);
    const stepY = 8 + capH + 6 + 25;
    st.minus.position.set(16 + 25, stepY);
    st.text.position.set(width / 2, stepY);
    st.plus.position.set(width - 16 - 25, stepY);
    secCap.position.set(16, stepY + 25 + 12);
    const secY = secCap.y + capH + 6 + 26;
    secondary = p.secondary(inner);
    secondary.position.set(width / 2, secY);
    rtp.style.align = 'center';
    rtp.style.wordWrap = true;
    rtp.style.wordWrapWidth = inner;
    rtp.anchor.set(0.5, 1);
    rtp.position.set(width / 2, height - 8);
    const mh = 64;
    main = p.main(inner, mh, fs(21));
    main.position.set(width / 2, Math.max(secY + 26 + 14 + mh / 2, rtp.y - rtp.height - 10 - mh / 2));
    rtp.visible = main.y + mh / 2 + 4 < rtp.y - rtp.height;
  } else {
    const row = 56;
    stepCap.position.set(24, 10);
    st.minus.position.set(24 + 26, row);
    st.text.position.set(24 + 52 + 50, row);
    st.plus.position.set(24 + 52 + 100 + 26, row);
    const sx = 24 + 52 + 100 + 52 + 24;
    secondary = p.secondary(170);
    secondary.position.set(sx + 85, row);
    secCap.position.set(sx, 10);
    const aw = Math.min(300, width - (sx + 170) - 48);
    main = p.main(aw, 70, fs(24));
    main.position.set(width - 24 - aw / 2, row - 4);
    rtp.style.align = 'left';
    rtp.anchor.set(0, 0.5);
    rtp.position.set(sx + 170 + 20, row);
    const room = width - 24 - aw - 16 - rtp.x;
    if (rtp.width > room) rtp.scale.set(Math.max(0.72, room / rtp.width));
    rtp.visible = rtp.width <= room;
  }
  c.addChild(stepCap, secCap, st.minus, st.plus, st.text, secondary, main, rtp);
  return { minus: st.minus, plus: st.plus, text: st.text, secondary, main };
}
