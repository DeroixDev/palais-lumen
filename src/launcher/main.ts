// "Unsere Spiele": the launcher. Static markup lives in index.html; this paints the key art,
// reads a light save summary per game, and runs the glitter (one canvas, paused when unseen).

import { csArt, palaisArt, partyArt, teaserArt, unoArt } from './art';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');

// ---------- art ----------
const ART: Record<string, () => string> = {
  palais: palaisArt,
  cs: csArt,
  uno: unoArt,
  party: partyArt,
  race: () => teaserArt('race'),
  quiz: () => teaserArt('quiz'),
  poker: () => teaserArt('poker'),
};
document.querySelectorAll<HTMLElement>('[data-art]').forEach((el) => {
  const draw = ART[el.dataset.art ?? ''];
  if (draw) el.innerHTML = draw();
});

// ---------- save summaries (read defensively: any odd or old format just shows "no save") ----------
const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function readJSON(key: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Same curve as CS Gambler's career (src/cs/app/lib/career.ts), kept tiny here so the launcher stays light. */
function csLevel(xp: number) {
  let lvl = 1, cum = 0;
  while (lvl < 250) {
    const need = Math.round((550 * Math.pow(1.0135, lvl - 1) + 60 * (lvl - 1)) / 10) * 10;
    if (cum + need > xp) break;
    cum += need;
    lvl++;
  }
  return lvl;
}

function csSummary(): string | null {
  const s = readJSON('csgambler.save');
  if (!s || !num(s.balance)) return null;
  const lvl = num(s.xp) ? csLevel(Math.max(0, s.xp)) : 1;
  return `Stufe ${lvl} · ${nf2.format(s.balance)} Coins`;
}

function palaisSummary(): string | null {
  let best: { at: number; text: string } | null = null;
  for (const slot of ['auto', 'slot1', 'slot2', 'slot3']) {
    const d = readJSON('nachtfalter.save.' + slot);
    if (!d || !num(d.balance)) continue;
    const at = num(d.savedAt) ? d.savedAt : 0;
    const ev = d.evening as { number?: unknown } | undefined;
    const day = ev && num(ev.number) ? ev.number : null;
    const text = `${day ? `Tag ${day} · ` : ''}${nf0.format(Math.floor(d.balance))} Lumen`;
    if (!best || at > best.at) best = { at, text };
  }
  return best?.text ?? null;
}

function unoSummary(): string | null {
  const s = readJSON('unounser.save');
  if (!s || !num(s.rounds) || s.rounds <= 0) return null;
  const wins = num(s.wins) ? s.wins : 0;
  return `${nf0.format(wins)} ${wins === 1 ? 'Sieg' : 'Siege'} · ${nf0.format(s.rounds)} ${s.rounds === 1 ? 'Runde' : 'Runden'}`;
}

function partySummary(): string | null {
  const s = readJSON('partyunser.stats');
  const save = readJSON('partyunser.save');
  const st = (save?.data as { st?: { round?: unknown; rules?: { rounds?: unknown } } } | undefined)?.st;
  if (st && num(st.round) && num(st.rules?.rounds)) return `Abend läuft · Runde ${nf0.format(st.round)} von ${nf0.format(st.rules.rounds)}`;
  if (!s || !num(s.evenings) || s.evenings <= 0) return null;
  const wins = num(s.wins) ? s.wins : 0;
  return `${nf0.format(s.evenings)} ${s.evenings === 1 ? 'Abend' : 'Abende'} · ${nf0.format(wins)} ${wins === 1 ? 'Sieg' : 'Siege'}`;
}

function showSave(game: string, text: string | null) {
  const el = document.querySelector<HTMLElement>(`[data-save="${game}"]`);
  if (!el || !text) return;
  el.classList.add('has');
  el.querySelector('.save-txt')!.textContent = `Dein Stand: ${text}`;
}
try {
  showSave('palais', palaisSummary());
  showSave('cs', csSummary());
  showSave('uno', unoSummary());
  showSave('party', partySummary());
} catch {
  /* never let a save summary break the launcher */
}

// ---------- game cards: whole card opens the game, gentle tilt + foil on fine pointers ----------
document.querySelectorAll<HTMLElement>('.game').forEach((card) => {
  const link = card.querySelector<HTMLAnchorElement>('.btn-play');
  if (!link) return;
  card.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) return;
    if (getSelection()?.toString()) return;
    location.href = link.href;
  });

  const holo = card.querySelector<HTMLElement>('.holo');
  let raf = 0, px = 0.5, py = 0.5;
  // Only transforms change per move: no repaint, the card and its foil just move on the compositor.
  const apply = () => {
    raf = 0;
    if (holo) holo.style.transform = `translate3d(${((0.5 - px) * 16).toFixed(1)}%, ${((0.5 - py) * 16).toFixed(1)}%, 0)`;
    if (!reduced.matches) card.style.transform = `perspective(1100px) rotateX(${((0.5 - py) * 5).toFixed(2)}deg) rotateY(${((px - 0.5) * 6).toFixed(2)}deg)`;
  };
  card.addEventListener('pointerenter', () => { if (finePointer.matches) card.classList.add('tilting'); });
  card.addEventListener('pointermove', (e) => {
    if (!finePointer.matches) return;
    const r = card.getBoundingClientRect();
    px = (e.clientX - r.left) / r.width;
    py = (e.clientY - r.top) / r.height;
    if (!raf) raf = requestAnimationFrame(apply);
  });
  card.addEventListener('pointerleave', () => {
    cancelAnimationFrame(raf);
    raf = 0;
    card.classList.remove('tilting');
    card.style.transform = '';
    if (holo) holo.style.transform = '';
  });
});

// ---------- glitter ----------
const hero = document.querySelector<HTMLElement>('.hero')!;
const canvas = hero.querySelector<HTMLCanvasElement>('.glitter')!;
const title = hero.querySelector<HTMLElement>('.headline')!;
const ctx = canvas.getContext('2d');

const TINTS = ['#ffffff', '#ffffff', '#ff7ac2', '#dcff1f', '#7deeff', '#ffe14a'];
const SPRITE = 48;
/** One pre-rendered sparkle per tint: a soft glow plus a sharp four-point star. */
const sprites = TINTS.map((tint) => {
  const c = document.createElement('canvas');
  c.width = c.height = SPRITE;
  const g = c.getContext('2d')!;
  const m = SPRITE / 2;
  const glow = g.createRadialGradient(m, m, 0, m, m, m);
  glow.addColorStop(0, tint);
  glow.addColorStop(0.18, tint + '88');
  glow.addColorStop(1, tint + '00');
  g.fillStyle = glow;
  g.fillRect(0, 0, SPRITE, SPRITE);
  g.fillStyle = '#fff';
  g.beginPath();
  const k = 2.2;
  g.moveTo(m, 2); g.lineTo(m + k, m - k); g.lineTo(SPRITE - 2, m); g.lineTo(m + k, m + k);
  g.lineTo(m, SPRITE - 2); g.lineTo(m - k, m + k); g.lineTo(2, m); g.lineTo(m - k, m - k);
  g.closePath();
  g.fill();
  return c;
});

interface Spark { x: number; y: number; s: number; ph: number; sp: number; vy: number; t: number; life: number }
let sparks: Spark[] = [];
const trail: Spark[] = [];
let W = 0, H = 0, dpr = 1;
let titleBox = { x: 0, y: 0, w: 0, h: 0 };

function spawn(onTitle: boolean): Spark {
  const inTitle = onTitle && titleBox.w > 0;
  return {
    x: inTitle ? titleBox.x + Math.random() * titleBox.w : Math.random() * W,
    y: inTitle ? titleBox.y + Math.random() * titleBox.h : Math.random() * H,
    s: (inTitle ? 10 : 6) + Math.random() * (inTitle ? 18 : 14),
    ph: Math.random() * Math.PI * 2,
    sp: 0.6 + Math.random() * 1.6,
    vy: -(2 + Math.random() * 7),
    t: Math.floor(Math.random() * TINTS.length),
    life: 0,
  };
}

function layout() {
  const r = hero.getBoundingClientRect();
  W = r.width;
  H = r.height;
  // weak GPUs pay per pixel: cap the backing store
  dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(2_400_000 / Math.max(1, W * H)));
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const t = title.getBoundingClientRect();
  titleBox = { x: t.left - r.left, y: t.top - r.top, w: t.width, h: t.height };
  const count = Math.round(Math.min(110, Math.max(36, (W * H) / 16000)));
  sparks = Array.from({ length: count }, (_, i) => spawn(i % 5 < 2));
}

function draw(time: number) {
  if (!ctx) return;
  const sec = time / 1000;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  for (const p of sparks) {
    const w = Math.sin(sec * p.sp + p.ph);
    const a = w > 0 ? w * w * w : 0; // mostly dark, short bright twinkles
    if (a < 0.02) continue;
    const s = p.s * (0.35 + 0.65 * a);
    ctx.globalAlpha = a;
    ctx.drawImage(sprites[p.t], p.x - s / 2, p.y - s / 2, s, s);
  }
  for (const p of trail) {
    const k = 1 - p.life / 0.9;
    if (k <= 0) continue;
    const s = p.s * k;
    ctx.globalAlpha = k;
    ctx.drawImage(sprites[p.t], p.x - s / 2, p.y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

let raf = 0, last = 0, visible = true, slowFrames = 0, thinned = false;
function frame(time: number) {
  raf = requestAnimationFrame(frame);
  const dt = last ? Math.min(0.05, (time - last) / 1000) : 0.016;
  last = time;
  // a device that can't keep up gets half the sparkles, once
  if (!thinned && dt > 0.028) { if (++slowFrames > 40) { thinned = true; sparks = sparks.filter((_, i) => i % 2 === 0); } }
  for (const p of sparks) {
    p.y += p.vy * dt;
    if (p.y < -20) { p.y = H + 10; p.x = Math.random() * W; }
  }
  for (let i = trail.length - 1; i >= 0; i--) {
    const p = trail[i];
    p.life += dt;
    p.y += p.vy * dt;
    if (p.life > 0.9) trail.splice(i, 1);
  }
  draw(time);
}
function start() {
  if (raf || reduced.matches || document.hidden || !visible || !ctx) return;
  last = 0;
  raf = requestAnimationFrame(frame);
}
function stop() {
  cancelAnimationFrame(raf);
  raf = 0;
}

function boot() {
  layout();
  if (reduced.matches) draw(1200); // one still frame of glitter
  else start();
}
// Wait for the display font so the title box (where the glitter gathers) is measured right.
(document.fonts?.ready ?? Promise.resolve()).then(boot, boot);

let resizeT = 0;
addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = window.setTimeout(() => { layout(); if (reduced.matches) draw(1200); }, 150);
});
document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
new IntersectionObserver(([e]) => {
  visible = e.isIntersecting;
  if (visible) start(); else stop();
}).observe(hero);
reduced.addEventListener?.('change', () => { if (reduced.matches) { stop(); draw(1200); } else start(); });

// pointer trail: a few sparkles where the cursor moves over the hero
let lastSpawn = 0;
hero.addEventListener('pointermove', (e) => {
  if (reduced.matches || !raf || e.pointerType !== 'mouse') return;
  const now = performance.now();
  if (now - lastSpawn < 34 || trail.length > 36) return;
  lastSpawn = now;
  const r = hero.getBoundingClientRect();
  const p = spawn(false);
  p.x = e.clientX - r.left + (Math.random() - 0.5) * 14;
  p.y = e.clientY - r.top + (Math.random() - 0.5) * 14;
  p.s = 10 + Math.random() * 14;
  p.vy = 10 + Math.random() * 25;
  trail.push(p);
});

// ---------- holographic sheen across "Unsere", every few seconds ----------
function shine() {
  if (reduced.matches || document.hidden || !visible) return;
  hero.classList.remove('shine');
  void hero.offsetWidth;
  hero.classList.add('shine');
  setTimeout(() => hero.classList.remove('shine'), 1600);
}
setTimeout(shine, 1100);
setInterval(shine, 7000);
