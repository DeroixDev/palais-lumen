/** CS Gambler catalog: weapons, skins, cases. All names are our own. */
import type { CaseDef, CaseForm, CaseLook, CaseMaterial, CaseSection, PatternRecipe, Rarity, SkinDef, WeaponDef } from '../contract';

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
const COLLECTION_MUL: Record<string, number> = {
  Drache: 3.5, Galaxie: 3.5, Kaiser: 5, Gift: 2.5, Ozean: 1.3,
  Prisma: 3, Kosmos: 3, Schmiede: 1.6, Raubtier: 1.4, Abgrund: 1.4, Arkade: 1.2, Gewitter: 1.2,
};

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
  // ---- collections added with the big case update
  ...make('Prisma', [
    ['ar7', 'Prismenbruch', 'covert', 'doppler', ['#1238c8', '#ff3d9a', '#e0f2fe']],
    ['awlong', 'Regenbogenlauf', 'covert', 'fade', ['#ffd400', '#ff4fa3', '#3cc8ff'], { angle: 20 }],
    ['deserthawk', 'Rubinfeuer', 'classified', 'doppler', ['#c4002b', '#ff3d5a', '#ffd0d8']],
    ['m4echo', 'Saphirglanz', 'classified', 'doppler', ['#1238c8', '#38bdf8', '#e0f2fe']],
    ['p9', 'Bonbonverlauf', 'restricted', 'fade', ['#ff6ad5', '#ffd400', '#7cf2ff'], { angle: 40 }],
    ['kestrel', 'Opal', 'restricted', 'holo', ['#f0e0ff'], { hue: 0.8 }],
    ['mikro10', 'Smaragdschliff', 'restricted', 'doppler', ['#00a050', '#39ff8a', '#d8ffe8']],
    ['galant', 'Abendrot', 'milspec', 'fade', ['#ff5a1f', '#ff2b8a', '#3a0a6a'], { angle: 15 }],
    ['vektors', 'Perlglanz', 'milspec', 'holo', ['#ffe8f4'], { hue: 0.2 }],
    ['schnecke', 'Ölfilm', 'milspec', 'holo', ['#3a2a6a'], { hue: 0.55 }],
    ['titan', 'Glasperle', 'industrial', 'anodized', ['#7ad8ff', '#1a3a6a']],
    ['pumpe12', 'Seifenblase', 'industrial', 'holo', ['#d8f4ff'], { hue: 0.4 }],
  ]),
  ...make('Schmiede', [
    ['ar7', 'Härtegrad', 'covert', 'casehardened', ['#24508f', '#c8a24a', '#8b8f94', '#5a3c74']],
    ['awlong', 'Schmiedeherz', 'covert', 'damascus', ['#2b2e33', '#c87a3a', '#e0e4ea']],
    ['kestrel', 'Anlassfarben', 'classified', 'casehardened', ['#1a6ad6', '#c87a3a', '#a7adb5', '#6a3c94']],
    ['bulldog', 'Damaszenerstahl', 'classified', 'damascus', ['#1f2226', '#7a828c', '#dfe4ea']],
    ['falke', 'Kohlenstoff', 'restricted', 'carbon', ['#121418', '#5a6470']],
    ['deserthawk', 'Blauanlauf', 'restricted', 'anodized', ['#2a4ab8', '#0a1236']],
    ['mamba', 'Amboss', 'restricted', 'hex', ['#2a2d33', '#4a4f57', '#8a9099', '#c87a3a']],
    ['kurz25', 'Funkenregen', 'milspec', 'splatter', ['#1a1a1e', '#ff9a3c', '#ffe0a0']],
    ['ursa45', 'Zunderstahl', 'milspec', 'casehardened', ['#3a5a8a', '#a88a4a', '#8b8f94', '#4a3a64']],
    ['stummel', 'Hammerschlag', 'milspec', 'blotch', ['#4a4f57', '#6a7078', '#9aa0a8']],
    ['kobra57', 'Rohguss', 'industrial', 'solid', ['#5a5d62', '#3a3c40']],
    ['lawine', 'Schlacke', 'consumer', 'blotch', ['#2a2624', '#4a403a', '#6a5a4a']],
  ]),
  ...make('Raubtier', [
    ['m4echo', 'Säbelzahn', 'covert', 'tiger', ['#f2a516', '#1a0c02', '#ffd36a'], { freq: 1.1 }],
    ['scout88', 'Königskobra', 'covert', 'snake', ['#e8c040', '#1a1204', '#fff0a0'], { size: 18 }],
    ['ar7', 'Leopardenfell', 'classified', 'snake', ['#d8b06a', '#2a1a0a', '#f0d8a0'], { size: 24 }],
    ['galant', 'Weißer Tiger', 'classified', 'tiger', ['#f4f4f4', '#1a1a1a', '#ffffff']],
    ['p9', 'Krokodil', 'restricted', 'scales', ['#4a6a2a', '#141e0a', '#9ab85a'], { size: 22 }],
    ['mk5', 'Zebra', 'restricted', 'tiger', ['#f0f0f0', '#101010', '#ffffff'], { freq: 1.6 }],
    ['titan', 'Wolfsrudel', 'restricted', 'camo', ['#6a6a70', '#3a3a40', '#9a9aa0', '#1a1a1e']],
    ['hornisse', 'Hornviper', 'milspec', 'snake', ['#9a7a4a', '#2a1a0a', '#d8c08a']],
    ['kapsel90', 'Panther', 'milspec', 'anodized', ['#2a2a34', '#0a0a10']],
    ['sturmflinte', 'Gepard', 'milspec', 'snake', ['#e0b060', '#2a1a08', '#f8e0a0'], { size: 12 }],
    ['bulldog', 'Bärenfell', 'industrial', 'blotch', ['#4a3424', '#2a1a10', '#6a4a30']],
    ['brecher', 'Wildschwein', 'industrial', 'camo', ['#5a4a3a', '#3a2e22', '#7a6a50']],
  ]),
  ...make('Kosmos', [
    ['ar7', 'Sternenmeer', 'covert', 'galaxy', ['#1a3a8a', '#ff6ad5', '#ffffff']],
    ['mamba', 'Schwarzes Loch', 'covert', 'galaxy', ['#0a0a1a', '#7a1aff', '#ffd0a0']],
    ['kestrel', 'Nordlicht', 'classified', 'galaxy', ['#00c896', '#2a7aff', '#e0fff8']],
    ['vektors', 'Quasar', 'classified', 'doppler', ['#3a2bd6', '#3de9ff', '#ffffff']],
    ['deserthawk', 'Mondlandung', 'restricted', 'marble', ['#3a3d4a', '#9a9fb8', '#f0f2ff']],
    ['scout88', 'Sternbild', 'restricted', 'circuit', ['#0b0b24', '#9a9aff', '#ffffff']],
    ['kapsel90', 'Plasma', 'restricted', 'acid', ['#2a0a6a', '#ff2bd6', '#3de9ff', '#1a0a3a']],
    ['kurz25', 'Raumstation', 'milspec', 'hex', ['#d8dce8', '#9aa0b0', '#5a6070']],
    ['spektor', 'Asteroid', 'milspec', 'blotch', ['#3a3430', '#5a4a40', '#8a7a6a']],
    ['schnecke', 'Sonnenwind', 'milspec', 'fade', ['#ffb300', '#ff3d9a', '#3a0a6a'], { angle: 25 }],
    ['pumpe12', 'Mondgestein', 'industrial', 'digital', ['#5a5d6a', '#3a3c46', '#8a8d9a']],
    ['stummel', 'Vakuum', 'consumer', 'solid', ['#1a1a24', '#0a0a12']],
  ]),
  ...make('Farbenspiel', [
    ['m4echo', 'Flamingo', 'covert', 'fade', ['#ff6ad5', '#ff9ac8', '#fff0f8'], { angle: 30 }],
    ['ar7', 'Schneeweiß', 'covert', 'marble', ['#f4f6fa', '#c8ccd8', '#ffffff', '#9aa0b0']],
    ['deserthawk', 'Obsidian', 'covert', 'carbon', ['#08080a', '#3a3a44']],
    ['awlong', 'Kirschrot', 'classified', 'anodized', ['#e0102a', '#4a0008']],
    ['galant', 'Goldstaub', 'classified', 'holo', ['#ffd870'], { hue: 0.12 }],
    ['p9', 'Pinkblitz', 'restricted', 'lightning', ['#2a0a24', '#ffffff', '#ff4fd8']],
    ['kestrel', 'Tiefschwarz', 'restricted', 'solid', ['#0e0e12', '#050507']],
    ['mikro10', 'Kanariengelb', 'restricted', 'anodized', ['#ffe000', '#7a5a00']],
    ['falke', 'Königsblau', 'restricted', 'anodized', ['#1a4ad6', '#081a5a']],
    ['scout88', 'Pastell', 'milspec', 'tiles', ['#ffd0e8', '#d0e8ff', '#e8ffd0', '#fff0c0']],
    ['kobra57', 'Limette', 'milspec', 'anodized', ['#9dff00', '#2a5a00']],
    ['mk5', 'Lachs', 'milspec', 'solid', ['#ff8a7a', '#d86a5a']],
    ['schnecke', 'Elfenbeinweiß', 'milspec', 'solid', ['#f0eadc', '#d8d0c0']],
    ['lawine', 'Neonpink', 'milspec', 'stripes', ['#14101a', '#ff2bd6'], { angle: -30, width: 28 }],
    ['hornisse', 'Sonnengelb', 'industrial', 'solid', ['#ffc800', '#d8a000']],
    ['ursa45', 'Grasgrün', 'industrial', 'solid', ['#3aa83a', '#207020']],
    ['bulldog', 'Rosenholz', 'industrial', 'wood', ['#c86a7a', '#6a2a3a']],
    ['titan', 'Himmelblau', 'consumer', 'solid', ['#7ac0ff', '#4a90d8']],
  ]),
  ...make('Kirschblüte', [
    ['ar7', 'Hanami', 'covert', 'splatter', ['#ffe8f0', '#ff8ab8', '#c4306a', '#5a2a3a'], { count: 40 }],
    ['mamba', 'Sakura', 'covert', 'fade', ['#ffd0e8', '#ff6aa8', '#7a1a4a'], { angle: 15 }],
    ['scout88', 'Blütenregen', 'classified', 'splatter', ['#2a1a24', '#ffb0d0', '#ffffff']],
    ['kobra57', 'Koi', 'classified', 'scales', ['#ff7a3a', '#fff4ea', '#1a1a1a'], { size: 24 }],
    ['mk5', 'Teehaus', 'restricted', 'wood', ['#a85a3a', '#4a1a0a']],
    ['galant', 'Lampion', 'restricted', 'tiles', ['#c4161c', '#ffcc66', '#1a0a08']],
    ['vektors', 'Zierteich', 'milspec', 'waves', ['#1a4a5a', '#4aa8b8', '#e8f8ff'], { size: 30 }],
    ['sturmflinte', 'Bonsai', 'milspec', 'camo', ['#4a6a3a', '#2a3a1a', '#ffb0d0', '#6a4a2a']],
    ['kurz25', 'Papierfächer', 'milspec', 'stripes', ['#f8f0e0', '#c4306a'], { angle: 60, width: 20 }],
    ['lawine', 'Steingarten', 'industrial', 'blotch', ['#8a8a84', '#6a6a64', '#b0b0a8']],
  ]),
  ...make('Sommerhitze', [
    ['awlong', 'Strandgut', 'covert', 'waves', ['#ffd890', '#2ac8d8', '#0a6a8a', '#ffffff'], { size: 40 }],
    ['m4echo', 'Tropenfieber', 'classified', 'graffiti', ['#1a3a2a', '#ff6a3a', '#ffd400', '#2ad8a8']],
    ['p9', 'Wassermelone', 'classified', 'stripes', ['#2a8a3a', '#ff4a5a', '#1a4a1a'], { angle: 0, width: 30 }],
    ['spektor', 'Palmenstrand', 'restricted', 'camo', ['#e8d090', '#3aa86a', '#2a7aa8', '#ffffff']],
    ['kapsel90', 'Eiswürfel', 'restricted', 'hex', ['#c8f0ff', '#8ad0f0', '#ffffff', '#5aa8d8']],
    ['ursa45', 'Sonnenbrand', 'milspec', 'fade', ['#ff8a3a', '#ff4a6a', '#ffd0a0'], { angle: 50 }],
    ['schnecke', 'Surfbrett', 'milspec', 'stripes', ['#ffffff', '#ff6a3a', '#2ac8d8'], { angle: -10, width: 26 }],
    ['hornisse', 'Flipflop', 'industrial', 'solid', ['#ff6a8a', '#d84a6a']],
    ['pumpe12', 'Sandburg', 'consumer', 'blotch', ['#e8d0a0', '#c8a870', '#a88850']],
  ]),
  ...make('Arkade', [
    ['ar7', 'Highscore', 'covert', 'graffiti', ['#0a0a1a', '#ff2bd6', '#00e5ff', '#ffe600', '#7cff00']],
    ['kestrel', 'Synthwave', 'classified', 'fade', ['#ff2b8a', '#7a2bff', '#00c8ff'], { angle: -10 }],
    ['deserthawk', 'Kassette', 'classified', 'stripes', ['#1a1a1a', '#ff6a3a', '#ffd400', '#2ac8d8'], { angle: 0, width: 18 }],
    ['mikro10', '8-Bit', 'restricted', 'digital', ['#2a2a6a', '#ff4a8a', '#ffd400', '#2ad8a8'], { cell: 18 }],
    ['falke', 'Joystick', 'restricted', 'circuit', ['#14081f', '#ff2bd6', '#ffe600']],
    ['bulldog', 'VHS', 'milspec', 'lightning', ['#0a0a14', '#e0e0ff', '#7a7aff']],
    ['mk5', 'Diskokugel', 'milspec', 'hex', ['#c8ccd8', '#8a8f9a', '#ffffff', '#ff6ad5']],
    ['sturmflinte', 'Neonröhre', 'milspec', 'anodized', ['#ff2bd6', '#2a0a3a']],
    ['scout88', 'Pixelwüste', 'industrial', 'digital', ['#c89a5a', '#8a6a3a', '#e8c88a']],
    ['brecher', 'Spielhalle', 'industrial', 'tiles', ['#1a1a3a', '#3a3a8a', '#ff2bd6']],
  ]),
  ...make('Abgrund', [
    ['awlong', 'Leere', 'covert', 'web', ['#3a0a6a', '#050208'], { webs: 5 }],
    ['m4echo', 'Schattenriss', 'covert', 'dragon', ['#0a0a0e', '#5a5a6a', '#000000', '#c8c8d8']],
    ['ar7', 'Nachtschatten', 'classified', 'carbon', ['#0a0a10', '#4a3a7a']],
    ['vektors', 'Rabenfeder', 'classified', 'scales', ['#14141c', '#050508', '#5a5a7a'], { size: 16 }],
    ['spektor', 'Finsternis', 'restricted', 'blotch', ['#0a0a0e', '#1a1a24', '#3a3a4a']],
    ['scout88', 'Teer', 'restricted', 'acid', ['#0a0a0a', '#1a1a20', '#3a3a48', '#050505']],
    ['kobra57', 'Rußwolke', 'milspec', 'camo', ['#2a2a2e', '#141416', '#4a4a50']],
    ['ursa45', 'Grabesstille', 'milspec', 'topo', ['#0e0e14', '#2a2a3a', '#6a6a8a']],
    ['titan', 'Neumond', 'industrial', 'solid', ['#18181e', '#0c0c10']],
    ['mikro10', 'Mitternachtsblau', 'industrial', 'anodized', ['#1a2a5a', '#05081a']],
  ]),
  ...make('Gewitter', [
    ['ar7', 'Kugelblitz', 'covert', 'lightning', ['#0a0a2a', '#ffffff', '#7ad8ff']],
    ['awlong', 'Hochspannung', 'classified', 'lightning', ['#1a1a0a', '#fff8c0', '#ffd400']],
    ['kestrel', 'Sturmauge', 'classified', 'topo', ['#0a1a3a', '#2a5aa8', '#c8e8ff']],
    ['galant', 'Donnerhall', 'restricted', 'lightning', ['#14082a', '#e0d0ff', '#9a6aff']],
    ['p9', 'Elektron', 'restricted', 'circuit', ['#0a1a2a', '#3de9ff', '#ffffff']],
    ['mamba', 'Gewitterfront', 'milspec', 'blotch', ['#2a3040', '#4a5468', '#8a96b0']],
    ['kurz25', 'Funkstille', 'milspec', 'digital', ['#3a4050', '#2a2e38', '#5a6070']],
    ['stummel', 'Kurzschluss', 'industrial', 'stripes', ['#1a1a1a', '#ffd400'], { angle: 45, width: 24 }],
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

// Finishes added with the big case update: every knife gets three of them (on top of its old set,
// so existing skin ids stay exactly as they were).
const KNIFE_FINISHES_2: Fin[] = [
  ['Gammaschimmer', 'doppler', ['#00a878', '#7cff3a', '#e0ffd0']],
  ['Goldader', 'marble', ['#3a2a05', '#e8b84a', '#fff4c8'], { bands: 1.2 }],
  ['Rubinader', 'marble', ['#3a0508', '#c4161c', '#ffd0d8']],
  ['Kirschblüte', 'fade', ['#ffd0e8', '#ff6aa8', '#7a1a4a'], { angle: 20 }],
  ['Sternenstaub', 'galaxy', ['#5a2bd6', '#ff6ad5', '#ffffff']],
  ['Giftzahn', 'web', ['#3aff6a', '#04140a']],
  ['Rostbraun', 'blotch', ['#4a2a14', '#8a4a1a', '#c87a3a']],
  ['Mitternacht', 'anodized', ['#1a1a3a', '#05050f']],
];
function knifeRows2(): Row[] {
  const rows: Row[] = [];
  KNIVES.forEach((k, ki) => {
    [0, 1, 2].forEach((j) => {
      const [name, kind, colors, params] = KNIFE_FINISHES_2[(ki * 3 + j) % KNIFE_FINISHES_2.length];
      rows.push([k, name, 'gold', kind, colors, params]);
    });
  });
  return rows;
}
const GLOVE_ROWS_2: Row[] = [
  ['sporthandschuhe', 'Flamingo', 'gold', 'stripes', ['#1a1a1a', '#ff6ad5'], { angle: -20, width: 22 }],
  ['sporthandschuhe', 'Goldfaust', 'gold', 'anodized', ['#ffe08a', '#8a5a0a']],
  ['fahrerhandschuhe', 'Mitternachtsfahrt', 'gold', 'carbon', ['#0a0a14', '#4a6aff']],
  ['fahrerhandschuhe', 'Kirschleder', 'gold', 'wood', ['#8a2a3a', '#3a0a14']],
  ['bandagen', 'Neonband', 'gold', 'stripes', ['#0a0a12', '#00ffd0', '#ff2bd6'], { angle: 30, width: 20 }],
  ['bandagen', 'Schneeweiß', 'gold', 'camo', ['#f4f6fa', '#c8ccd8', '#ffffff']],
  ['sporthandschuhe', 'Gammastrahl', 'gold', 'doppler', ['#00a878', '#7cff3a', '#e0ffd0']],
];

/** The original ★ set: the first 21 cases draw from this, so their contents never change. */
const GOLD_V1: SkinDef[] = [...make('Messer', knifeRows()), ...make('Handschuhe', GLOVE_ROWS)];
const GOLD: SkinDef[] = [...GOLD_V1, ...make('Messer', knifeRows2()), ...make('Handschuhe', GLOVE_ROWS_2)];

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
  return GOLD_V1.filter(filter).slice(0, max).map((s) => s.id);
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

const CASES_V1: CaseDef[] = [
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

// ------------------------------------------------------------------ shelves + the big case update
export interface CaseSectionInfo { id: CaseSection; name: string; blurb: string }
/** Shop shelves, in page order. */
export const CASE_SECTIONS: CaseSectionInfo[] = [
  { id: 'einsteiger', name: 'Einsteiger', blurb: 'Günstig rein, mit kleiner Chance auf ein Messer.' },
  { id: 'budget', name: 'Budget', blurb: 'Für ein paar Cent: ohne ★, dafür ständig etwas Neues.' },
  { id: 'klassiker', name: 'Klassiker', blurb: 'Die Sammlungen, mit denen alles anfing.' },
  { id: 'waffen', name: 'Waffen-Spezial', blurb: 'Eine Waffengattung pro Kiste.' },
  { id: 'farben', name: 'Farben', blurb: 'Rot, Blau, Neon … eine Farbe, quer durch alle Sammlungen.' },
  { id: 'muster', name: 'Muster', blurb: 'Doppler, Verlauf, Gehärtet, Damast und Co.' },
  { id: 'messer', name: 'Messer & Handschuhe', blurb: 'Hohe ★-Chance, hoher Einsatz.' },
  { id: 'premium', name: 'Premium & High Roller', blurb: 'Teuer. Sehr teuer. Und manchmal unbezahlbar.' },
  { id: 'risiko', name: '50/50 & Risiko', blurb: 'Wenige Items, riesige Spanne: Schrott oder ★.' },
  { id: 'event', name: 'Event & Saison', blurb: 'Nur für kurze Zeit … zumindest fast.' },
  { id: 'rang', name: 'Rang-Kisten', blurb: 'Werden mit deiner Karriere-Stufe freigeschaltet.' },
];

/** Colour family of a skin, from its palette (first colours weigh most). */
type Tone = 'rot' | 'orange' | 'gelb' | 'gold' | 'gruen' | 'blau' | 'lila' | 'pink' | 'schwarz' | 'weiss' | 'neon';
function hsl(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const sat = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  return [h, sat, l];
}
const toneCache = new Map<string, Record<Tone, number>>();
function tones(s: SkinDef): Record<Tone, number> {
  let t = toneCache.get(s.id);
  if (t) return t;
  t = { rot: 0, orange: 0, gelb: 0, gold: 0, gruen: 0, blau: 0, lila: 0, pink: 0, schwarz: 0, weiss: 0, neon: 0 };
  let tw = 0;
  s.pattern.colors.forEach((c, i) => {
    const w = i === 0 ? 1 : i === 1 ? 0.8 : 0.5;
    tw += w;
    const [h, sat, l] = hsl(c);
    if (l < 0.12) { t!.schwarz += w; return; }
    if (l > 0.88 || (sat < 0.2 && l > 0.72)) { t!.weiss += w; return; }
    if (sat < 0.2) { if (l < 0.22) t!.schwarz += w * 0.6; return; }
    if (sat > 0.9 && l > 0.42 && l < 0.65 && !(h > 12 && h < 45)) t!.neon += w * 0.9;
    if (h < 12 || h >= 348) t!.rot += w;
    else if (h < 36) t!.orange += w;
    else if (h < 62) { if (sat < 0.9 && l < 0.72) t!.gold += w; t!.gelb += w * 0.7; }
    else if (h < 170) t!.gruen += w;
    else if (h < 255) t!.blau += w;
    else if (h < 292) t!.lila += w;
    else if (l > 0.55 || h < 335) t!.pink += w; else t!.rot += w * 0.7;
  });
  for (const k in t) t[k as Tone] /= tw || 1;
  toneCache.set(s.id, t);
  return t;
}
const tone = (...ts: Tone[]) => (s: SkinDef) => ts.reduce((a, k) => a + tones(s)[k], 0) >= 0.42;

/** n items spread over the price range of a pool (cheapest .. priciest), deterministic. */
function spread(pool: SkinDef[], n: number): SkinDef[] {
  const sorted = [...pool].sort((a, b) => a.basePrice - b.basePrice || (a.id < b.id ? -1 : 1));
  if (sorted.length <= n) return sorted;
  if (n === 1) return [sorted[sorted.length - 1]];
  const out: SkinDef[] = [];
  for (let i = 0; i < n; i++) out.push(sorted[Math.round((i * (sorted.length - 1)) / (n - 1))]);
  return [...new Set(out)];
}
/** n items picked by a salted hash: a different, stable mix per case. */
function mixPick(pool: SkinDef[], n: number, salt: string): SkinDef[] {
  return [...pool].sort((a, b) => h32(a.id + salt) - h32(b.id + salt)).slice(0, n);
}
/** The n priciest of a pool. */
const top = (pool: SkinDef[], n: number) => [...pool].sort((a, b) => b.basePrice - a.basePrice).slice(0, n);

type Per = Partial<Record<Rarity, number>>;
type Pick = (pool: SkinDef[], n: number) => SkinDef[];
/** Gun contents: per tier, `per[r]` skins of the filtered pool. */
function guns(filter: (s: SkinDef) => boolean, per: Per, pick: Pick = spread): Partial<Record<Rarity, string[]>> {
  const out: Partial<Record<Rarity, string[]>> = {};
  for (const r of RARITY_LIST) {
    const n = per[r];
    if (!n || r === 'gold') continue;
    const ids = pick(GUNS.filter((s) => s.rarity === r && filter(s)), n).map((s) => s.id);
    if (ids.length) out[r] = ids;
  }
  return out;
}
const RARITY_LIST: Rarity[] = ['consumer', 'industrial', 'milspec', 'restricted', 'classified', 'covert'];
const golds = (filter: (s: SkinDef) => boolean, n: number, pick: Pick = spread) => pick(GOLD.filter(filter), n).map((s) => s.id);
const kindOf = (...ks: string[]) => (s: SkinDef) => ks.includes(WEAPONS.find((w) => w.id === s.weapon)?.kind ?? '');
const pat = (...ks: string[]) => (s: SkinDef) => ks.includes(s.pattern.kind);
const col = (...cs: string[]) => (s: SkinDef) => cs.includes(s.collection);
const wpn = (...ws: string[]) => (s: SkinDef) => ws.includes(s.weapon);
const any = () => true;
const STD: Per = { milspec: 4, restricted: 3, classified: 2, covert: 2 };

interface Spec {
  id: string; name: string; price: number; cat: CaseDef['category']; section: CaseSection; level?: number;
  look: CaseLook; contents: Partial<Record<Rarity, string[]>>; gold?: string[]; pop?: number; badge?: string;
  /** Skins that must be in this case on top of the picked ones (sorted into their tier). */
  extra?: string[];
}
function box(o: Spec): CaseDef {
  const contents = { ...o.contents };
  if (o.gold?.length) contents.gold = [...o.gold];
  for (const id of o.extra ?? []) {
    const sk = SKINS.find((x) => x.id === id);
    if (sk && !contents[sk.rarity]?.includes(id)) (contents[sk.rarity] ??= []).push(id);
  }
  return { id: o.id, name: o.name, price: o.price, category: o.cat, level: o.level ?? 0, look: o.look, contents, section: o.section, pop: o.pop, badge: o.badge };
}
const L = (a: string, b: string, emblem: string, form: CaseForm, material: CaseMaterial, trim?: string, label?: string): CaseLook =>
  ({ a, b, emblem, form, material, ...(trim ? { trim } : {}), ...(label ? { label } : {}) });

// Look + shelf for the original 21 cases.
const V1_META: Record<string, [CaseSection, CaseForm, CaseMaterial, number]> = {
  schrottkiste: ['einsteiger', 'crate', 'metal', 55],
  rekrutenkiste: ['einsteiger', 'crate', 'paint', 62],
  sparkiste: ['einsteiger', 'drum', 'paint', 48],
  glutkiste: ['klassiker', 'crate', 'metal', 92],
  neonkiste: ['klassiker', 'neon', 'carbon', 84],
  frostkiste: ['klassiker', 'capsule', 'metal', 71],
  wuestensturm: ['klassiker', 'chest', 'wood', 52],
  dschungelkiste: ['klassiker', 'drum', 'paint', 46],
  stadtkiste: ['klassiker', 'briefcase', 'carbon', 57],
  ozeankiste: ['klassiker', 'briefcase', 'metal', 63],
  drachenkiste: ['premium', 'casket', 'leather', 96],
  galaxiekiste: ['premium', 'capsule', 'carbon', 88],
  giftkiste: ['premium', 'drum', 'metal', 66],
  kaiserkiste: ['premium', 'casket', 'gold', 78],
  'messer-saphir': ['messer', 'briefcase', 'leather', 74],
  'messer-rubin': ['messer', 'casket', 'leather', 76],
  'handschuh-tresor': ['messer', 'safe', 'metal', 61],
  goldtresor: ['premium', 'safe', 'gold', 83],
  messerkiste: ['messer', 'crate', 'carbon', 87],
  geisterkiste: ['event', 'chest', 'wood', 72],
  winterfest: ['event', 'capsule', 'paint', 64],
};
for (const c of CASES_V1) {
  const m = V1_META[c.id];
  if (!m) continue;
  c.section = m[0]; c.look.form = m[1]; c.look.material = m[2]; c.pop = m[3];
}

const CASES_V2: CaseDef[] = [
  // ---- Einsteiger
  box({ id: 'erste-schritte', name: 'Erste Schritte', price: 0.79, cat: 'starter', section: 'einsteiger', pop: 58,
    look: L('#2f4a6a', '#7ac0ff', 'chevron', 'briefcase', 'paint', '#c8d0da'),
    contents: guns(col('Farbenspiel', 'Schrott', 'Rekrut'), { consumer: 3, industrial: 3, milspec: 3, restricted: 2 }),
    gold: golds((s) => s.weapon === 'klappmesser' || s.weapon === 'dolch', 4) }),
  box({ id: 'zielscheibe', name: 'Zielscheibe', price: 1.29, cat: 'starter', section: 'einsteiger', pop: 51, badge: 'NEU',
    look: L('#5a1a1a', '#ff5a4a', 'target', 'drum', 'metal'),
    contents: guns(any, { industrial: 3, milspec: 3, restricted: 3, classified: 1 }, (p, n) => mixPick(p.filter((s) => s.basePrice < 6), n, 'ziel')),
    gold: golds(pat('camo', 'blotch', 'anodized'), 4) }),
  // ---- Budget (no ★, a few cents)
  box({ id: 'groschenkiste', name: 'Groschenkiste', price: 0.1, cat: 'starter', section: 'budget', pop: 40,
    look: L('#4a3a24', '#c8a060', 'coin', 'drum', 'wood'),
    contents: guns(any, { consumer: 4, industrial: 3, milspec: 2 }, (p, n) => spread(p.filter((s) => s.basePrice < 1), n)) }),
  box({ id: 'pfennigfuchs', name: 'Pfennigfuchs', price: 0.05, cat: 'starter', section: 'budget', pop: 36,
    look: L('#3a3f2a', '#a8b060', 'paw', 'crate', 'wood'),
    contents: guns(any, { consumer: 4, industrial: 4 }, (p, n) => mixPick(p, n, 'fuchs')) }),
  box({ id: 'kleingeld', name: 'Kleingeld', price: 0.4, cat: 'starter', section: 'budget', pop: 44,
    look: L('#24384a', '#5ac8d8', 'coin', 'briefcase', 'metal'),
    contents: guns(any, { industrial: 3, milspec: 4, restricted: 3 }, (p, n) => mixPick(p.filter((s) => s.basePrice < 4), n, 'klein')) }),
  box({ id: 'muenzschlitz', name: 'Münzschlitz', price: 1.5, cat: 'starter', section: 'budget', pop: 42,
    look: L('#3a2a4a', '#c08aff', 'dice', 'safe', 'paint'),
    contents: guns(any, { milspec: 4, restricted: 4, classified: 3 }, (p, n) => mixPick(p.filter((s) => s.basePrice < 15), n, 'muenz')) }),
  box({ id: 'restposten', name: 'Restposten', price: 0.25, cat: 'starter', section: 'budget', pop: 38,
    look: L('#4a4038', '#e09a50', 'gear', 'crate', 'paint', undefined, 'RESTE'),
    contents: guns(col('Schmiede', 'Raubtier', 'Kosmos', 'Arkade', 'Abgrund', 'Gewitter', 'Sommerhitze', 'Kirschblüte'), { consumer: 3, industrial: 4, milspec: 4 }) }),
  // ---- Klassiker: the new collections
  box({ id: 'prismakiste', name: 'Prismakiste', price: 22, cat: 'premium', section: 'klassiker', level: 5, pop: 90, badge: 'HOT',
    look: L('#1a1a4a', '#ff4fd8', 'gem', 'capsule', 'carbon', '#d8e8ff'),
    contents: guns(col('Prisma'), { industrial: 2, milspec: 3, restricted: 3, classified: 2, covert: 2 }),
    gold: golds(pat('doppler', 'fade'), 8) }),
  box({ id: 'schmiedekiste', name: 'Schmiedekiste', price: 6, cat: 'standard', section: 'klassiker', pop: 68,
    look: L('#2a2622', '#ff8a2a', 'anvil', 'crate', 'metal', '#c87a3a'),
    contents: guns(col('Schmiede'), { consumer: 1, industrial: 1, milspec: 3, restricted: 3, classified: 2, covert: 2 }),
    gold: golds(pat('casehardened', 'damascus', 'blotch'), 8) }),
  box({ id: 'raubtierkiste', name: 'Raubtierkiste', price: 5, cat: 'standard', section: 'klassiker', pop: 74,
    look: L('#3a2408', '#f2a516', 'claw', 'chest', 'leather', '#e8c070'),
    contents: guns(col('Raubtier'), { industrial: 2, milspec: 3, restricted: 3, classified: 2, covert: 2 }),
    gold: golds(pat('tiger', 'snake'), 7) }),
  box({ id: 'kosmoskiste', name: 'Kosmoskiste', price: 20, cat: 'premium', section: 'klassiker', level: 5, pop: 82,
    look: L('#0a0a2a', '#7a5aff', 'galaxy', 'capsule', 'metal', '#b8c0ff'),
    contents: guns(col('Kosmos'), { consumer: 1, industrial: 1, milspec: 3, restricted: 3, classified: 2, covert: 2 }),
    gold: golds(pat('galaxy', 'doppler'), 8) }),
  box({ id: 'arkadekiste', name: 'Arkadekiste', price: 5, cat: 'standard', section: 'klassiker', pop: 70, badge: 'NEU',
    look: L('#14082a', '#ff2bd6', 'joystick', 'neon', 'paint', '#00e5ff'),
    contents: guns(col('Arkade'), { industrial: 2, milspec: 3, restricted: 2, classified: 2, covert: 1 }),
    gold: golds((s) => fin('Doppler Phase 2', 'Verlauf', 'Ultraviolett', 'Neonnacht', 'Neonband')(s), 6) }),
  box({ id: 'abgrundkiste', name: 'Abgrundkiste', price: 6, cat: 'standard', section: 'klassiker', pop: 66,
    look: L('#0c0c12', '#8a5aff', 'eye', 'safe', 'carbon', '#5a5a6a'),
    contents: guns(col('Abgrund'), { industrial: 2, milspec: 2, restricted: 2, classified: 2, covert: 2 }),
    gold: golds((s) => fin('Schwarze Perle', 'Mitternacht', 'Nachtfalter', 'Mitternachtsfahrt', 'Ultraviolett')(s), 7) }),
  box({ id: 'gewitterkiste', name: 'Gewitterkiste', price: 5, cat: 'standard', section: 'klassiker', pop: 60,
    look: L('#141a2e', '#7ad8ff', 'bolt', 'drum', 'metal', '#ffd400'),
    contents: guns(col('Gewitter'), { industrial: 1, milspec: 2, restricted: 2, classified: 2, covert: 1 }),
    gold: golds((s) => fin('Doppler Saphir', 'Kristallblau', 'Supraleiter', 'Kobalt')(s), 6) }),
  // ---- Waffen-Spezial
  box({ id: 'pistolenkiste', name: 'Pistolenkiste', price: 4, cat: 'standard', section: 'waffen', pop: 72,
    look: L('#2a2d33', '#ffb020', 'ammo', 'briefcase', 'metal', '#c8ccd4', 'PISTOLEN'),
    contents: guns(kindOf('pistol'), { industrial: 2, milspec: 4, restricted: 3, classified: 2, covert: 2 }),
    gold: golds((s) => s.weapon === 'klappmesser' || s.weapon === 'stilett', 5) }),
  box({ id: 'gewehrkiste', name: 'Gewehrkiste', price: 6, cat: 'standard', section: 'waffen', pop: 86,
    look: L('#33301e', '#e8c040', 'ammo', 'crate', 'paint', '#8a8f96', 'GEWEHRE'),
    contents: guns(kindOf('rifle'), { industrial: 2, milspec: 4, restricted: 3, classified: 3, covert: 3 }),
    gold: golds((s) => s.weapon === 'bajonett' || s.weapon === 'krallmesser', 5) }),
  box({ id: 'scharfschuetzenkiste', name: 'Scharfschützenkiste', price: 7, cat: 'standard', section: 'waffen', pop: 79,
    look: L('#1e2a24', '#5aff9a', 'target', 'drum', 'carbon', '#8a9a90', 'SNIPER'),
    contents: guns(kindOf('sniper'), { industrial: 2, milspec: 3, restricted: 3, classified: 2, covert: 3 }),
    gold: golds((s) => s.weapon === 'jagdmesser' || s.weapon === 'buschmesser', 5) }),
  box({ id: 'smgkiste', name: 'SMG-Kiste', price: 3, cat: 'standard', section: 'waffen', pop: 54,
    look: L('#2a1a3a', '#c06aff', 'bolt', 'crate', 'carbon', '#a8a0b8', 'SMG'),
    contents: guns(kindOf('smg'), { industrial: 2, milspec: 4, restricted: 3, classified: 2, covert: 2 }),
    gold: golds((s) => s.weapon === 'schmetterling' || s.weapon === 'dolch', 5) }),
  box({ id: 'schrotkiste', name: 'Schrotflintenkiste', price: 3, cat: 'standard', section: 'waffen', pop: 41,
    look: L('#3a1a10', '#ff6a3a', 'shell', 'chest', 'wood', '#c87a3a', 'SCHROT'),
    contents: guns(kindOf('shotgun'), { consumer: 2, industrial: 3, milspec: 4, restricted: 2, classified: 1 }),
    gold: golds((s) => s.weapon === 'buschmesser', 4) }),
  box({ id: 'schwerekiste', name: 'Schwere Waffen', price: 3, cat: 'standard', section: 'waffen', pop: 38,
    look: L('#2a2a1a', '#d8d040', 'gear', 'safe', 'metal', '#8a8f96', 'SCHWER'),
    contents: guns(kindOf('heavy'), { consumer: 2, industrial: 3, milspec: 4, restricted: 2 }),
    gold: golds(isGlove, 4) }),
  box({ id: 'ar7-arsenal', name: 'AR-7 Arsenal', price: 9, cat: 'standard', section: 'waffen', pop: 91, badge: 'HOT',
    look: L('#3a1408', '#ff5a1f', 'ammo', 'crate', 'metal', '#e8b84a', 'AR-7'),
    contents: guns(wpn('ar7'), { restricted: 4, classified: 4, covert: 5 }),
    gold: golds(wpn('krallmesser'), 4) }),
  box({ id: 'longshot-kiste', name: 'Longshot-Kiste', price: 10, cat: 'standard', section: 'waffen', pop: 84,
    look: L('#0e1a2e', '#38bdf8', 'target', 'briefcase', 'leather', '#c8d8e8', 'AW-L'),
    contents: guns(wpn('awlong'), { milspec: 2, restricted: 3, classified: 3, covert: 3 }),
    gold: golds(wpn('bajonett'), 4) }),
  box({ id: 'hawk-kiste', name: 'Hawk-Kiste', price: 6, cat: 'standard', section: 'waffen', pop: 77,
    look: L('#3a2a10', '#ffcc33', 'wings', 'briefcase', 'metal', '#ffe08a', 'HAWK'),
    contents: guns(wpn('deserthawk'), { milspec: 2, restricted: 3, classified: 4, covert: 3 }),
    gold: golds(wpn('stilett', 'klappmesser'), 4) }),
  // ---- Farben
  box({ id: 'farbe-rot', name: 'Rote Kiste', price: 5, cat: 'standard', section: 'farben', pop: 69,
    look: L('#5a0a10', '#ff3040', 'drop', 'capsule', 'paint', '#ffb0b0', 'ROT'),
    contents: guns(tone('rot'), STD), gold: golds(tone('rot'), 5) }),
  box({ id: 'farbe-blau', name: 'Blaue Kiste', price: 5, cat: 'standard', section: 'farben', pop: 67,
    look: L('#0a1e5a', '#3a8aff', 'drop', 'crate', 'paint', '#a8c8ff', 'BLAU'),
    contents: guns(tone('blau'), STD), gold: golds(tone('blau'), 5) }),
  box({ id: 'farbe-gruen', name: 'Grüne Kiste', price: 5, cat: 'standard', section: 'farben', pop: 58,
    look: L('#0a3a1a', '#3aff7a', 'drop', 'drum', 'paint', '#a8ffc8', 'GRÜN'),
    contents: guns(tone('gruen'), STD), gold: golds(tone('gruen'), 5) }),
  box({ id: 'farbe-gold', name: 'Goldene Kiste', price: 8, cat: 'standard', section: 'farben', pop: 81,
    look: L('#5a3a05', '#ffd24a', 'crown', 'chest', 'gold', '#fff1b8', 'GOLD'),
    contents: guns(tone('gold', 'gelb'), STD), extra: ['galant-goldstaub', 'hornisse-sonnengelb'], gold: golds(tone('gold', 'gelb', 'orange'), 5) }),
  box({ id: 'farbe-schwarz', name: 'Schwarze Kiste', price: 6, cat: 'standard', section: 'farben', pop: 73,
    look: L('#0a0a0c', '#6a6a7a', 'skull', 'safe', 'carbon', '#3a3a44', 'SCHWARZ'),
    contents: guns(tone('schwarz'), STD), gold: golds(tone('schwarz'), 5) }),
  box({ id: 'farbe-weiss', name: 'Weiße Kiste', price: 6, cat: 'standard', section: 'farben', pop: 55,
    look: L('#d8dce4', '#ffffff', 'snow', 'capsule', 'paint', '#9aa0b0', 'WEISS'),
    contents: guns(tone('weiss'), STD), extra: ['scout88-pastell'], gold: golds(tone('weiss'), 5) }),
  box({ id: 'farbe-pink', name: 'Pinke Kiste', price: 6, cat: 'standard', section: 'farben', pop: 64,
    look: L('#5a0a3a', '#ff6ad5', 'heart', 'briefcase', 'leather', '#ffd0f0', 'PINK'),
    contents: guns(tone('pink'), STD), extra: ['p9-pinkblitz'], gold: golds(tone('pink'), 5) }),
  box({ id: 'farbe-neon', name: 'Neonkiste XL', price: 6, cat: 'standard', section: 'farben', pop: 76,
    look: L('#08080f', '#00ffd0', 'circuit', 'neon', 'carbon', '#ff2bd6', 'NEON'),
    contents: guns(tone('neon'), STD), gold: golds(tone('neon'), 5) }),
  box({ id: 'farbe-orange', name: 'Orange Kiste', price: 5, cat: 'standard', section: 'farben', pop: 47,
    look: L('#5a2205', '#ff8a1f', 'flame', 'drum', 'metal', '#ffc890', 'ORANGE'),
    contents: guns(tone('orange'), STD), gold: golds(tone('orange'), 5) }),
  box({ id: 'farbe-lila', name: 'Lila Kiste', price: 5, cat: 'standard', section: 'farben', pop: 50,
    look: L('#2a0a4a', '#a86aff', 'moon', 'casket', 'paint', '#d8c8ff', 'LILA'),
    contents: guns(tone('lila'), STD), gold: golds(tone('lila'), 5) }),
  // ---- Muster
  box({ id: 'doppler-kiste', name: 'Doppler-Kiste', price: 30, cat: 'premium', section: 'muster', level: 5, pop: 93, badge: 'HOT',
    look: L('#1a0a3a', '#ff3d9a', 'gem', 'casket', 'carbon', '#e0e8ff', 'DOPPLER'),
    contents: guns(pat('doppler', 'holo'), { milspec: 2, restricted: 3, classified: 3, covert: 1 }),
    gold: golds(pat('doppler'), 10) }),
  box({ id: 'verlauf-kiste', name: 'Verlaufskiste', price: 15, cat: 'premium', section: 'muster', pop: 80,
    look: L('#3a0a3a', '#ffb000', 'sun', 'capsule', 'paint', '#ffd0f0', 'FADE'),
    contents: guns(pat('fade'), { milspec: 3, restricted: 3, classified: 2, covert: 3 }),
    gold: golds(pat('fade'), 8) }),
  box({ id: 'gehaertet-kiste', name: 'Gehärtet-Kiste', price: 18, cat: 'premium', section: 'muster', pop: 85,
    look: L('#1a2a4a', '#c8a24a', 'shield', 'safe', 'metal', '#5a8ad6', 'GEHÄRTET'),
    contents: guns(pat('casehardened', 'anodized'), { industrial: 2, milspec: 3, restricted: 2, classified: 2, covert: 1 }),
    gold: golds(pat('casehardened'), 9) }),
  box({ id: 'damast-kiste', name: 'Damast & Karbon', price: 9, cat: 'premium', section: 'muster', pop: 62,
    look: L('#1a1c20', '#c8ccd4', 'blade', 'briefcase', 'carbon', '#8e959e', 'DAMAST'),
    contents: guns(pat('damascus', 'carbon'), { milspec: 2, restricted: 3, classified: 3, covert: 2 }),
    gold: golds(pat('damascus', 'carbon'), 8) }),
  box({ id: 'tiger-kiste', name: 'Tigerkäfig', price: 7, cat: 'premium', section: 'muster', pop: 70,
    look: L('#3a1a02', '#ff9a16', 'claw', 'crate', 'wood', '#1a0c02', 'TIGER'),
    contents: guns(pat('tiger'), { milspec: 3, restricted: 3, classified: 1, covert: 1 }),
    gold: golds(pat('tiger'), 7) }),
  box({ id: 'galaxie-muster', name: 'Sternennebel', price: 20, cat: 'premium', section: 'muster', level: 5, pop: 87,
    look: L('#120a3a', '#ff6ad5', 'galaxy', 'casket', 'metal', '#c8b8ff', 'NEBULA'),
    contents: guns(pat('galaxy', 'acid'), { classified: 4, covert: 4 }),
    gold: golds(pat('galaxy'), 8) }),
  box({ id: 'marmor-kiste', name: 'Marmorkiste', price: 16, cat: 'premium', section: 'muster', pop: 64,
    look: L('#e8e0cc', '#c4161c', 'crown', 'casket', 'paint', '#e8b84a', 'MARMOR'),
    contents: guns(pat('marble'), { restricted: 3, classified: 3, covert: 3 }),
    gold: golds(pat('marble'), 9) }),
  box({ id: 'schlangen-kiste', name: 'Schlangengrube', price: 7, cat: 'premium', section: 'muster', pop: 59,
    look: L('#1a2a0a', '#c8e040', 'snake', 'drum', 'leather', '#8a9a3a', 'VIPER'),
    contents: guns(pat('snake', 'scales'), { industrial: 1, milspec: 3, restricted: 3, classified: 3, covert: 3 }),
    gold: golds(pat('snake'), 7) }),
  box({ id: 'tarn-kiste', name: 'Tarnkiste', price: 2.5, cat: 'standard', section: 'muster', pop: 45,
    look: L('#3a4426', '#a8b46a', 'leaf', 'crate', 'paint', '#6a7044', 'TARN'),
    contents: guns(pat('camo', 'digital'), { consumer: 2, industrial: 3, milspec: 4, restricted: 3, classified: 1 }),
    gold: golds(pat('camo'), 6) }),
  box({ id: 'holo-kiste', name: 'Hologramm-Kiste', price: 8, cat: 'premium', section: 'muster', pop: 61, badge: 'NEU',
    look: L('#1a2a3a', '#8ad8ff', 'eye', 'neon', 'metal', '#ff8ad8', 'HOLO'),
    contents: guns(pat('holo', 'lightning', 'circuit'), { industrial: 2, milspec: 3, restricted: 4, classified: 2, covert: 2 }),
    gold: golds(pat('anodized', 'web'), 7) }),
  // ---- Messer & Handschuhe
  box({ id: 'krallen-kiste', name: 'Krallenkiste', price: 75, cat: 'gold', section: 'messer', level: 5, pop: 89,
    look: L('#1a1a24', '#ff4a6a', 'claw', 'casket', 'carbon', '#e8b84a', 'KRALLE'),
    contents: guns(any, { classified: 3, covert: 3 }, (p, n) => mixPick(p, n, 'kralle')),
    gold: golds(wpn('krallmesser'), 14) }),
  box({ id: 'schmetterlings-kiste', name: 'Schmetterlingskiste', price: 95, cat: 'gold', section: 'messer', level: 10, pop: 94, badge: 'HOT',
    look: L('#2a0a3a', '#ff8ad8', 'butterfly', 'casket', 'leather', '#ffd0f0', 'BUTTERFLY'),
    contents: guns(any, { classified: 3, covert: 3 }, (p, n) => mixPick(p, n, 'falter')),
    gold: golds(wpn('schmetterling'), 14) }),
  box({ id: 'bajonett-kiste', name: 'Bajonettkiste', price: 60, cat: 'gold', section: 'messer', level: 5, pop: 71,
    look: L('#1a2418', '#9ad07a', 'blade', 'crate', 'metal', '#c8ccd4', 'BAJONETT'),
    contents: guns(any, { classified: 3, covert: 3 }, (p, n) => mixPick(p, n, 'bajo')),
    gold: golds(wpn('bajonett'), 14) }),
  box({ id: 'handschuhkiste', name: 'Handschuhkiste', price: 45, cat: 'gold', section: 'messer', level: 5, pop: 63,
    look: L('#2a1a10', '#e8a050', 'glove', 'briefcase', 'leather', '#e8c070', 'GLOVES'),
    contents: guns(any, { restricted: 3, classified: 3, covert: 2 }, (p, n) => mixPick(p, n, 'hand')),
    gold: golds(isGlove, 12, (p, n) => mixPick(p, n, 'glove')) }),
  box({ id: 'messer-smaragd', name: 'Messerkiste Smaragd', price: 90, cat: 'gold', section: 'messer', level: 10, pop: 79,
    look: L('#05301c', '#39ff8a', 'gem', 'safe', 'leather', '#9effc8', 'SMARAGD'),
    contents: guns(tone('gruen'), { classified: 3, covert: 3 }),
    gold: golds((s) => isKnife(s) && (tone('gruen')(s) || fin('Doppler Smaragd', 'Gammaschimmer', 'Giftzahn')(s)), 12) }),
  // ---- Premium & High Roller
  box({ id: 'diamant-tresor', name: 'Diamant-Tresor', price: 2000, cat: 'gold', section: 'premium', level: 30, pop: 97, badge: 'LIMITIERT',
    look: L('#0a1a3a', '#a8e4ff', 'gem', 'safe', 'gold', '#e8f6ff', 'DIAMANT'),
    contents: {}, gold: golds(pat('doppler'), 7, top) }),
  box({ id: 'millionaerskoffer', name: 'Millionärskoffer', price: 1200, cat: 'gold', section: 'premium', level: 25, pop: 92,
    look: L('#1a1408', '#ffd24a', 'crown', 'briefcase', 'gold', '#fff1b8', 'MILLION'),
    contents: {}, gold: golds(any, 10, (p, n) => top(p, 28).filter((_, i) => i % 3 === 0).slice(0, n)) }),
  box({ id: 'high-roller', name: 'High Roller', price: 400, cat: 'gold', section: 'premium', level: 20, pop: 88,
    look: L('#2a0505', '#ff3040', 'dice', 'casket', 'gold', '#ffe08a', 'HIGH ROLLER'),
    contents: guns(any, { covert: 4 }, top), gold: golds(any, 8, (p, n) => top(p, 40).filter((_, i) => i % 5 === 1).slice(0, n)) }),
  box({ id: 'platinkiste', name: 'Platinkiste', price: 35, cat: 'premium', section: 'premium', level: 15, pop: 75,
    look: L('#8a9098', '#e8f0ff', 'star', 'casket', 'metal', '#ffffff', 'PLATIN'),
    contents: guns(col('Kaiser', 'Prisma', 'Kosmos', 'Galaxie', 'Drache'), { restricted: 3, classified: 3, covert: 4 }, top),
    gold: golds((s) => fin('Doppler Saphir', 'Polarnacht', 'Kristallblau', 'Schneeweiß', 'Goldader')(s), 8) }),
  box({ id: 'schwarzgold', name: 'Schwarzgold', price: 180, cat: 'gold', section: 'premium', level: 20, pop: 81,
    look: L('#0a0806', '#ffd24a', 'crown', 'safe', 'carbon', '#e8b84a', 'NOIR'),
    contents: guns(col('Abgrund', 'Kaiser'), { classified: 3, covert: 3 }),
    gold: golds((s) => fin('Schwarze Perle', 'Goldader', 'Goldfaust', 'Mitternacht', 'Nachtfalter', 'Blattgold')(s), 10) }),
  // ---- 50/50 & Risiko (few items, junk or ★)
  box({ id: 'alles-oder-nichts', name: 'Alles oder Nichts', price: 95, cat: 'gold', section: 'risiko', level: 5, pop: 90, badge: 'RISIKO',
    look: L('#1a0505', '#ff2a2a', 'skull', 'drum', 'metal', '#ffd400', 'ALL IN'),
    contents: guns(any, { consumer: 3 }, (p, n) => mixPick(p, n, 'nix')), gold: golds((s) => s.basePrice > 250 && s.basePrice < 600, 3) }),
  box({ id: 'hop-oder-top', name: 'Hop oder Top', price: 45, cat: 'gold', section: 'risiko', pop: 78,
    look: L('#0a2a1a', '#3aff7a', 'clover', 'capsule', 'paint', '#ffd400', 'HOP/TOP'),
    contents: guns(any, { industrial: 3 }, (p, n) => mixPick(p, n, 'hop')), gold: golds(any, 3, (p, n) => mixPick(p.filter((s) => s.basePrice > 120 && s.basePrice < 220), n, 'top')) }),
  box({ id: 'muenzwurf', name: 'Münzwurf', price: 30, cat: 'gold', section: 'risiko', pop: 83,
    look: L('#3a2a05', '#ffd24a', 'coin', 'capsule', 'gold', '#fff1b8', '50/50'),
    contents: guns(any, { restricted: 3 }, (p, n) => mixPick(p, n, 'kopf')), gold: golds(any, 3, (p, n) => mixPick(p.filter((s) => s.basePrice < 160), n, 'zahl')) }),
  box({ id: 'gluecksrad', name: 'Glücksrad', price: 45, cat: 'gold', section: 'risiko', pop: 74,
    look: L('#2a0a3a', '#ffd400', 'star', 'drum', 'paint', '#ff2bd6', 'GLÜCK'),
    contents: guns(any, { milspec: 3, classified: 2 }, (p, n) => mixPick(p, n, 'rad')), gold: golds(any, 3, (p, n) => mixPick(p.filter((s) => s.basePrice < 400), n, 'rad')) }),
  box({ id: 'jackpot', name: 'Jackpot', price: 250, cat: 'gold', section: 'risiko', level: 10, pop: 86, badge: 'RISIKO',
    look: L('#3a0a05', '#ffcc33', 'seven', 'safe', 'gold', '#ff3040', 'JACKPOT'),
    contents: guns(any, { consumer: 5 }, (p, n) => mixPick(p, n, 'jack')), gold: golds(any, 1, top) }),
  // ---- Event & Saison
  box({ id: 'kirschbluete', name: 'Kirschblütenkiste', price: 7, cat: 'event', section: 'event', pop: 77, badge: 'SAISON',
    look: L('#4a1a2a', '#ff8ab8', 'blossom', 'chest', 'wood', '#ffd0e0'),
    contents: guns(col('Kirschblüte'), { industrial: 1, milspec: 3, restricted: 2, classified: 2, covert: 2 }),
    gold: golds((s) => fin('Kirschblüte', 'Rubinader', 'Flamingo', 'Doppler Phase 2')(s), 6), extra: ['fahrerhandschuhe-kirschleder'] }),
  box({ id: 'sommerhitze', name: 'Sommerhitze', price: 6, cat: 'event', section: 'event', pop: 69, badge: 'SAISON',
    look: L('#0a5a6a', '#ffcc33', 'palm', 'drum', 'paint', '#ff6a3a'),
    contents: guns(col('Sommerhitze'), { consumer: 1, industrial: 1, milspec: 2, restricted: 2, classified: 2, covert: 1 }),
    gold: golds((s) => fin('Verlauf', 'Tigerzahn', 'Goldader', 'Neonband', 'Sternenstaub')(s), 6) }),
  box({ id: 'silvester', name: 'Silvesterknaller', price: 8, cat: 'event', section: 'event', pop: 73,
    look: L('#0a0a2a', '#ffd400', 'firework', 'drum', 'paint', '#ff3d5a', 'BOOM'),
    contents: guns(col('Glut', 'Neon', 'Arkade'), { milspec: 3, restricted: 3, classified: 2, covert: 3 }, (p, n) => mixPick(p, n, 'boom')),
    gold: golds((s) => fin('Sternenstaub', 'Doppler Phase 2', 'Verlauf', 'Neonnacht')(s), 7) }),
  box({ id: 'herbstlaub', name: 'Herbstlaub', price: 5, cat: 'event', section: 'event', pop: 52,
    look: L('#4a2208', '#ff9a2a', 'leaf', 'chest', 'wood', '#c85a1a'),
    contents: guns(tone('orange', 'gold'), { industrial: 2, milspec: 3, restricted: 2, classified: 2, covert: 1 }, (p, n) => mixPick(p, n, 'herbst')),
    gold: golds((s) => fin('Rostbraun', 'Tigerzahn', 'Lederbraun', 'Kupferzorn')(s), 6) }),
  // ---- Rang-Kisten (career level gates)
  box({ id: 'rang-bronze', name: 'Bronze-Kiste', price: 8, cat: 'standard', section: 'rang', level: 10, pop: 57,
    look: L('#4a2a14', '#e0915a', 'chevron', 'crate', 'metal', '#c87a3a', 'BRONZE'),
    contents: guns(any, { milspec: 3, restricted: 3, classified: 3, covert: 2 }, (p, n) => mixPick(p, n, 'bronze')),
    gold: golds(any, 6, (p, n) => mixPick(p, n, 'bronze')) }),
  box({ id: 'rang-silber', name: 'Silber-Kiste', price: 14, cat: 'standard', section: 'rang', level: 25, pop: 60,
    look: L('#5a606a', '#e8eef5', 'chevron', 'briefcase', 'metal', '#ffffff', 'SILBER'),
    contents: guns(any, { restricted: 3, classified: 3, covert: 3 }, (p, n) => mixPick(p.filter((s) => s.basePrice > 2), n, 'silber')),
    gold: golds(any, 6, (p, n) => mixPick(p, n, 'silber')) }),
  box({ id: 'rang-gold', name: 'Gold-Rangkiste', price: 30, cat: 'premium', section: 'rang', level: 50, pop: 66,
    look: L('#5a3a05', '#ffd24a', 'trophy', 'chest', 'gold', '#fff1b8', 'RANG GOLD'),
    contents: guns(any, { restricted: 2, classified: 3, covert: 4 }, (p, n) => top(p, n * 3).filter((_, i) => i % 3 === 0)),
    gold: golds(any, 8, (p, n) => mixPick(p, n, 'rgold')) }),
  box({ id: 'rang-platin', name: 'Platin-Rangkiste', price: 120, cat: 'gold', section: 'rang', level: 75, pop: 64,
    look: L('#3a4a5a', '#c8f0ff', 'trophy', 'casket', 'metal', '#ffffff', 'PLATIN'),
    contents: guns(any, { classified: 3, covert: 4 }, (p, n) => top(p, n * 2).filter((_, i) => i % 2 === 1)),
    gold: golds(any, 8, (p, n) => mixPick(p.filter((s) => s.basePrice > 250), n, 'platin')) }),
  box({ id: 'rang-diamant', name: 'Diamant-Rangkiste', price: 300, cat: 'gold', section: 'rang', level: 100, pop: 70,
    look: L('#0a2a4a', '#7ae8ff', 'gem', 'capsule', 'gold', '#e0fbff', 'DIAMANT'),
    contents: guns(any, { covert: 5 }, top), gold: golds(any, 8, (p, n) => mixPick(p.filter((s) => s.basePrice > 500), n, 'dia')) }),
  box({ id: 'rang-meister', name: 'Meisterkiste', price: 700, cat: 'gold', section: 'rang', level: 150, pop: 74,
    look: L('#2a0a0a', '#ff5a3a', 'dragon', 'casket', 'gold', '#ffd24a', 'MEISTER'),
    contents: guns(any, { covert: 3 }, top), gold: golds(any, 8, (p, n) => top(p, n * 2).filter((_, i) => i % 2 === 0)) }),
  box({ id: 'rang-legende', name: 'Legendenkiste', price: 2500, cat: 'gold', section: 'rang', level: 200, pop: 80, badge: 'PRESTIGE',
    look: L('#1a0a2a', '#ffd24a', 'crown', 'safe', 'gold', '#ff4fd8', 'LEGENDE'),
    contents: {}, gold: golds(any, 6, top) }),
];

export const CASES: CaseDef[] = [...CASES_V1, ...CASES_V2];
CASES.forEach((c, i) => { c.added ??= i < CASES_V1.length ? i : 100 + i; });
// The plain knife Doppler shows its phase by seed now (data/specials.ts: Phase 1–4, Rubin, Saphir,
// Schwarze Perle), so it is just "Doppler". The id keeps the old name, saves stay valid.
for (const s of SKINS) if (s.name === 'Doppler Phase 2') s.name = 'Doppler';

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
