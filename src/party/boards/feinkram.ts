// Fine detail for every board ("Kleinkram"): a second level of detail on surfaces (paving with
// joints, moss and stains; wood planks; roof tiles; façades with framed windows, sills, curtains
// and flower boxes), atlas decals (posters, graffiti, shop signs that light up at night) as one
// merged mesh each, painted path markings, litter along the path edges (leaves, confetti,
// puddles), the props on special spaces (a stall at every shop, a ring at every duel), fairy
// lights and washing lines.
// Everything builds once into instanced or merged meshes with shared materials; nothing here runs
// per frame (life and reactions are in leben.ts).

import type { BEdge, BNode, BoardGraph } from './types';
import type { Atmo } from '../view3d/atmo';
import { BOX, Batch, CONE, CYL8, FONT, GRAD, THREE, ctex, groundAniso, markShared } from '../view3d/kit';
import { aoAdd } from '../view3d/fx3d';
import { glowEmi } from '../view3d/shaderfx';
import { TAU } from '../util';
import { BULB, LEAF, type P2 } from './bauteile';
import type { Item } from './details';
import { flatBatch, groundCoins, lifeConfigOf, nearOnly, pigeons, spectators, spotFilterOf } from './leben';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

const _v = new THREE.Vector3(), _n3 = new THREE.Matrix3();
/** Appends a vertex-coloured geometry (e.g. another Batch's) to `b`, transformed by `m`, keeping
 *  its colours (Batch.addM paints everything in one colour). */
export function addColored(b: Batch, g: THREE.BufferGeometry, m: THREE.Matrix4, tint?: THREE.Color) {
  const P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color;
  const tr = tint?.r ?? 1, tg = tint?.g ?? 1, tb = tint?.b ?? 1;
  _n3.getNormalMatrix(m);
  for (let i = 0; i < P.count; i++) {
    _v.fromBufferAttribute(P as THREE.BufferAttribute, i).applyMatrix4(m); b.P.push(_v.x, _v.y, _v.z);
    _v.fromBufferAttribute(N as THREE.BufferAttribute, i).applyMatrix3(_n3).normalize(); b.N.push(_v.x, _v.y, _v.z);
    if (C) b.C.push(C.getX(i) * tr, C.getY(i) * tg, C.getZ(i) * tb); else b.C.push(tr, tg, tb);
  }
  if (g.index) { const ix = g.index.array; for (let i = 0; i < ix.length; i++) b.I.push(ix[i] + b.n); }
  else for (let i = 0; i < P.count; i++) b.I.push(i + b.n);
  b.n += P.count;
  return b;
}
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _tc = new THREE.Color();
/**
 * Like details.instanced, but merged into a Batch (one draw call together with everything else
 * in it): every item is a tinted, placed copy of `geo`. Static only. Ground items get the same
 * soft contact shadow as instanced props (`ao`, 0 = none).
 */
export function bake(b: Batch, geo: THREE.BufferGeometry, items: Item[], o: { sc?: THREE.Scene; ao?: number } = {}) {
  let bb: THREE.Box3 | null = null;
  for (const it of items) {
    const s = it.s ?? 1, ry = it.ry ?? 0;
    _m4.compose(_p.set(it.x, it.y ?? 0, it.z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(s * (it.sx ?? 1), s * (it.sy ?? 1), s * (it.sz ?? 1)));
    addColored(b, geo, _m4, _tc.set(it.c ?? '#ffffff'));
    if (o.sc && (o.ao ?? 0) > 0 && (it.y ?? 0) <= 0.25) {
      if (!bb) { geo.computeBoundingBox(); bb = geo.boundingBox!; }
      const w = (bb.max.x - bb.min.x) * s * (it.sx ?? 1), d = (bb.max.z - bb.min.z) * s * (it.sz ?? 1);
      aoAdd(o.sc, it.x, it.z, w * 1.3 + 0.4, d * 1.3 + 0.4, ry, o.ao!);
    }
  }
  return b;
}
/** Vertex-coloured flat detail lying on another surface (markings, litter): pushed forward in depth. */
export const VC_FLAT = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
/** A thin wire or rope (3 sides, no caps): a sixth of the triangles of CYL8. */
export const WIRE = new THREE.CylinderGeometry(1, 1, 1, 3, 1, true);
markShared(WIRE);

// ---------------------------------------------------------------- surfaces
/**
 * A `deco` for details.groundTex: every big tile is laid as smaller pavers (`sub`: 'brick' rows
 * with offset joints, 'grid' squares, or 'none'), with moss in some joints, soft stains, a few
 * chipped corners and cracks. Colours are rgba strings so they work on any base colour.
 */
export function pavingDeco(o: { sub?: 'brick' | 'grid' | 'none'; joint?: string; moss?: number; stain?: number; mossC?: string; stainC?: string; extra?: (g: CanvasRenderingContext2D, x: number, y: number, s: number, k: number) => void } = {}) {
  const joint = o.joint ?? 'rgba(40,40,70,.22)', mossC = o.mossC ?? 'rgba(70,150,70,.55)', stainC = o.stainC ?? 'rgba(40,30,60,.10)';
  return (g: CanvasRenderingContext2D, x: number, y: number, S: number, k: number) => {
    const sub = o.sub ?? 'brick';
    g.strokeStyle = joint; g.lineWidth = 1.2;
    if (sub === 'brick') {
      const rows = 4, h = S / rows;
      for (let r = 1; r < rows; r++) { g.beginPath(); g.moveTo(x, y + r * h); g.lineTo(x + S, y + r * h); g.stroke(); }
      for (let r = 0; r < rows; r++) for (let c = 0; c < 2; c++) { const xx = x + ((c + (r % 2) * 0.5) * S) / 2; if (xx > x + 1 && xx < x + S - 1) { g.beginPath(); g.moveTo(xx, y + r * h); g.lineTo(xx, y + (r + 1) * h); g.stroke(); } }
    } else if (sub === 'grid') {
      g.beginPath(); g.moveTo(x + S / 2, y); g.lineTo(x + S / 2, y + S); g.moveTo(x, y + S / 2); g.lineTo(x + S, y + S / 2); g.stroke();
    }
    // moss creeping out of the joints
    if (Math.random() < (o.moss ?? 0.35)) {
      g.fillStyle = mossC;
      const along = Math.random() < 0.5, base = along ? y + (Math.floor(Math.random() * 4) * S) / 4 : x + (Math.floor(Math.random() * 2) * S) / 2;
      for (let i = 0; i < 14; i++) { const t = rnd(0.1, 0.9) * S; g.beginPath(); g.arc(along ? x + t : base + rnd(-1.5, 1.5), along ? base + rnd(-1.5, 1.5) : y + t, rnd(0.8, 2.2), 0, TAU); g.fill(); }
    }
    // soft stains
    if (Math.random() < (o.stain ?? 0.3)) {
      const cx = x + rnd(0.2, 0.8) * S, cy = y + rnd(0.2, 0.8) * S, r = rnd(5, 13);
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, stainC); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    // a chipped corner or a hairline crack now and then
    if (k === 5) { g.fillStyle = 'rgba(0,0,0,.12)'; g.beginPath(); g.moveTo(x + S, y); g.lineTo(x + S - 7, y); g.lineTo(x + S, y + 6); g.fill(); }
    if (k === 1) { g.strokeStyle = 'rgba(30,30,50,.25)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x + S * 0.2, y + S * 0.7); g.lineTo(x + S * 0.4, y + S * 0.55); g.lineTo(x + S * 0.45, y + S * 0.3); g.stroke(); }
    o.extra?.(g, x, y, S, k);
  };
}

/** Wooden planks along u with joints, grain, knots and nail heads (repeat; white-ish for tint or a wood colour). */
export function woodTex(o: { base?: string; dark?: string; planks?: number } = {}) {
  const N = o.planks ?? 6, base = o.base ?? '#c79a6a', dark = o.dark ?? '#7a5636';
  const t = ctex(256, 128, (g) => {
    const h = 128 / N;
    for (let i = 0; i < N; i++) {
      g.fillStyle = base; g.fillRect(0, i * h, 256, h);
      const v = rnd(-0.12, 0.12);
      g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`; g.fillRect(0, i * h, 256, h);
      g.strokeStyle = 'rgba(80,50,30,.25)'; g.lineWidth = 0.8;
      for (let k = 0; k < 4; k++) { const yy = i * h + rnd(2, h - 2); g.beginPath(); g.moveTo(0, yy); for (let x = 0; x <= 256; x += 32) g.lineTo(x, yy + Math.sin(x * 0.05 + k) * 1.2); g.stroke(); }
      if (Math.random() < 0.6) { g.fillStyle = 'rgba(90,55,30,.45)'; g.beginPath(); g.ellipse(rnd(20, 236), i * h + h / 2, 4, 2, 0, 0, TAU); g.fill(); }
      const cut = rnd(40, 216);
      g.fillStyle = dark; g.fillRect(cut, i * h, 1.5, h);
      g.fillStyle = 'rgba(40,30,30,.7)';
      for (const x of [cut - 5, cut + 6]) for (const yy of [i * h + 4, i * h + h - 4]) { g.beginPath(); g.arc(x, yy, 1.1, 0, TAU); g.fill(); }
      g.fillStyle = dark; g.fillRect(0, i * h + h - 1.5, 256, 1.5);
    }
  }, true);
  t.anisotropy = groundAniso();
  return t;
}

/** Roof tiles in scalloped rows (white-based, tint per instance). */
export function roofTex() {
  return ctex(64, 64, (g) => {
    g.fillStyle = '#e6e0ee'; g.fillRect(0, 0, 64, 64);
    for (let r = 0; r < 6; r++) for (let c = -1; c < 6; c++) {
      const x = c * 12 + (r % 2) * 6, y = r * 11;
      g.fillStyle = Math.random() < 0.15 ? '#d4cce0' : '#ffffff';
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 12, y); g.lineTo(x + 12, y + 7); g.arc(x + 6, y + 7, 6, 0, Math.PI); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(60,40,80,.35)'; g.lineWidth = 1; g.stroke();
    }
  }, true);
}

/**
 * Façade texture: a grid of `cols` × `rows` windows per tile with frames, a cross bar, sills,
 * curtains, flower boxes and shutters, a faint plaster texture, and the lit-window emissive map
 * to go with it (only the panes light up). White-based: the instance colour paints the wall.
 */
export function facadeTex(o: { cols?: number; rows?: number; lit?: number; litColors?: string[] } = {}) {
  const C = o.cols ?? 4, R = o.rows ?? 8, W = 128, H = 256, cw = W / C, ch = H / R;
  type Win = { kind: number; curtain: string | null; lit: string | null };
  const wins: Win[] = [];
  for (let i = 0; i < C * R; i++) wins.push({ kind: Math.floor(Math.random() * 6), curtain: Math.random() < 0.35 ? pick(['#ff9ad0', '#ffe680', '#9ee8ff', '#c8a8ff']) : null, lit: Math.random() < (o.lit ?? 0.45) ? pick(o.litColors ?? ['#ffe680', '#8ff3ff', '#ffb3e0', '#ffd08a']) : null });
  const pane = (g: CanvasRenderingContext2D, i: number, j: number) => { const x = i * cw, y = j * ch; return { x: x + cw * 0.2, y: y + ch * 0.16, w: cw * 0.6, h: ch * 0.62 }; };
  const map = ctex(W, H, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 500; k++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,.035)' : 'rgba(255,255,255,.5)'; g.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5); }
    // storey bands
    for (let j = 0; j <= R; j++) { g.fillStyle = 'rgba(60,40,90,.10)'; g.fillRect(0, j * ch - 1, W, 2); }
    for (let j = 0; j < R; j++) for (let i = 0; i < C; i++) {
      const w = wins[j * C + i], p = pane(g, i, j);
      // shutters on some windows
      if (w.kind === 4) { g.fillStyle = 'rgba(70,60,120,.35)'; g.fillRect(p.x - 4, p.y, 3.5, p.h); g.fillRect(p.x + p.w + 0.5, p.y, 3.5, p.h); }
      // frame + glass with a reflection streak
      g.fillStyle = '#f4f0ff'; g.fillRect(p.x - 1.6, p.y - 1.6, p.w + 3.2, p.h + 3.2);
      g.strokeStyle = 'rgba(50,30,90,.45)'; g.lineWidth = 0.8; g.strokeRect(p.x - 1.6, p.y - 1.6, p.w + 3.2, p.h + 3.2);
      const gr = g.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h);
      gr.addColorStop(0, '#d8d0f4'); gr.addColorStop(0.5, '#a89ed4'); gr.addColorStop(1, '#bfb6e6');
      g.fillStyle = gr; g.fillRect(p.x, p.y, p.w, p.h);
      g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(p.x + 2, p.y + p.h - 2); g.lineTo(p.x + p.w * 0.45, p.y + 2); g.lineTo(p.x + p.w * 0.6, p.y + 2); g.lineTo(p.x + 5, p.y + p.h - 2); g.fill();
      if (w.curtain) { g.fillStyle = w.curtain; g.fillRect(p.x, p.y, p.w * 0.28, p.h); g.fillRect(p.x + p.w * 0.72, p.y, p.w * 0.28, p.h); }
      // cross bar
      g.fillStyle = '#f4f0ff'; g.fillRect(p.x + p.w / 2 - 0.8, p.y, 1.6, p.h); if (w.kind !== 2) g.fillRect(p.x, p.y + p.h * 0.42, p.w, 1.4);
      // sill / flower box
      g.fillStyle = 'rgba(60,40,90,.5)'; g.fillRect(p.x - 3, p.y + p.h + 1.6, p.w + 6, 2.2);
      if (w.kind === 1 || w.kind === 5) {
        g.fillStyle = '#b8744a'; g.fillRect(p.x - 1, p.y + p.h - 1, p.w + 2, 3.5);
        for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? '#3fbf6a' : pick(['#ff5fae', '#ffd23f', '#ff8a5c']); g.beginPath(); g.arc(p.x + 1 + (k * p.w) / 5, p.y + p.h - 2, 1.8, 0, TAU); g.fill(); }
      }
    }
  }, true);
  const emi = ctex(W, H, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    for (let j = 0; j < R; j++) for (let i = 0; i < C; i++) {
      const w = wins[j * C + i];
      if (!w.lit) continue;
      const p = pane(g, i, j);
      g.fillStyle = w.lit; g.fillRect(p.x, p.y, p.w, p.h);
      if (w.curtain) { g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(p.x, p.y, p.w * 0.28, p.h); g.fillRect(p.x + p.w * 0.72, p.y, p.w * 0.28, p.h); }
      g.fillStyle = '#000'; g.fillRect(p.x + p.w / 2 - 0.8, p.y, 1.6, p.h); if (w.kind !== 2) g.fillRect(p.x, p.y + p.h * 0.42, p.w, 1.4);
    }
  }, true);
  return { map, emi };
}

// ---------------------------------------------------------------- atlas decals
/** One canvas texture with `cols` × `rows` cells, each drawn by its own function (cell size px). */
export function atlasTex(cells: ((g: CanvasRenderingContext2D, w: number, h: number) => void)[], cols: number, rows: number, cw = 128, chh = 128) {
  return ctex(cols * cw, rows * chh, (g) => {
    cells.forEach((draw, i) => {
      const cx = (i % cols) * cw, cy = Math.floor(i / cols) * chh;
      g.save(); g.translate(cx, cy); g.beginPath(); g.rect(0, 0, cw, chh); g.clip(); draw(g, cw, chh); g.restore();
    });
  });
}
export interface Quad { x: number; y: number; z: number; ry: number; w: number; h: number; cell: number; tilt?: number; /** cells wide (a wide picture over neighbouring cells) */ span?: number }
/** Many textured quads (facing +z before `ry`) as ONE geometry, each showing one atlas cell. */
export function atlasQuads(items: Quad[], cols: number, rows: number) {
  const P: number[] = [], N: number[] = [], U: number[] = [], I: number[] = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Matrix4(), e = new THREE.Euler();
  items.forEach((q, k) => {
    m.makeRotationFromEuler(e.set(q.tilt ?? 0, q.ry, 0, 'YXZ')).setPosition(q.x, q.y, q.z);
    n.set(0, 0, 1).transformDirection(m);
    const u0 = (q.cell % cols) / cols, v0 = 1 - (Math.floor(q.cell / cols) + 1) / rows;
    const corners: [number, number, number, number][] = [[-0.5, -0.5, 0, 0], [0.5, -0.5, 1, 0], [0.5, 0.5, 1, 1], [-0.5, 0.5, 0, 1]];
    for (const [cx, cy, cu, cv] of corners) {
      v.set(cx * q.w, cy * q.h, 0).applyMatrix4(m);
      P.push(v.x, v.y, v.z); N.push(n.x, n.y, n.z);
      U.push(u0 + ((cu * 0.98 + 0.01) * (q.span ?? 1)) / cols, v0 + (cv * 0.98 + 0.01) / rows);
    }
    const b = k * 4;
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  g.computeBoundingSphere();
  return g;
}
/** Material for wall decals (posters, graffiti): lit like the walls, cut out by alpha. */
export function decalMat(map: THREE.Texture) {
  return new THREE.MeshToonMaterial({ map, gradientMap: GRAD, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}
/** Material for shop signs and screens that light up at dusk (and bloom at night). */
export function litMat(map: THREE.Texture, atmo: Atmo | null, day = 0.35, night = 1.25, o: { alpha?: boolean; side?: THREE.Side } = {}) {
  const m = glowEmi(new THREE.MeshToonMaterial({ map, emissiveMap: map, emissive: '#ffffff', emissiveIntensity: day, gradientMap: GRAD, alphaTest: o.alpha ? 0.5 : 0, side: o.side ?? THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0.9);
  atmo?.emissive(m, day, night);
  return m;
}

/** Bold sign text on a dark plate with a coloured frame (an atlas cell). */
export function signCell(text: string, fg: string, frame: string, bg = '#1a0b33', icon?: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  return (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.fillStyle = bg; g.beginPath(); g.roundRect(3, 3, w - 6, h - 6, 10); g.fill();
    g.strokeStyle = frame; g.lineWidth = 5; g.stroke();
    icon?.(g, w, h);
    let size = Math.min(h * 0.42, (w * 1.5) / Math.max(3, text.length));
    g.font = `italic 900 ${size}px ${FONT}`;
    while (g.measureText(text).width > w - 16 && size > 8) { size -= 2; g.font = `italic 900 ${size}px ${FONT}`; }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg; g.shadowColor = fg; g.shadowBlur = 6;
    g.fillText(text, w / 2, icon ? h * 0.7 : h / 2 + 2);
    g.shadowBlur = 0;
  };
}
/** A paper poster with a headline, a picture blob and small print (an atlas cell, alpha edges). */
export function posterCell(title: string, c1: string, c2: string, motif: 'star' | 'note' | 'heart' | 'ball' | 'mask' = 'star') {
  return (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.fillStyle = c1; g.fillRect(8, 6, w - 16, h - 12);
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(8, 6, w - 16, 18);
    g.fillStyle = c2; g.beginPath();
    const cx = w / 2, cy = h * 0.5;
    if (motif === 'star') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 11 : 26; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } }
    else if (motif === 'heart') { g.moveTo(cx, cy + 20); g.bezierCurveTo(cx - 34, cy - 4, cx - 14, cy - 28, cx, cy - 10); g.bezierCurveTo(cx + 14, cy - 28, cx + 34, cy - 4, cx, cy + 20); }
    else if (motif === 'note') { g.ellipse(cx - 8, cy + 14, 10, 7, -0.4, 0, TAU); g.rect(cx, cy - 22, 4, 36); g.rect(cx, cy - 22, 18, 6); }
    else if (motif === 'ball') { g.arc(cx, cy, 22, 0, TAU); }
    else { g.ellipse(cx, cy, 26, 18, 0, 0, TAU); }
    g.fill();
    if (motif === 'ball') { g.strokeStyle = c1; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 22, 0.6, 2.4); g.stroke(); }
    if (motif === 'mask') { g.fillStyle = c1; g.beginPath(); g.ellipse(cx - 10, cy - 2, 6, 4, 0, 0, TAU); g.ellipse(cx + 10, cy - 2, 6, 4, 0, 0, TAU); g.fill(); }
    let size = 22;
    g.font = `italic 900 ${size}px ${FONT}`;
    while (g.measureText(title).width > w - 24 && size > 8) { size -= 1; g.font = `italic 900 ${size}px ${FONT}`; }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffffff'; g.fillText(title, w / 2, 22);
    g.fillStyle = 'rgba(255,255,255,.7)'; for (let k = 0; k < 3; k++) g.fillRect(20, h - 30 + k * 6, w - 40 - k * 14, 3);
    // a torn corner
    g.clearRect(w - 22, h - 14, 14, 8);
  };
}
/** A graffiti tag: fat outlined letters with a drop shadow and a few drips (an atlas cell, alpha). */
export function tagCell(text: string, fill: string, line: string) {
  return (g: CanvasRenderingContext2D, w: number, h: number) => {
    let size = h * 0.6;
    g.font = `italic 900 ${size}px ${FONT}`;
    while (g.measureText(text).width > w - 14 && size > 10) { size -= 2; g.font = `italic 900 ${size}px ${FONT}`; }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.save(); g.translate(w / 2, h / 2); g.rotate(-0.12);
    g.lineWidth = 10; g.strokeStyle = 'rgba(20,10,40,.9)'; g.strokeText(text, 3, 4);
    g.lineWidth = 6; g.strokeStyle = line; g.strokeText(text, 0, 0);
    const gr = g.createLinearGradient(0, -size / 2, 0, size / 2); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, fill); gr.addColorStop(1, fill);
    g.fillStyle = gr; g.fillText(text, 0, 0);
    g.fillStyle = fill; for (let k = 0; k < 4; k++) { const x = rnd(-w / 3, w / 3); g.fillRect(x, size * 0.25, 2.5, rnd(8, 20)); g.beginPath(); g.arc(x + 1.2, size * 0.25 + 20, 2.5, 0, TAU); g.fill(); }
    g.restore();
  };
}

// ---------------------------------------------------------------- path markings and edge litter
const CHEVRON = (() => {
  const s = new THREE.Shape();
  ([[0, -0.5], [0.42, 0.05], [0.24, 0.05], [0, -0.22], [-0.24, 0.05], [-0.42, 0.05]] as const).forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2);
})();
const FLAT = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const LEAF_FLAT = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5); s.quadraticCurveTo(0.42, 0, 0, 0.5); s.quadraticCurveTo(-0.42, 0, 0, -0.5);
  return new THREE.ShapeGeometry(s, 2).rotateX(-Math.PI / 2);
})();
const PUDDLE = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);

/**
 * Painted markings on path ribbons: a dashed centre line and an arrow in the walking direction
 * on every `every`-th path piece. `y` is the top of the ribbon.
 */
export function pathMarks(sc: THREE.Scene, nodes: BNode[], edges: BEdge[], o: { y?: number; color?: string; arrow?: string; every?: number; gap?: number } = {}) {
  const y = (o.y ?? 0.1) + 0.004, dashes: Item[] = [], arrows: Item[] = [], gap = o.gap ?? 1.45;
  edges.forEach((e, i) => {
    const A = nodes[e.a], B = nodes[e.b], dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
    const free = L - gap * 2;
    if (free < 0.5) return;
    const ux = dx / L, uz = dz / L;
    if (i % (o.every ?? 3) === 0 && free > 1.1) arrows.push({ x: A.x + ux * (L / 2), y, z: A.z + uz * (L / 2), ry: yaw, s: 0.62, c: o.arrow ?? '#ffffff' });
    else {
      const n = Math.max(1, Math.floor(free / 0.7));
      for (let k = 0; k < n; k++) { const t = gap + ((k + 0.5) * free) / n; dashes.push({ x: A.x + ux * t, y, z: A.z + uz * t, ry: yaw, sx: 0.08, sz: 0.34, c: o.color ?? '#ffffff' }); }
    }
  });
  // into the scene's flat batch (one near-only mesh with the litter, see sharedDetail)
  const b = flatBatch(sc);
  bake(b, FLAT, dashes);
  bake(b, CHEVRON, arrows);
}

/**
 * Litter along the path edges (shown close up only): leaves, confetti and a few small puddles
 * that mirror the sky a little. `ok(x, z)` says where litter may lie (not in water, buildings).
 */
export function edgeLitter(sc: THREE.Scene, nodes: BNode[], edges: BEdge[], o: { ok?: (x: number, z: number) => boolean; leaves?: string[]; confetti?: string[]; per?: number; puddles?: number; puddleC?: string; y?: number } = {}) {
  const leaves = o.leaves ?? ['#7bc65a', '#a8d04a', '#e8a33a', '#d86a3a', '#5fae5a'];
  const conf = o.confetti ?? ['#ff4fb0', '#ffd23f', '#35d4ff', '#b8f02a', '#b46bff', '#ffffff'];
  const L: Item[] = [], Cf: Item[] = [], Pd: Item[] = [], y = o.y ?? 0.015;
  const per = o.per ?? 4;
  for (const e of edges) {
    const A = nodes[e.a], B = nodes[e.b], dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz);
    if (len < 2.4) continue;
    const ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
    for (let k = 0; k < per; k++) {
      const t = rnd(1.2, len - 1.2), side = Math.random() < 0.5 ? -1 : 1, off = rnd(1.0, 1.7) * side;
      const x = A.x + ux * t + nx * off, z = A.z + uz * t + nz * off;
      if (o.ok && !o.ok(x, z)) continue;
      if (Math.random() < 0.55) L.push({ x, y, z, ry: rnd(0, TAU), s: rnd(0.16, 0.26), sx: 0.7, c: pick(leaves) });
      else Cf.push({ x, y, z, ry: rnd(0, TAU), s: rnd(0.07, 0.11), c: pick(conf) });
    }
    if (Pd.length < (o.puddles ?? 10) && Math.random() < 0.18) {
      const t = rnd(1.5, len - 1.5), side = Math.random() < 0.5 ? -1 : 1, x = A.x + ux * t + nx * 1.15 * side, z = A.z + uz * t + nz * 1.15 * side;
      if (!o.ok || o.ok(x, z)) Pd.push({ x, y: y + 0.004, z, ry: Math.atan2(dx, dz) + rnd(-0.4, 0.4), s: rnd(0.35, 0.55), sz: rnd(1.3, 1.9), c: '#ffffff' });
    }
  }
  // into the scene's flat batch: puddles are opaque, sky-blue with a bright glint
  const b = flatBatch(sc);
  bake(b, LEAF_FLAT, L);
  bake(b, FLAT, Cf);
  const pc = o.puddleC ?? '#a8d0ff';
  bake(b, PUDDLE, Pd.map((p) => ({ ...p, c: pc })));
  bake(b, FLAT, Pd.map((p) => ({ x: p.x + Math.sin((p.ry ?? 0) + 1.2) * 0.12, y: (p.y ?? 0) + 0.003, z: p.z + Math.cos((p.ry ?? 0) + 1.2) * 0.12, ry: p.ry, sx: 0.06, sz: (p.sz ?? 1) * (p.s ?? 1) * 0.9, c: '#ffffff' })));
}

// ---------------------------------------------------------------- special spaces
/** Direction (yaw) at a node that is furthest from all its paths, preferring the back (−z, away from the camera). */
export function freeYaw(nodes: BNode[], edges: BEdge[], id: number) {
  const n = nodes[id], dirs: number[] = [];
  for (const e of edges) { if (e.a === id || e.b === id) { const m = nodes[e.a === id ? e.b : e.a]; dirs.push(Math.atan2(m.x - n.x, m.z - n.z)); } }
  let best = Math.PI, bs = -1e9;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU - Math.PI;
    let d = Math.PI;
    for (const q of dirs) { let x = Math.abs(a - q) % TAU; if (x > Math.PI) x = TAU - x; d = Math.min(d, x); }
    const score = d + Math.cos(a - Math.PI) * 0.45;
    if (score > bs) { bs = score; best = a; }
  }
  return best;
}
/**
 * Props that belong to a special space, merged into `b`: a little market stall behind every shop
 * (striped awning, counter with goods, a price board) and a boxing ring around every duel
 * (corner posts with ropes). `top` is the height of the space's top face.
 */
export function spaceProps(b: Batch, nodes: BNode[], edges: BEdge[], top: number) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), e = new THREE.Euler();
  for (const n of nodes) {
    if (n.type === 'S') {
      const yaw = freeYaw(nodes, edges, n.id);
      const sub = new Batch();
      // counter at the back edge of the space, awning above it (front of the stall faces the space, -z local)
      sub.add(BOX, '#f4e6d0', 0, 0.35, 0, 0, 0, 0, 1.7, 0.7, 0.55);
      sub.add(BOX, '#b46bff', 0, 0.35, -0.28, 0, 0, 0, 1.6, 0.5, 0.02);
      for (let k = 0; k < 5; k++) sub.add(BOX, k % 2 ? '#ffd23f' : '#ffffff', -0.64 + k * 0.32, 0.44, -0.29, 0, 0, 0, 0.16, 0.06, 0.01);
      sub.add(BOX, '#8a5a3a', 0, 0.72, 0, 0, 0, 0, 1.78, 0.05, 0.6);
      // goods: fruit, jars, a gift box
      for (let k = 0; k < 4; k++) sub.add(LEAF, ['#ff5f6e', '#ffd23f', '#7be05a', '#ff9a5c'][k], -0.6 + k * 0.4, 0.83, 0.05, 0, 0, 0, 0.13);
      sub.add(CYL8, '#9fe3ff', 0.65, 0.86, -0.1, 0, 0, 0, 0.08, 0.2, 0.08); sub.add(CYL8, '#ff7ad0', 0.65, 0.97, -0.1, 0, 0, 0, 0.085, 0.03, 0.085);
      sub.add(BOX, '#35d4ff', -0.2, 0.86, -0.15, 0, 0.4, 0, 0.22, 0.22, 0.22); sub.add(BOX, '#ffd23f', -0.2, 0.86, -0.15, 0, 0.4, 0, 0.24, 0.05, 0.05);
      for (const sx of [-0.82, 0.82]) sub.add(CYL8, '#2a1258', sx, 1.05, 0.22, 0, 0, 0, 0.04, 2.1, 0.04);
      for (let k = 0; k < 6; k++) sub.add(BOX, k % 2 ? '#ffffff' : '#b46bff', -0.75 + k * 0.3, 2.0, -0.05, -0.42, 0, 0, 0.3, 0.04, 0.85);
      for (let k = 0; k < 6; k++) sub.add(CONE, k % 2 ? '#ffffff' : '#b46bff', -0.75 + k * 0.3, 1.74, -0.43, Math.PI, 0, 0, 0.15, 0.14, 0.05);
      sub.add(BOX, '#1a0b33', 0.55, 1.35, 0.25, 0, 0, 0, 0.5, 0.36, 0.04); sub.add(BOX, '#ffd23f', 0.55, 1.37, 0.23, 0, 0, 0, 0.3, 0.06, 0.01);
      const r = 1.62;
      m.compose(p.set(n.x + Math.sin(yaw) * r, 0, n.z + Math.cos(yaw) * r), q.setFromEuler(e.set(0, yaw + Math.PI, 0)), s);
      addColored(b, sub.geometry(), m);
    } else if (n.type === 'D') {
      // align the ring with the first path so the paths run through the side ropes, not the posts
      const e0 = edges.find((x) => x.a === n.id || x.b === n.id);
      const o = e0 ? nodes[e0.a === n.id ? e0.b : e0.a] : n;
      const yaw = Math.atan2(o.x - n.x, o.z - n.z);
      const R = 1.38, sub = new Batch();
      const corners: P2[] = [[-R, -R], [R, -R], [R, R], [-R, R]];
      corners.forEach(([x, z], i) => {
        sub.add(CYL8, '#e8e4f4', x, top + 0.45, z, 0, 0, 0, 0.07, 0.9, 0.07);
        sub.add(BOX, i % 2 ? '#ff3d6e' : '#2b9dff', x, top + 0.82, z, 0, 0, 0, 0.17, 0.2, 0.17);
      });
      for (let i = 0; i < 4; i++) {
        const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
        for (const h of [0.4, 0.68]) sub.beam([ax, top + h, az], [bx, top + h, bz], 0.024, i % 2 ? '#ffffff' : '#ff8a2e', WIRE);
      }
      m.compose(p.set(n.x, 0, n.z), q.setFromEuler(e.set(0, yaw + Math.PI / 4 * 0, 0)), s);
      addColored(b, sub.geometry(), m);
    }
  }
  return b;
}

// ---------------------------------------------------------------- fairy lights, washing lines
/** Bulbs whose glow follows the lamps of the atmosphere (dim by day, bright and blooming at
 *  night); vertex colours give each bulb its colour. One material per board. */
export function bulbMat(atmo: Atmo | null, day = 0.35, night = 1.6) {
  const u = { value: day };
  const m = glowEmi(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD, emissive: '#000000' }), 1);
  m.onBeforeCompile = (s) => {
    s.uniforms.uBulbK = u;
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uBulbK;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance = vColor.rgb * uBulbK;');
  };
  m.customProgramCacheKey = () => 'bulbs';
  atmo?.on((L) => { u.value = day + (night - day) * L.glow; });
  return m;
}
/** A sagging string of fairy lights from a to b: the wire into `wire`, the bulbs into `bulbs`. */
export function fairyString(wire: Batch, bulbs: Batch, a: [number, number, number], b: [number, number, number], o: { n?: number; sag?: number; colors?: string[]; size?: number } = {}) {
  const n = o.n ?? 8, sag = o.sag ?? 0.5, cols = o.colors ?? ['#ffe680', '#ff7ad0', '#8ff3ff', '#b8f02a'];
  const at = (k: number): [number, number, number] => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k - Math.sin(k * Math.PI) * sag, a[2] + (b[2] - a[2]) * k];
  let prev = at(0);
  for (let i = 1; i <= n; i++) { const cur = at(i / n); wire.beam(prev, cur, 0.015, '#2a2440', WIRE); prev = cur; }
  for (let i = 0; i < n; i++) { const [x, y, z] = at((i + 0.5) / n); bulbs.add(BULB, cols[i % cols.length], x, y - 0.06, z, 0, 0, 0, o.size ?? 0.07); }
}
/** A washing line from a to b with laundry (shirts, trousers, socks, towels) pegged on it. */
export function washingLine(b: Batch, a: [number, number, number], c: [number, number, number], o: { colors?: string[]; sag?: number } = {}) {
  const cols = o.colors ?? ['#ffffff', '#ff7ad0', '#35d4ff', '#ffd23f', '#b8f02a', '#ff9a5c', '#c8a8ff'];
  const sag = o.sag ?? 0.35, len = Math.hypot(c[0] - a[0], c[2] - a[2]), yaw = Math.atan2(c[0] - a[0], c[2] - a[2]) - Math.PI / 2;
  const at = (k: number): [number, number, number] => [a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k - Math.sin(k * Math.PI) * sag, a[2] + (c[2] - a[2]) * k];
  let prev = at(0);
  for (let i = 1; i <= 6; i++) { const cur = at(i / 6); b.beam(prev, cur, 0.014, '#f4f0ff', WIRE); prev = cur; }
  let k = 0.12;
  while (k < 0.9) {
    const [x, y, z] = at(k), kind = Math.floor(Math.random() * 4), col = pick(cols);
    const w = kind === 0 ? 0.5 : kind === 1 ? 0.36 : kind === 2 ? 0.16 : 0.6;
    const h = kind === 0 ? 0.5 : kind === 1 ? 0.62 : kind === 2 ? 0.26 : 0.4;
    b.add(BOX, col, x, y - h / 2 - 0.02, z, 0, yaw, 0, w, h, 0.03);
    if (kind === 0) for (const s of [-1, 1]) b.add(BOX, col, x + Math.cos(yaw) * s * 0.3, y - 0.14, z - Math.sin(yaw) * s * 0.3, 0, yaw, s * 0.6, 0.18, 0.12, 0.03);
    if (kind === 3) b.add(BOX, '#ffffff', x, y - 0.32, z, 0, yaw, 0, w, 0.05, 0.035);
    b.add(BOX, '#c8a070', x, y + 0.01, z, 0, yaw, 0, 0.03, 0.08, 0.05);
    k += (w + 0.12) / len;
  }
}

// ---------------------------------------------------------------- what every board gets
/**
 * Built by the board view after the board's decor (which may tune it with leben.lifeConfig and
 * leben.setSpotFilter): litter along the paths, pigeon groups and coins beside them, and the
 * spectators at the star. `clear(x, z, rN, rE)` is the kit's clearOfPath.
 */
export function sharedDetail(sc: THREE.Scene, graph: BoardGraph, clear: (x: number, z: number, rN: number, rE: number) => boolean) {
  const cfg = lifeConfigOf(sc), spot = spotFilterOf(sc), nodes = graph.nodes, fb = flatBatch(sc);
  const land = graph.edges.filter((e) => !e.flag || e.flag === 'carpet' || e.flag === 'walk');
  const ok = (x: number, z: number) => !spot || spot(x, z);
  if (cfg.litter) edgeLitter(sc, nodes, land, { ok: (x, z) => ok(x, z) && clear(x, z, 1.45, 0.85), per: cfg.litterPer, leaves: cfg.leaves, confetti: cfg.confetti, puddles: cfg.puddles, puddleC: cfg.puddleC });
  const spots = (n: number, r0: number, r1: number, rN: number, rE: number, gap: number) => {
    const out: P2[] = [];
    for (let k = 0; k < n * 30 && out.length < n; k++) {
      const e = pick(land), A = nodes[e.a], B = nodes[e.b], dx = B.x - A.x, dz = B.z - A.z, l = Math.hypot(dx, dz) || 1, t = Math.random(), side = Math.random() < 0.5 ? -1 : 1, off = rnd(r0, r1) * side;
      const x = A.x + dx * t - (dz / l) * off, z = A.z + dz * t + (dx / l) * off;
      if (!ok(x, z) || !clear(x, z, rN, rE) || out.some(([a, b]) => Math.hypot(a - x, b - z) < gap)) continue;
      out.push([x, z]);
    }
    return out;
  };
  if (cfg.pigeons > 0) pigeons(sc, spots(cfg.pigeons, 2.3, 3.1, 2.1, 1.7, 6), { colors: cfg.pigeonC });
  if (cfg.coins > 0) groundCoins(sc, spots(cfg.coins, 1.25, 1.8, 1.6, 1.05, 2));
  if (cfg.spectators > 0) spectators(sc, (x, z) => clear(x, z, 1.9, 1.15), { n: cfg.spectators, colors: cfg.fanC });
  if (fb.n) { const m = fb.mesh(VC_FLAT, false, true); sc.add(m); nearOnly(sc, m); }
}
