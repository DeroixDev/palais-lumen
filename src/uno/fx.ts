// Glitter burst for a won round or match: one canvas that exists only while it plays.

const TINTS = ['#ffffff', '#ffffff', '#ff7ac2', '#dcff1f', '#7deeff', '#ffe14a', '#ff2e4d', '#2f7dff'];
const S = 40;
let sprites: HTMLCanvasElement[] | null = null;

function makeSprites() {
  return TINTS.map((tint) => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    const m = S / 2;
    const glow = g.createRadialGradient(m, m, 0, m, m, m);
    glow.addColorStop(0, tint);
    glow.addColorStop(0.2, tint + '88');
    glow.addColorStop(1, tint + '00');
    g.fillStyle = glow;
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#fff';
    g.beginPath();
    const k = 2;
    g.moveTo(m, 2); g.lineTo(m + k, m - k); g.lineTo(S - 2, m); g.lineTo(m + k, m + k);
    g.lineTo(m, S - 2); g.lineTo(m - k, m + k); g.lineTo(2, m); g.lineTo(m - k, m - k);
    g.closePath();
    g.fill();
    return c;
  });
}

interface P { x: number; y: number; vx: number; vy: number; s: number; t: number; ph: number; sp: number; life: number; max: number }

let running: (() => void) | null = null;

/** Sparkles bursting from (x, y); `big` for a won match. */
export function glitterBurst(x: number, y: number, big = false) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  running?.();
  sprites ??= makeSprites();
  const canvas = document.createElement('canvas');
  canvas.className = 'burst';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const W = innerWidth, H = innerHeight;
  const dpr = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(2_000_000 / (W * H)));
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const g = canvas.getContext('2d')!;
  const n = big ? 170 : 90;
  const ps: P[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (big ? 260 : 180) + Math.random() * (big ? 620 : 380);
    ps.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 160, s: 10 + Math.random() * 22, t: Math.floor(Math.random() * TINTS.length), ph: Math.random() * 6, sp: 8 + Math.random() * 10, life: 0, max: 1.2 + Math.random() * (big ? 1.8 : 1) });
  }
  if (big) {
    // a curtain of glitter falling from the top as well
    for (let i = 0; i < 80; i++) ps.push({ x: Math.random() * W, y: -20 - Math.random() * H * 0.5, vx: (Math.random() - 0.5) * 40, vy: 80 + Math.random() * 140, s: 8 + Math.random() * 16, t: Math.floor(Math.random() * TINTS.length), ph: Math.random() * 6, sp: 6 + Math.random() * 8, life: 0, max: 3.2 });
  }
  let raf = 0, last = 0;
  const stop = () => { cancelAnimationFrame(raf); canvas.remove(); running = null; };
  running = stop;
  const frame = (time: number) => {
    const dt = last ? Math.min(0.05, (time - last) / 1000) : 0.016;
    last = time;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    let alive = 0;
    for (const p of ps) {
      p.life += dt;
      if (p.life > p.max) continue;
      alive++;
      p.vx *= 1 - 1.6 * dt;
      p.vy = p.vy * (1 - 1.2 * dt) + 380 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const tw = 0.55 + 0.45 * Math.sin(p.life * p.sp + p.ph);
      const fade = Math.min(1, (p.max - p.life) / 0.5);
      const s = p.s * (0.5 + 0.5 * tw);
      g.globalAlpha = fade * tw;
      g.drawImage(sprites![p.t], p.x - s / 2, p.y - s / 2, s, s);
    }
    g.globalAlpha = 1;
    if (alive && !document.hidden) raf = requestAnimationFrame(frame);
    else stop();
  };
  raf = requestAnimationFrame(frame);
}
