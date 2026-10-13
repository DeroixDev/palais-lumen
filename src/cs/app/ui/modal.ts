// Modal layers. Esc / backdrop close the top one, focus returns to the opener.
import { el } from '../lib/util';

export interface ModalHandle { root: HTMLElement; body: HTMLElement; close(): void }
const stack: ModalHandle[] = [];

addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !stack.length) return;
  const top = stack[stack.length - 1];
  if (top.root.dataset.dismiss !== '0') top.close();
});

/** Opens a modal. With `stack` it opens above the current one, otherwise it replaces it. */
export function openModal(content: HTMLElement | string, opts: { cls?: string; onClose?: () => void; dismissable?: boolean; label?: string; stack?: boolean } = {}): ModalHandle {
  if (!opts.stack) while (stack.length) stack[stack.length - 1].close();
  const back = document.activeElement as HTMLElement | null;
  const root = el(`<div class="modal-wrap ${opts.cls ?? ''}" role="dialog" aria-modal="true"><div class="modal-back"></div><div class="modal" tabindex="-1"><button class="modal-x" type="button" aria-label="Schließen">✕</button><div class="modal-body"></div></div></div>`);
  root.setAttribute('aria-label', opts.label ?? 'Fenster');
  const body = root.querySelector('.modal-body') as HTMLElement;
  if (typeof content === 'string') body.innerHTML = content; else body.appendChild(content);
  const dismiss = opts.dismissable !== false;
  root.dataset.dismiss = dismiss ? '1' : '0';
  let closed = false;
  const h: ModalHandle = {
    root, body,
    close() {
      if (closed) return;
      closed = true;
      const i = stack.indexOf(h);
      if (i >= 0) stack.splice(i, 1);
      root.classList.remove('in');
      root.classList.add('out');
      setTimeout(() => root.remove(), 220);
      opts.onClose?.();
      if (back?.isConnected) back.focus?.({ preventScroll: true });
    },
  };
  root.querySelector('.modal-back')!.addEventListener('click', () => dismiss && h.close());
  const x = root.querySelector('.modal-x') as HTMLElement;
  if (!dismiss) x.hidden = true;
  x.addEventListener('click', () => h.close());
  document.body.appendChild(root);
  stack.push(h);
  requestAnimationFrame(() => { root.classList.add('in'); (root.querySelector('.modal') as HTMLElement).focus({ preventScroll: true }); });
  return h;
}
export const closeAllModals = () => { while (stack.length) stack[stack.length - 1].close(); };
export const modalOpen = () => stack.length > 0;
