// "Neuigkeiten": the update log, like a store page's dev log. Every published version gets an
// entry in src/data/devlog.json (newest first); the title button shows a dot while there is a
// version the player has not opened yet.

import log from '../data/devlog.json';

interface Entry {
  v: string;
  date: string;
  kind: string;
  title: string;
  intro?: string;
  sections: { h: string; items: string[] }[];
}

const LOG = log as Entry[];
const SEEN_KEY = 'nachtfalter.devlog.seen';

export const latestVersion = () => LOG[0].v;

function seen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

/** True while the newest entry has not been opened on this device. */
export const hasUnread = () => seen() !== LOG[0].v;

function markRead() {
  try {
    localStorage.setItem(SEEN_KEY, LOG[0].v);
  } catch {
    /* private mode: the dot just stays */
  }
  document.querySelectorAll('.news-dot').forEach((d) => d.remove());
}

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${Number(d)}.${Number(m)}.${y}`;
};

const KIND_CLASS: Record<string, string> = { 'Großes Update': 'big', Patch: 'patch', Hotfix: 'fix', 'Erste Version': 'first' };

function entry(e: Entry, open: boolean): HTMLElement {
  const el = document.createElement('details');
  el.className = 'dl-entry';
  el.open = open;
  const sum = document.createElement('summary');
  sum.innerHTML = `<span class="dl-v">v${e.v}</span><span class="dl-head"><span class="dl-meta"><span class="dl-kind ${KIND_CLASS[e.kind] ?? ''}"></span><time datetime="${e.date}">${fmtDate(e.date)}</time></span><strong></strong></span>`;
  sum.querySelector('.dl-kind')!.textContent = e.kind;
  sum.querySelector('strong')!.textContent = e.title;
  el.appendChild(sum);
  const body = document.createElement('div');
  body.className = 'dl-body';
  if (e.intro) {
    const p = document.createElement('p');
    p.className = 'dl-intro';
    p.textContent = e.intro;
    body.appendChild(p);
  }
  for (const s of e.sections) {
    const h = document.createElement('h3');
    h.textContent = s.h;
    const ul = document.createElement('ul');
    for (const it of s.items) {
      const li = document.createElement('li');
      li.textContent = it;
      ul.appendChild(li);
    }
    body.append(h, ul);
  }
  el.appendChild(body);
  return el;
}

interface ModalHost {
  modal(title: string, body: HTMLElement, buttons: { label: string; primary?: boolean; onClick: () => void }[]): void;
  closeModal(): void;
}

/** Opens the update log; the newest update is unfolded, older ones fold open on a tap. */
export function showDevlog(host: ModalHost) {
  injectStyle();
  const wrap = document.createElement('div');
  wrap.className = 'devlog';
  LOG.forEach((e, i) => wrap.appendChild(entry(e, i === 0)));
  host.modal('Neuigkeiten', wrap, [{ label: 'Schließen', primary: true, onClick: () => host.closeModal() }]);
  markRead();
}

/** A small lamp dot on a button while there is an unread update. */
export function markButton(btn: HTMLElement) {
  injectStyle();
  if (!hasUnread() || btn.querySelector('.news-dot')) return;
  if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
  const dot = document.createElement('i');
  dot.className = 'news-dot';
  dot.setAttribute('aria-label', 'Neues Update');
  btn.appendChild(dot);
}

function injectStyle() {
  if (document.getElementById('devlog-style')) return;
  const s = document.createElement('style');
  s.id = 'devlog-style';
  s.textContent = `
  .devlog { display: grid; gap: 10px; }
  .dl-entry { border-radius: 10px; background: linear-gradient(180deg, rgba(30,42,90,.85), rgba(11,16,39,.85)); box-shadow: inset 0 0 0 1.5px rgba(224,178,90,.55); }
  .dl-entry[open] { box-shadow: inset 0 0 0 2px rgba(255,217,138,.9), 0 0 14px rgba(255,207,122,.18); }
  .dl-entry summary { list-style: none; display: flex; align-items: center; gap: 12px; padding: 10px 12px; cursor: pointer; min-height: 44px; box-sizing: border-box; }
  .dl-entry summary::-webkit-details-marker { display: none; }
  .dl-entry summary::after { content: ""; margin-left: auto; flex: none; width: 9px; height: 9px; border: solid var(--lamp); border-width: 0 2px 2px 0; transform: rotate(45deg) translateY(-3px); transition: transform .2s; }
  .dl-entry[open] summary::after { transform: rotate(-135deg) translateY(-2px); }
  .dl-v { flex: none; min-width: 3.4em; text-align: center; padding: 6px 6px 5px; border-radius: 7px; font: 1rem/1 var(--display); color: #2a1406; background: var(--brass-grad); box-shadow: 0 0 0 1.5px rgba(8,10,24,.9); }
  .dl-head { display: grid; gap: 3px; min-width: 0; }
  .dl-head strong { font: 1.12rem/1.15 var(--display); color: var(--cream, #f5e6c8); letter-spacing: .02em; }
  .dl-meta { display: flex; gap: 8px; align-items: center; font-size: .82rem; color: var(--muted); letter-spacing: .04em; }
  .dl-kind { padding: 2px 7px; border-radius: 5px; font-weight: 700; text-transform: uppercase; font-size: .72rem; letter-spacing: .08em; color: #f5e6c8; background: rgba(160,110,60,.45); }
  .dl-kind.big { color: #2a1406; background: #f2c25a; }
  .dl-kind.fix { background: rgba(200,70,70,.55); }
  .dl-kind.first { color: #0c2430; background: #9fe8ff; }
  .dl-body { padding: 0 14px 12px; }
  .dl-intro { margin: 2px 0 8px; color: var(--cream-2, #e8d6b0); font-style: italic; }
  .dl-body h3 { margin: 10px 0 4px; font: 700 .86rem/1.2 var(--body); letter-spacing: .12em; text-transform: uppercase; color: var(--lamp); }
  .dl-body ul { margin: 0; padding-left: 1.15em; display: grid; gap: 4px; }
  .dl-body li::marker { color: var(--lamp); }
  .news-dot { position: absolute; top: -4px; right: -4px; width: 12px; height: 12px; border-radius: 50%; background: #ff6b5f; box-shadow: 0 0 0 2px #0b1027, 0 0 8px rgba(255,107,95,.8); pointer-events: none; }
  @media (prefers-reduced-motion: reduce) { .dl-entry summary::after { transition: none; } }
  `;
  document.head.appendChild(s);
}
