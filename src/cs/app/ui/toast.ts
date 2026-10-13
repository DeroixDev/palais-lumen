// Small notices top-right (bottom on phones).
import { el, esc } from '../lib/util';

let box: HTMLElement | null = null;
export function toast(title: string, body = '', kind: 'info' | 'good' | 'bad' | 'gold' | 'level' = 'info', icon = '') {
  if (!box) { box = el('<div class="toasts" role="status" aria-live="polite"></div>'); document.body.appendChild(box); }
  const t = el(`<div class="toast ${kind}">${icon ? `<span class="ti">${icon}</span>` : ''}<div><b>${esc(title)}</b>${body ? `<span>${esc(body)}</span>` : ''}</div></div>`);
  box.appendChild(t);
  // Keep the pile short (two on phones).
  const max = innerWidth < 600 ? 2 : 4;
  const live = [...box.children].filter((x) => !x.classList.contains('out'));
  live.slice(0, Math.max(0, live.length - max)).forEach((x) => { x.classList.add('out'); setTimeout(() => x.remove(), 400); });
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); t.classList.add('out'); setTimeout(() => t.remove(), 400); }, kind === 'level' ? 4200 : 3000);
}
