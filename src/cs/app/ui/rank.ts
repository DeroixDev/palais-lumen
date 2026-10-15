// Rank badges: a procedurally drawn emblem per level (11 stages of 25 levels, a small change every
// 5 levels), cached as SVG data URLs; the living layers on top are plain HTML that only animate
// transform and opacity, and only while on screen. Plus the level-up pulse and the stage-up ceremony.

import { MAX_LEVEL, rankName, sellBonus, stageOf, subOf, titleOf, type Stage } from '../lib/career';
import { sfx } from '../lib/sound';
import { reducedMotion } from '../lib/util';
import { modalOpen } from './modal';

type Pt = [number, number];
const C = 60; // centre of the 120×120 drawing
const poly = (pts: Pt[]) => `M${pts.map((p) => `${p[0]} ${p[1]}`).join('L')}Z`;
const hexPts = (cx: number, cy: number, r: number): Pt[] => [0, 1, 2, 3, 4, 5].map((i) => { const a = (Math.PI / 3) * i - Math.PI / 2; return [+(cx + r * Math.cos(a)).toFixed(2), +(cy + r * Math.sin(a)).toFixed(2)]; });
const scaleAt = (k: number, cy = C) => `translate(${C} ${cy}) scale(${k}) translate(${-C} ${-cy})`;
const MIRROR = 'translate(120 0) scale(-1 1)';

type Wings = 'none' | 'laurel' | 'blade' | 'gem' | 'kite' | 'horn' | 'fin' | 'shard' | 'royal';
interface Look {
  outer: string; inner: string;
  /** centre of the number */ cy: number;
  /** top point (gem), side points (studs), bottom point (pendant) */
  top: Pt; side: Pt; bottom: Pt;
  metal: string[]; edge: string; field: [string, string];
  accent: string; num: string; numEdge: string;
  wings: Wings;
  /** stage-specific frame decor */
  decor?: (lg: boolean) => string;
  /** glowing parts (cracks, neon) that also form the pulsing glow layer */
  glow?: () => string;
}

const SHIELD = 'M60 14L98 24L96 60C94 84 78 98 60 106C42 98 26 84 24 60L22 24Z';
const SHIELD_IN = 'M60 30L84 36L83 60C82 75 73 84 60 90C47 84 38 75 37 60L36 36Z';
const rivet = (x: number, y: number, r = 2.6) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#m)" stroke="#0008" stroke-width=".8"/><circle cx="${x - r * 0.3}" cy="${y - r * 0.35}" r="${r * 0.35}" fill="#fff9"/>`;

const LOOKS: Look[] = [
  // 0 Eisen: rough riveted iron hexagon
  {
    outer: poly(hexPts(60, 60, 45)), inner: poly(hexPts(60, 60, 30)), cy: 60,
    top: [60, 15], side: [97, 60], bottom: [60, 105],
    metal: ['#a3aab4', '#6a717b', '#454b54', '#2a2e35'], edge: '#0f1114', field: ['#2b3139', '#111418'],
    accent: '#d3dae3', num: '#eef1f5', numEdge: '#0d0f12', wings: 'none',
    decor: (lg) => hexPts(60, 60, 38.5).map(([x, y]) => rivet(x, y, lg ? 2.6 : 3.2)).join('') + (lg ? '<path d="M30 40l9 -4M82 82l7 -6M78 30l6 5" stroke="#ffffff30" stroke-width="1" fill="none"/>' : ''),
  },
  // 1 Bronze: cast bronze, cut corners, engraved double line
  {
    outer: poly([[60, 12], [92, 26], [100, 58], [90, 90], [60, 106], [30, 90], [20, 58], [28, 26]]),
    inner: poly([[60, 28], [80, 36], [85, 58], [78, 80], [60, 90], [42, 80], [35, 58], [40, 36]]), cy: 59,
    top: [60, 13], side: [96, 58], bottom: [60, 104],
    metal: ['#ffd2a0', '#cf8748', '#93542a', '#4f2a10'], edge: '#251306', field: ['#3d2614', '#150b05'],
    accent: '#ffb878', num: '#fff0de', numEdge: '#2a1407', wings: 'none',
    decor: (lg) => `<path d="${poly([[60, 18], [88, 30], [95, 58], [86, 86], [60, 100], [34, 86], [25, 58], [32, 30]])}" fill="none" stroke="#3a1c08" stroke-opacity=".75" stroke-width="1.4"/>${lg ? rivet(60, 20, 2.2) + rivet(60, 98, 2.2) : ''}`,
  },
  // 2 Silber: polished heater shield with engraved scrolls
  {
    outer: SHIELD, inner: SHIELD_IN, cy: 58,
    top: [60, 15], side: [96, 46], bottom: [60, 104],
    metal: ['#ffffff', '#d3dce6', '#8894a3', '#46505d'], edge: '#1a2028', field: ['#283341', '#0e1319'],
    accent: '#eef6ff', num: '#ffffff', numEdge: '#141a21', wings: 'none',
    decor: (lg) => `<path d="M60 20L91 28L90 60C88 80 75 92 60 99C45 92 32 80 30 60L29 28Z" fill="none" stroke="#2a323d" stroke-opacity=".55" stroke-width="1.2"/>${lg ? '<path d="M40 25q-6 8 -4 18M80 25q6 8 4 18" stroke="#ffffffaa" stroke-width="1.2" fill="none"/>' : ''}`,
  },
  // 3 Gold: crenellated gold shield with ruby studs and laurel
  {
    outer: 'M22 22L42 22L48 12L60 20L72 12L78 22L98 22L96 60C94 84 78 98 60 106C42 98 26 84 24 60Z',
    inner: SHIELD_IN, cy: 58,
    top: [60, 20], side: [96, 46], bottom: [60, 104],
    metal: ['#fff6c2', '#ffd35a', '#c98914', '#6a4204'], edge: '#2b1902', field: ['#3d2b08', '#120c02'],
    accent: '#ff4d5e', num: '#fff7da', numEdge: '#2b1902', wings: 'laurel',
    decor: (lg) => `<circle cx="48" cy="15.5" r="2.6" fill="#ff4d5e" stroke="#4a0710" stroke-width=".8"/><circle cx="72" cy="15.5" r="2.6" fill="#ff4d5e" stroke="#4a0710" stroke-width=".8"/>${lg ? '<path d="M60 20L91 28L90 60C88 80 75 92 60 99C45 92 32 80 30 60L29 28Z" fill="none" stroke="#5a3a04" stroke-opacity=".6" stroke-width="1.2"/>' : ''}`,
  },
  // 4 Platin: tall crest with side blades
  {
    outer: poly([[60, 8], [88, 20], [100, 50], [92, 82], [60, 110], [28, 82], [20, 50], [32, 20]]),
    inner: poly([[60, 26], [80, 34], [87, 54], [81, 74], [60, 92], [39, 74], [33, 54], [40, 34]]), cy: 59,
    top: [60, 10], side: [98, 50], bottom: [60, 108],
    metal: ['#ffffff', '#dff6ff', '#9dbfcd', '#4a6470'], edge: '#13212a', field: ['#163644', '#071318'],
    accent: '#7fe8ff', num: '#f4feff', numEdge: '#0b1a20', wings: 'blade',
    decor: (lg) => `<path d="M60 8L60 26M100 50L87 54M20 50L33 54M60 110L60 92" stroke="#ffffff" stroke-opacity=".55" stroke-width="1"/>${lg ? '<path d="M32 20L40 34M88 20L80 34M28 82L39 74M92 82L81 74" stroke="#2a4450" stroke-opacity=".6" stroke-width="1"/>' : ''}`,
  },
  // 5 Smaragd: faceted gem setting, green-silver with emerald inlays
  {
    outer: poly([[60, 8], [94, 28], [101, 62], [82, 96], [60, 108], [38, 96], [19, 62], [26, 28]]),
    inner: poly([[60, 26], [82, 38], [85, 62], [73, 84], [60, 91], [47, 84], [35, 62], [38, 38]]), cy: 59,
    top: [60, 9], side: [99, 62], bottom: [60, 106],
    metal: ['#f0fff7', '#a6dcc2', '#4e9077', '#1d4234'], edge: '#0a1f17', field: ['#0f4029', '#03170d'],
    accent: '#4dffa6', num: '#effff6', numEdge: '#04190e', wings: 'gem',
    decor: (lg) => {
      const gem = (x: number, y: number, s: number) => `<path d="M${x} ${y - s}L${x + s * 0.8} ${y}L${x} ${y + s}L${x - s * 0.8} ${y}Z" fill="url(#a)" stroke="#022b17" stroke-width=".8"/><path d="M${x} ${y - s}L${x + s * 0.8} ${y}L${x} ${y}Z" fill="#ffffff70"/>`;
      return gem(26, 45, 5) + gem(94, 45, 5) + gem(40, 99, 4) + gem(80, 99, 4) + (lg ? '<path d="M60 8L60 26M94 28L82 38M26 28L38 38M101 62L85 62M19 62L35 62" stroke="#ffffff" stroke-opacity=".4" stroke-width=".9"/>' : '');
    },
    glow: () => '<path d="M26 40l4 5-4 5-4-5zM94 40l4 5-4 5-4-5z" fill="#7dffc0"/>',
  },
  // 6 Saphir: diamond kite with crystal wings and a star tip
  {
    outer: poly([[60, 4], [100, 42], [90, 84], [60, 112], [30, 84], [20, 42]]),
    inner: poly([[60, 24], [84, 47], [77, 76], [60, 92], [43, 76], [36, 47]]), cy: 57,
    top: [60, 6], side: [98, 44], bottom: [60, 110],
    metal: ['#ffffff', '#d6e9ff', '#78a6dd', '#1f3c78'], edge: '#0a1530', field: ['#123170', '#040d27'],
    accent: '#a8d8ff', num: '#ffffff', numEdge: '#06122e', wings: 'kite',
    decor: (lg) => `<path d="M60 4L60 24M100 42L84 47M20 42L36 47M90 84L77 76M30 84L43 76M60 112L60 92" stroke="#ffffff" stroke-opacity=".6" stroke-width="1"/><path d="M60 4L100 42L84 47L60 24Z" fill="#ffffff" fill-opacity=".22"/>${lg ? '<path d="M20 42L36 47L43 76L30 84Z" fill="#001040" fill-opacity=".22"/>' : ''}`,
    glow: () => '<path d="M60 4L100 42L90 84L60 112L30 84L20 42Z" fill="none" stroke="#8fd0ff" stroke-width="3"/>',
  },
  // 7 Obsidian: jagged black glass with ember cracks and horns
  {
    outer: poly([[60, 6], [74, 18], [96, 20], [92, 44], [102, 64], [86, 84], [80, 104], [60, 98], [40, 104], [34, 84], [18, 64], [28, 44], [24, 20], [46, 18]]),
    inner: poly(hexPts(60, 59, 29)), cy: 59,
    top: [60, 8], side: [99, 64], bottom: [60, 100],
    metal: ['#6b6672', '#2c2830', '#141216', '#040304'], edge: '#000000', field: ['#24120a', '#070302'],
    accent: '#ff7a33', num: '#ffe2c4', numEdge: '#3a1000', wings: 'horn',
    decor: () => `<path d="M60 6L74 18L96 20" fill="none" stroke="#ffffff" stroke-opacity=".28" stroke-width="1"/>`,
    glow: () => '<path d="M28 44L36 52L33 60M92 44L84 50L88 58L84 64M46 18L50 28L47 32M74 18L70 27M40 104L44 92L41 88M80 104L76 94M18 64L31 70" fill="none" stroke="#ff8a2e" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  // 8 Plasma: dark angular core with neon edges and fins
  {
    outer: poly([[60, 8], [80, 20], [102, 22], [94, 52], [100, 84], [74, 94], [60, 110], [46, 94], [20, 84], [26, 52], [18, 22], [40, 20]]),
    inner: poly(hexPts(60, 59, 29)), cy: 59,
    top: [60, 10], side: [97, 52], bottom: [60, 108],
    metal: ['#4a1a66', '#24093a', '#14051f', '#08020d'], edge: '#000000', field: ['#25083f', '#070110'],
    accent: '#ff5cf0', num: '#ffffff', numEdge: '#4a0050', wings: 'fin',
    decor: () => '<path d="M60 8L80 20L102 22L94 52L100 84L74 94L60 110L46 94L20 84L26 52L18 22L40 20Z" fill="none" stroke="#3ff3ff" stroke-width="1.6"/>',
    glow: () => '<path d="M60 8L80 20L102 22L94 52L100 84L74 94L60 110L46 94L20 84L26 52L18 22L40 20Z" fill="none" stroke="#3ff3ff" stroke-width="2.6"/><path d="M60 30L85 44L85 74L60 88L35 74L35 44Z" fill="none" stroke="#ff5cf0" stroke-width="2.4"/><path d="M26 52L35 52M94 52L85 52M60 8L60 30M60 110L60 88" stroke="#3ff3ff" stroke-width="1.4"/>',
  },
  // 9 Prisma: holographic crystal star
  {
    outer: poly([[60, 4], [76, 22], [102, 26], [92, 54], [104, 80], [76, 88], [60, 112], [44, 88], [16, 80], [28, 54], [18, 26], [44, 22]]),
    inner: poly(hexPts(60, 58, 28)), cy: 58,
    top: [60, 6], side: [99, 54], bottom: [60, 110],
    metal: ['#ff9ad5', '#ffe58a', '#8affc6', '#8ac8ff', '#c69aff'], edge: '#251a45', field: ['#22184a', '#07051a'],
    accent: '#ffffff', num: '#ffffff', numEdge: '#2a1650', wings: 'shard',
    decor: () => '<path d="M60 4L60 30M102 26L84 44M18 26L36 44M104 80L84 72M16 80L36 72M60 112L60 86" stroke="#ffffff" stroke-opacity=".75" stroke-width="1"/><path d="M60 4L76 22L60 30Z M92 54L104 80L84 72Z M28 54L16 80L36 72Z" fill="#ffffff" fill-opacity=".35"/>',
    glow: () => '<path d="M60 4L76 22L102 26L92 54L104 80L76 88L60 112L44 88L16 80L28 54L18 26L44 22Z" fill="none" stroke="#ffffff" stroke-width="2.2"/>',
  },
  // 10 Ikone: crowned royal shield, gold with a prism inlay
  {
    outer: 'M24 40L16 14L36 28L46 6L60 24L74 6L84 28L104 14L96 40L96 64C94 88 78 100 60 110C42 100 26 88 24 64Z',
    inner: 'M60 40L84 45L84 66C82 82 72 92 60 98C48 92 38 82 36 66L36 45Z', cy: 67,
    top: [60, 26], side: [97, 62], bottom: [60, 108],
    metal: ['#fffbe2', '#ffd75e', '#cf8d12', '#6e4204'], edge: '#2a1600', field: ['#2e1046', '#0b0418'],
    accent: '#ff4f6b', num: '#fff6da', numEdge: '#2a0a3a', wings: 'royal',
    decor: () => '<path d="M24 40L96 40" stroke="#6e4204" stroke-width="1.6"/><path d="M28 34L92 34" stroke="url(#p)" stroke-width="4"/><circle cx="16" cy="14" r="3" fill="#7fe8ff" stroke="#0b3a4a" stroke-width=".8"/><circle cx="104" cy="14" r="3" fill="#7fe8ff" stroke="#0b3a4a" stroke-width=".8"/><circle cx="46" cy="6" r="3" fill="#ff4f6b" stroke="#4a0712" stroke-width=".8"/><circle cx="74" cy="6" r="3" fill="#ff4f6b" stroke="#4a0712" stroke-width=".8"/><path d="M60 14l4 6-4 6-4-6z" fill="#fff" stroke="#6e4204" stroke-width=".8"/><path d="M60 44L80 48L80 66C78 80 70 88 60 93C50 88 42 80 40 66L40 48Z" fill="none" stroke="url(#p)" stroke-width="2.2"/>',
    glow: () => '<path d="M28 34L92 34" stroke="#ffe9a8" stroke-width="5"/><circle cx="60" cy="20" r="6" fill="#ffffff"/>',
  },
];

// ---------- wings (drawn for the right side, mirrored for the left) ----------

function wing(kind: Wings, stage: number, sub: number, lg: boolean): string {
  const n = sub; // more feathers / blades with each sub-step
  switch (kind) {
    case 'laurel': {
      let s = '';
      const leaves = 4 + Math.min(n, 3);
      for (let i = 0; i < leaves; i++) {
        const t = i / (leaves - 1);
        const a = 1.18 - t * 1.2; // from near the tip up along the side
        const x = 60 + Math.cos(a) * 47, y = 62 + Math.sin(a) * 44;
        const rot = (a * 180) / Math.PI + 90 - 28;
        s += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="3.2" ry="7.6" transform="rotate(${rot.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="url(#m)" stroke="#3a2402" stroke-width=".8"/>`;
      }
      return s;
    }
    case 'blade': {
      const b = ['M96 38L116 26L108 48L98 52Z', 'M98 60L117 64L104 74Z', 'M94 80L112 92L96 92Z'];
      return b.slice(0, 1 + Math.min(2, Math.floor(n / 2) + (lg ? 0 : 0))).map((d) => `<path d="${d}" fill="url(#m)" stroke="#13212a" stroke-width="1"/>`).join('');
    }
    case 'gem': {
      const b = ['M98 34L117 20L112 46L100 50Z', 'M100 58L119 62L106 74Z', 'M96 78L114 92L98 92Z'];
      return b.slice(0, 1 + Math.min(2, Math.floor((n + 1) / 2))).map((d, i) => `<path d="${d}" fill="url(#m)" stroke="#0a1f17" stroke-width="1"/>${i === 0 ? '<path d="M117 20L112 46L108 40Z" fill="url(#a)"/>' : ''}`).join('');
    }
    case 'kite': {
      const b = ['M96 38L119 10L108 56Z', 'M98 60L119 70L100 80Z', 'M92 84L110 104L88 96Z'];
      return b.slice(0, 1 + Math.min(2, Math.floor((n + 1) / 2))).map((d) => `<path d="${d}" fill="url(#m)" stroke="#0a1530" stroke-width="1"/><path d="${d}" fill="#ffffff" fill-opacity=".18" transform="translate(1 -1) scale(.98)"/>`).join('');
    }
    case 'horn': {
      return `<path d="M88 26Q110 22 118 2Q116 34 94 44Z" fill="url(#m)" stroke="#000" stroke-width="1"/>${n >= 2 ? '<path d="M98 66L119 76L100 84Z" fill="url(#m)" stroke="#000" stroke-width="1"/>' : ''}${n >= 4 ? '<path d="M86 88L104 108L82 100Z" fill="url(#m)" stroke="#000" stroke-width="1"/>' : ''}`;
    }
    case 'fin': {
      const b = ['M98 26L119 14L110 44L96 46Z', 'M96 58L119 56L106 72Z', 'M96 86L116 98L94 96Z'];
      return b.slice(0, 1 + Math.min(2, Math.floor((n + 1) / 2))).map((d) => `<path d="${d}" fill="#1a0628" stroke="#ff5cf0" stroke-width="1.4"/>`).join('');
    }
    case 'shard': {
      const b = ['M96 30L119 4L110 46Z', 'M100 50L120 46L106 64Z', 'M100 70L120 84L100 86Z', 'M86 94L104 116L80 104Z'];
      return b.slice(0, 2 + Math.min(2, Math.floor(n / 2))).map((d) => `<path d="${d}" fill="url(#m)" stroke="#251a45" stroke-width="1"/><path d="${d}" fill="#ffffff" fill-opacity=".25" transform="translate(2 0) scale(.97)"/>`).join('');
    }
    case 'royal': {
      // gold feathers fanning out of the shoulders, prism quills, laurel at the foot
      let s = '';
      const fe: [number, number][] = [[-62, 36], [-42, 38], [-22, 36], [-2, 32], [18, 26], [36, 20]];
      for (const [ang, len] of fe) {
        s += `<path d="M0 -4.5Q${(len * 0.55).toFixed(1)} -10 ${len} 0Q${(len * 0.55).toFixed(1)} 8 0 4.5Z" transform="translate(90 58) rotate(${ang})" fill="url(#m)" stroke="#3a2402" stroke-width=".8"/>`;
        if (lg) s += `<path d="M2 0L${len - 4} 0" transform="translate(90 58) rotate(${ang})" stroke="url(#p)" stroke-width="1.3"/>`;
      }
      for (let i = 0; i < 4; i++) {
        const a = 1.2 - (i / 3) * 0.6;
        const x = 60 + Math.cos(a) * 44, y = 66 + Math.sin(a) * 42;
        const rot = (a * 180) / Math.PI + 90 - 28;
        s += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="3" ry="7" transform="rotate(${rot.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="url(#m)" stroke="#3a2402" stroke-width=".8"/>`;
      }
      return s;
    }
    default: return stage < 3 && n >= 3 ? `<path d="M${n >= 4 ? 100 : 99} 50L114 44L108 60L100 62Z" fill="url(#m)" stroke="#0008" stroke-width="1"/>` : '';
  }
}

// ---------- the badge ----------

type Mode = 'full' | 'mask' | 'glow';
/** lg ≥ 64 px: everything; sm 24–63 px: tighter crop, bigger number; xs < 24 px: emblem only. */
type Detail = 'lg' | 'sm' | 'xs';

function svgFor(lvl: number, detail: Detail, mode: Mode): string {
  const lg = detail === 'lg';
  const vb = lg ? '0 0 120 120' : '12 2 96 116';
  const st = stageOf(lvl).i;
  const sub = subOf(lvl);
  const L = LOOKS[st];
  const stops = L.metal.map((c, i) => `<stop offset="${(i / (L.metal.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join('');
  const prism = '<linearGradient id="p" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9ad5"/><stop offset=".25" stop-color="#ffe58a"/><stop offset=".5" stop-color="#8affc6"/><stop offset=".75" stop-color="#8ac8ff"/><stop offset="1" stop-color="#c69aff"/></linearGradient>';
  const defs = `<defs><linearGradient id="m" x1="0" y1="0" x2="${st === 9 ? 1 : 0.35}" y2="1">${stops}</linearGradient>`
    + `<radialGradient id="f" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="${L.field[0]}"/><stop offset="1" stop-color="${L.field[1]}"/></radialGradient>`
    + `<linearGradient id="h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".5" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient>`
    + `<linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="${L.accent}"/><stop offset="1" stop-color="${L.accent}" stop-opacity=".55"/></linearGradient>`
    + prism
    + `<radialGradient id="r" cx="60" cy="60" r="60" gradientUnits="userSpaceOnUse"><stop offset=".25" stop-color="${L.accent}" stop-opacity=".55"/><stop offset="1" stop-color="${L.accent}" stop-opacity="0"/></radialGradient>`
    + `<filter id="g" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${lg ? 2.2 : 1.6}"/></filter>`
    + `<clipPath id="c"><path d="${L.inner}"/></clipPath></defs>`;
  const wingsR = lg || st >= 3 ? wing(L.wings, st, sub, lg) : '';
  const wings = wingsR ? `<g>${wingsR}</g><g transform="${MIRROR}">${wingsR}</g>` : '';

  if (mode === 'mask') return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${defs}<g fill="#fff">${wings.replace(/fill="[^"]*"/g, 'fill="#fff"')}<path d="${L.outer}"/></g></svg>`;
  if (mode === 'glow') {
    const g = L.glow?.() ?? '';
    const both = `<g>${g}</g>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${defs}<g filter="url(#g)">${both}</g>${both}</svg>`;
  }

  // a soft halo behind the higher stages; light rays behind the crown
  let rays = '';
  if (st >= 6 && lg) rays = `<circle cx="60" cy="60" r="58" fill="url(#r)" opacity="${st === 10 ? 0.7 : 0.35}"/>`;
  if (st === 10 && lg) {
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.1;
      const x1 = C + Math.cos(a - 0.06) * 60, y1 = C + Math.sin(a - 0.06) * 60, x2 = C + Math.cos(a + 0.06) * 60, y2 = C + Math.sin(a + 0.06) * 60;
      rays += `<path d="M60 60L${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}Z" fill="url(#r)"/>`;
    }
  }

  // sub-steps: studs at the sides (1+), a gem on top (2+), side fins on plain frames (3+), a pendant (4)
  const [sx, sy] = L.side, [tx, ty] = L.top, [bx, by] = L.bottom;
  const stud = (x: number, y: number) => `<path d="M${x} ${y - 3.6}L${x + 2.6} ${y}L${x} ${y + 3.6}L${x - 2.6} ${y}Z" fill="url(#a)" stroke="${L.edge}" stroke-width=".9"/>`;
  let subs = '';
  if (sub >= 1) subs += stud(sx - 3, sy) + stud(120 - sx + 3, sy);
  if (sub >= 2 && st !== 10) subs += `<circle cx="${tx}" cy="${ty + 3}" r="${lg ? 4 : 4.6}" fill="url(#a)" stroke="${L.edge}" stroke-width="1"/><circle cx="${tx - 1.3}" cy="${ty + 1.6}" r="1.3" fill="#fff"/>`;
  if (sub >= 4) subs += `<path d="M${bx} ${by - 6}L${bx + 4} ${by - 1}L${bx} ${by + 5}L${bx - 4} ${by - 1}Z" fill="url(#a)" stroke="${L.edge}" stroke-width=".9"/>`;

  // pips: one per sub-step inside the field, under the number
  let pips = '';
  if (lg && lvl < MAX_LEVEL) {
    const k = sub + 1, gap = 6.4, y = L.cy + 19;
    for (let i = 0; i < k; i++) { const x = C + (i - (k - 1) / 2) * gap; pips += `<path d="M${x} ${y - 2.4}L${x + 2.2} ${y}L${x} ${y + 2.4}L${x - 2.2} ${y}Z" fill="${L.accent}"/>`; }
  }

  const txt = detail === 'xs' ? '' : String(lvl);
  const fs = lg ? (txt.length >= 3 ? 21 : 27) : txt.length >= 3 ? 26 : 34;
  const ny = L.cy - (lg ? 2 : 0);
  const glow = L.glow ? `<g filter="url(#g)" opacity=".9">${L.glow()}</g><g opacity=".95">${L.glow()}</g>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${defs}${rays}`
    + `<g transform="translate(0 2.2)" opacity=".5">${wings.replace(/fill="url\(#m\)"/g, 'fill="#000"')}<path d="${L.outer}" fill="#000"/></g>`
    + wings
    + `<path d="${L.outer}" fill="url(#m)" stroke="${L.edge}" stroke-width="1.6" stroke-linejoin="round"/>`
    + `<path d="${L.outer}" fill="none" stroke="url(#h)" stroke-width="2.2" transform="${scaleAt(0.93)}" stroke-linejoin="round"/>`
    + (L.decor?.(lg) ?? '')
    + glow
    + `<path d="${L.inner}" fill="${L.edge}" transform="${scaleAt(1.1, L.cy)}"/>`
    + `<path d="${L.inner}" fill="url(#f)" stroke="${L.accent}" stroke-opacity=".55" stroke-width="1"/>`
    + `<g clip-path="url(#c)"><ellipse cx="60" cy="${L.cy - 26}" rx="34" ry="20" fill="#fff" opacity=".07"/></g>`
    + subs + pips
    + `<text x="60" y="${ny}" text-anchor="middle" dominant-baseline="central" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="${fs}" letter-spacing="-.5" fill="${L.num}" stroke="${L.numEdge}" stroke-width="${lg ? 3.2 : 4}" paint-order="stroke" stroke-linejoin="round">${txt}</text>`
    + `</svg>`;
}

const cache = new Map<string, string>();
const toURL = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}`;
/** Data URL of the badge for `lvl` (cached by level, detail and layer). */
export function rankURL(lvl: number, size = 64, mode: Mode = 'full'): string {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.round(lvl)));
  const d: Detail = size >= 64 ? 'lg' : size >= 24 ? 'sm' : 'xs';
  // mask and glow only change per stage and sub-step, xs badges carry no number
  const key = mode === 'full' && d !== 'xs' ? `${l}|${d}` : `${mode}|${stageOf(l).i}|${subOf(l)}|${d}`;
  let u = cache.get(key);
  if (!u) { u = toURL(svgFor(l, d, mode)); cache.set(key, u); }
  return u;
}

/** Which living layers a stage gets (only on big badges). */
function fxOf(st: number) {
  return { shine: st >= 3, glow: !!LOOKS[st].glow, embers: st === 7 || st === 10, holo: st >= 9, fast: st === 8 };
}

export interface BadgeOpts { live?: boolean; cls?: string; locked?: boolean; title?: boolean }
/** HTML for a rank badge `size` px square. Living layers only for `live` badges of 40 px and more. */
export function rankBadge(lvl: number, size: number, o: BadgeOpts = {}): string {
  const st = stageOf(lvl).i;
  const live = !!o.live && size >= 40 && !o.locked;
  const fx = fxOf(st);
  let layers = '';
  if (live) {
    if (fx.glow) layers += `<img class="rk-glow${fx.fast ? ' fast' : ''}" src="${rankURL(lvl, size, 'glow')}" alt="" draggable="false">`;
    if (fx.shine || fx.holo) layers += `<span class="rk-fx" style="-webkit-mask-image:url('${rankURL(lvl, size, 'mask')}');mask-image:url('${rankURL(lvl, size, 'mask')}')">${fx.holo ? '<b></b>' : ''}${fx.shine ? '<i></i>' : ''}</span>`;
    if (fx.embers) layers += `<span class="rk-emb${st === 10 ? ' gold' : ''}">${[18, 34, 50, 64, 78, 88].map((x, i) => `<i style="left:${x}%;animation-delay:${(i * 0.53).toFixed(2)}s"></i>`).join('')}</span>`;
  }
  const label = `${rankName(lvl)} · Stufe ${lvl}`;
  return `<span class="rk rk-s${st}${live && layers ? ' live' : ''}${o.locked ? ' locked' : ''}${o.cls ? ` ${o.cls}` : ''}" style="--s:${size}px"${o.title !== false ? ` title="${label}"` : ''}><img class="rk-img" src="${rankURL(lvl, size)}" width="${size}" height="${size}" alt="${o.title === false ? '' : label}" draggable="false">${layers}</span>`;
}

// Living layers run only while visible.
let io: IntersectionObserver | null = null;
const watched = new Set<Element>();
/** Starts the living layers of every `.rk.live` under `root` while it is on screen. */
export function armLive(root: ParentNode) {
  if (typeof IntersectionObserver === 'undefined') return;
  io ??= new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('on', e.isIntersecting)), { rootMargin: '40px' });
  for (const el of [...watched]) if (!el.isConnected) { io.unobserve(el); watched.delete(el); }
  root.querySelectorAll('.rk.live').forEach((el) => { if (!watched.has(el)) { watched.add(el); io!.observe(el); } });
}

// ---------- level-up pulse ----------

/** The short pop on a badge: scale bump plus an expanding ring (transform/opacity only). */
export function pulseBadge(host: HTMLElement, color = '#ffb15e') {
  if (reducedMotion() || typeof host.animate !== 'function') return;
  host.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.32)', offset: 0.28 }, { transform: 'scale(.94)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 720, easing: 'cubic-bezier(.2,.8,.2,1)' });
  const ring = document.createElement('i');
  ring.className = 'rk-ring';
  ring.style.setProperty('--c', color);
  host.appendChild(ring);
  ring.animate([{ transform: 'scale(.5)', opacity: 1 }, { transform: 'scale(1.9)', opacity: 0 }], { duration: 800, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => ring.remove();
}

// ---------- stage-up ceremony ----------

let busy = false;
const queue: { stage: Stage; now: boolean }[] = [];
async function runQueue() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    // never over a drop window: wait until the player is between actions
    const t0 = Date.now();
    while (!queue[0].now && (modalOpen() || document.visibilityState !== 'visible') && Date.now() - t0 < 60_000) await new Promise((r) => setTimeout(r, 400));
    await playCeremony(queue.shift()!.stage);
  }
  busy = false;
}

/** Perks the new stage brings, as short lines. */
export function stagePerks(s: Stage): string[] {
  const out = [`Rahmen „${s.name}“`, 'Profilbanner', 'Namensfarbe im Feed'];
  if (s.i > 0) out.push(`+${Math.round(sellBonus(s.from) * 100)} % beim Verkauf`, `Tageskiste ${s.name}`, `+${50 * s.i} Coins`);
  return out;
}

/** The ~2.5 s ceremony for reaching `stage` (old frame breaks, the new one lands). Skippable. */
export function stageCeremony(stage: Stage, now = false) {
  queue.push({ stage, now });
  void runQueue();
}

function playCeremony(stage: Stage): Promise<void> {
  return new Promise((done) => {
    const newL = stage.from;
    const oldL = Math.max(1, newL - 1);
    const rm = reducedMotion();
    const size = Math.min(240, Math.round(Math.min(innerWidth, innerHeight) * 0.42));
    const shards: [number, number][][] = [
      [[0, 0], [55, 0], [45, 40], [0, 30]], [[55, 0], [100, 0], [100, 35], [45, 40]],
      [[0, 30], [45, 40], [35, 70], [0, 75]], [[45, 40], [100, 35], [100, 70], [60, 65]],
      [[0, 75], [35, 70], [50, 100], [0, 100]], [[35, 70], [60, 65], [100, 70], [100, 100], [50, 100]],
    ];
    const dirs: [number, number, number][] = [[-1, -1, -40], [1, -1, 35], [-1.2, 0, -25], [1.2, 0.1, 30], [-0.8, 1, -50], [0.9, 1, 45]];
    const wrap = document.createElement('div');
    wrap.className = 'rk-cer';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', `Neuer Rang: ${stage.name}`);
    wrap.style.setProperty('--rc', stage.color);
    wrap.style.setProperty('--sz', `${size}px`);
    wrap.innerHTML = `<div class="rc-back"></div>
      <div class="rc-stage">
        <div class="rc-rays"></div>
        <div class="rc-old">${rankBadge(oldL, size, { title: false })}</div>
        <div class="rc-shards">${shards.map((p) => `<span style="clip-path:polygon(${p.map(([x, y]) => `${x}% ${y}%`).join(',')})"><img src="${rankURL(oldL, size)}" alt=""></span>`).join('')}</div>
        <i class="rc-flash"></i>
        <div class="rc-new">${rankBadge(newL, size, { live: true, title: false })}</div>
      </div>
      <div class="rc-txt"><small>Neuer Rang</small><h2>${stage.name}</h2><p>Stufe ${newL} · ${titleOf(newL).name}</p><ul>${stagePerks(stage).map((x) => `<li>${x}</li>`).join('')}</ul></div>
      <span class="rc-skip">Tippen zum Überspringen</span>`;
    document.body.appendChild(wrap);
    armLive(wrap);
    const $ = (s: string) => wrap.querySelector(s) as HTMLElement;
    const anims: Animation[] = [];
    const A = (el: Element, k: Keyframe[], t: KeyframeAnimationOptions) => { const a = el.animate(k, { fill: 'both', easing: 'cubic-bezier(.2,.8,.2,1)', ...t }); anims.push(a); return a; };
    let finished = false;
    const end = () => {
      if (finished) return;
      finished = true;
      removeEventListener('keydown', onKey, true);
      const a = wrap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
      a.onfinish = () => { anims.forEach((x) => x.cancel()); wrap.remove(); done(); };
    };
    const onKey = (e: KeyboardEvent) => { e.preventDefault(); e.stopPropagation(); end(); };
    wrap.addEventListener('click', end);
    addEventListener('keydown', onKey, true);
    sfx.rankUp();

    A($('.rc-back'), [{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
    if (rm) {
      A($('.rc-old'), [{ opacity: 1 }, { opacity: 0 }], { duration: 500, delay: 400 });
      A($('.rc-new'), [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 400 });
      A($('.rc-txt'), [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 700 });
      wrap.querySelectorAll('.rc-shards, .rc-flash, .rc-rays').forEach((x) => ((x as HTMLElement).style.display = 'none'));
      setTimeout(end, 2600);
      return;
    }
    // 0–0.9 s: the old frame strains
    A($('.rc-old'), [{ transform: 'scale(.86)', opacity: 0 }, { transform: 'scale(1)', opacity: 1, offset: 0.25 }, { transform: 'scale(1.02) rotate(-1.5deg)', offset: 0.55 }, { transform: 'scale(1.05) rotate(1.8deg)', offset: 0.7 }, { transform: 'scale(1.06) rotate(-2deg)', offset: 0.85 }, { transform: 'scale(1.08)', opacity: 1, offset: 0.97 }, { transform: 'scale(1.08)', opacity: 0 }], { duration: 930 });
    // 0.9 s: it breaks into shards
    wrap.querySelectorAll<HTMLElement>('.rc-shards span').forEach((s, i) => {
      const [dx, dy, r] = dirs[i];
      A(s, [{ transform: 'translate(0,0) scale(1.08)', opacity: 0 }, { transform: 'translate(0,0) scale(1.08)', opacity: 1, offset: 0.01 }, { transform: `translate(${dx * size * 0.75}px, ${dy * size * 0.6 + size * 0.25}px) rotate(${r}deg) scale(.9)`, opacity: 0 }], { duration: 900, delay: 900, easing: 'cubic-bezier(.15,.6,.3,1)' });
    });
    setTimeout(() => { if (!finished) sfx.shatter(); }, 900);
    A($('.rc-flash'), [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(.6)', opacity: 1, offset: 0.2 }, { transform: 'scale(1.6)', opacity: 0 }], { duration: 700, delay: 880 });
    A($('.rc-rays'), [{ transform: 'scale(.6) rotate(0deg)', opacity: 0 }, { transform: 'scale(1) rotate(20deg)', opacity: 1, offset: 0.3 }, { transform: 'scale(1.05) rotate(60deg)', opacity: 0.7 }], { duration: 2400, delay: 950, easing: 'linear' });
    // 1.0 s: the new frame lands
    A($('.rc-new'), [{ transform: 'scale(.35)', opacity: 0 }, { transform: 'scale(1.12)', opacity: 1, offset: 0.55 }, { transform: 'scale(1)', opacity: 1 }], { duration: 650, delay: 980 });
    A($('.rc-txt'), [{ transform: 'translateY(14px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 450, delay: 1250 });
    A($('.rc-skip'), [{ opacity: 0 }, { opacity: 0.6 }], { duration: 400, delay: 600 });
    setTimeout(end, 3300);
  });
}

/** Profile banner per stage (career page): cheap layered CSS gradients, no images. */
export const BANNERS: string[] = [
  'repeating-linear-gradient(115deg, rgba(255,255,255,.035) 0 2px, transparent 2px 9px), radial-gradient(80% 140% at 0% 50%, rgba(170,180,195,.22), transparent 60%), linear-gradient(180deg, #171b21, #0f1216)',
  'radial-gradient(circle at 30% 30%, rgba(255,180,110,.12) 0 1.5px, transparent 2.5px) 0 0 / 22px 22px, radial-gradient(80% 140% at 0% 50%, rgba(224,154,92,.32), transparent 60%), linear-gradient(180deg, #1d1610, #110c08)',
  'linear-gradient(100deg, transparent 30%, rgba(255,255,255,.06) 38%, transparent 46%), linear-gradient(100deg, transparent 52%, rgba(255,255,255,.04) 56%, transparent 60%), radial-gradient(80% 140% at 0% 50%, rgba(223,231,242,.22), transparent 60%), linear-gradient(180deg, #181d25, #0e1218)',
  'repeating-conic-gradient(from 0deg at 12% 50%, rgba(255,211,90,.07) 0 4deg, transparent 4deg 12deg), radial-gradient(80% 140% at 0% 50%, rgba(255,211,90,.30), transparent 60%), linear-gradient(180deg, #1f190c, #120e05)',
  'repeating-linear-gradient(60deg, rgba(191,243,255,.05) 0 1px, transparent 1px 16px), repeating-linear-gradient(-60deg, rgba(191,243,255,.05) 0 1px, transparent 1px 16px), radial-gradient(80% 140% at 0% 50%, rgba(127,232,255,.25), transparent 60%), linear-gradient(180deg, #121d22, #0a1115)',
  'conic-gradient(from 30deg at 15% 50%, rgba(77,255,166,.12), transparent 20%, rgba(77,255,166,.06) 40%, transparent 60%, rgba(77,255,166,.1) 80%, transparent), radial-gradient(80% 140% at 0% 50%, rgba(77,255,166,.25), transparent 60%), linear-gradient(180deg, #0e1d16, #08110c)',
  'repeating-linear-gradient(135deg, rgba(111,182,255,.06) 0 1px, transparent 1px 22px), radial-gradient(60% 120% at 10% 50%, rgba(111,182,255,.35), transparent 65%), linear-gradient(180deg, #0c1630, #070c1a)',
  'radial-gradient(circle at 30% 70%, rgba(255,122,51,.4) 0 1.5px, transparent 2.5px) 0 0 / 37px 31px, radial-gradient(circle at 70% 30%, rgba(255,170,90,.28) 0 1px, transparent 2px) 0 0 / 23px 29px, radial-gradient(70% 140% at 0% 100%, rgba(255,90,20,.35), transparent 60%), linear-gradient(180deg, #140c09, #080504)',
  'linear-gradient(rgba(63,243,255,.07) 1px, transparent 1px) 0 0 / 28px 28px, linear-gradient(90deg, rgba(255,92,240,.07) 1px, transparent 1px) 0 0 / 28px 28px, radial-gradient(70% 140% at 0% 50%, rgba(255,92,240,.32), transparent 60%), linear-gradient(180deg, #160822, #0a0412)',
  'linear-gradient(115deg, rgba(255,154,213,.18), rgba(255,229,138,.12) 25%, rgba(138,255,198,.12) 50%, rgba(138,200,255,.14) 75%, rgba(198,154,255,.18)), linear-gradient(180deg, #151229, #0a0818)',
  'repeating-conic-gradient(from 0deg at 12% 50%, rgba(255,215,94,.09) 0 3deg, transparent 3deg 10deg), radial-gradient(80% 140% at 0% 50%, rgba(255,215,94,.35), transparent 60%), linear-gradient(180deg, #1f0f2e, #0c0616)',
];
