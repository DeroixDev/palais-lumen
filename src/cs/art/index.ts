/**
 * CS Gambler art API (see ../contract.ts).
 *
 * Texture/UV convention for 3D: renderSkinTexture(skin, float, seed, size) returns the square
 * texture that covers the weapon's model box: u = x / box[0], v = y / box[1] (planar side
 * projection, stretched to the square). renderWearMask uses the same UVs (white = bare metal).
 * Both are deterministic for (skin, float bucket 0.01, seed, size).
 */
import type { CaseDef, Rarity, RenderOpts, WeaponModel } from '../contract';
import { weaponById } from '../data/catalog';
import { buildModel } from './models';
import { renderSkinImpl, renderSkinTextureImpl, renderWearMaskImpl, warmSkinsImpl } from './render';
import { renderCaseImpl } from './case';

export function renderSkin(opts: RenderOpts): HTMLCanvasElement {
  return renderSkinImpl(opts);
}

export function renderSkinTexture(skin: string, float: number, seed: number, size: number): HTMLCanvasElement {
  return renderSkinTextureImpl(skin, float, seed, size);
}

/** Extra for the 3D viewer: wear mask in the same UV space (white = paint worn off). */
export function renderWearMask(skin: string, float: number, seed: number, size: number): HTMLCanvasElement {
  return renderWearMaskImpl(skin, float, seed, size);
}

/**
 * Optional: pre-generate the pattern textures of these skins in idle time (call when a case page
 * opens, before the reel spins) so the first renderSkin of each is fast. Resolves when done.
 */
export function warmSkins(skinIds: string[]): Promise<void> {
  return warmSkinsImpl(skinIds);
}

export function weaponModel(weaponId: string): WeaponModel {
  return buildModel(weaponId, weaponById(weaponId)?.kind);
}

const COLORS: Record<Rarity, string> = {
  consumer: '#b0c3d9',
  industrial: '#5e98d9',
  milspec: '#4b69ff',
  restricted: '#8847ff',
  classified: '#d32ce6',
  covert: '#eb4b4b',
  gold: '#e4ae39',
};
const NAMES: Record<Rarity, string> = {
  consumer: 'Verbraucher',
  industrial: 'Industrie',
  milspec: 'Militärstandard',
  restricted: 'Eingeschränkt',
  classified: 'Klassifiziert',
  covert: 'Verdeckt',
  gold: '★ Außergewöhnlich',
};

export function rarityColor(r: Rarity): string {
  return COLORS[r] ?? '#b0c3d9';
}
export function rarityName(r: Rarity): string {
  return NAMES[r] ?? r;
}

export function renderCase(c: CaseDef, width: number, height: number): HTMLCanvasElement {
  return renderCaseImpl(c, width, height);
}
