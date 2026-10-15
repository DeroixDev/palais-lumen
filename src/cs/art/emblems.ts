/**
 * Case emblems: small vector artworks drawn into a unit box centred at 0,0 (radius ~1).
 * Each one only builds paths and fills/strokes them with the current fillStyle/strokeStyle, so the
 * caller decides the material (embossed metal, glowing neon ...). Cut-outs use destination-out on
 * the emblem's own layer (the caller draws emblems on a scratch layer).
 */
type C = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

function cut(c: C, f: () => void) {
  const op = c.globalCompositeOperation;
  c.globalCompositeOperation = 'destination-out';
  f();
  c.globalCompositeOperation = op;
}
function poly(c: C, pts: number[]) {
  c.beginPath();
  for (let i = 0; i < pts.length; i += 2) (i ? c.lineTo : c.moveTo).call(c, pts[i], pts[i + 1]);
  c.closePath();
}
function star(c: C, n: number, r1: number, r2: number, x = 0, y = 0, rot = -Math.PI / 2) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n, r = i % 2 ? r2 : r1;
    c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  c.closePath();
}

export const EMBLEMS: Record<string, (c: C) => void> = {
  flame(c) {
    c.beginPath();
    c.moveTo(0, 1);
    c.bezierCurveTo(-0.78, 0.95, -0.9, 0.15, -0.38, -0.32);
    c.bezierCurveTo(-0.33, 0.02, -0.18, 0.14, -0.06, 0.1);
    c.bezierCurveTo(-0.32, -0.38, 0.04, -0.78, 0.12, -1.02);
    c.bezierCurveTo(0.28, -0.56, 0.9, -0.26, 0.74, 0.46);
    c.bezierCurveTo(0.65, 0.86, 0.36, 1, 0, 1);
    c.fill();
    cut(c, () => {
      c.beginPath();
      c.moveTo(0.02, 0.86);
      c.bezierCurveTo(-0.36, 0.82, -0.4, 0.42, -0.12, 0.2);
      c.bezierCurveTo(-0.06, 0.38, 0.08, 0.42, 0.14, 0.3);
      c.bezierCurveTo(0.42, 0.42, 0.4, 0.84, 0.02, 0.86);
      c.fill();
    });
  },
  snow(c) {
    c.lineCap = 'round';
    c.lineWidth = 0.12;
    for (let i = 0; i < 6; i++) {
      c.save(); c.rotate((i * Math.PI) / 3);
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -0.95);
      c.moveTo(0, -0.5); c.lineTo(-0.26, -0.74); c.moveTo(0, -0.5); c.lineTo(0.26, -0.74);
      c.moveTo(0, -0.25); c.lineTo(-0.16, -0.4); c.moveTo(0, -0.25); c.lineTo(0.16, -0.4);
      c.stroke(); c.restore();
    }
    star(c, 6, 0.2, 0.1); c.fill();
  },
  skull(c) {
    c.beginPath();
    c.moveTo(-0.62, 0.18);
    c.bezierCurveTo(-0.95, -0.25, -0.75, -0.95, 0, -0.95);
    c.bezierCurveTo(0.75, -0.95, 0.95, -0.25, 0.62, 0.18);
    c.lineTo(0.5, 0.42); c.lineTo(0.42, 0.88); c.lineTo(-0.42, 0.88); c.lineTo(-0.5, 0.42);
    c.closePath(); c.fill();
    cut(c, () => {
      c.beginPath(); c.ellipse(-0.3, -0.14, 0.21, 0.24, 0.2, 0, TAU); c.ellipse(0.3, -0.14, 0.21, 0.24, -0.2, 0, TAU); c.fill();
      poly(c, [0, 0.16, -0.11, 0.36, 0.11, 0.36]); c.fill();
      for (let i = -1; i <= 2; i++) c.fillRect(i * 0.2 - 0.13, 0.56, 0.06, 0.34);
    });
  },
  star(c) { star(c, 5, 1, 0.42); c.fill(); cut(c, () => { star(c, 5, 0.45, 0.19); c.fill(); }); star(c, 5, 0.3, 0.13); c.fill(); },
  bolt(c) {
    poly(c, [0.24, -1, -0.58, 0.14, -0.06, 0.14, -0.28, 1, 0.6, -0.2, 0.06, -0.2, 0.36, -1]);
    c.fill();
  },
  gem(c) {
    poly(c, [-0.9, -0.3, -0.5, -0.82, 0.5, -0.82, 0.9, -0.3, 0, 0.98]); c.fill();
    cut(c, () => {
      c.lineWidth = 0.06; c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(-0.9, -0.3); c.lineTo(0.9, -0.3);
      c.moveTo(-0.5, -0.82); c.lineTo(-0.28, -0.3); c.lineTo(0, 0.98); c.lineTo(0.28, -0.3); c.lineTo(0.5, -0.82);
      c.moveTo(-0.28, -0.3); c.lineTo(0, -0.82); c.lineTo(0.28, -0.3);
      c.stroke();
    });
  },
  knife(c) {
    c.save(); c.rotate(0.6);
    c.beginPath();
    c.moveTo(-0.13, 0.3); c.lineTo(-0.13, -0.55); c.quadraticCurveTo(0.02, -1.08, 0.26, -1.02); c.quadraticCurveTo(0.18, -0.35, 0.14, 0.3); c.closePath(); c.fill();
    c.beginPath(); c.roundRect(-0.36, 0.27, 0.72, 0.12, 0.04); c.fill();
    c.beginPath(); c.roundRect(-0.12, 0.42, 0.24, 0.58, 0.08); c.fill();
    cut(c, () => { for (let i = 0; i < 3; i++) c.fillRect(-0.12, 0.52 + i * 0.15, 0.24, 0.04); });
    c.restore();
  },
  blade(c) {
    c.save(); c.rotate(-0.75);
    c.beginPath();
    c.moveTo(-0.1, 0.35); c.lineTo(-0.12, -0.7); c.lineTo(0, -1.05); c.lineTo(0.14, -0.72); c.lineTo(0.12, -0.25); c.lineTo(0.2, -0.15); c.lineTo(0.12, 0.35); c.closePath(); c.fill();
    c.beginPath(); c.ellipse(0, 0.38, 0.38, 0.07, 0, 0, TAU); c.fill();
    c.beginPath(); c.roundRect(-0.1, 0.42, 0.2, 0.55, 0.06); c.fill();
    cut(c, () => { c.lineWidth = 0.04; c.beginPath(); c.moveTo(0, -0.9); c.lineTo(0, 0.25); c.stroke(); });
    c.restore();
  },
  glove(c) {
    c.beginPath();
    c.moveTo(-0.55, 1); c.lineTo(-0.6, 0.1); c.lineTo(-0.9, -0.25); c.quadraticCurveTo(-0.95, -0.42, -0.75, -0.4); c.lineTo(-0.5, -0.15);
    const fx = [-0.48, -0.18, 0.12, 0.42], fl = [0.75, 0.95, 0.9, 0.7];
    fx.forEach((x, i) => { c.lineTo(x, -fl[i] + 0.1); c.arc(x + 0.13, -fl[i] + 0.1, 0.13, Math.PI, 0); c.lineTo(x + 0.26, -0.1); });
    c.lineTo(0.62, 1); c.closePath(); c.fill();
    cut(c, () => { c.fillRect(-0.6, 0.62, 1.25, 0.08); });
  },
  crown(c) {
    c.beginPath();
    c.moveTo(-0.92, 0.55); c.lineTo(-1, -0.5); c.lineTo(-0.5, -0.02); c.lineTo(0, -0.78); c.lineTo(0.5, -0.02); c.lineTo(1, -0.5); c.lineTo(0.92, 0.55); c.closePath();
    c.fill();
    c.beginPath(); c.roundRect(-0.95, 0.64, 1.9, 0.26, 0.06); c.fill();
    for (const [x, y] of [[-1, -0.58], [0, -0.88], [1, -0.58]]) { c.beginPath(); c.arc(x, y, 0.13, 0, TAU); c.fill(); }
    cut(c, () => { for (const x of [-0.5, 0, 0.5]) { c.beginPath(); c.arc(x, 0.3, 0.1, 0, TAU); c.fill(); } });
  },
  wave(c) {
    c.beginPath();
    c.moveTo(-1, 0.9); c.lineTo(-1, 0.1);
    c.bezierCurveTo(-0.7, -0.6, 0.1, -1.05, 0.6, -0.55);
    c.bezierCurveTo(0.2, -0.65, -0.1, -0.35, 0.05, -0.05);
    c.bezierCurveTo(0.2, 0.2, 0.55, 0.1, 0.7, -0.1);
    c.bezierCurveTo(0.8, 0.25, 0.9, 0.5, 1, 0.55); c.lineTo(1, 0.9); c.closePath(); c.fill();
    cut(c, () => {
      c.lineWidth = 0.07; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-0.8, 0.55); c.bezierCurveTo(-0.5, 0.35, -0.2, 0.75, 0.2, 0.5); c.bezierCurveTo(0.5, 0.35, 0.7, 0.7, 0.9, 0.65); c.stroke();
    });
  },
  eye(c) {
    c.beginPath(); c.moveTo(-1, 0); c.quadraticCurveTo(0, -0.95, 1, 0); c.quadraticCurveTo(0, 0.95, -1, 0); c.fill();
    cut(c, () => { c.beginPath(); c.arc(0, 0, 0.4, 0, TAU); c.fill(); });
    c.beginPath(); c.arc(0, 0, 0.26, 0, TAU); c.fill();
    cut(c, () => { c.beginPath(); c.ellipse(0, 0, 0.07, 0.2, 0, 0, TAU); c.fill(); });
  },
  sun(c) {
    c.beginPath(); c.arc(0, 0, 0.44, 0, TAU); c.fill();
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6, b = a + 0.13, e = a - 0.13;
      poly(c, [Math.cos(e) * 0.55, Math.sin(e) * 0.55, Math.cos(a) * (i % 2 ? 0.82 : 1), Math.sin(a) * (i % 2 ? 0.82 : 1), Math.cos(b) * 0.55, Math.sin(b) * 0.55]);
      c.fill();
    }
  },
  dragon(c) {
    // a dragon head in profile, facing right
    c.beginPath();
    c.moveTo(-0.95, 0.85);
    c.lineTo(-1.05, 0.62); c.lineTo(-0.86, 0.55); c.lineTo(-0.98, 0.3); c.lineTo(-0.76, 0.22); c.lineTo(-0.84, -0.02); c.lineTo(-0.62, -0.08);
    c.lineTo(-0.45, -0.35);
    c.lineTo(-0.7, -0.95); c.lineTo(-0.25, -0.5); // horn 1
    c.lineTo(-0.1, -0.98); c.lineTo(0.02, -0.48); // horn 2
    c.bezierCurveTo(0.25, -0.45, 0.45, -0.35, 0.62, -0.2);
    c.lineTo(1, -0.12); c.lineTo(0.95, 0.02); c.lineTo(0.7, 0.05); // snout
    c.lineTo(0.92, 0.12); c.lineTo(0.88, 0.22); c.lineTo(0.5, 0.2); // jaw gap
    c.lineTo(0.75, 0.38); c.lineTo(0.3, 0.42);
    c.bezierCurveTo(0.05, 0.45, -0.1, 0.6, -0.2, 0.85);
    c.closePath(); c.fill();
    cut(c, () => {
      poly(c, [0.08, -0.25, 0.32, -0.2, 0.12, -0.12]); c.fill();
      c.lineWidth = 0.05;
      c.beginPath(); c.moveTo(-0.5, 0.2); c.lineTo(-0.2, 0.05); c.moveTo(-0.55, 0.45); c.lineTo(-0.25, 0.3); c.moveTo(-0.55, 0.7); c.lineTo(-0.3, 0.55); c.stroke();
    });
  },
  circuit(c) {
    c.lineWidth = 0.09; c.lineCap = 'round';
    const lines = [[-0.95, -0.5, -0.45, -0.5, -0.2, -0.25], [-0.95, 0.45, -0.4, 0.45, -0.2, 0.25], [0.95, -0.6, 0.45, -0.6, 0.2, -0.25], [0.95, 0.6, 0.45, 0.6, 0.2, 0.25], [0, -0.95, 0, -0.32], [0, 0.95, 0, 0.32]];
    lines.forEach((l) => {
      c.beginPath(); c.moveTo(l[0], l[1]); for (let i = 2; i < l.length; i += 2) c.lineTo(l[i], l[i + 1]); c.stroke();
      c.beginPath(); c.arc(l[0], l[1], 0.1, 0, TAU); c.fill();
    });
    c.beginPath(); c.roundRect(-0.32, -0.32, 0.64, 0.64, 0.08); c.fill();
    cut(c, () => { c.beginPath(); c.roundRect(-0.18, -0.18, 0.36, 0.36, 0.04); c.fill(); });
  },
  leaf(c) {
    c.beginPath(); c.moveTo(0, 1); c.quadraticCurveTo(-1.05, 0.1, 0, -1); c.quadraticCurveTo(1.05, 0.1, 0, 1); c.fill();
    cut(c, () => {
      c.lineWidth = 0.06; c.lineCap = 'round';
      c.beginPath(); c.moveTo(0, 0.85); c.lineTo(0, -0.75);
      for (let i = 0; i < 4; i++) { const y = 0.45 - i * 0.32; c.moveTo(0, y); c.lineTo(-0.35, y - 0.25); c.moveTo(0, y); c.lineTo(0.35, y - 0.25); }
      c.stroke();
    });
  },
  heart(c) {
    c.beginPath(); c.moveTo(0, 0.92); c.bezierCurveTo(-1.25, 0, -0.62, -1.05, 0, -0.38); c.bezierCurveTo(0.62, -1.05, 1.25, 0, 0, 0.92); c.fill();
  },
  moon(c) {
    c.beginPath(); c.arc(0, 0, 0.92, 0, TAU); c.fill();
    cut(c, () => { c.beginPath(); c.arc(0.4, -0.26, 0.76, 0, TAU); c.fill(); });
    star(c, 4, 0.22, 0.06, 0.55, 0.15); c.fill();
    star(c, 4, 0.14, 0.04, 0.25, -0.55); c.fill();
  },
  galaxy(c) {
    for (let arm = 0; arm < 3; arm++) {
      for (let i = 0; i < 26; i++) {
        const t = i / 26, a = arm * (TAU / 3) + t * 3.6, rr = 0.12 + t * 0.85;
        c.beginPath(); c.arc(Math.cos(a) * rr, Math.sin(a) * rr * 0.8, 0.13 * (1 - t) + 0.025, 0, TAU); c.fill();
      }
    }
    c.beginPath(); c.arc(0, 0, 0.24, 0, TAU); c.fill();
  },
  shield(c) {
    c.beginPath(); c.moveTo(0, -1); c.lineTo(0.82, -0.7); c.bezierCurveTo(0.85, 0.2, 0.5, 0.7, 0, 1); c.bezierCurveTo(-0.5, 0.7, -0.85, 0.2, -0.82, -0.7); c.closePath(); c.fill();
    cut(c, () => { poly(c, [-0.5, -0.25, 0, 0.1, 0.5, -0.25, 0.5, -0.05, 0, 0.32, -0.5, -0.05]); c.fill(); });
  },
  target(c) {
    c.lineWidth = 0.12;
    c.beginPath(); c.arc(0, 0, 0.82, 0, TAU); c.stroke();
    c.beginPath(); c.arc(0, 0, 0.48, 0, TAU); c.stroke();
    c.beginPath(); c.arc(0, 0, 0.14, 0, TAU); c.fill();
    c.lineWidth = 0.1; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, -1.02); c.lineTo(0, -0.28); c.moveTo(0, 1.02); c.lineTo(0, 0.28); c.moveTo(-1.02, 0); c.lineTo(-0.28, 0); c.moveTo(1.02, 0); c.lineTo(0.28, 0); c.stroke();
  },
  coin(c) {
    c.beginPath(); c.arc(0, 0, 0.95, 0, TAU); c.fill();
    cut(c, () => { c.lineWidth = 0.07; c.beginPath(); c.arc(0, 0, 0.78, 0, TAU); c.stroke(); star(c, 5, 0.5, 0.21); c.fill(); });
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; cut(c, () => { c.beginPath(); c.arc(Math.cos(a) * 0.94, Math.sin(a) * 0.94, 0.035, 0, TAU); c.fill(); }); }
  },
  dice(c) {
    c.save(); c.rotate(-0.25);
    c.beginPath(); c.roundRect(-0.78, -0.78, 1.56, 1.56, 0.3); c.fill();
    cut(c, () => { for (const [x, y] of [[-0.4, -0.4], [0.4, -0.4], [0, 0], [-0.4, 0.4], [0.4, 0.4]]) { c.beginPath(); c.arc(x, y, 0.15, 0, TAU); c.fill(); } });
    c.restore();
  },
  clover(c) {
    for (let i = 0; i < 4; i++) {
      c.save(); c.rotate((i * Math.PI) / 2 + Math.PI / 4);
      c.beginPath(); c.moveTo(0, -0.05); c.bezierCurveTo(-0.62, -0.5, -0.32, -1.02, 0, -0.66); c.bezierCurveTo(0.32, -1.02, 0.62, -0.5, 0, -0.05); c.fill();
      c.restore();
    }
    c.lineWidth = 0.1; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, 0.1); c.quadraticCurveTo(0.1, 0.6, 0.4, 0.95); c.stroke();
  },
  blossom(c) {
    for (let i = 0; i < 5; i++) {
      c.save(); c.rotate((i * TAU) / 5);
      c.beginPath(); c.moveTo(0, -0.12);
      c.bezierCurveTo(-0.5, -0.4, -0.38, -0.95, -0.12, -0.98); c.lineTo(0, -0.84); c.lineTo(0.12, -0.98);
      c.bezierCurveTo(0.38, -0.95, 0.5, -0.4, 0, -0.12); c.fill();
      c.restore();
    }
    cut(c, () => { c.beginPath(); c.arc(0, 0, 0.2, 0, TAU); c.fill(); });
    for (let i = 0; i < 5; i++) { const a = (i * TAU) / 5 + 0.6; c.beginPath(); c.arc(Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.05, 0, TAU); c.fill(); }
  },
  palm(c) {
    c.lineCap = 'round';
    c.lineWidth = 0.14;
    c.beginPath(); c.moveTo(0.15, 1); c.quadraticCurveTo(0.2, 0.2, -0.05, -0.35); c.stroke();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.55;
      c.save(); c.translate(-0.05, -0.38); c.rotate(a);
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(0.45, -0.25, 0.9, 0.12); c.quadraticCurveTo(0.45, -0.05, 0, 0); c.fill();
      c.restore();
    }
    c.beginPath(); c.arc(-0.12, -0.25, 0.09, 0, TAU); c.arc(0.06, -0.22, 0.09, 0, TAU); c.fill();
  },
  gear(c) {
    c.beginPath();
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = a0 + TAU / n / 2;
      c.lineTo(Math.cos(a0 - 0.08) * 0.98, Math.sin(a0 - 0.08) * 0.98);
      c.lineTo(Math.cos(a0 + 0.2) * 0.98, Math.sin(a0 + 0.2) * 0.98);
      c.lineTo(Math.cos(a1 + 0.05) * 0.74, Math.sin(a1 + 0.05) * 0.74);
      c.lineTo(Math.cos(a1 + 0.3) * 0.74, Math.sin(a1 + 0.3) * 0.74);
    }
    c.closePath(); c.fill();
    cut(c, () => { c.beginPath(); c.arc(0, 0, 0.32, 0, TAU); c.fill(); });
  },
  anvil(c) {
    c.beginPath();
    c.moveTo(-1, -0.45); c.lineTo(0.95, -0.45); c.lineTo(0.95, -0.2);
    c.quadraticCurveTo(0.45, -0.18, 0.32, 0.12); c.lineTo(0.3, 0.42); c.lineTo(0.6, 0.65); c.lineTo(0.6, 0.85);
    c.lineTo(-0.6, 0.85); c.lineTo(-0.6, 0.65); c.lineTo(-0.3, 0.42); c.lineTo(-0.32, 0.1);
    c.quadraticCurveTo(-0.55, -0.15, -1, -0.2); c.closePath(); c.fill();
    // sparks
    c.lineWidth = 0.06; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0.1, -0.6); c.lineTo(0.05, -0.95); c.moveTo(0.3, -0.6); c.lineTo(0.55, -0.9); c.moveTo(-0.1, -0.6); c.lineTo(-0.35, -0.88); c.stroke();
  },
  claw(c) {
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 0.45;
      c.beginPath();
      c.moveTo(x - 0.28, -0.95);
      c.quadraticCurveTo(x + 0.28, -0.2, x + 0.1, 0.98);
      c.quadraticCurveTo(x + 0.02, -0.15, x - 0.28, -0.95);
      c.fill();
    }
  },
  paw(c) {
    c.beginPath(); c.ellipse(0, 0.38, 0.5, 0.42, 0, 0, TAU); c.fill();
    for (const [x, y, r] of [[-0.68, -0.15, 0.2], [-0.27, -0.55, 0.22], [0.27, -0.55, 0.22], [0.68, -0.15, 0.2]]) { c.beginPath(); c.ellipse(x, y, r, r * 1.25, x * 0.4, 0, TAU); c.fill(); }
  },
  chevron(c) {
    for (let i = 0; i < 3; i++) {
      const y = -0.1 + i * 0.36;
      poly(c, [-0.85, y, 0, y - 0.38, 0.85, y, 0.85, y + 0.2, 0, y - 0.18, -0.85, y + 0.2]); c.fill();
    }
    star(c, 5, 0.32, 0.13, 0, -0.72); c.fill();
  },
  trophy(c) {
    c.beginPath();
    c.moveTo(-0.6, -0.9); c.lineTo(0.6, -0.9); c.bezierCurveTo(0.6, -0.1, 0.35, 0.15, 0.1, 0.22);
    c.lineTo(0.1, 0.55); c.lineTo(0.42, 0.62); c.lineTo(0.42, 0.9); c.lineTo(-0.42, 0.9); c.lineTo(-0.42, 0.62); c.lineTo(-0.1, 0.55); c.lineTo(-0.1, 0.22);
    c.bezierCurveTo(-0.35, 0.15, -0.6, -0.1, -0.6, -0.9); c.closePath(); c.fill();
    c.lineWidth = 0.11;
    c.beginPath(); c.moveTo(-0.58, -0.75); c.bezierCurveTo(-1.05, -0.75, -0.95, -0.15, -0.42, -0.12); c.stroke();
    c.beginPath(); c.moveTo(0.58, -0.75); c.bezierCurveTo(1.05, -0.75, 0.95, -0.15, 0.42, -0.12); c.stroke();
    cut(c, () => { star(c, 5, 0.24, 0.1, 0, -0.5); c.fill(); });
  },
  wings(c) {
    for (const s of [-1, 1]) {
      c.save(); c.scale(s, 1);
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        const y = -0.55 + i * 0.26, L = 0.95 - i * 0.14;
        c.moveTo(0.18, y + 0.12); c.quadraticCurveTo(0.5, y - 0.2, 0.18 + L, y - 0.15 + i * 0.05); c.quadraticCurveTo(0.55, y + 0.12, 0.18, y + 0.3); c.fill();
      }
      c.restore();
    }
    c.beginPath(); c.arc(0, -0.15, 0.2, 0, TAU); c.fill();
    poly(c, [-0.14, 0.05, 0.14, 0.05, 0, 0.8]); c.fill();
  },
  ammo(c) {
    for (let i = -1; i <= 1; i++) {
      const x = i * 0.5, y = i === 0 ? -0.15 : 0;
      c.beginPath();
      c.moveTo(x - 0.17, y + 0.95); c.lineTo(x - 0.17, y - 0.25); c.quadraticCurveTo(x - 0.17, y - 0.75, x, y - 0.95); c.quadraticCurveTo(x + 0.17, y - 0.75, x + 0.17, y - 0.25); c.lineTo(x + 0.17, y + 0.95); c.closePath(); c.fill();
      cut(c, () => { c.fillRect(x - 0.2, y - 0.2, 0.4, 0.06); c.fillRect(x - 0.2, y + 0.72, 0.4, 0.05); });
    }
  },
  shell(c) {
    c.save(); c.rotate(-0.5);
    c.beginPath(); c.roundRect(-0.3, -0.95, 0.6, 1.3, 0.12); c.fill();
    c.beginPath(); c.roundRect(-0.36, 0.42, 0.72, 0.5, 0.06); c.fill();
    cut(c, () => { c.fillRect(-0.4, 0.36, 0.8, 0.07); for (let i = 0; i < 3; i++) c.fillRect(-0.3, -0.75 + i * 0.3, 0.6, 0.05); });
    c.restore();
  },
  butterfly(c) {
    for (const s of [-1, 1]) {
      c.save(); c.scale(s, 1);
      c.beginPath(); c.moveTo(0.06, -0.1); c.bezierCurveTo(0.4, -1.1, 1.15, -0.85, 0.9, -0.25); c.bezierCurveTo(0.8, 0, 0.4, 0.02, 0.06, 0); c.fill();
      c.beginPath(); c.moveTo(0.06, 0.05); c.bezierCurveTo(0.6, 0.05, 0.85, 0.45, 0.6, 0.75); c.bezierCurveTo(0.4, 0.95, 0.12, 0.6, 0.06, 0.12); c.fill();
      cut(c, () => { c.beginPath(); c.arc(0.58, -0.42, 0.14, 0, TAU); c.fill(); c.beginPath(); c.arc(0.42, 0.42, 0.09, 0, TAU); c.fill(); });
      c.restore();
    }
    c.beginPath(); c.ellipse(0, 0.05, 0.07, 0.62, 0, 0, TAU); c.fill();
    c.lineWidth = 0.04; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, -0.5); c.quadraticCurveTo(-0.1, -0.85, -0.25, -0.95); c.moveTo(0, -0.5); c.quadraticCurveTo(0.1, -0.85, 0.25, -0.95); c.stroke();
  },
  joystick(c) {
    c.beginPath(); c.roundRect(-0.85, 0.35, 1.7, 0.55, 0.15); c.fill();
    c.fillRect(-0.07, -0.35, 0.14, 0.75);
    c.beginPath(); c.arc(0, -0.55, 0.32, 0, TAU); c.fill();
    c.beginPath(); c.arc(0.55, 0.62, 0.12, 0, TAU); c.arc(-0.55, 0.62, 0.12, 0, TAU); c.fill();
    cut(c, () => { c.beginPath(); c.arc(0.55, 0.62, 0.07, 0, TAU); c.fill(); c.beginPath(); c.arc(-0.55, 0.62, 0.07, 0, TAU); c.fill(); });
  },
  drop(c) {
    c.beginPath(); c.moveTo(0, -1); c.bezierCurveTo(0.25, -0.55, 0.75, -0.1, 0.75, 0.32); c.arc(0, 0.32, 0.75, 0, Math.PI); c.bezierCurveTo(-0.75, -0.1, -0.25, -0.55, 0, -1); c.fill();
    cut(c, () => { c.beginPath(); c.ellipse(-0.32, 0.25, 0.12, 0.25, 0.3, 0, TAU); c.fill(); });
  },
  firework(c) {
    c.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU, r0 = 0.25, r1 = i % 2 ? 0.75 : 0.95;
      c.lineWidth = i % 2 ? 0.06 : 0.09;
      c.beginPath(); c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); c.stroke();
      c.beginPath(); c.arc(Math.cos(a) * (r1 + 0.08), Math.sin(a) * (r1 + 0.08), 0.06, 0, TAU); c.fill();
    }
    c.beginPath(); c.arc(0, 0, 0.14, 0, TAU); c.fill();
  },
  seven(c) {
    poly(c, [-0.7, -0.9, 0.75, -0.9, 0.75, -0.62, 0.05, 0.95, -0.38, 0.95, 0.28, -0.6, -0.7, -0.6]); c.fill();
    star(c, 4, 0.26, 0.07, -0.62, 0.45); c.fill();
  },
  snake(c) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.lineWidth = 0.26;
    c.beginPath(); c.moveTo(-0.55, 0.9); c.bezierCurveTo(0.6, 0.9, 0.7, 0.2, 0, 0.05); c.bezierCurveTo(-0.7, -0.1, -0.6, -0.65, 0.15, -0.68); c.stroke();
    c.beginPath(); c.ellipse(0.35, -0.7, 0.3, 0.2, -0.1, 0, TAU); c.fill();
    cut(c, () => { c.beginPath(); c.arc(0.42, -0.76, 0.05, 0, TAU); c.fill(); });
    c.lineWidth = 0.04;
    c.beginPath(); c.moveTo(0.64, -0.72); c.lineTo(0.85, -0.7); c.lineTo(0.95, -0.78); c.moveTo(0.85, -0.7); c.lineTo(0.95, -0.62); c.stroke();
  },
  pumpkin(c) {
    for (const [x, rx] of [[-0.45, 0.45], [0.45, 0.45], [0, 0.5]]) { c.beginPath(); c.ellipse(x, 0.15, rx, 0.75, 0, 0, TAU); c.fill(); }
    c.fillRect(-0.08, -0.85, 0.16, 0.3);
    cut(c, () => { poly(c, [-0.45, -0.05, -0.2, -0.05, -0.32, -0.3]); c.fill(); poly(c, [0.45, -0.05, 0.2, -0.05, 0.32, -0.3]); c.fill(); poly(c, [-0.55, 0.3, 0.55, 0.3, 0.3, 0.6, 0.1, 0.45, -0.1, 0.6, -0.3, 0.45]); c.fill(); });
  },
};

export const EMBLEM_KEYS = () => Object.keys(EMBLEMS);
