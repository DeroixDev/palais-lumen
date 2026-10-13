import * as THREE from 'three';
import type { WeaponKind, WeaponModel, WeaponPart } from '../contract';

/**
 * Turns the layered 2D WeaponModel into extruded meshes.
 * Model units: x right, y down (art's model box). Three: x right, y up, z towards the camera.
 */

export interface BuiltModel {
  group: THREE.Group;
  /** Size of the model in world units after scaling (width, height, depth). */
  size: THREE.Vector3;
  geometries: THREE.BufferGeometry[];
}

export type PartMaterials = Record<WeaponPart['material'], THREE.Material>;

/** Width of the model in world units. The camera frames to this. */
export const MODEL_WIDTH = 4;

export function buildModel(model: WeaponModel, kind: WeaponKind, mats: PartMaterials): BuiltModel {
  const [W, H] = model.box;
  const padded = kind === 'gloves';
  const soft = kind === 'gloves' || kind === 'knife';
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const parts = [...model.parts].sort((a, b) => a.layer - b.layer);

  // Texture space (art's convention): the square texture covers the model box, u = x / W, v = y / H,
  // image top = model y 0. CanvasTexture has flipY on, so v = 1 is the image top; shape y is -y.
  const vOf = (yShape: number) => 1 + yShape / H;

  parts.forEach((part, i) => {
    const rings = part.rings.map(cleanRing).filter((r) => r.length >= 3);
    if (!rings.length) return;
    const outer = rings[0];
    const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, -y)));
    for (const hole of rings.slice(1)) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, -y))));

    // Parts drawn later sit a hair thicker so coplanar overlaps don't z-fight.
    const depth = Math.max(0.5, part.depth) * (1 + i * 0.006) + i * 0.02;
    const minDim = Math.min(minExtent(outer), ...rings.slice(1).map((h) => minExtent(h) * 0.8));
    const bt = Math.min(depth * (padded ? 0.42 : 0.3), padded ? 14 : 4.5);
    const bs = Math.min(minDim * (padded ? 0.22 : 0.16), padded ? 9 : soft ? 2.6 : 3.2, bt * 1.4);
    const core = Math.max(0.01, depth - 2 * bt);
    const zc = core / 2;

    const uvGen = {
      generateTopUV(_g: THREE.ExtrudeGeometry, v: number[], a: number, b: number, c: number) {
        return [a, b, c].map((k) => new THREE.Vector2(v[k * 3] / W, vOf(v[k * 3 + 1])));
      },
      generateSideWallUV(_g: THREE.ExtrudeGeometry, v: number[], a: number, b: number, c: number, d: number) {
        // Continue the cap colour around the edge; a slight z drift keeps it from looking like a hard smear.
        return [a, b, c, d].map((k) => new THREE.Vector2(v[k * 3] / W + (v[k * 3 + 2] - zc) * (0.4 / W), vOf(v[k * 3 + 1]) + (v[k * 3 + 2] - zc) * (1.2 / W)));
      },
    };

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: core,
      bevelEnabled: true,
      bevelThickness: bt,
      bevelSize: bs,
      bevelOffset: -bs,
      bevelSegments: padded ? 5 : 3,
      curveSegments: 1,
      steps: 1,
      UVGenerator: uvGen as unknown as THREE.UVGenerator,
    });
    smoothSides(geo, padded ? 70 : 50);
    geo.translate(0, 0, -zc);
    geometries.push(geo);

    const mesh = new THREE.Mesh(geo, mats[part.material] ?? mats.dark);
    mesh.position.z = part.z ?? 0;
    mesh.name = part.name;
    group.add(mesh);
  });

  // Centre and scale.
  const box = new THREE.Box3().setFromObject(group);
  const centre = box.getCenter(new THREE.Vector3());
  const raw = box.getSize(new THREE.Vector3());
  const s = MODEL_WIDTH / Math.max(raw.x, raw.y * 1.6, 1e-3);
  const inner = new THREE.Group();
  inner.add(group);
  group.position.copy(centre).multiplyScalar(-1);
  inner.scale.setScalar(s);
  return { group: inner, size: raw.multiplyScalar(s), geometries };
}

function cleanRing(r: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const p of r) {
    const q = out[out.length - 1];
    if (!q || Math.abs(q[0] - p[0]) > 1e-4 || Math.abs(q[1] - p[1]) > 1e-4) out.push(p);
  }
  if (out.length > 2) {
    const a = out[0], b = out[out.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4) out.pop();
  }
  return out;
}

function minExtent(r: [number, number][]): number {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return Math.min(x1 - x0, y1 - y0);
}

/**
 * Smooth normals on the side walls (group 1) only, with a crease angle, so bevels read as rounded
 * edges while the flat caps (group 0) keep exact flat normals.
 */
function smoothSides(geo: THREE.BufferGeometry, creaseDeg: number) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const side = geo.groups.find((g) => g.materialIndex === 1);
  if (!side) return;
  const start = side.start, end = side.start + side.count;
  const cos = Math.cos((creaseDeg * Math.PI) / 180);
  const faceN: number[] = [];
  const map = new Map<string, number[]>();
  const key = (i: number) => `${Math.round(pos.getX(i) * 100)},${Math.round(pos.getY(i) * 100)},${Math.round(pos.getZ(i) * 100)}`;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = start; i < end; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    b.sub(a); c.sub(a); b.cross(c); // area-weighted
    const f = faceN.length / 3;
    faceN.push(b.x, b.y, b.z);
    for (let k = 0; k < 3; k++) {
      const kk = key(i + k);
      let l = map.get(kk);
      if (!l) map.set(kk, (l = []));
      l.push(f);
    }
  }
  const n = new THREE.Vector3(), fn = new THREE.Vector3(), on = new THREE.Vector3();
  for (let i = start; i < end; i += 3) {
    const f = (i - start) / 3;
    fn.set(faceN[f * 3], faceN[f * 3 + 1], faceN[f * 3 + 2]);
    const fl = fn.length() || 1;
    for (let k = 0; k < 3; k++) {
      n.set(0, 0, 0);
      for (const g of map.get(key(i + k))!) {
        on.set(faceN[g * 3], faceN[g * 3 + 1], faceN[g * 3 + 2]);
        if (on.dot(fn) / ((on.length() || 1) * fl) >= cos) n.add(on);
      }
      if (n.lengthSq() < 1e-12) n.copy(fn);
      n.normalize();
      nrm.setXYZ(i + k, n.x, n.y, n.z);
    }
  }
  nrm.needsUpdate = true;
}
