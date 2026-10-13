/**
 * CS Gambler 3D inspect view. The platform loads this lazily: `const v = await import('../viewer3d')`.
 */
import { renderSkinTexture, renderWearMask, weaponModel } from '../art';
import { skinById, weaponById } from '../data/catalog';
import { openInspectWith } from './inspect';
import type { ArtSource, InspectHandle, InspectItem, InspectOptions } from './source';

export type { ArtSource, InspectHandle, InspectItem, InspectOptions } from './source';
export { openInspectWith } from './inspect';

const art: ArtSource = {
  weaponOf(skinId) {
    const s = skinById(skinId);
    const w = s && weaponById(s.weapon);
    return w ? { id: w.id, kind: w.kind } : undefined;
  },
  weaponModel,
  renderSkinTexture,
  renderWearMask,
};

/**
 * Mounts the inspect view filling `host` (WebGL canvas, absolutely positioned inside it).
 * Drag to rotate (with inertia), wheel/pinch to zoom, double-click resets, slow idle turn after 3 s.
 * setItem() swaps the skin in place (rebuilds the model only when the weapon changes).
 */
export function openInspect(host: HTMLElement, item: InspectItem, opts?: InspectOptions): InspectHandle {
  return openInspectWith(host, item, art, opts);
}
