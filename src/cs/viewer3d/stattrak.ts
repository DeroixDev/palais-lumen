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
  // Lower right of the receiver, in front of the face.
  box.position.set(bb.min.x + w * 0.66, bb.min.y + h * 0.32, front + 1.0);
  box.name = 'stattrak';
  host.parent.add(box);
  return () => {
    box.removeFromParent();
    caseGeo.dispose(); caseMat.dispose(); screenGeo.dispose(); screenMat.dispose(); tex.dispose();
  };
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
