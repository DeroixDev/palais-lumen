// The house controls behind the code pad (seven taps on the logo, or Ctrl+Shift+M).
// Nothing here shows anywhere else.

import { checkCode, unlockDev } from '../lib/panel';
import { sfx } from '../lib/sound';
import { openModal } from './modal';
import { openModMenu } from './modmenu';

export function openPanelPad() {
  const pad = document.createElement('div');
  pad.className = 'pinpad';
  pad.innerHTML = `<div class="pp-dots" aria-hidden="true"></div><div class="pp-keys">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].map((k) => `<button type="button" class="pp-k ${k}" data-k="${k}">${k === 'del' ? '⌫' : k === 'ok' ? '✓' : k}</button>`).join('')}</div>`;
  const m = openModal(pad, { cls: 'pin-modal', label: 'Code' });
  let code = '';
  const dots = pad.querySelector('.pp-dots') as HTMLElement;
  const draw = () => { dots.innerHTML = Array.from({ length: Math.max(4, code.length) }, (_, i) => `<i class="${i < code.length ? 'on' : ''}"></i>`).join(''); };
  const press = (k: string) => {
    if (k === 'del') code = code.slice(0, -1);
    else if (k === 'ok') {
      if (checkCode(code)) { unlockDev(); sfx.click(); m.close(); setTimeout(openModMenu, 240); return; }
      code = '';
      pad.classList.remove('shake'); void pad.offsetWidth; pad.classList.add('shake');
      sfx.error();
    } else if (code.length < 8) {
      code += k;
      // The right code opens at once, no need to press ✓.
      if (checkCode(code)) { unlockDev(); sfx.click(); m.close(); setTimeout(openModMenu, 240); return; }
    }
    sfx.tick();
    draw();
  };
  pad.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('.pp-k') as HTMLElement | null; if (b) press(b.dataset.k!); });
  pad.tabIndex = 0;
  pad.addEventListener('keydown', (e) => {
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('del');
    else if (e.key === 'Enter') press('ok');
  });
  setTimeout(() => pad.focus(), 50);
  draw();
}

let padOpen = false;
addEventListener('keydown', (e) => {
  if (!(e.ctrlKey && e.shiftKey && (e.key === 'M' || e.key === 'm' || e.code === 'KeyM'))) return;
  e.preventDefault();
  if (padOpen || document.querySelector('.mm-modal, .pin-modal')) return;
  padOpen = true;
  setTimeout(() => (padOpen = false), 400);
  openPanelPad();
});
