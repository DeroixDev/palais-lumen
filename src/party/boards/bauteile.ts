// Building parts shared by Palais Lumen and CS-Bunker: the island plinth from an outline, a
// point-in-outline test with margin, own path ribbons (for boards that flag every edge and draw
// their own carpets or walkways), chase lights along the paths, a starry sky as one Points mesh
// and canvas signs. Everything here builds once; nothing allocates per frame.

import type { BEdge, BNode } from './types';
import { BOX, CYL8, FONT, THREE, ctex, markShared, toon } from '../view3d/kit';
import { glow } from '../view3d/shaderfx';

/** Low-poly shapes for small parts (bulbs, leaves): far fewer triangles than the kit spheres. */
export const BULB = markShared0(new THREE.IcosahedronGeometry(1, 0));
export const LEAF = markShared0(new THREE.SphereGeometry(1, 6, 4));
export const CYL6 = markShared0(new THREE.CylinderGeometry(1, 1, 1, 6));
function markShared0<T extends THREE.BufferGeometry>(g: T): T { markShared(g); return g; }

export type P2 = [number, number];

/** Rounded rectangle outline (x, z), corners cut with `n` steps (n = 1: a chamfer, art-déco style). */
export function roundRect(x0: number, x1: number, z0: number, z1: number, r: number, n = 6): P2[] {
  const out: P2[] = [];
  const arc = (cx: number, cz: number, a0: number, a1: number) => {
    for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); }
  };
  const H = Math.PI / 2;
  arc(x1 - r, z1 - r, 0, H);
  arc(x0 + r, z1 - r, H, 2 * H);
  arc(x0 + r, z0 + r, 2 * H, 3 * H);
  arc(x1 - r, z0 + r, 3 * H, 4 * H);
  return out;
}

/** Inside the outline and at least `m` away from its border. */
export function inOutline(pts: P2[], x: number, z: number, m = 0): boolean {
  let inside = false;
  let dmin = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    const dx = xj - xi, dz = zj - zi, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - xi) * dx + (z - zi) * dz) / l2));
    dmin = Math.min(dmin, Math.hypot(x - (xi + dx * t), z - (zi + dz * t)));
  }
  return inside && dmin > m;
}

/** The island: the outline extruded downwards, top textured, sides in one colour. */
export function plinth(sc: THREE.Scene, pts: P2[], top: THREE.Material, side: string, depth = 3) {
  const shape = new THREE.Shape();
  pts.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 2, curveSegments: 4 });
  const m = new THREE.Mesh(geo, [top, toon(side)]);
  m.rotation.x = -Math.PI / 2;
  m.position.y = -depth - 0.5;
  m.receiveShadow = true;
  sc.add(m);
  return m;
}

/** A glowing trim tube along the outline. */
export function trim(sc: THREE.Scene, pts: P2[], y: number, r: number, color: string, scale = 1) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x * scale, y, z * scale)), true, 'catmullrom', 0.1);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 6, r, 6, true), glow(new THREE.MeshBasicMaterial({ color }), 0.7));
  sc.add(m);
  return m;
}

/** Own path ribbons for flagged edges: a top strip, a wider border and a centre stud per edge. */
export function ribbons(sc: THREE.Scene, nodes: BNode[], edges: BEdge[], o: { top: string; border: string; stud: string; w?: number }) {
  const dummy = new THREE.Object3D();
  const w = o.w ?? 1.15;
  const top = new THREE.InstancedMesh(BOX, toon(o.top), edges.length);
  const bor = new THREE.InstancedMesh(BOX, toon(o.border), edges.length);
  const stud = new THREE.InstancedMesh(CYL8, toon(o.stud), edges.length);
  edges.forEach((e, i) => {
    const A = nodes[e.a], B = nodes[e.b], L = Math.hypot(B.x - A.x, B.z - A.z), yaw = Math.atan2(B.x - A.x, B.z - A.z);
    dummy.position.set((A.x + B.x) / 2, 0.05, (A.z + B.z) / 2); dummy.rotation.set(0, yaw, 0); dummy.scale.set(w, 0.1, L); dummy.updateMatrix(); top.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 0.02; dummy.scale.set(w + 0.45, 0.06, L + 0.3); dummy.updateMatrix(); bor.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 0.12; dummy.scale.set(0.2, 0.06, 0.2); dummy.updateMatrix(); stud.setMatrixAt(i, dummy.matrix);
  });
  top.receiveShadow = bor.receiveShadow = true;
  sc.add(top, bor, stud);
}

/**
 * Chase lights: bulbs along both sides of the given edges (one instanced mesh). `tick(t, mode)`
 * recolours them about 12 times a second; no allocations.
 */
export function chaseLights(sc: THREE.Scene, nodes: BNode[], edges: BEdge[], off: number, colors: string[], y = 0.2, size = 0.13) {
  const pos: P2[] = [];
  for (const e of edges) {
    const A = nodes[e.a], B = nodes[e.b], dx = B.x - A.x, dz = B.z - A.z, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l, mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
    pos.push([mx + nx * off, mz + nz * off], [mx - nx * off, mz - nz * off]);
  }
  const mat = glow(new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  const im = new THREE.InstancedMesh(BULB, mat, pos.length);
  const dummy = new THREE.Object3D();
  pos.forEach(([x, z], i) => { dummy.position.set(x, y, z); dummy.scale.setScalar(size); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
  const cols = colors.map((c) => new THREE.Color(c));
  const dim = cols.map((c) => c.clone().multiplyScalar(0.28));
  const rainbow = ['#ff4fb0', '#ffd23f', '#35e6ff', '#7dff8a', '#b46bff'].map((c) => new THREE.Color(c));
  for (let i = 0; i < pos.length; i++) im.setColorAt(i, cols[0]);
  sc.add(im);
  let acc = 0, step = 0;
  return {
    mesh: im,
    /** mode 0: calm chase, 1: party (rainbow, fast), 2: all dim. */
    tick(dt: number, mode: number) {
      acc += dt;
      if (acc < (mode === 1 ? 0.06 : 0.09)) return;
      acc = 0;
      step++;
      for (let i = 0; i < pos.length; i++) {
        const k = (i >> 1) + step;
        if (mode === 1) im.setColorAt(i, rainbow[(k + (i & 1)) % rainbow.length]);
        else if (mode === 2) im.setColorAt(i, dim[0]);
        else im.setColorAt(i, k % 4 === 0 ? cols[(k >> 2) % cols.length] : dim[(i >> 1) % dim.length]);
      }
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    },
  };
}

/** A starry sky: one Points mesh on a dome. */
export function starField(sc: THREE.Scene, n: number, r: number, color = '#fff6d8') {
  const p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, e = 0.12 + Math.random() * 0.9;
    p[i * 3] = Math.cos(a) * Math.cos(e) * r;
    p[i * 3 + 1] = Math.sin(e) * r * 0.6 + 20;
    p[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 1.6, sizeAttenuation: true, fog: false }));
  sc.add(m);
  return m;
}

/** A sign texture: dark plate, frame, big italic text (optional bulbs around the frame). */
export function signTex(text: string, o: { w?: number; h?: number; bg?: string; fg: string; frame: string; glow?: string; bulbs?: string; size?: number }) {
  const w = o.w ?? 512, h = o.h ?? 140;
  return ctex(w, h, (g) => {
    g.fillStyle = o.bg ?? '#0d1230';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = o.frame;
    g.lineWidth = 8;
    g.strokeRect(10, 10, w - 20, h - 20);
    if (o.bulbs) {
      g.fillStyle = o.bulbs;
      for (let x = 22; x < w - 10; x += 26) { g.beginPath(); g.arc(x, 10, 5, 0, Math.PI * 2); g.arc(x, h - 10, 5, 0, Math.PI * 2); g.fill(); }
    }
    g.font = `italic 900 ${o.size ?? Math.round(h * 0.56)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = 16; }
    g.fillStyle = o.fg;
    g.fillText(text, w / 2, h / 2 + 4);
  });
}

/** A flat textured plane (sign) facing +z, placed and turned. */
export function signMesh(tex: THREE.Texture, w: number, h: number, x: number, y: number, z: number, yaw = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glow(new THREE.MeshBasicMaterial({ map: tex }), 0.6));
  m.position.set(x, y, z);
  m.rotation.y = yaw;
  return m;
}
