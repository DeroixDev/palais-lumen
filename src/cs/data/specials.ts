/**
 * Special patterns ("Kennzeichnungen"): which paint seeds of a skin are worth more, and how the
 * renderer must draw them so the label is true on the art. Pure data, no DOM: used by the economy
 * (values, case EV), the UI (badges) and the art worker (variant textures).
 *
 * Modelled on the real CS2 market (see /mnt/project-files/konzept/cs-wertvolle-muster.md):
 * case-hardened blue gems, Doppler phases and gems, fade percentage, marble fire & ice, centred and
 * triple webs, slaughter shapes. Seed tables are fixed per pattern family (seed -> same special on
 * every skin of that family), built from a seeded shuffle so the counts are exact.
 */
import type { SkinDef } from '../contract';

/** 0 = information only (phase, fade %), 1 = besonders, 2 = selten, 3 = legendär. */
export type SpecialTier = 0 | 1 | 2 | 3;

export interface PatternTag {
  /** Stable id, e.g. 'bg1', 'ruby', 'fade100'. */
  id: string;
  /** Full German name, e.g. 'Blaues Juwel · Tier 1'. */
  name: string;
  /** Short chip text for tiles. */
  short: string;
  /** One-line explanation for the detail view. */
  info: string;
  /** Value multiplier of this tag. */
  mult: number;
  tier: SpecialTier;
}

/** How the art differs for this seed: palette/params override and window placement. */
export interface ArtVariant {
  /** Texture cache key part (same key = same texture). */
  key: string;
  colors?: string[];
  params?: Record<string, number | string>;
  /**
   * 'motif': the texture centre (500, 500) lands on the biggest painted part ('paint': on the whole
   * painted area); the renderer adds the sizes (mw, mh, ww, wh). { span }: the painted area shows
   * exactly this horizontal range of the texture (fade %, fire & ice).
   */
  win?: 'motif' | 'paint' | { span: [number, number] };
}

export interface PatternInfo {
  /** The valuable special (tier >= 1), if any. */
  special: PatternTag | null;
  /** Informational tag (Doppler phase, fade %), if any. */
  note: PatternTag | null;
  /** Total value multiplier of the seed (special x note, or a collector number). */
  mult: number;
  art: ArtVariant | null;
}

// ---------------------------------------------------------------- helpers
function rng(seed: number) {
  let a = (seed | 0) ^ 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Seeds 0..999 in a fixed shuffled order (minus reserved ones). */
function order(salt: number, skip: Iterable<number> = []): number[] {
  const no = new Set(skip);
  const a = Array.from({ length: 1000 }, (_, i) => i).filter((i) => !no.has(i));
  const r = rng(salt);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const h01 = (seed: number, salt: number) => rng(seed * 7919 + salt * 104729)();
function hue(hex: string): number {
  const v = parseInt(hex.replace('#', ''), 16);
  const r = ((v >> 16) & 255) / 255, g = ((v >> 8) & 255) / 255, b = (v & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.08) return -1; // grey
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}
const pctTxt = (n: number) => `${n.toLocaleString('de-DE', { maximumFractionDigits: 1 })}`;
const xTxt = (m: number) => `×${m.toLocaleString('de-DE', { maximumFractionDigits: 2 })}`;

// ---------------------------------------------------------------- families
export type Family = 'ch' | 'doppler' | 'dopplerGun' | 'gamma' | 'gem' | 'fade' | 'marblefade' | 'web' | 'blotch' | 'galaxy' | 'damascus' | 'none';
type SkinLike = Pick<SkinDef, 'name' | 'pattern' | 'rarity'> & { id?: string };

const GEM_NAME = /Rubin|Saphir|Smaragd|Perle/;
export function familyOf(s: SkinLike): Family {
  const k = s.pattern?.kind;
  switch (k) {
    case 'casehardened': return 'ch';
    case 'doppler':
      if (/Gamma/.test(s.name)) return 'gamma';
      if (GEM_NAME.test(s.name)) return 'gem';
      return s.rarity === 'gold' ? 'doppler' : 'dopplerGun';
    case 'fade': return 'fade';
    case 'marble': return s.name === 'Marmorverlauf' ? 'marblefade' : 'none';
    case 'web': return 'web';
    case 'blotch': return 'blotch';
    case 'galaxy': return 'galaxy';
    case 'damascus': return 'damascus';
    default: return 'none';
  }
}

// ---------------------------------------------------------------- case hardened
// Real tier-1 blue gems (AK 661, 670, 321, 387, 955, 168 ...) as our tier 1, a few more famous
// seeds as tier 2, the rest drawn from a fixed shuffle.
const BG1 = [661, 670, 321, 387, 555, 955, 168];
const BG2_FIX = [151, 179, 868, 442, 463, 269, 828, 760];
const CH_ORDER = order(661, [...BG1, ...BG2_FIX]);
const BG2 = [...BG2_FIX, ...CH_ORDER.slice(0, 4)];
const BG3 = CH_ORDER.slice(4, 29);
const GOLDGEM = CH_ORDER.slice(29, 37);
const chSet = (a: number[]) => new Set(a);
const S_BG1 = chSet(BG1), S_BG2 = chSet(BG2), S_BG3 = chSet(BG3), S_GG = chSet(GOLDGEM);

/** Share of the visible side painted blue for a gem seed (what the art then draws). */
export function bluePct(seed: number): number {
  if (seed === 661) return 98;
  if (S_BG1.has(seed)) return 88 + Math.round(h01(seed, 1) * 8);
  if (S_BG2.has(seed)) return 70 + Math.round(h01(seed, 2) * 14);
  if (S_BG3.has(seed)) return 55 + Math.round(h01(seed, 3) * 13);
  return 0;
}
const goldish = (s: SkinLike) => { const h = hue(s.pattern.colors[1] ?? ''); return h >= 18 && h <= 60; };

function chInfo(s: SkinLike, seed: number): PatternInfo | null {
  const b = bluePct(seed);
  if (b) {
    const t = S_BG1.has(seed) ? 1 : S_BG2.has(seed) ? 2 : 3;
    const legend = seed === 661;
    const mult = legend ? 60 : t === 1 ? 40 : t === 2 ? 10 : 3;
    const name = legend ? 'Blaues Juwel · Legende' : `Blaues Juwel · Tier ${t}`;
    return {
      special: { id: `bg${t}`, name, short: legend ? 'Juwel #661' : `Juwel T${t}`, tier: t === 1 ? 3 : t === 2 ? 2 : 1, mult,
        info: `Gehärtet mit rund ${b} % Blau auf der Schauseite${legend ? ', das berühmteste Muster' : ''}. ${xTxt(mult)} Wert.` },
      note: null, mult, art: { key: `bg${b}`, params: { blue: b / 100 }, win: 'paint' },
    };
  }
  if (S_GG.has(seed) && goldish(s)) {
    const mult = 2;
    return { special: { id: 'gg', name: 'Goldjuwel', short: 'Goldjuwel', tier: 1, mult, info: `Gehärtet fast ganz in Gold, ohne Blau. ${xTxt(mult)} Wert.` },
      note: null, mult, art: { key: 'gg', params: { goldgem: 1 }, win: 'paint' } };
  }
  return null;
}

// ---------------------------------------------------------------- doppler
const D_ORDER = order(415);
const RUBY = new Set(D_ORDER.slice(0, 15)), SAPH = new Set(D_ORDER.slice(15, 30)), PEARL = new Set(D_ORDER.slice(30, 38));
const PINK_GALAXY = new Set(D_ORDER.slice(38, 46));
const EMERALD = new Set(D_ORDER.slice(0, 15)); // gamma: its own family, same rarity as a ruby
const PURE = new Set(order(417).slice(0, 20));

const GEMS = {
  ruby: { name: 'Rubin', colors: ['#b0001e', '#ff2a4a', '#ffc8d0'], mult: 7, info: 'Doppler-Edelstein: ganz in Rubinrot' },
  saph: { name: 'Saphir', colors: ['#0a2fc0', '#2fb4ff', '#dcefff'], mult: 6, info: 'Doppler-Edelstein: ganz in Saphirblau' },
  pearl: { name: 'Schwarze Perle', colors: ['#120c2a', '#5a3ad0', '#d0c8ff'], mult: 9, info: 'Seltenster Doppler-Edelstein: tiefschwarz mit violettem Schimmer' },
  emer: { name: 'Smaragd', colors: ['#00804a', '#10f080', '#c8ffe0'], mult: 10, info: 'Gamma-Edelstein: reines, leuchtendes Smaragdgrün' },
} as const;

/** Doppler phases: palette + small value shift (phase 2 pink and phase 4 blue are wanted). */
const PHASES: { colors: string[]; mult: number; desc: string; dark?: number }[] = [
  { colors: ['#5a0a48', '#d0308a', '#ffb8e0'], mult: 0.92, desc: 'viel Schwarz mit Pink', dark: 0.9 },
  { colors: ['#e0307e', '#8a2be0', '#ffd0f0'], mult: 1.2, desc: 'pink und lila' },
  { colors: ['#12807a', '#4ad6a8', '#e0fff4'], mult: 0.9, desc: 'grün und türkis' },
  { colors: ['#2850e0', '#8a5aff', '#d8e8ff'], mult: 1.08, desc: 'blau und lila' },
];
const GAMMA_PHASES: { colors: string[]; mult: number; desc: string }[] = [
  { colors: ['#3a9a20', '#b8ff3a', '#f0ffd0'], mult: 1.06, desc: 'gelbgrün' },
  { colors: ['#00a878', '#7cff3a', '#e0ffd0'], mult: 0.96, desc: 'grün' },
  { colors: ['#00888a', '#3ad6c8', '#d0fff8'], mult: 0.94, desc: 'türkis' },
  { colors: ['#1a6aa8', '#3ac8ff', '#d8f8ff'], mult: 1.08, desc: 'blaugrün' },
];
const phaseOf = (seed: number) => Math.floor(h01(seed, 9) * 4);

function gem(k: keyof typeof GEMS): PatternInfo {
  const g = GEMS[k];
  return { special: { id: k, name: g.name, short: g.name, tier: k === 'pearl' || k === 'emer' ? 3 : 2, mult: g.mult, info: `${g.info}. ${xTxt(g.mult)} Wert.` },
    note: null, mult: g.mult, art: { key: k, colors: [...g.colors], params: k === 'pearl' ? { dark: 0.94, stars: 520 } : { dark: 0.5 } } };
}

function dopplerInfo(f: Family, seed: number): PatternInfo | null {
  if (f === 'gem') {
    if (!PURE.has(seed)) return null;
    const mult = 1.4;
    return { special: { id: 'pure', name: 'Makellos', short: 'Makellos', tier: 1, mult, info: `Edelstein ohne dunkle Stellen, durchgehend leuchtend. ${xTxt(mult)} Wert.` },
      note: null, mult, art: { key: 'pure', params: { dark: 0.12 } } };
  }
  if (f === 'gamma') {
    if (EMERALD.has(seed)) return gem('emer');
    const p = phaseOf(seed), ph = GAMMA_PHASES[p];
    return { special: null, note: { id: `gp${p + 1}`, name: `Phase ${p + 1}`, short: `P${p + 1}`, tier: 0, mult: ph.mult, info: `Gamma-Phase ${p + 1}: ${ph.desc}.` },
      mult: ph.mult, art: { key: `gp${p + 1}`, colors: [...ph.colors] } };
  }
  if (RUBY.has(seed)) return gem('ruby');
  if (SAPH.has(seed)) return gem('saph');
  if (PEARL.has(seed)) return gem('pearl');
  if (f === 'dopplerGun') return null;
  if (PINK_GALAXY.has(seed)) {
    const mult = 2;
    return { special: { id: 'galaxy2', name: 'Rosa Galaxie', short: 'Rosa Galaxie', tier: 2, mult, info: `Beste Phase 2: kräftiges Pink mit dichtem Sternenfeld. ${xTxt(mult)} Wert.` },
      note: { id: 'p2', name: 'Phase 2', short: 'P2', tier: 0, mult: 1, info: 'Doppler-Phase 2: pink und lila.' },
      mult, art: { key: 'galaxy2', colors: ['#ff3a9a', '#a02be8', '#ffe0f4'], params: { dark: 0.45, stars: 1100 } } };
  }
  const p = phaseOf(seed), ph = PHASES[p];
  return { special: null, note: { id: `p${p + 1}`, name: `Phase ${p + 1}`, short: `P${p + 1}`, tier: 0, mult: ph.mult, info: `Doppler-Phase ${p + 1}: ${ph.desc}.` },
    mult: ph.mult, art: { key: `p${p + 1}`, colors: [...ph.colors], ...(ph.dark ? { params: { dark: ph.dark } } : {}) } };
}

// ---------------------------------------------------------------- fade
const F_ORDER = order(403);
const fadeRank = new Int16Array(1000);
F_ORDER.forEach((sd, i) => (fadeRank[sd] = i));
/** Fade percentage 80..100 of a seed (5 seeds at 100 %, 15 at 99 %, 30 at 98 %). */
export function fadePct(seed: number): number {
  const r = fadeRank[seed];
  if (r < 5) return 100;
  if (r < 20) return 99;
  if (r < 50) return 98;
  return Math.round((97 - ((r - 50) / 949) * 17) * 10) / 10;
}
function fadeInfo(seed: number): PatternInfo {
  const p = fadePct(seed);
  // the painted area shows the end of the gradient plus as much of the rest as the % says
  const art: ArtVariant = { key: '', win: { span: [0.97 - (0.42 + 0.53 * (p - 80) / 20), 0.97] } };
  if (p >= 98) {
    const mult = p === 100 ? 1.8 : p === 99 ? 1.35 : 1.15;
    const name = p === 100 ? 'Voller Verlauf' : `Verlauf ${p} %`;
    return { special: { id: `fade${p}`, name, short: p === 100 ? '100 % Verlauf' : `${p} % Verlauf`, tier: p === 100 ? 2 : 1, mult,
      info: `${p === 100 ? 'Der komplette Farbverlauf liegt auf der Waffe, bis zur letzten Farbe' : `${p} % des Farbverlaufs liegen auf der Waffe`}. ${xTxt(mult)} Wert.` }, note: null, mult, art };
  }
  const mult = Math.round((0.9 + ((p - 80) / 17) * 0.1) * 1000) / 1000;
  return { special: null, note: { id: 'fade', name: `Verlauf ${pctTxt(p)} %`, short: `${Math.floor(p)} %`, tier: 0, mult, info: `${pctTxt(p)} % des Farbverlaufs sind sichtbar.` }, mult, art };
}

// ---------------------------------------------------------------- marble fade
const M_ORDER = order(1337);
const FI_MAX = new Set(M_ORDER.slice(0, 3)), FI = new Set(M_ORDER.slice(3, 13)), FI_FAKE = new Set(M_ORDER.slice(13, 38));
const MSPAN: ArtVariant['win'] = { span: [0.16, 0.8] };
function marbleInfo(seed: number): PatternInfo | null {
  const R = '#e8261c', B = '#1e5fd8', Y = '#ffd400';
  if (FI_MAX.has(seed)) return { special: { id: 'fimax', name: 'Feuer & Eis · Max', short: 'F&I Max', tier: 3, mult: 6, info: 'Nur Rot und Blau, je zur Hälfte, ohne Gelb. Die besten Feuer-&-Eis-Muster. ×6 Wert.' },
    note: null, mult: 6, art: { key: 'fimax', colors: [R, R, R, B, B, B], params: { bands: 1 }, win: MSPAN } };
  if (FI.has(seed)) return { special: { id: 'fi', name: 'Feuer & Eis', short: 'Feuer & Eis', tier: 2, mult: 4, info: 'Nur Rot und Blau auf der Schauseite, kein Gelb. ×4 Wert.' },
    note: null, mult: 4, art: { key: 'fi', colors: [R, R, B, B], params: { bands: 1.1 }, win: MSPAN } };
  if (FI_FAKE.has(seed)) return { special: { id: 'fifake', name: 'Falsches Feuer & Eis', short: 'Falsches F&I', tier: 1, mult: 1.25, info: 'Rot und Blau mit einer gelben Linie. ×1,25 Wert.' },
    note: null, mult: 1.25, art: { key: 'fifake', colors: [R, R, Y, B, B], params: { bands: 1 }, win: MSPAN } };
  return null;
}

// ---------------------------------------------------------------- web, blotch, galaxy, damascus
const W_ORDER = order(718);
const WEB_C = new Set(W_ORDER.slice(0, 20)), WEB_3 = new Set(W_ORDER.slice(20, 26));
function webInfo(seed: number): PatternInfo | null {
  if (WEB_3.has(seed)) return { special: { id: 'web3', name: 'Dreifachnetz', short: 'Dreifachnetz', tier: 2, mult: 3.5, info: 'Drei kräftige Netze nebeneinander in der Mitte der Waffe. ×3,5 Wert.' },
    note: null, mult: 3.5, art: { key: 'web3', params: { hero: 3 }, win: 'paint' } };
  if (WEB_C.has(seed)) return { special: { id: 'webc', name: 'Zentriertes Netz', short: 'Zentr. Netz', tier: 1, mult: 2, info: 'Ein großes, kräftiges Netz genau in der Mitte der Waffe. ×2 Wert.' },
    note: null, mult: 2, art: { key: 'webc', params: { hero: 1 }, win: 'paint' } };
  return null;
}
const B_ORDER = order(4242);
const SHAPES: [Set<number>, string, string, number, SpecialTier, string][] = [
  [new Set(B_ORDER.slice(0, 5)), 'engel', 'Engel', 2.2, 2, 'Ein klares Flügelpaar mit Kopf groß auf der Schauseite'],
  [new Set(B_ORDER.slice(5, 15)), 'diamant', 'Diamant', 1.8, 1, 'Eine klare Raute groß auf der Schauseite'],
  [new Set(B_ORDER.slice(15, 25)), 'herz', 'Herz', 1.6, 1, 'Ein sauberes Herz groß auf der Schauseite'],
];
function blotchInfo(seed: number): PatternInfo | null {
  for (const [set, id, name, mult, tier, info] of SHAPES) {
    if (set.has(seed)) return { special: { id, name, short: name, tier, mult, info: `${info}. ${xTxt(mult)} Wert.` }, note: null, mult, art: { key: id, params: { shape: id }, win: 'motif' } };
  }
  return null;
}
const G_ORDER = order(1054);
const CORE = new Set(G_ORDER.slice(0, 15));
function galaxyInfo(seed: number): PatternInfo | null {
  if (!CORE.has(seed)) return null;
  return { special: { id: 'core', name: 'Supernova-Kern', short: 'Supernova', tier: 1, mult: 1.5, info: 'Ein großer, strahlender Stern auf der Schauseite. ×1,5 Wert.' },
    note: null, mult: 1.5, art: { key: 'core', params: { core: 1 }, win: 'motif' } };
}
const DM_ORDER = order(2077);
const STRIPE = new Set(DM_ORDER.slice(0, 15));
function damascusInfo(seed: number): PatternInfo | null {
  if (!STRIPE.has(seed)) return null;
  return { special: { id: 'stripe', name: 'Nachtstreifen', short: 'Nachtstreifen', tier: 1, mult: 1.3, info: 'Ein dunkles Band zieht sich längs durch den Stahl. ×1,3 Wert.' },
    note: null, mult: 1.3, art: { key: 'stripe', params: { stripe: 1 }, win: 'motif' } };
}

// ---------------------------------------------------------------- collector numbers
/** Seeds collectors like for the number alone (no visible difference). */
const KULT: Record<number, number> = { 661: 2.5, 1: 1.5, 69: 1.5, 420: 1.4, 777: 1.5, 888: 1.3, 999: 1.3, 0: 1.3 };
function kultInfo(seed: number): PatternTag | null {
  const m = KULT[seed];
  if (!m) return null;
  return { id: 'kult', name: `Kultnummer #${seed}`, short: `#${seed}`, tier: 1, mult: m, info: `Sammler mögen die Nummer, sichtbar ist nichts Besonderes. ${xTxt(m)} Wert.` };
}

// ---------------------------------------------------------------- public
const NONE: PatternInfo = { special: null, note: null, mult: 1, art: null };
const cache = new Map<string, PatternInfo>();

/** Everything a seed means for this skin (deterministic). */
export function patternInfo(s: SkinLike | null | undefined, seed: number): PatternInfo {
  if (!s?.pattern) return NONE;
  const ck = (s.id ?? s.name + s.pattern.kind) + '|' + seed;
  const hit = cache.get(ck);
  if (hit) return hit;
  const f = familyOf(s);
  let pi: PatternInfo | null = null;
  switch (f) {
    case 'ch': pi = chInfo(s, seed); break;
    case 'doppler': case 'dopplerGun': case 'gamma': case 'gem': pi = dopplerInfo(f, seed); break;
    case 'fade': pi = fadeInfo(seed); break;
    case 'marblefade': pi = marbleInfo(seed); break;
    case 'web': pi = webInfo(seed); break;
    case 'blotch': pi = blotchInfo(seed); break;
    case 'galaxy': pi = galaxyInfo(seed); break;
    case 'damascus': pi = damascusInfo(seed); break;
  }
  pi ??= NONE;
  // a collector number only counts where the seed has no visible special
  if (!pi.special) {
    const k = kultInfo(seed);
    if (k) pi = { ...pi, special: k, mult: pi.mult * k.mult };
  }
  if (cache.size > 20000) cache.clear();
  cache.set(ck, pi);
  return pi;
}

/** True when the seed carries a valuable special on this skin (tier >= 1). */
export const isSpecial = (s: SkinLike | null | undefined, seed: number) => !!patternInfo(s, seed).special;

/** All special seeds of a skin, best first (for tools and tests). */
export function specialSeeds(s: SkinLike): { seed: number; tag: PatternTag }[] {
  const out: { seed: number; tag: PatternTag }[] = [];
  for (let sd = 0; sd < 1000; sd++) { const p = patternInfo(s, sd); if (p.special) out.push({ seed: sd, tag: p.special }); }
  return out.sort((a, b) => b.tag.mult - a.tag.mult || a.seed - b.seed);
}
