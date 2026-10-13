/** Case box art: a lit, bevelled crate with an emblem, per CaseDef.look. */
import type { CaseDef } from '../contract';
import { hex, rgb, mix, rng, hashStr } from './noise';

function dpr(): number {
  return Math.min(3, Math.max(1, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Emblems are drawn into a unit box centred at 0,0 with radius ~1. */
const EMBLEMS: Record<string, (c: CanvasRenderingContext2D) => void> = {
  flame(c) {
    c.beginPath();
    c.moveTo(0, 1);
    c.bezierCurveTo(-0.75, 0.95, -0.85, 0.2, -0.35, -0.3);
    c.bezierCurveTo(-0.3, 0.05, -0.15, 0.15, -0.05, 0.12);
    c.bezierCurveTo(-0.3, -0.35, 0.05, -0.75, 0.1, -1);
    c.bezierCurveTo(0.25, -0.55, 0.85, -0.25, 0.7, 0.45);
    c.bezierCurveTo(0.62, 0.85, 0.35, 1, 0, 1);
    c.fill();
  },
  snow(c) {
    c.lineCap = 'round';
    c.lineWidth = 0.13;
    for (let i = 0; i < 6; i++) {
      c.save(); c.rotate((i * Math.PI) / 3);
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -0.95);
      c.moveTo(0, -0.55); c.lineTo(-0.25, -0.78); c.moveTo(0, -0.55); c.lineTo(0.25, -0.78);
      c.stroke(); c.restore();
    }
  },
  skull(c) {
    c.beginPath();
    c.ellipse(0, -0.15, 0.78, 0.72, 0, 0, Math.PI * 2);
    c.rect(-0.42, 0.3, 0.84, 0.55);
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath(); c.ellipse(-0.3, -0.12, 0.2, 0.24, 0, 0, Math.PI * 2); c.ellipse(0.3, -0.12, 0.2, 0.24, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(0, 0.12); c.lineTo(-0.1, 0.3); c.lineTo(0.1, 0.3); c.fill();
    for (let i = -1; i <= 1; i++) c.fillRect(i * 0.22 - 0.04, 0.55, 0.08, 0.3);
    c.globalCompositeOperation = 'source-over';
  },
  star(c) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 - Math.PI / 2, r = i % 2 ? 0.42 : 1;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath(); c.fill();
  },
  bolt(c) {
    c.beginPath();
    c.moveTo(0.2, -1); c.lineTo(-0.55, 0.12); c.lineTo(-0.05, 0.12); c.lineTo(-0.25, 1); c.lineTo(0.55, -0.18); c.lineTo(0.05, -0.18); c.closePath();
    c.fill();
  },
  gem(c) {
    c.beginPath();
    c.moveTo(-0.85, -0.3); c.lineTo(-0.45, -0.8); c.lineTo(0.45, -0.8); c.lineTo(0.85, -0.3); c.lineTo(0, 0.95); c.closePath();
    c.fill();
    c.globalAlpha = 0.35; c.strokeStyle = '#000'; c.lineWidth = 0.06;
    c.beginPath(); c.moveTo(-0.85, -0.3); c.lineTo(0.85, -0.3); c.moveTo(-0.45, -0.8); c.lineTo(-0.25, -0.3); c.lineTo(0, 0.95); c.lineTo(0.25, -0.3); c.lineTo(0.45, -0.8); c.stroke();
    c.globalAlpha = 1;
  },
  knife(c) {
    c.beginPath();
    c.moveTo(-0.15, 0.35); c.lineTo(-0.12, -0.6); c.quadraticCurveTo(0.05, -1.05, 0.28, -0.95); c.quadraticCurveTo(0.2, -0.3, 0.15, 0.35); c.closePath();
    c.fill();
    c.fillRect(-0.32, 0.32, 0.64, 0.12);
    c.beginPath(); c.roundRect(-0.12, 0.44, 0.24, 0.56, 0.08); c.fill();
  },
  glove(c) {
    c.beginPath();
    c.moveTo(-0.55, 1); c.lineTo(-0.6, 0.1); c.lineTo(-0.9, -0.25); c.quadraticCurveTo(-0.95, -0.42, -0.75, -0.4); c.lineTo(-0.5, -0.15);
    const fx = [-0.48, -0.18, 0.12, 0.42], fl = [0.75, 0.95, 0.9, 0.7];
    fx.forEach((x, i) => { c.lineTo(x, -fl[i] + 0.1); c.arc(x + 0.13, -fl[i] + 0.1, 0.13, Math.PI, 0); c.lineTo(x + 0.26, -0.1); });
    c.lineTo(0.62, 1); c.closePath(); c.fill();
  },
  crown(c) {
    c.beginPath();
    c.moveTo(-0.9, 0.6); c.lineTo(-0.95, -0.55); c.lineTo(-0.45, -0.05); c.lineTo(0, -0.8); c.lineTo(0.45, -0.05); c.lineTo(0.95, -0.55); c.lineTo(0.9, 0.6); c.closePath();
    c.fill(); c.fillRect(-0.9, 0.7, 1.8, 0.2);
  },
  wave(c) {
    c.lineWidth = 0.16; c.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      c.beginPath();
      for (let x = -1; x <= 1.001; x += 0.05) c.lineTo(x, -0.5 + k * 0.5 + Math.sin(x * 5 + k) * 0.15);
      c.stroke();
    }
  },
  eye(c) {
    c.beginPath(); c.moveTo(-1, 0); c.quadraticCurveTo(0, -0.95, 1, 0); c.quadraticCurveTo(0, 0.95, -1, 0); c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath(); c.arc(0, 0, 0.36, 0, Math.PI * 2); c.fill();
    c.globalCompositeOperation = 'source-over';
    c.beginPath(); c.arc(0, 0, 0.18, 0, Math.PI * 2); c.fill();
  },
  sun(c) {
    c.beginPath(); c.arc(0, 0, 0.45, 0, Math.PI * 2); c.fill();
    c.lineWidth = 0.12; c.lineCap = 'round';
    for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6; c.beginPath(); c.moveTo(Math.cos(a) * 0.62, Math.sin(a) * 0.62); c.lineTo(Math.cos(a) * 0.95, Math.sin(a) * 0.95); c.stroke(); }
  },
  dragon(c) {
    c.lineWidth = 0.16; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath();
    for (let t = 0; t <= 1.0001; t += 0.02) { const a = t * Math.PI * 3.2; c.lineTo(Math.cos(a) * (0.9 - t * 0.6), Math.sin(a) * (0.9 - t * 0.6) * 0.8); }
    c.stroke();
    c.beginPath(); c.moveTo(0.9, 0); c.lineTo(1.05, -0.3); c.lineTo(0.7, -0.15); c.closePath(); c.fill();
  },
  circuit(c) {
    c.lineWidth = 0.09; c.lineCap = 'round';
    const lines = [[-0.9, -0.5, -0.3, -0.5, 0, -0.2], [-0.9, 0.4, -0.2, 0.4, 0.2, 0], [0.9, -0.6, 0.4, -0.6, 0.1, -0.3], [0.9, 0.6, 0.3, 0.6, 0.1, 0.4]];
    lines.forEach((l) => { c.beginPath(); c.moveTo(l[0], l[1]); c.lineTo(l[2], l[3]); c.lineTo(l[4], l[5]); c.stroke(); c.beginPath(); c.arc(l[0], l[1], 0.1, 0, 7); c.fill(); });
    c.fillRect(-0.3, -0.3, 0.6, 0.6);
  },
  leaf(c) {
    c.beginPath(); c.moveTo(0, 1); c.quadraticCurveTo(-1, 0.1, 0, -1); c.quadraticCurveTo(1, 0.1, 0, 1); c.fill();
  },
  heart(c) {
    c.beginPath(); c.moveTo(0, 0.9); c.bezierCurveTo(-1.2, 0, -0.6, -1, 0, -0.4); c.bezierCurveTo(0.6, -1, 1.2, 0, 0, 0.9); c.fill();
  },
  moon(c) {
    c.beginPath(); c.arc(0, 0, 0.9, 0, Math.PI * 2); c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath(); c.arc(0.38, -0.25, 0.75, 0, Math.PI * 2); c.fill();
    c.globalCompositeOperation = 'source-over';
  },
};

export const EMBLEM_KEYS = () => Object.keys(EMBLEMS);

export function renderCaseImpl(cd: CaseDef, width: number, height: number): HTMLCanvasElement {
  const d = dpr();
  const W = Math.round(width * d), H = Math.round(height * d);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  c.style.width = width + 'px'; c.style.height = height + 'px';
  const ctx = c.getContext('2d')!;
  const A = hex(cd.look.a), B = hex(cd.look.b);
  const r = rng(hashStr(cd.id));

  // glow behind the box
  const glow = ctx.createRadialGradient(W / 2, H * 0.5, 0, W / 2, H * 0.5, Math.max(W, H) * 0.55);
  glow.addColorStop(0, rgb(B, 0.45)); glow.addColorStop(0.6, rgb(A, 0.12)); glow.addColorStop(1, rgb(A, 0));
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  // box geometry: front face + lid, slight perspective via top face
  const bw = Math.min(W * 0.84, H * 1.35), bh = bw * 0.6;
  const x = (W - bw) / 2, y = H * 0.52 - bh / 2 + bh * 0.08;
  const top = bh * 0.16;
  const rad = bw * 0.035;

  // floor shadow
  ctx.save();
  ctx.translate(W / 2, y + bh);
  ctx.scale(1, 0.14);
  const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, bw * 0.62);
  sh.addColorStop(0, 'rgba(0,0,0,0.6)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(-bw, -bw, bw * 2, bw * 2);
  ctx.restore();

  // top face (lid seen from above)
  ctx.beginPath();
  ctx.moveTo(x + bw * 0.06, y - top); ctx.lineTo(x + bw * 0.94, y - top); ctx.lineTo(x + bw, y + rad); ctx.lineTo(x, y + rad); ctx.closePath();
  const tg = ctx.createLinearGradient(0, y - top, 0, y);
  tg.addColorStop(0, rgb(mix(B, [255, 255, 255], 0.35))); tg.addColorStop(1, rgb(mix(A, [255, 255, 255], 0.15)));
  ctx.fillStyle = tg; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = d; ctx.stroke();

  // front face
  rr(ctx, x, y, bw, bh, rad);
  const fg = ctx.createLinearGradient(x, y, x + bw, y + bh);
  fg.addColorStop(0, rgb(mix(A, [255, 255, 255], 0.08)));
  fg.addColorStop(0.55, rgb(A));
  fg.addColorStop(1, rgb(mix(A, B, 0.5)));
  ctx.fillStyle = fg; ctx.fill();
  ctx.save();
  ctx.clip();
  // brushed/texture streaks
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(255,255,255,${r() * 0.04})`;
    ctx.fillRect(x, y + r() * bh, bw, r() * 2 * d + 0.5);
  }
  // diagonal sheen
  const sg = ctx.createLinearGradient(x, y, x + bw * 0.7, y + bh);
  sg.addColorStop(0, 'rgba(255,255,255,0.0)'); sg.addColorStop(0.35, 'rgba(255,255,255,0.16)'); sg.addColorStop(0.45, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg; ctx.fillRect(x, y, bw, bh);
  // bottom shade
  const bg = ctx.createLinearGradient(0, y, 0, y + bh);
  bg.addColorStop(0, 'rgba(255,255,255,0.15)'); bg.addColorStop(0.3, 'rgba(255,255,255,0)'); bg.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = bg; ctx.fillRect(x, y, bw, bh);
  // lid seam
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, y + bh * 0.22, bw, Math.max(1, d * 1.5));
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x, y + bh * 0.22 + d * 1.5, bw, Math.max(1, d));
  ctx.restore();

  // corner guards (metal; gold for gold cases)
  const goldish = cd.category === 'gold';
  const cg = bw * 0.09;
  const corners: [number, number][] = [[x, y], [x + bw - cg, y], [x, y + bh - cg], [x + bw - cg, y + bh - cg]];
  corners.forEach(([cx, cy]) => {
    rr(ctx, cx, cy, cg, cg, rad);
    const mg = ctx.createLinearGradient(cx, cy, cx, cy + cg);
    if (goldish) { mg.addColorStop(0, '#fff1b8'); mg.addColorStop(0.5, '#d9a43a'); mg.addColorStop(1, '#6e4a10'); }
    else { mg.addColorStop(0, '#d9dde3'); mg.addColorStop(0.5, '#8a9099'); mg.addColorStop(1, '#4a4f57'); }
    ctx.fillStyle = mg; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = d * 0.8; ctx.stroke();
    ctx.fillStyle = '#2a2d33';
    ctx.beginPath(); ctx.arc(cx + cg / 2, cy + cg / 2, cg * 0.13, 0, Math.PI * 2); ctx.fill();
  });

  // latch
  const lw = bw * 0.12, lh = bh * 0.14;
  rr(ctx, x + bw / 2 - lw / 2, y + bh * 0.22 - lh / 2, lw, lh, lh * 0.25);
  const lg = ctx.createLinearGradient(0, y + bh * 0.22 - lh / 2, 0, y + bh * 0.22 + lh / 2);
  lg.addColorStop(0, '#f2e2a8'); lg.addColorStop(0.5, '#c79a3a'); lg.addColorStop(1, '#6e4f14');
  ctx.fillStyle = lg; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = d * 0.8; ctx.stroke();

  // emblem plate
  const ex = W / 2, ey = y + bh * 0.6, er = bh * 0.27;
  const eg = ctx.createRadialGradient(ex, ey - er * 0.3, 0, ex, ey, er * 1.3);
  eg.addColorStop(0, rgb(mix(B, [255, 255, 255], 0.3), 0.95)); eg.addColorStop(1, rgb(mix(B, [0, 0, 0], 0.45), 0.95));
  ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2);
  ctx.fillStyle = eg; ctx.fill();
  ctx.lineWidth = d * 2; ctx.strokeStyle = rgb(mix(B, [255, 255, 255], 0.55)); ctx.stroke();
  ctx.lineWidth = d; ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath(); ctx.arc(ex, ey, er + d * 1.5, 0, Math.PI * 2); ctx.stroke();

  const em = EMBLEMS[cd.look.emblem] ?? EMBLEMS.star;
  ctx.save();
  ctx.translate(ex, ey);
  ctx.scale(er * 0.62, er * 0.62);
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4 * d; ctx.shadowOffsetY = d;
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
  em(ctx);
  ctx.restore();

  // outer outline (gold/premium get a bright rim)
  rr(ctx, x, y, bw, bh, rad);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = d * 1.2; ctx.stroke();
  if (cd.category === 'gold' || cd.category === 'premium') {
    rr(ctx, x + d * 1.5, y + d * 1.5, bw - d * 3, bh - d * 3, rad * 0.8);
    ctx.strokeStyle = cd.category === 'gold' ? 'rgba(255,214,120,0.75)' : rgb(mix(B, [255, 255, 255], 0.5), 0.55);
    ctx.lineWidth = d * 1.2; ctx.stroke();
  }
  // sparkles for gold / event cases
  if (cd.category === 'gold' || cd.category === 'event') {
    const n = cd.category === 'gold' ? 7 : 4;
    for (let i = 0; i < n; i++) {
      const sx = x + r() * bw, sy = y - top + r() * (bh + top), L = (3 + r() * 6) * d;
      const sg2 = ctx.createRadialGradient(sx, sy, 0, sx, sy, L);
      sg2.addColorStop(0, 'rgba(255,255,255,0.95)'); sg2.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg2; ctx.beginPath(); ctx.arc(sx, sy, L, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(sx - L, sy - d * 0.4, L * 2, d * 0.8); ctx.fillRect(sx - d * 0.4, sy - L, d * 0.8, L * 2);
    }
  }
  return c;
}

