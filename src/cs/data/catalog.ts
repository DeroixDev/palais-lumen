/** CS Gambler catalog: weapons, skins, cases. All names are our own. */
import type { CaseDef, PatternRecipe, Rarity, SkinDef, WeaponDef } from '../contract';

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

// ------------------------------------------------------------------ helpers
function h32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const frac = (s: string) => (h32(s) % 10007) / 10007;

const PRICE: Record<Rarity, [number, number]> = {
  consumer: [0.03, 0.3],
  industrial: [0.1, 0.8],
  milspec: [0.1, 2],
  restricted: [1, 8],
  classified: [5, 40],
  covert: [20, 250],
  gold: [80, 2500],
};
/** Weapon popularity: rifles/snipers cost more than the same rarity on a pistol. */
const KIND_MUL: Record<string, number> = { rifle: 0.85, sniper: 0.85, pistol: 0.55, smg: 0.35, shotgun: 0.3, heavy: 0.25, knife: 0.6, gloves: 0.55 };
/** Premium finishes push the price within the band. */
const KIND_BONUS: Record<string, number> = { doppler: 0.3, fade: 0.2, marble: 0.22, casehardened: 0.15, galaxy: 0.15, dragon: 0.18, holo: 0.1, damascus: 0.05, web: 0.08 };

/** Premium collections are worth more, so their (pricier) cases keep a fair EV. */
const COLLECTION_MUL: Record<string, number> = { Drache: 3.5, Galaxie: 3.5, Kaiser: 5, Gift: 2.5, Ozean: 1.3 };

const FLOATS: [number, number][] = [[0, 1], [0, 0.8], [0.06, 0.8], [0, 0.5], [0.1, 1], [0, 0.38], [0, 0.7], [0.02, 0.6]];
const FLOATS_GOLD: [number, number][] = [[0, 0.8], [0.06, 0.8], [0, 0.5], [0, 1], [0.1, 0.65]];
const CLEAN = new Set(['fade', 'doppler', 'marble']);

function slug(s: string): string {
  return s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

type Row = [weapon: string, name: string, rarity: Rarity, kind: string, colors: string[], params?: Record<string, number | string>];

function make(collection: string, rows: Row[]): SkinDef[] {
  return rows.map(([weapon, name, rarity, kind, colors, params]) => {
    const id = `${weapon}-${slug(name)}`;
    const wk = WEAPONS.find((w) => w.id === weapon)?.kind ?? 'rifle';
    const [lo, hi] = PRICE[rarity];
    const t = Math.min(1, frac(id) * (KIND_MUL[wk] ?? 0.5) + (KIND_BONUS[kind] ?? 0) + (rarity === 'gold' ? 0.08 : 0.05));
    const raw = Math.min(hi * 1.6, lo * Math.pow(hi / lo, t) * (rarity === 'gold' ? 1 : COLLECTION_MUL[collection] ?? 1));
    const basePrice = raw < 1 ? Math.round(raw * 100) / 100 : raw < 20 ? Math.round(raw * 10) / 10 : Math.round(raw);
    let fr: [number, number];
    if (CLEAN.has(kind)) fr = [0, 0.08];
    else if (rarity === 'gold') fr = FLOATS_GOLD[h32(id + 'f') % FLOATS_GOLD.length];
    else fr = FLOATS[h32(id + 'f') % FLOATS.length];
    const pattern: PatternRecipe = { kind, colors, ...(params ? { params } : {}) };
    return { id, weapon, name, rarity, pattern, floatMin: fr[0], floatMax: fr[1], basePrice, collection };
  });
}

// ------------------------------------------------------------------ palettes used a lot
const FIRE = ['#140805', '#ff3b00', '#ff9a00', '#ffe9a0'];
const ICE = ['#0b1e3a', '#2f7fd8', '#a8e4ff', '#ffffff'];
const NEON = ['#0a0a12', '#00ffd0', '#ff2bd6'];

// ------------------------------------------------------------------ gun skins by collection
const GUNS: SkinDef[] = [
  ...make('Schrott', [
    ['p9', 'Sand', 'consumer', 'solid', ['#c2a878', '#9c8458']],
    ['kurz25', 'Asphalt', 'consumer', 'solid', ['#3d4045', '#24272b']],
    ['mk5', 'Olivgrau', 'consumer', 'solid', ['#5f6650', '#3b4033']],
    ['pumpe12', 'Rostfleck', 'consumer', 'blotch', ['#5a4636', '#3a2c22', '#9a5a2e']],
    ['schnecke', 'Kreide', 'consumer', 'solid', ['#c9c7bf', '#9d9a90']],
    ['brecher', 'Bunker', 'consumer', 'digital', ['#4b5047', '#33362f', '#62685c']],
    ['ursa45', 'Schiefer', 'industrial', 'solid', ['#4a5564', '#2c333d']],
    ['stummel', 'Morast', 'industrial', 'camo', ['#4e4a33', '#2d2b1d', '#6d6542']],
    ['scout88', 'Steppe', 'industrial', 'camo', ['#a28f62', '#6d5f3e', '#c9b98a']],
    ['hornisse', 'Werkstatt', 'milspec', 'stripes', ['#2a2a2a', '#f2c200'], { angle: -40, width: 40 }],
    ['galant', 'Grauwolke', 'milspec', 'digital', ['#8a8f96', '#5c6168', '#b6bbc2']],
    ['m4echo', 'Kupferzorn', 'restricted', 'anodized', ['#b4562b', '#3d1a0c']],
  ]),
  ...make('Rekrut', [
    ['vektors', 'Nebelgrau', 'consumer', 'solid', ['#8d9399', '#6a7076']],
    ['mikro10', 'Kaktus', 'consumer', 'camo', ['#6b7d4a', '#40502c', '#a3a86c']],
    ['sturmflinte', 'Moorbirke', 'consumer', 'wood', ['#b98c5a', '#6d4626']],
    ['lawine', 'Granit', 'industrial', 'digital', ['#77797c', '#4c4e52', '#a1a3a6'], { cell: 12 }],
    ['kobra57', 'Seegras', 'industrial', 'topo', ['#2d5a4f', '#3f7f6a', '#9fe0c4']],
    ['titan', 'Ödland', 'industrial', 'camo', ['#8a7350', '#5a4630', '#b39b6c', '#3a2f22']],
    ['kapsel90', 'Sandsturm', 'milspec', 'tiger', ['#c9a86a', '#6b4b25', '#e5d2a0']],
    ['bulldog', 'Kirschholz', 'milspec', 'wood', ['#9c3f24', '#4d1a0c']],
    ['deserthawk', 'Patrone', 'milspec', 'anodized', ['#d4a24a', '#6b4718']],
    ['falke', 'Pixelsturm', 'restricted', 'digital', ['#3b6fb6', '#1d3359', '#9cc3f2', '#e8f2ff']],
    ['ar7', 'Rotwild', 'restricted', 'camo', ['#7a2a1d', '#3a120b', '#b8563a', '#1a0a06']],
    ['awlong', 'Saphir', 'classified', 'anodized', ['#1840a8', '#0b1636']],
  ]),
  ...make('Glut', [
    ['ar7', 'Glutlinie', 'covert', 'flames', FIRE],
    ['awlong', 'Drachenatem', 'covert', 'flames', ['#0d0402', '#b31200', '#ff5a00', '#ffd27a']],
    ['deserthawk', 'Feuerwerk', 'classified', 'splatter', ['#1a0d0a', '#ff4d00', '#ffd400', '#ff006a']],
    ['m4echo', 'Glutkern', 'classified', 'fade', ['#ff2a00', '#ff9100', '#ffe066'], { angle: 10 }],
    ['p9', 'Funkenflug', 'restricted', 'lightning', ['#2a0b05', '#fff4c2', '#ff6a00']],
    ['mk5', 'Lavastrom', 'restricted', 'blotch', ['#2a0702', '#7a1405', '#ff6a00']],
    ['kobra57', 'Zunder', 'restricted', 'tiger', ['#ff7a1a', '#1a0a04', '#ffb366']],
    ['sturmflinte', 'Hitzewelle', 'milspec', 'anodized', ['#ff9a3c', '#8a1d00']],
    ['ursa45', 'Ascheregen', 'milspec', 'splatter', ['#2f2f33', '#ff6a1a', '#7a7a80']],
    ['brecher', 'Kohleglut', 'milspec', 'topo', ['#1a1210', '#3d1a10', '#ff5a1f']],
    ['scout88', 'Feuerprobe', 'industrial', 'stripes', ['#2a1a14', '#ff5a00'], { angle: -20, width: 30 }],
    ['kurz25', 'Rauchzeichen', 'industrial', 'camo', ['#4a4a4e', '#2b2b2e', '#6e6e72', '#1b1b1d']],
  ]),
  ...make('Neon', [
    ['m4echo', 'Neonbiss', 'covert', 'circuit', NEON],
    ['kapsel90', 'Synthwelle', 'covert', 'fade', ['#ff2bd6', '#7a2bff', '#00e5ff'], { angle: 0 }],
    ['ar7', 'Neonrevolution', 'classified', 'graffiti', ['#120f1f', '#ff2bd6', '#00e5ff', '#ffe600', '#7cff00']],
    ['vektors', 'Lichtspur', 'classified', 'circuit', ['#0b0820', '#ff3df2', '#3de9ff']],
    ['mikro10', 'Pixelrausch', 'restricted', 'holo', ['#ff6ad5'], { hue: 0.6 }],
    ['galant', 'Stromschlag', 'restricted', 'lightning', ['#0d0b24', '#ffffff', '#00c8ff']],
    ['spektor', 'Hologramm', 'restricted', 'holo', ['#8ad8ff']],
    ['kurz25', 'Laserlinie', 'milspec', 'stripes', ['#0d0d14', '#ff2bd6', '#00e5ff'], { angle: -15, width: 22 }],
    ['schnecke', 'Clubnacht', 'milspec', 'splatter', ['#141022', '#ff2bd6', '#00e5ff', '#ffe600']],
    ['hornisse', 'Leuchtgift', 'milspec', 'tiles', ['#0b0b16', '#3a0ca3', '#ff2bd6', '#00e5ff']],
    ['lawine', 'Schaltkreis', 'industrial', 'circuit', ['#132018', '#39ff88', '#a5ffcf'], { traces: 50 }],
    ['pumpe12', 'Kathode', 'industrial', 'anodized', ['#3df2ff', '#1a2b6b']],
  ]),
  ...make('Frost', [
    ['awlong', 'Nachtfrost', 'covert', 'marble', ICE, { bands: 1 }],
    ['kestrel', 'Gletscher', 'covert', 'blotch', ['#0b2a52', '#3f8fd8', '#e6f6ff']],
    ['p9', 'Eiszapfen', 'classified', 'anodized', ['#1e3a8a', '#9be3ff']],
    ['falke', 'Polarlicht', 'classified', 'galaxy', ['#00c896', '#6a3cff', '#c8fff0']],
    ['m4echo', 'Raureif', 'restricted', 'topo', ['#123a63', '#6fb6ec', '#e8f6ff']],
    ['scout88', 'Schneesturm', 'restricted', 'digital', ['#e8eef5', '#a9b9cc', '#5d6f86', '#ffffff'], { cell: 14 }],
    ['ursa45', 'Kälteschock', 'restricted', 'lightning', ['#071a33', '#e9fbff', '#5ad1ff']],
    ['kobra57', 'Frostbiss', 'milspec', 'tiger', ['#cfe8ff', '#123a6b', '#ffffff']],
    ['mk5', 'Blaueis', 'milspec', 'hex', ['#0f2c52', '#2f6fb6', '#6fb6ec', '#bfe3ff']],
    ['stummel', 'Nordwind', 'milspec', 'camo', ['#d9e2ec', '#8aa0b8', '#4d6584', '#ffffff']],
    ['bulldog', 'Permafrost', 'industrial', 'anodized', ['#b8d4ec', '#476a8f']],
    ['titan', 'Tundra', 'industrial', 'digital', ['#c3ccd6', '#7f8c9b', '#ffffff']],
  ]),
  ...make('Wüste', [
    ['ar7', 'Wüstenkönig', 'covert', 'snake', ['#d9a441', '#3a2410', '#f3d68a'], { size: 20 }],
    ['deserthawk', 'Sonnenfeuer', 'covert', 'fade', ['#ffb300', '#ff5a00', '#7a1e00'], { angle: 35 }],
    ['galant', 'Sandviper', 'classified', 'snake', ['#b58b4c', '#2a1b0c', '#e3c48d']],
    ['awlong', 'Fata Morgana', 'classified', 'holo', ['#e8c27a'], { hue: 0.1 }],
    ['spektor', 'Dünenmeer', 'restricted', 'topo', ['#c9a46b', '#e3c690', '#7a5530']],
    ['hornisse', 'Skorpion', 'restricted', 'tiger', ['#d8b06a', '#2a1a0a', '#f0d79c']],
    ['mamba', 'Karawane', 'restricted', 'tiles', ['#7a4a1d', '#c98a3c', '#e8c27a', '#5a2f12']],
    ['p9', 'Sandsturm', 'milspec', 'camo', ['#c8ab78', '#9a7a48', '#e2cfa3', '#6e5432']],
    ['sturmflinte', 'Steinwüste', 'milspec', 'digital', ['#a88c66', '#7a6448', '#cdb592']],
    ['mikro10', 'Oase', 'milspec', 'waves', ['#e8d5a6', '#3aa39a', '#1f6f6a', '#ffffff'], { size: 40 }],
    ['lawine', 'Lehmhaut', 'industrial', 'solid', ['#a6764a', '#7a5232']],
    ['kurz25', 'Kamelhaar', 'industrial', 'wood', ['#c9a06a', '#8a6236']],
  ]),
  ...make('Dschungel', [
    ['m4echo', 'Smaragdschlange', 'covert', 'snake', ['#1fae5c', '#0a2a16', '#9df0b8'], { size: 18 }],
    ['scout88', 'Urwaldgeist', 'covert', 'dragon', ['#163d24', '#2f9e55', '#0b1a10', '#c6ff6a']],
    ['ar7', 'Dschungelkrieg', 'classified', 'camo', ['#3f5a2a', '#1d2a14', '#6b8a3e', '#8d7a4a'], { scale: 0.8 }],
    ['kapsel90', 'Giftfrosch', 'classified', 'splatter', ['#0f3a1c', '#39ff6a', '#ffd400', '#ff3b30']],
    ['bulldog', 'Mangrove', 'restricted', 'wood', ['#6b4a2a', '#2a1a0c']],
    ['galant', 'Lianen', 'restricted', 'topo', ['#1e3d22', '#2f6b39', '#a6e07a']],
    ['schnecke', 'Moosbart', 'milspec', 'blotch', ['#2c3b20', '#4e6b30', '#9ab85a']],
    ['ursa45', 'Farnwald', 'milspec', 'camo', ['#4a6b3a', '#24361c', '#7d9a52', '#141f10']],
    ['vektors', 'Laubfrosch', 'milspec', 'anodized', ['#5ad65a', '#0f4a1c']],
    ['pumpe12', 'Unterholz', 'industrial', 'camo', ['#5d5a3a', '#363421', '#7f7a50']],
    ['kobra57', 'Bambus', 'industrial', 'wood', ['#c8b86a', '#7a6a2a']],
    ['brecher', 'Tarnnetz', 'restricted', 'digital', ['#3d4a2c', '#25301a', '#5f6e40', '#141a0e']],
  ]),
  ...make('Stadt', [
    ['awlong', 'Asphaltkönig', 'covert', 'graffiti', ['#2b2d31', '#ff3b30', '#ffd60a', '#0a84ff', '#ffffff']],
    ['falke', 'Betonherz', 'classified', 'hex', ['#3a3d42', '#55595f', '#7a7f86', '#ff6a00']],
    ['m4echo', 'Kohlefaser', 'classified', 'carbon', ['#1d2024', '#6d7480']],
    ['mamba', 'Stahlnetz', 'restricted', 'hex', ['#262a30', '#3c424a', '#5a626d']],
    ['p9', 'U-Bahn', 'restricted', 'graffiti', ['#3d4250', '#ff2d55', '#30d158', '#ffd60a']],
    ['deserthawk', 'Karbon', 'restricted', 'carbon', ['#16181c', '#9aa3ad']],
    ['spektor', 'Stadtnacht', 'milspec', 'digital', ['#2a2f38', '#454c58', '#11141a', '#69717d'], { cell: 12 }],
    ['kestrel', 'Bauzaun', 'milspec', 'stripes', ['#1b1b1b', '#ffcc00'], { angle: -45, width: 36 }],
    ['mk5', 'Hinterhof', 'milspec', 'splatter', ['#55585e', '#ff6a00', '#222428']],
    ['titan', 'Pflaster', 'industrial', 'tiles', ['#6e7178', '#4a4d52', '#8b8f96'], { size: 90 }],
    ['hornisse', 'Kabelsalat', 'industrial', 'circuit', ['#1d1f24', '#ff9500', '#ffd60a'], { traces: 40 }],
    ['lawine', 'Stahlbeton', 'consumer', 'solid', ['#8a8c8f', '#6a6c70']],
  ]),
  ...make('Ozean', [
    ['ar7', 'Tsunami', 'covert', 'waves', ['#0b2a4a', '#1f5f99', '#e8f4ff', '#0b1a2e'], { size: 44 }],
    ['vektors', 'Tiefsee', 'covert', 'galaxy', ['#00406b', '#00c2c7', '#a0fff4']],
    ['awlong', 'Korallenriff', 'classified', 'blotch', ['#ff6f61', '#00a6a6', '#ffd2a1']],
    ['kestrel', 'Brandung', 'classified', 'waves', ['#e8f4ff', '#2a7fc2', '#0c3c6b', '#ffffff'], { size: 36 }],
    ['kurz25', 'Perlmutt', 'restricted', 'holo', ['#cfe9ff'], { hue: 0.45 }],
    ['schnecke', 'Muschelbank', 'restricted', 'scales', ['#e8d3c0', '#8a5a4a', '#fff2e6']],
    ['scout88', 'Lagune', 'restricted', 'anodized', ['#00d1c1', '#003b57']],
    ['mikro10', 'Seeigel', 'milspec', 'splatter', ['#0b2a3a', '#4a2a7a', '#00c2c7']],
    ['titan', 'Gezeiten', 'milspec', 'topo', ['#0b3a5a', '#1f6f99', '#a8e4ff']],
    ['stummel', 'Treibholz', 'milspec', 'wood', ['#a8a090', '#6a6050']],
    ['sturmflinte', 'Hafenblau', 'industrial', 'digital', ['#2a4a6a', '#1a3048', '#4a7aa0']],
    ['brecher', 'Ankerkette', 'industrial', 'hex', ['#1d2b38', '#2e4256', '#4d6a86']],
  ]),
  ...make('Drache', [
    ['ar7', 'Feuerdrache', 'covert', 'dragon', ['#120a08', '#c4161c', '#2a0604', '#ffcc33']],
    ['awlong', 'Drachenlord', 'covert', 'dragon', ['#0d1726', '#e8b84a', '#1a0f05', '#ff5a2a']],
    ['m4echo', 'Jadedrache', 'classified', 'dragon', ['#0e2a22', '#3fbf8a', '#061510', '#e8ffcf']],
    ['deserthawk', 'Gehärtet', 'classified', 'casehardened', ['#24508f', '#c8a24a', '#8b8f94', '#5a3c74']],
    ['kestrel', 'Damaszener', 'restricted', 'damascus', ['#2b2e33', '#8e959e', '#d8dde3']],
    ['vektors', 'Blutnetz', 'restricted', 'web', ['#8a0c12', '#120203']],
    ['galant', 'Schuppenpanzer', 'restricted', 'scales', ['#a8202a', '#2a0508', '#e8a040'], { size: 26 }],
    ['bulldog', 'Drachenzahn', 'milspec', 'tiger', ['#e8c070', '#3a0a08', '#fff0c0']],
    ['mamba', 'Ascheschwinge', 'milspec', 'blotch', ['#2a2a30', '#5a1a1a', '#b84a2a']],
    ['kapsel90', 'Lindwurm', 'milspec', 'snake', ['#4a7a3a', '#1a2a10', '#c0e070']],
    ['pumpe12', 'Schwefel', 'industrial', 'anodized', ['#e8d040', '#5a4a0a']],
    ['hornisse', 'Glutschuppe', 'industrial', 'scales', ['#7a2a14', '#2a0a04', '#c05a2a']],
  ]),
  ...make('Galaxie', [
    ['m4echo', 'Ereignishorizont', 'covert', 'galaxy', ['#3b1a8a', '#ff3d9a', '#ffe9ff']],
    ['awlong', 'Supernova', 'covert', 'galaxy', ['#ff5a1f', '#7a1aff', '#fff0d0']],
    ['p9', 'Sternenstaub', 'classified', 'doppler', ['#5a2bd6', '#ff6ad5', '#ffffff']],
    ['spektor', 'Nebula', 'classified', 'acid', ['#2a1a6a', '#7a2bd6', '#ff6ad5', '#3de9ff']],
    ['kobra57', 'Mondstaub', 'restricted', 'marble', ['#2a2d4a', '#8a8fb8', '#e8eaff']],
    ['mk5', 'Kometenschweif', 'restricted', 'fade', ['#0a1a4a', '#3d6aff', '#d0e0ff'], { angle: 5 }],
    ['schnecke', 'Weltraumschrott', 'restricted', 'hex', ['#1a1a2a', '#2a2a4a', '#5a5a8a', '#9a9aff']],
    ['falke', 'Orbit', 'milspec', 'topo', ['#0b0b24', '#1a1a4a', '#7a7aff']],
    ['ursa45', 'Meteorit', 'milspec', 'blotch', ['#2a2420', '#4a3a30', '#ff7a2a']],
    ['titan', 'Raumanzug', 'milspec', 'carbon', ['#e8e8f0', '#9aa0b0']],
    ['sturmflinte', 'Dunkle Materie', 'industrial', 'solid', ['#1a1a2e', '#0b0b16']],
    ['lawine', 'Satellit', 'industrial', 'circuit', ['#141428', '#9a9aff', '#ffffff'], { traces: 45 }],
  ]),
  ...make('Gift', [
    ['kapsel90', 'Säurebad', 'covert', 'acid', ['#39ff14', '#0a2a0a', '#c8ff00', '#1a6a1a']],
    ['ar7', 'Biohazard', 'covert', 'splatter', ['#1a1f14', '#9dff00', '#ffe600', '#39ff14'], { count: 34 }],
    ['mikro10', 'Neonbiss', 'classified', 'acid', ['#ff2bd6', '#39ff14', '#00e5ff', '#120f1f']],
    ['galant', 'Giftnebel', 'classified', 'blotch', ['#14240a', '#3a6a14', '#b8ff3a']],
    ['m4echo', 'Toxin', 'restricted', 'hex', ['#0f1a0a', '#1f3a10', '#39ff14', '#b8ff3a']],
    ['p9', 'Schlangengift', 'restricted', 'snake', ['#7aff3a', '#0a1a04', '#d8ff9a']],
    ['stummel', 'Klärschlamm', 'milspec', 'blotch', ['#3a3a1a', '#5a5a2a', '#9a9a3a']],
    ['brecher', 'Fass 13', 'milspec', 'stripes', ['#1a1a1a', '#c8ff00'], { angle: 45, width: 34 }],
    ['deserthawk', 'Mutagen', 'milspec', 'acid', ['#5a0a7a', '#39ff14', '#1a0a2a']],
    ['scout88', 'Sporen', 'industrial', 'splatter', ['#2a3a1a', '#7a9a3a', '#c8d88a']],
    ['mamba', 'Sumpfgas', 'industrial', 'camo', ['#3a4a1a', '#1a240a', '#6a7a2a']],
    ['kobra57', 'Abwasser', 'consumer', 'solid', ['#4a5a3a', '#2a3424']],
  ]),
  ...make('Kaiser', [
    ['awlong', 'Kaiserkrone', 'covert', 'marble', ['#3a1a05', '#e8b84a', '#fff4c8', '#8a5a1a'], { bands: 1.5 }],
    ['deserthawk', 'Goldrausch', 'covert', 'anodized', ['#ffe08a', '#8a5a0a']],
    ['m4echo', 'Rubin', 'classified', 'marble', ['#3a0508', '#c4161c', '#ff8a8a', '#ffffff']],
    ['ar7', 'Smaragd', 'classified', 'marble', ['#05301c', '#18a35a', '#9effc8', '#ffffff']],
    ['vektors', 'Saphirthron', 'restricted', 'damascus', ['#0a1a4a', '#3a6ad6', '#c8d8ff']],
    ['kestrel', 'Mosaik', 'restricted', 'tiles', ['#1a3a6a', '#e8b84a', '#c4161c', '#f4ecd8']],
    ['bulldog', 'Elfenbein', 'restricted', 'marble', ['#e8e0cc', '#c8b898', '#ffffff']],
    ['mamba', 'Purpurmantel', 'milspec', 'anodized', ['#8a2be2', '#2a0a4a']],
    ['spektor', 'Hermelin', 'milspec', 'snake', ['#f4f0e8', '#1a1a1a', '#ffffff'], { size: 16 }],
    ['ursa45', 'Thronsaal', 'milspec', 'tiles', ['#4a0a14', '#8a1a2a', '#e8b84a']],
    ['pumpe12', 'Messing', 'industrial', 'anodized', ['#d4b062', '#7a5a22']],
    ['hornisse', 'Blattgold', 'restricted', 'fade', ['#fff1b8', '#e8b84a', '#8a5a0a'], { angle: 60 }],
  ]),
  ...make('Geister', [
    ['ar7', 'Kürbiskopf', 'covert', 'flames', ['#120a1a', '#ff6a00', '#ffb000', '#ffe9a0']],
    ['scout88', 'Geisterlicht', 'classified', 'galaxy', ['#1a5a3a', '#7aff9a', '#e0ffe8']],
    ['m4echo', 'Spinnenkönig', 'classified', 'web', ['#1a0a24', '#c8ff00'], { webs: 6 }],
    ['p9', 'Fledermaus', 'restricted', 'splatter', ['#1a0a24', '#ff6a00', '#5a1a8a']],
    ['kapsel90', 'Gruselkabinett', 'restricted', 'graffiti', ['#1a0a24', '#ff6a00', '#7aff3a', '#c84aff']],
    ['stummel', 'Grabstein', 'milspec', 'blotch', ['#3a3a40', '#5a5a64', '#8a8a96']],
    ['ursa45', 'Irrlicht', 'milspec', 'lightning', ['#0a140a', '#e0ffe8', '#3aff7a']],
    ['brecher', 'Hexenkessel', 'milspec', 'acid', ['#2a0a3a', '#7aff3a', '#ff6a00']],
    ['kurz25', 'Mitternacht', 'industrial', 'web', ['#2a2a40', '#0a0a10'], { webs: 3 }],
  ]),
  ...make('Winterfest', [
    ['awlong', 'Polarstern', 'covert', 'galaxy', ['#1a3a8a', '#9ad8ff', '#ffffff']],
    ['m4echo', 'Zuckerstange', 'classified', 'stripes', ['#ffffff', '#d6001c'], { angle: -35, width: 30 }],
    ['ar7', 'Lebkuchen', 'restricted', 'tiles', ['#8a4a1a', '#c87a3a', '#f4e0c0', '#5a2a0a']],
    ['vektors', 'Schneeflocke', 'restricted', 'hex', ['#cfe4ff', '#9ac0ec', '#ffffff', '#5a8ac8']],
    ['mikro10', 'Glühwein', 'milspec', 'anodized', ['#c4161c', '#3a0508']],
    ['falke', 'Tannenwald', 'milspec', 'camo', ['#1a4a2a', '#0a2a14', '#e8f0e8', '#2a6a3a']],
    ['titan', 'Eisstock', 'milspec', 'topo', ['#e8f4ff', '#c8dcf0', '#4a7ab0']],
    ['bulldog', 'Kaminholz', 'industrial', 'wood', ['#8a5a2a', '#3a1a08']],
  ]),
];

// ------------------------------------------------------------------ knives & gloves
type Fin = [name: string, kind: string, colors: string[], params?: Record<string, number | string>];
const KNIFE_FINISHES: Fin[] = [
  ['Doppler Rubin', 'doppler', ['#c4002b', '#ff3d5a', '#ffd0d8']],
  ['Doppler Saphir', 'doppler', ['#1238c8', '#38bdf8', '#e0f2fe']],
  ['Doppler Smaragd', 'doppler', ['#00a050', '#39ff8a', '#d8ffe8']],
  ['Schwarze Perle', 'doppler', ['#2a1a5a', '#7a3ad6', '#e8d8ff']],
  ['Doppler Phase 2', 'doppler', ['#d6337a', '#7a2bd6', '#ffd0f0']],
  ['Verlauf', 'fade', ['#ffd400', '#ff4fa3', '#7a3cff'], { angle: 25 }],
  ['Marmorverlauf', 'marble', ['#ffd400', '#e8261c', '#1e5fd8'], { bands: 1 }],
  ['Gehärtet', 'casehardened', ['#24508f', '#c8a24a', '#8b8f94', '#5a3c74']],
  ['Tigerzahn', 'tiger', ['#f2a516', '#1a0c02', '#ffd36a'], { freq: 1.2 }],
  ['Damast', 'damascus', ['#2b2e33', '#8e959e', '#e0e4ea']],
  ['Blutnetz', 'web', ['#a00c14', '#0a0101']],
  ['Blutrausch', 'blotch', ['#7a0a10', '#c4161c', '#ff8a7a']],
  ['Nachthimmel', 'galaxy', ['#3b1a8a', '#2a7aff', '#ffffff']],
  ['Ultraviolett', 'anodized', ['#7a2be2', '#1a0636']],
  ['Waldläufer', 'camo', ['#4d5a32', '#232a16', '#7a7044', '#121509']],
  ['Kristallblau', 'casehardened', ['#1a6ad6', '#8a8f94', '#a7adb5', '#2a3a6a']],
  ['Schlangenhaut', 'snake', ['#c8b06a', '#2a1a0a', '#f0e0a8'], { size: 16 }],
  ['Polarnacht', 'marble', ['#0b1e3a', '#2f7fd8', '#a8e4ff', '#ffffff']],
];
const KNIVES = ['krallmesser', 'schmetterling', 'bajonett', 'klappmesser', 'jagdmesser', 'dolch', 'buschmesser', 'stilett'];

function knifeRows(): Row[] {
  const rows: Row[] = [];
  KNIVES.forEach((k, ki) => {
    // every knife: the 4 classic dopplers/fade/marble/case hardened, plus a rotating set of 4 others
    const base = [0, 1, 2, 3, 5, 6, 7];
    const extra = [4, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
    const picks = [...base, ...[0, 1, 2].map((j) => extra[(ki * 3 + j) % extra.length])];
    picks.forEach((fi) => {
      const [name, kind, colors, params] = KNIFE_FINISHES[fi];
      rows.push([k, name, 'gold', kind, colors, params]);
    });
  });
  return rows;
}

const GLOVE_ROWS: Row[] = [
  ['sporthandschuhe', 'Lila Nebel', 'gold', 'blotch', ['#3a2a5a', '#6a4ab0', '#d8c8ff']],
  ['sporthandschuhe', 'Supraleiter', 'gold', 'hex', ['#0a2a5a', '#1a5ab0', '#7ac8ff', '#e8f6ff'], { size: 18 }],
  ['sporthandschuhe', 'Neonnacht', 'gold', 'stripes', ['#1a1a2a', '#ff2bd6', '#00e5ff'], { angle: -30, width: 26 }],
  ['sporthandschuhe', 'Smaragdnetz', 'gold', 'web', ['#0a5a2a', '#04140a']],
  ['sporthandschuhe', 'Arktis', 'gold', 'camo', ['#e8eef5', '#a9b9cc', '#5d6f86']],
  ['sporthandschuhe', 'Kupferzorn', 'gold', 'anodized', ['#d87a3a', '#4a1a08']],
  ['fahrerhandschuhe', 'Kaiserkaro', 'gold', 'tiles', ['#5a0a14', '#c4161c', '#e8b84a', '#1a0508'], { size: 50 }],
  ['fahrerhandschuhe', 'Schlangenbiss', 'gold', 'snake', ['#7a8a3a', '#1a2008', '#c8d88a'], { size: 14 }],
  ['fahrerhandschuhe', 'Kristallblau', 'gold', 'marble', ['#0b1e3a', '#2f7fd8', '#a8e4ff']],
  ['fahrerhandschuhe', 'Rennfahrer', 'gold', 'stripes', ['#f4f4f4', '#d6001c', '#1a1a1a'], { angle: 0, width: 34 }],
  ['fahrerhandschuhe', 'Nachtfalter', 'gold', 'carbon', ['#1a1a24', '#8a7aff']],
  ['fahrerhandschuhe', 'Lederbraun', 'gold', 'wood', ['#8a5a3a', '#4a2a14']],
  ['bandagen', 'Kobalt', 'gold', 'anodized', ['#1a4ad6', '#0a1236']],
  ['bandagen', 'Ödland', 'gold', 'camo', ['#a08a5a', '#5a4a2a', '#c8b88a', '#3a2a14']],
  ['bandagen', 'Blutband', 'gold', 'blotch', ['#5a0a0a', '#a01414', '#ff7a6a']],
  ['bandagen', 'Kupferzorn', 'gold', 'casehardened', ['#2a4a8a', '#c87a3a', '#8b8f94', '#5a3c74']],
  ['bandagen', 'Tigerfell', 'gold', 'tiger', ['#e89a2a', '#1a0a02', '#ffd080']],
  ['bandagen', 'Leopard', 'gold', 'snake', ['#d8b06a', '#2a1a0a', '#f0d8a0'], { size: 24 }],
];

const GOLD: SkinDef[] = [...make('Messer', knifeRows()), ...make('Handschuhe', GLOVE_ROWS)];

export const SKINS: SkinDef[] = [...GUNS, ...GOLD];

// ------------------------------------------------------------------ cases
function byCollections(cols: string[]): Partial<Record<Rarity, string[]>> {
  const out: Partial<Record<Rarity, string[]>> = {};
  for (const s of GUNS) {
    if (!cols.includes(s.collection)) continue;
    (out[s.rarity] ??= []).push(s.id);
  }
  return out;
}
/** Gold pool by finish names and/or weapons. */
function gold(filter: (s: SkinDef) => boolean, max = 99): string[] {
  return GOLD.filter(filter).slice(0, max).map((s) => s.id);
}
const isKnife = (s: SkinDef) => KNIVES.includes(s.weapon);
const isGlove = (s: SkinDef) => !KNIVES.includes(s.weapon);
const fin = (...names: string[]) => (s: SkinDef) => names.includes(s.name);

function kase(
  id: string, name: string, price: number, category: CaseDef['category'], level: number,
  look: CaseDef['look'], cols: string[], goldIds: string[], tweak?: (c: Partial<Record<Rarity, string[]>>) => void,
): CaseDef {
  const contents = byCollections(cols);
  tweak?.(contents);
  contents.gold = goldIds;
  return { id, name, price, category, level, look, contents };
}

export const CASES: CaseDef[] = [
  // starter
  kase('schrottkiste', 'Schrottkiste', 0.49, 'starter', 0, { a: '#4a4d52', b: '#8a8f96', emblem: 'skull' }, ['Schrott'],
    gold((s) => isKnife(s) && fin('Waldläufer', 'Ultraviolett', 'Damast', 'Schlangenhaut')(s), 6)),
  kase('rekrutenkiste', 'Rekrutenkiste', 0.99, 'starter', 0, { a: '#3a4a2a', b: '#8aa05a', emblem: 'star' }, ['Rekrut'],
    gold((s) => isKnife(s) && fin('Tigerzahn', 'Blutrausch', 'Waldläufer')(s), 6)),
  kase('sparkiste', 'Sparkiste', 1.79, 'starter', 0, { a: '#2a3a5a', b: '#5a8ad6', emblem: 'leaf' }, ['Schrott', 'Rekrut'],
    gold((s) => isKnife(s) && fin('Damast', 'Ultraviolett', 'Kristallblau')(s), 6), (c) => { c.consumer = c.consumer?.slice(0, 3); }),
  // standard
  kase('glutkiste', 'Glutkiste', 4.5, 'standard', 0, { a: '#7c2d12', b: '#f97316', emblem: 'flame' }, ['Glut'],
    gold((s) => isKnife(s) && fin('Doppler Rubin', 'Verlauf', 'Blutrausch', 'Tigerzahn')(s), 8)),
  kase('neonkiste', 'Neonkiste', 5.9, 'standard', 0, { a: '#2a0a4a', b: '#ff2bd6', emblem: 'circuit' }, ['Neon'],
    gold((s) => isKnife(s) && fin('Doppler Phase 2', 'Verlauf', 'Ultraviolett')(s), 8)),
  kase('frostkiste', 'Frostkiste', 4.9, 'standard', 0, { a: '#0b2a52', b: '#7dd3fc', emblem: 'snow' }, ['Frost'],
    gold((s) => isKnife(s) && fin('Doppler Saphir', 'Polarnacht', 'Kristallblau')(s), 8)),
  kase('wuestensturm', 'Wüstensturm', 3.9, 'standard', 0, { a: '#7a5530', b: '#e8c27a', emblem: 'sun' }, ['Wüste'],
    gold((s) => isKnife(s) && fin('Tigerzahn', 'Schlangenhaut', 'Gehärtet')(s), 8)),
  kase('dschungelkiste', 'Dschungelkiste', 3.5, 'standard', 0, { a: '#163d24', b: '#5ad65a', emblem: 'leaf' }, ['Dschungel'],
    gold((s) => isKnife(s) && fin('Doppler Smaragd', 'Waldläufer', 'Schlangenhaut')(s), 8)),
  kase('stadtkiste', 'Stadtkiste', 2.9, 'standard', 0, { a: '#2b2d31', b: '#ffcc00', emblem: 'bolt' }, ['Stadt'],
    gold((s) => isKnife(s) && fin('Damast', 'Blutnetz', 'Ultraviolett')(s), 8)),
  kase('ozeankiste', 'Ozeankiste', 6.5, 'standard', 5, { a: '#0b2a4a', b: '#00c2c7', emblem: 'wave' }, ['Ozean'],
    gold((s) => isKnife(s) && fin('Doppler Saphir', 'Marmorverlauf', 'Kristallblau')(s), 8)),
  // premium
  kase('drachenkiste', 'Drachenkiste', 18, 'premium', 5, { a: '#3a0a08', b: '#e8b84a', emblem: 'dragon' }, ['Drache'],
    gold((s) => isKnife(s) && fin('Gehärtet', 'Damast', 'Doppler Rubin', 'Blutnetz')(s), 12)),
  kase('galaxiekiste', 'Galaxiekiste', 24, 'premium', 10, { a: '#1a0a4a', b: '#7a3ad6', emblem: 'star' }, ['Galaxie'],
    gold((s) => isKnife(s) && fin('Schwarze Perle', 'Nachthimmel', 'Doppler Saphir', 'Doppler Phase 2')(s), 12)),
  kase('giftkiste', 'Giftkiste', 12, 'premium', 0, { a: '#0f2a0a', b: '#39ff14', emblem: 'skull' }, ['Gift'],
    gold((s) => fin('Doppler Smaragd', 'Smaragdnetz', 'Schlangenbiss')(s), 12)),
  kase('kaiserkiste', 'Kaiserkiste', 45, 'premium', 20, { a: '#3a1a05', b: '#e8b84a', emblem: 'crown' }, ['Kaiser'],
    gold((s) => fin('Doppler Rubin', 'Doppler Saphir', 'Doppler Smaragd', 'Marmorverlauf', 'Kaiserkaro')(s), 14)),
  // gold
  kase('messer-saphir', 'Messerkiste Saphir', 89, 'gold', 10, { a: '#0a1a5a', b: '#38bdf8', emblem: 'knife' }, ['Frost', 'Ozean'],
    gold((s) => isKnife(s) && fin('Doppler Saphir', 'Polarnacht', 'Kristallblau', 'Nachthimmel', 'Schwarze Perle')(s)),
    (c) => { delete c.consumer; delete c.industrial; delete c.milspec; }),
  kase('messer-rubin', 'Messerkiste Rubin', 99, 'gold', 10, { a: '#3a0508', b: '#ff3d5a', emblem: 'gem' }, ['Glut', 'Drache'],
    gold((s) => isKnife(s) && fin('Doppler Rubin', 'Blutnetz', 'Blutrausch', 'Verlauf', 'Marmorverlauf')(s)),
    (c) => { delete c.consumer; delete c.industrial; delete c.milspec; }),
  kase('handschuh-tresor', 'Handschuh-Tresor', 120, 'gold', 20, { a: '#1a1a24', b: '#e4ae39', emblem: 'glove' }, ['Kaiser', 'Stadt'],
    gold(isGlove), (c) => { delete c.consumer; delete c.industrial; delete c.milspec; }),
  kase('goldtresor', 'Goldtresor', 250, 'gold', 30, { a: '#5a3a05', b: '#ffe08a', emblem: 'crown' }, ['Kaiser', 'Galaxie'],
    gold((s) => s.pattern.kind === 'doppler' || fin('Marmorverlauf', 'Verlauf', 'Gehärtet', 'Kaiserkaro', 'Supraleiter', 'Kristallblau')(s)),
    (c) => { delete c.consumer; delete c.industrial; delete c.milspec; delete c.restricted; }),
  kase('messerkiste', 'Messerkiste', 65, 'gold', 5, { a: '#2a2d33', b: '#c8ccd4', emblem: 'knife' }, ['Rekrut', 'Wüste'],
    gold((s) => isKnife(s) && !['doppler', 'fade', 'marble'].includes(s.pattern.kind)),
    (c) => { delete c.consumer; delete c.industrial; delete c.milspec; }),
  // event
  kase('geisterkiste', 'Geisterkiste', 6.66, 'event', 0, { a: '#1a0a24', b: '#ff6a00', emblem: 'moon' }, ['Geister'],
    gold((s) => fin('Blutnetz', 'Nachthimmel', 'Smaragdnetz', 'Ultraviolett')(s), 10)),
  kase('winterfest', 'Winterfest', 7.5, 'event', 0, { a: '#0b2a52', b: '#e8f4ff', emblem: 'snow' }, ['Winterfest'],
    gold((s) => fin('Polarnacht', 'Kristallblau', 'Arktis', 'Doppler Saphir')(s), 10)),
];

// ------------------------------------------------------------------ lookups
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
