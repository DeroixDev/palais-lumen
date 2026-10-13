/** CS Gambler catalog: weapons, skins, cases. All names are our own. */
import type { CaseDef, SkinDef, WeaponDef } from '../contract';

export const WEAPONS: WeaponDef[] = [
  // pistols
  { id: 'p9', name: 'P-9', kind: 'pistol' },
  { id: 'deserthawk', name: 'Desert Hawk', kind: 'pistol' },
  { id: 'vektors', name: 'Vektor-S', kind: 'pistol' },
  { id: 'kurz25', name: 'Kurz-25', kind: 'pistol' },
  { id: 'kobra57', name: 'Kobra-57', kind: 'pistol' },
  { id: 'bulldog', name: 'Bulldog .44', kind: 'pistol' },
  { id: 'hornisse', name: 'Hornisse-9', kind: 'pistol' },
  // smgs
  { id: 'mk5', name: 'MK-5', kind: 'smg' },
  { id: 'mikro10', name: 'Mikro-10', kind: 'smg' },
  { id: 'kapsel90', name: 'Kapsel-90', kind: 'smg' },
  { id: 'ursa45', name: 'Ursa-45', kind: 'smg' },
  { id: 'schnecke', name: 'Schnecke-19', kind: 'smg' },
  // rifles
  { id: 'ar7', name: 'AR-7', kind: 'rifle' },
  { id: 'm4echo', name: 'M4-Echo', kind: 'rifle' },
  { id: 'galant', name: 'Galant', kind: 'rifle' },
  { id: 'falke', name: 'Falke', kind: 'rifle' },
  { id: 'spektor', name: 'Spektor', kind: 'rifle' },
  { id: 'kestrel', name: 'Kestrel-553', kind: 'rifle' },
  // snipers
  { id: 'awlong', name: 'AW-Longshot', kind: 'sniper' },
  { id: 'scout88', name: 'Scout-88', kind: 'sniper' },
  { id: 'titan', name: 'Titan-A1', kind: 'sniper' },
  { id: 'mamba', name: 'Mamba-20', kind: 'sniper' },
  // shotguns
  { id: 'pumpe12', name: 'Pumpe-12', kind: 'shotgun' },
  { id: 'sturmflinte', name: 'Sturmflinte', kind: 'shotgun' },
  { id: 'stummel', name: 'Stummel', kind: 'shotgun' },
  // heavy
  { id: 'brecher', name: 'Brecher-249', kind: 'heavy' },
  { id: 'lawine', name: 'Lawine', kind: 'heavy' },
  // knives
  { id: 'krallmesser', name: '★ Krallmesser', kind: 'knife' },
  { id: 'schmetterling', name: '★ Schmetterling', kind: 'knife' },
  { id: 'bajonett', name: '★ Bajonett', kind: 'knife' },
  { id: 'klappmesser', name: '★ Klappmesser', kind: 'knife' },
  { id: 'jagdmesser', name: '★ Jagdmesser', kind: 'knife' },
  { id: 'dolch', name: '★ Dolch', kind: 'knife' },
  { id: 'buschmesser', name: '★ Buschmesser', kind: 'knife' },
  { id: 'stilett', name: '★ Stilett', kind: 'knife' },
  // gloves
  { id: 'sporthandschuhe', name: '★ Sporthandschuhe', kind: 'gloves' },
  { id: 'fahrerhandschuhe', name: '★ Fahrerhandschuhe', kind: 'gloves' },
  { id: 'bandagen', name: '★ Bandagen', kind: 'gloves' },
];

export const SKINS: SkinDef[] = [
  { id: 'ar7-glutlinie', weapon: 'ar7', name: 'Glutlinie', rarity: 'covert', pattern: { kind: 'fade', colors: ['#ff3d00', '#ffb300', '#fff3c4'], params: { angle: 15 } }, floatMin: 0, floatMax: 0.6, basePrice: 85, collection: 'Glut' },
  { id: 'ar7-waldlauf', weapon: 'ar7', name: 'Waldlauf', rarity: 'milspec', pattern: { kind: 'camo', colors: ['#5b6b3a', '#2e3a1f', '#8a7a4a', '#1b1f14'] }, floatMin: 0.06, floatMax: 0.8, basePrice: 0.6, collection: 'Glut' },
  { id: 'p9-nachtfrost', weapon: 'p9', name: 'Nachtfrost', rarity: 'restricted', pattern: { kind: 'anodized', colors: ['#1e3a8a', '#7dd3fc'] }, floatMin: 0, floatMax: 0.5, basePrice: 3.2, collection: 'Glut' },
  { id: 'p9-pixelsturm', weapon: 'p9', name: 'Pixelsturm', rarity: 'industrial', pattern: { kind: 'digital', colors: ['#6b7280', '#374151', '#9ca3af'] }, floatMin: 0, floatMax: 1, basePrice: 0.2, collection: 'Glut' },
  { id: 'ar7-tigerzahn', weapon: 'ar7', name: 'Tigerzahn', rarity: 'classified', pattern: { kind: 'tiger', colors: ['#f59e0b', '#111111', '#fcd34d'] }, floatMin: 0, floatMax: 0.4, basePrice: 14, collection: 'Glut' },
  { id: 'krallmesser-saphir', weapon: 'krallmesser', name: 'Doppler Saphir', rarity: 'gold', pattern: { kind: 'doppler', colors: ['#1d4ed8', '#38bdf8', '#e0f2fe'] }, floatMin: 0, floatMax: 0.08, basePrice: 900, collection: 'Glut' },
  { id: 'krallmesser-verlauf', weapon: 'krallmesser', name: 'Verlauf', rarity: 'gold', pattern: { kind: 'fade', colors: ['#f472b6', '#a78bfa', '#fde047'], params: { angle: 30 } }, floatMin: 0, floatMax: 0.08, basePrice: 420, collection: 'Glut' },
  { id: 'p9-sand', weapon: 'p9', name: 'Sand', rarity: 'consumer', pattern: { kind: 'solid', colors: ['#c2a878', '#9c8458'] }, floatMin: 0, floatMax: 1, basePrice: 0.05, collection: 'Glut' },
];

export const CASES: CaseDef[] = [
  {
    id: 'glutkiste', name: 'Glutkiste', price: 4.5, category: 'standard', level: 0,
    look: { a: '#7c2d12', b: '#f97316', emblem: 'flame' },
    contents: {
      consumer: ['p9-sand'], industrial: ['p9-pixelsturm'], milspec: ['ar7-waldlauf'], restricted: ['p9-nachtfrost'],
      classified: ['ar7-tigerzahn'], covert: ['ar7-glutlinie'], gold: ['krallmesser-saphir', 'krallmesser-verlauf'],
    },
  },
];

const skinMap = new Map<string, SkinDef>();
const weaponMap = new Map<string, WeaponDef>();
const caseMap = new Map<string, CaseDef>();

export function skinById(id: string): SkinDef | undefined {
  if (skinMap.size !== SKINS.length) { skinMap.clear(); SKINS.forEach((s) => skinMap.set(s.id, s)); }
  return skinMap.get(id);
}
export function weaponById(id: string): WeaponDef | undefined {
  if (weaponMap.size !== WEAPONS.length) { weaponMap.clear(); WEAPONS.forEach((w) => weaponMap.set(w.id, w)); }
  return weaponMap.get(id);
}
export function caseById(id: string): CaseDef | undefined {
  if (caseMap.size !== CASES.length) { caseMap.clear(); CASES.forEach((c) => caseMap.set(c.id, c)); }
  return caseMap.get(id);
}
