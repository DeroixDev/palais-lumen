// Screen effects: particle bursts and flashes on one fixed canvas.
import { reducedMotion } from '../lib/util';

interface P { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; spin: number; rot: number; star: boolean }
let cv: HTMLCanvasElement | null = null;
let g: CanvasRenderingContext2D | null = null;
const parts: P[] = [];
let running = false;

function ensure() {
  if (cv) return;
  cv = document.createElement('canvas');
  cv.className = 'fx-canvas';
  document.body.appendChild(cv);
  g = cv.getContext('2d');
  const size = () => { const d = Math.min(2, devicePixelRatio || 1); cv!.width = innerWidth * d; cv!.height = innerHeight * d; g!.setTransform(d, 0, 0, d, 0, 0); };
  size();
  addEventListener('resize', size);
}

function loop() {
  if (!g || !cv) return;
  g.clearRect(0, 0, innerWidth, innerHeight);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life++;
    p.vy += 0.18; p.vx *= 0.985; p.vy *= 0.985;
    p.x += p.vx; p.y += p.vy; p.rot += p.spin;
    const a = 1 - p.life / p.max;
    if (a <= 0) { parts.splice(i, 1); continue; }
    g.save();
    g.globalAlpha = a;
    g.translate(p.x, p.y); g.rotate(p.rot);
    g.fillStyle = p.color;
    if (p.star) {
      g.beginPath();
      for (let k = 0; k < 10; k++) { const r = k % 2 ? p.size * 0.45 : p.size; const an = (k / 10) * Math.PI * 2; g.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
      g.closePath(); g.fill();
    } else g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    g.restore();
  }
  if (parts.length) requestAnimationFrame(loop); else running = false;
}

export function burst(x: number, y: number, colors: string[], count = 80, power = 9) {
  if (reducedMotion()) return;
  ensure();
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = power * (0.35 + Math.random() * 0.75);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * 0.35, life: 0, max: 60 + Math.random() * 60, size: 4 + Math.random() * 7, color: colors[i % colors.length], spin: (Math.random() - 0.5) * 0.4, rot: Math.random() * 6, star: Math.random() < 0.3 });
  }
  if (!running) { running = true; requestAnimationFrame(loop); }
}

export function burstAt(node: Element, colors: string[], count = 80, power = 9) {
  const r = node.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, colors, count, power);
}

export function flash(color = 'rgba(255,209,74,.5)') {
  if (reducedMotion()) return;
  const f = document.createElement('div');
  f.className = 'fx-flash';
  f.style.setProperty('--fc', color);
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1500);
}

export function shake(node: HTMLElement) {
  if (reducedMotion()) return;
  node.classList.remove('shake');
  void node.offsetWidth;
  node.classList.add('shake');
}
