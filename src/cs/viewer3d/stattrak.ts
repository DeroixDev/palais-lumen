import * as THREE from 'three';

/**
 * The StatTrak counter: a small dark module with an orange digit display, mounted on the
 * front face of the receiver (or the largest skin part). Returns a remover that frees it.
 */
export function addStatTrak(modelRoot: THREE.Object3D, kills = 0): () => void {
  const meshes: THREE.Mesh[] = [];
  modelRoot.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  const pick = ['receiver', 'slide', 'frame', 'body', 'blade'];
  let host: THREE.Mesh | undefined;
  for (const n of pick) if ((host = meshes.find((m) => m.name === n))) break;
  if (!host) host = largest(meshes.filter((m) => m.userData.skin));
  if (!host?.parent) return () => {};

  host.geometry.computeBoundingBox();
  const bb = host.geometry.boundingBox!;
  const w = bb.max.x - bb.min.x, h = bb.max.y - bb.min.y;
  const mw = Math.min(46, Math.max(18, w * 0.24)), mh = Math.min(12, Math.max(6, h * 0.22));
  const front = bb.max.z + host.position.z;

  const caseGeo = new THREE.BoxGeometry(mw, mh, 2.4);
  const caseMat = new THREE.MeshPhysicalMaterial({ color: 0x15171b, metalness: 0.4, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const tex = digitsTexture(kills);
  const screenGeo = new THREE.PlaneGeometry(mw * 0.86, mh * 0.66);
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.4, roughness: 0.2, metalness: 0 });
  const box = new THREE.Mesh(caseGeo, caseMat);
  const screen = new THREE.Mesh(screenGeo, screenMat);
  screen.position.z = 1.21;
  box.add(screen);
  // Lower right of the receiver, in front of the face; on odd outlines (curved blades) search for
  // the nearest spot where the whole module sits on the part.
  const spot = findSpot(host, bb, mw, mh);
  if (!spot) {
    caseGeo.dispose(); caseMat.dispose(); screenGeo.dispose(); screenMat.dispose(); tex.dispose();
    return () => {};
  }
  box.position.set(spot.x, spot.y, front + 1.0);
  box.name = 'stattrak';
  host.parent.add(box);
  return () => {
    box.removeFromParent();
    caseGeo.dispose(); caseMat.dispose(); screenGeo.dispose(); screenMat.dispose(); tex.dispose();
  };
}

function findSpot(host: THREE.Mesh, bb: THREE.Box3, mw: number, mh: number): THREE.Vector2 | null {
  const shapes = ((host.geometry as THREE.ExtrudeGeometry).parameters?.shapes ?? []) as THREE.Shape | THREE.Shape[];
  const shape = Array.isArray(shapes) ? shapes[0] : shapes;
  if (!shape) return null;
  const { shape: outer, holes } = shape.extractPoints(1);
  const inside = (x: number, y: number) => inPoly(outer, x, y) && !holes.some((h) => inPoly(h, x, y));
  const fits = (x: number, y: number) => {
    const ax = mw * 0.5 + 3, ay = mh * 0.5 + 3;
    for (const [dx, dy] of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) if (!inside(x + dx * ax, y + dy * ay)) return false;
    return true;
  };
  const w = bb.max.x - bb.min.x, h = bb.max.y - bb.min.y;
  const px = bb.min.x + w * 0.66, py = bb.min.y + h * 0.32;
  let best: THREE.Vector2 | null = null, bestD = Infinity;
  for (let i = 0; i <= 24; i++) for (let j = 0; j <= 16; j++) {
    const x = bb.min.x + (w * i) / 24, y = bb.min.y + (h * j) / 16;
    const d = (x - px) ** 2 + (y - py) ** 2;
    if (d < bestD && fits(x, y)) { bestD = d; best = new THREE.Vector2(x, y); }
  }
  return best;
}

function inPoly(pts: THREE.Vector2[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

function largest(ms: THREE.Mesh[]): THREE.Mesh | undefined {
  let best: THREE.Mesh | undefined, area = -1;
  for (const m of ms) {
    m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox!;
    const a = (b.max.x - b.min.x) * (b.max.y - b.min.y);
    if (a > area) { area = a; best = m; }
  }
  return best;
}

function digitsTexture(kills: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#120804';
  g.fillRect(0, 0, 256, 64);
  g.font = '700 44px ui-monospace, Menlo, Consolas, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,120,20,0.14)';
  g.fillText('888888', 128, 34);
  g.shadowColor = 'rgba(255,140,40,0.9)';
  g.shadowBlur = 8;
  g.fillStyle = '#ff9a2a';
  g.fillText(String(Math.max(0, Math.floor(kills))).padStart(6, '0'), 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
