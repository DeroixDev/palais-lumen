import * as THREE from 'three';
import type { PartMaterials } from './build';

/** Plain (non-skin) materials. Created once per viewer, disposed with it. */
export function plainMaterials(): { mats: Omit<PartMaterials, 'skin'>; textures: THREE.Texture[] } {
  const wood = woodTexture();
  const rubberRough = noiseTexture(128, 0.78, 0.16);
  const metalRough = brushedTexture(256);
  const mats = {
    metal: new THREE.MeshPhysicalMaterial({ color: 0x9aa0a8, metalness: 0.92, roughness: 0.34, roughnessMap: metalRough, envMapIntensity: 1.0 }),
    dark: new THREE.MeshPhysicalMaterial({ color: 0x2b2e33, metalness: 0.7, roughness: 0.42, roughnessMap: metalRough, clearcoat: 0.15, clearcoatRoughness: 0.5 }),
    rubber: new THREE.MeshPhysicalMaterial({ color: 0x1c1d20, metalness: 0, roughness: 1, roughnessMap: rubberRough, sheen: 0.3, sheenRoughness: 0.8, sheenColor: new THREE.Color(0x333333) }),
    wood: new THREE.MeshPhysicalMaterial({ map: wood, metalness: 0, roughness: 0.55, clearcoat: 0.4, clearcoatRoughness: 0.35 }),
  };
  return { mats, textures: [wood, rubberRough, metalRough] };
}

/**
 * Skin material. `wear` is optional: a canvas where white = paint gone (bare metal).
 * Worn areas get metalness high and lower roughness, paint gets clearcoat that fades with float.
 */
export function skinMaterial(map: THREE.Texture, wear: HTMLCanvasElement | null, float: number): { mat: THREE.MeshPhysicalMaterial; textures: THREE.Texture[] } {
  const f = Math.min(1, Math.max(0, float));
  const paintRough = 0.32 + f * 0.38;
  const coat = 0.85 - f * 0.75;
  const mat = new THREE.MeshPhysicalMaterial({
    map,
    metalness: 0.08,
    roughness: paintRough,
    clearcoat: coat,
    clearcoatRoughness: 0.08 + f * 0.45,
    envMapIntensity: 1.0,
  });
  const textures: THREE.Texture[] = [];
  if (wear) {
    const orm = ormFromWear(wear, f);
    const t = new THREE.CanvasTexture(orm);
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = map.anisotropy;
    mat.roughnessMap = t; // G
    mat.metalnessMap = t; // B
    mat.clearcoatMap = t; // R
    mat.roughness = 1;
    mat.metalness = 1;
    mat.clearcoat = 1;
    textures.push(t);
  }
  return { mat, textures };
}

/** Packs clearcoat (R), roughness (G), metalness (B) from a wear mask. Runs at mask size (≤ 512 for speed). */
function ormFromWear(wear: HTMLCanvasElement, f: number): HTMLCanvasElement {
  const size = Math.min(512, wear.width);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(wear, 0, 0, size, size);
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  const paintRough = (0.32 + f * 0.38) * 255;
  const metalRough = (0.26 + f * 0.2) * 255;
  const coat = (0.85 - f * 0.75) * 255;
  for (let i = 0; i < d.length; i += 4) {
    const w = d[i] / 255; // white = worn
    d[i] = coat * (1 - w);
    d[i + 1] = paintRough + (metalRough - paintRough) * w;
    d[i + 2] = 0.08 * 255 + (0.92 - 0.08) * 255 * w;
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/**
 * Derives a wear mask by comparing the worn texture against a factory-new render of the same seed:
 * where they differ and the worn pixel is greyish, the paint is gone.
 */
export function deriveWearMask(worn: HTMLCanvasElement, clean: HTMLCanvasElement): HTMLCanvasElement {
  const size = Math.min(512, worn.width);
  const read = (src: HTMLCanvasElement) => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(src, 0, 0, size, size);
    return { c, g, img: g.getImageData(0, 0, size, size) };
  };
  const a = read(worn), b = read(clean);
  const d = a.img.data, e = b.img.data;
  for (let i = 0; i < d.length; i += 4) {
    const diff = Math.abs(d[i] - e[i]) + Math.abs(d[i + 1] - e[i + 1]) + Math.abs(d[i + 2] - e[i + 2]);
    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
    const grey = 1 - Math.min(1, (mx - mn) / 60); // low saturation = metal-like
    const w = Math.min(1, Math.max(0, (diff - 30) / 90)) * (0.35 + 0.65 * grey);
    const v = Math.round(w * 255);
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  a.g.putImageData(a.img, 0, 0);
  return a.c;
}

function woodTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, '#6e4528');
  grad.addColorStop(0.5, '#7d5030');
  grad.addColorStop(1, '#5e3a21');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  let r = 7;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const y = rnd() * S;
    g.strokeStyle = `rgba(${rnd() < 0.5 ? '40,22,10' : '150,100,60'},${0.12 + rnd() * 0.2})`;
    g.lineWidth = 0.6 + rnd() * 2;
    g.beginPath();
    for (let x = -4; x <= S + 4; x += 8) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 4 + Math.sin(x * 0.07 + i * 3) * 1.5);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 1);
  return t;
}

function noiseTexture(S: number, base: number, amp: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  let r = 11;
  for (let i = 0; i < img.data.length; i += 4) {
    r = (r * 16807) % 2147483647;
    const v = Math.max(0, Math.min(255, (base + (r / 2147483647 - 0.5) * amp) * 255));
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  return t;
}

/** Fine horizontal brushing in the roughness channel (multiplies material roughness). */
function brushedTexture(S: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgb(225,225,225)';
  g.fillRect(0, 0, S, S);
  let r = 3;
  for (let y = 0; y < S; y++) {
    r = (r * 16807) % 2147483647;
    const v = 190 + Math.round((r / 2147483647) * 65);
    g.fillStyle = `rgba(${v},${v},${v},0.6)`;
    g.fillRect(0, y, S, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
