/**
 * CS Gambler: the shared contract between the three parts of the game.
 *
 * - Art (src/cs/art, src/cs/data): weapon models, skin patterns, the catalog, the 2D renderer.
 * - 3D inspect (src/cs/viewer3d): looks at a skin on its weapon model.
 * - Platform (src/cs/app): the site itself (cases, battles, upgrader, contracts, inventory, career).
 *
 * Every name here is our own. No real CS weapon/skin names, no Valve art or sound.
 */

/** Rarity ladder, lowest first. 'gold' = knives and gloves (★). */
export type Rarity = 'consumer' | 'industrial' | 'milspec' | 'restricted' | 'classified' | 'covert' | 'gold';
export const RARITIES: Rarity[] = ['consumer', 'industrial', 'milspec', 'restricted', 'classified', 'covert', 'gold'];

export type WeaponKind = 'pistol' | 'smg' | 'rifle' | 'sniper' | 'shotgun' | 'heavy' | 'knife' | 'gloves';

export interface WeaponDef {
  id: string;            // 'ar7'
  name: string;          // 'AR-7'
  kind: WeaponKind;
}

/** How a skin texture is painted. `kind` names a pattern generator in src/cs/art/patterns.ts. */
export interface PatternRecipe {
  kind: string;                         // 'fade' | 'camo' | 'tiger' | 'hex' | 'doppler' | ... (art decides the set)
  colors: string[];                     // palette, 2–5 colours
  params?: Record<string, number | string>;
}

export interface SkinDef {
  id: string;            // unique, e.g. 'ar7-glutlinie'
  weapon: string;        // WeaponDef.id
  name: string;          // skin name only, e.g. 'Glutlinie' (UI shows 'AR-7 | Glutlinie')
  rarity: Rarity;
  pattern: PatternRecipe;
  floatMin: number;      // 0..1
  floatMax: number;      // 0..1
  /** Value in coins at float 0.20, no StatTrak. Platform scales by wear and StatTrak. */
  basePrice: number;
  collection: string;    // collection / case family name
}

/** Shape of the case box art (art picks one from the id when a case names none). */
export type CaseForm = 'crate' | 'briefcase' | 'chest' | 'capsule' | 'safe' | 'drum' | 'casket' | 'neon';
/** Surface of the case box. */
export type CaseMaterial = 'metal' | 'carbon' | 'wood' | 'leather' | 'gold' | 'paint';
/** Shop shelf a case sits on (the cases page groups by this; falls back to the category). */
export type CaseSection =
  | 'einsteiger' | 'budget' | 'klassiker' | 'waffen' | 'farben' | 'muster'
  | 'messer' | 'premium' | 'risiko' | 'event' | 'rang';

export interface CaseLook {
  a: string;                     // main body colour
  b: string;                     // accent / glow colour
  emblem: string;                // emblem keyword art understands
  form?: CaseForm;
  material?: CaseMaterial;
  /** Trim colour (corners, rims); gold for gold/premium cases when absent. */
  trim?: string;
  /** Short stencil text on the box (defaults to the case name). */
  label?: string;
}

export interface CaseDef {
  id: string;
  name: string;
  price: number;                 // coins to open (no separate keys on the platform)
  /** Skin ids by rarity tier. Gold tier lists knife/glove skins. */
  contents: Partial<Record<Rarity, string[]>>;
  /** Look of the case box: two colours + an emblem keyword art understands, optional form/material. */
  look: CaseLook;
  /** Economy class: decides the target return (see app/lib/economy.ts). */
  category: 'starter' | 'standard' | 'premium' | 'gold' | 'event';
  /** Career level needed to open it. 0 = everybody. */
  level: number;
  /** Shop shelf; optional so older/synthetic cases (daily case) still type-check. */
  section?: CaseSection;
  /** Popularity score 0..100 for the "Beliebt" sort. */
  pop?: number;
  /** Release order: higher = newer ("Neu" sort and badge). */
  added?: number;
  /** Small badge on the card, e.g. 'NEU', 'HOT', 'LIMITIERT'. */
  badge?: string;
}

/** One concrete item in an inventory. */
export interface ItemInstance {
  uid: string;
  skin: string;          // SkinDef.id
  float: number;         // 0..1
  seed: number;          // pattern seed 0..999 (pattern placement, like a real paint seed)
  statTrak: boolean;
  /** Where it came from, for the profile ("Glutkiste", "Upgrader", "Battle"). */
  source?: string;
}

/** Wear names by float. Shared by every part so the boundaries match. */
export function wearOf(float: number): { short: string; name: string } {
  if (float < 0.07) return { short: 'FN', name: 'Fabrikneu' };
  if (float < 0.15) return { short: 'MW', name: 'Minimale Gebrauchsspuren' };
  if (float < 0.38) return { short: 'FT', name: 'Einsatzerprobt' };
  if (float < 0.45) return { short: 'WW', name: 'Abgenutzt' };
  return { short: 'BS', name: 'Kampfspuren' };
}

// ---------- Art API (implemented in src/cs/art/index.ts) ----------

export interface RenderOpts {
  skin: string;          // SkinDef.id
  float: number;
  seed: number;
  width: number;         // CSS pixels; renderer multiplies by devicePixelRatio itself
  height: number;
  statTrak?: boolean;
}

/**
 * src/cs/art/index.ts must export:
 *   renderSkin(opts: RenderOpts): HTMLCanvasElement
 *     Side view of the weapon wearing the skin, transparent background, anti-aliased, hi-DPI.
 *     Cached by (skin, float bucket, seed, size). Fast enough for a reel of ~60 tiles.
 *   renderSkinTexture(skin: string, float: number, seed: number, size: number): HTMLCanvasElement
 *     The flat skin texture (square) with wear applied, for the 3D model.
 *   weaponModel(weaponId: string): WeaponModel
 *   rarityColor(r: Rarity): string, rarityName(r: Rarity): string
 *   renderCase(c: CaseDef, width: number, height: number): HTMLCanvasElement   (the case box art)
 *
 * src/cs/data/catalog.ts must export: WEAPONS: WeaponDef[], SKINS: SkinDef[], CASES: CaseDef[],
 *   and lookups skinById(id), weaponById(id), caseById(id).
 */

/** The weapon as layered 2D parts; the 3D viewer extrudes each part. Units: model box, x right, y down. */
export interface WeaponModel {
  box: [number, number];           // width, height of the model box (e.g. 512 x 192)
  parts: WeaponPart[];
}
export interface WeaponPart {
  name: string;                    // 'receiver', 'barrel', 'mag', 'stock', 'grip', 'blade', ...
  /** Closed outline; may contain holes as extra rings (ring 0 = outer). Points in model-box units. */
  rings: [number, number][][];
  /** 'skin' parts take the skin texture; others are plain materials. */
  material: 'skin' | 'metal' | 'dark' | 'rubber' | 'wood';
  /** Thickness for 3D extrusion in model units, and z offset of its centre (0 = middle plane). */
  depth: number;
  z?: number;
  /** Draw order, low first. */
  layer: number;
}

// ---------- 3D API (implemented in src/cs/viewer3d/index.ts) ----------
/**
 * export function openInspect(host: HTMLElement, item: Pick<ItemInstance, 'skin' | 'float' | 'seed' | 'statTrak'>): { dispose(): void }
 *   Mounts a WebGL canvas filling `host`. Drag to rotate, wheel/pinch to zoom, slow idle turn.
 *   Loaded lazily by the platform (dynamic import) so three.js stays out of the first load.
 */
