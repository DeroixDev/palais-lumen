// On phones a game's quip would sit on the table, so it goes into a slim paper strip over the
// HUD's day bar instead (the same spot as the toasts, which win when both want it).

import { reducedMotion } from '../core/fx';

/** The HUD has two rows (phones), or one squeezed row (landscape phones). */
export const stripLayout = () => matchMedia('(max-width: 1100px)').matches;

export class QuipStrip {
  private el: HTMLElement;
  private text: HTMLElement;
  private tag: HTMLElement;
  private timer = 0;
  private hideTimer = 0;

  constructor() {
    const el = document.createElement('div');
    el.id = 'quip-strip';
    el.className = 'off';
    el.hidden = true;
    el.setAttribute('role', 'status');
    el.innerHTML = '<span class="qs-tag"></span><span class="qs-t"></span>';
    this.tag = el.querySelector('.qs-tag')!;
    this.text = el.querySelector('.qs-t')!;
    el.addEventListener('pointerdown', () => this.hide());
    // After #toasts, so a toast on screen can push the strip out of sight with CSS alone.
    document.body.appendChild(el);
    this.el = el;
  }

  get showing() {
    return !this.el.hidden && !this.el.classList.contains('off');
  }

  say(speaker: string, line: string) {
    clearTimeout(this.timer);
    clearTimeout(this.hideTimer);
    this.tag.textContent = speaker.toUpperCase();
    this.text.textContent = line;
    this.el.hidden = false;
    void this.el.offsetWidth;
    this.el.classList.remove('off');
    this.timer = window.setTimeout(() => this.hide(), Math.min(6000, 3000 + line.length * 40));
  }

  hide() {
    if (this.el.hidden) return;
    clearTimeout(this.timer);
    this.el.classList.add('off');
    clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => (this.el.hidden = true), reducedMotion() ? 0 : 220);
  }

  clear() {
    clearTimeout(this.timer);
    clearTimeout(this.hideTimer);
    this.el.classList.add('off');
    this.el.hidden = true;
  }
}
