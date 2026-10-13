import type { WeaponKind, WeaponModel } from '../contract';

/** What the viewer needs from art + catalog. index.ts binds the real modules; dev pages may pass a fake. */
export interface ArtSource {
  /** Weapon id + kind for a skin id. */
  weaponOf(skinId: string): { id: string; kind: WeaponKind } | undefined;
  weaponModel(weaponId: string): WeaponModel;
  renderSkinTexture(skin: string, float: number, seed: number, size: number): HTMLCanvasElement;
  /** Optional: white = paint worn off (bare metal), black = intact paint. Same layout as the texture. */
  renderWearMask?(skin: string, float: number, seed: number, size: number): HTMLCanvasElement;
}

export interface InspectItem {
  skin: string;
  float: number;
  seed: number;
  statTrak: boolean;
}

export interface InspectHandle {
  dispose(): void;
  setItem(item: InspectItem): void;
}

export interface InspectOptions {
  /** 'studio' paints a dark radial gradient behind the model; 'transparent' lets the host show through. */
  background?: 'studio' | 'transparent';
  /** Texture edge length in px (default 1024). */
  textureSize?: number;
  /** Force reduced motion on/off (default: prefers-reduced-motion). */
  reducedMotion?: boolean;
}
