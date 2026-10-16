// Hand-drawn SVG art for the board scenes: the shopkeeper Krempel, the star host Madame Komet,
// the 12 items, the 6 Kumpel, crates, the roulette wheel and a few props. Same toon look as the
// HUD figures: flat colours, thick violet-black outlines, a white shine stroke.

import type { BuddyId, ItemId } from '../../engine/tables';

const V = '#0b0614';
const OL = `stroke="${V}" stroke-width="3" stroke-linejoin="round"`;

// ---------------- items ----------------
const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]], 2: [[0.27, 0.27], [0.73, 0.73]], 3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]], 5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.27, 0.25], [0.73, 0.25], [0.27, 0.5], [0.73, 0.5], [0.27, 0.75], [0.73, 0.75]],
};
function die(x: number, y: number, s: number, fill: string, face: number | string, rot = 0) {
  const pips = typeof face === 'number'
    ? PIPS[face].map(([u, v]) => `<circle cx="${(x + u * s).toFixed(1)}" cy="${(y + v * s).toFixed(1)}" r="${(s * 0.085).toFixed(1)}" fill="${V}"/>`).join('')
    : `<text x="${x + s / 2}" y="${y + s * 0.72}" text-anchor="middle" font-family="Archivo, sans-serif" font-weight="900" font-style="italic" font-size="${s * 0.62}" fill="${V}">${face}</text>`;
  return `<g transform="rotate(${rot} ${x + s / 2} ${y + s / 2})"><rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.2}" fill="${fill}" ${OL}/><path d="M${x + s * 0.18} ${y + s * 0.22} q${s * 0.1} -${s * 0.08} ${s * 0.3} -${s * 0.06}" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".75"/>${pips}</g>`;
}

const ITEM_ART: Record<ItemId, string> = {
  dw: die(6, 18, 30, '#ffe14a', 5, -10) + die(28, 14, 30, '#ff7ad9', 3, 8),
  tw: die(2, 26, 24, '#ffe14a', 2, -12) + die(38, 26, 24, '#2fe6ff', 4, 10) + die(20, 6, 24, '#ff7ad9', 6, 0),
  hw: `<g transform="rotate(-8 32 32)"><rect x="12" y="12" width="40" height="40" rx="8" fill="#b9add3" ${OL}/><path d="M12 52 L52 12 L52 44 Q52 52 44 52 Z" fill="#7dff8a" ${OL}/><text x="25" y="35" text-anchor="middle" font-family="Archivo, sans-serif" font-weight="900" font-style="italic" font-size="16" fill="${V}">1</text><text x="42" y="46" text-anchor="middle" font-family="Archivo, sans-serif" font-weight="900" font-style="italic" font-size="13" fill="${V}">–3</text></g>`,
  joker: die(10, 10, 44, '#b46bff', '?', -6) + '<path d="M50 8 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="#ffe14a" stroke="#0b0614" stroke-width="1.6"/>',
  sh: `<path d="M32 6 L54 14 C54 34 46 50 32 58 C18 50 10 34 10 14 Z" fill="#2fe6ff" ${OL}/><path d="M32 13 L47 18.5 C47 33 41 44 32 50 Z" fill="#9ff6ff"/><path d="M18 20 C18 26 19 30 21 34" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M50 40 l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2z M14 46 l1.4 3 3 1.4 -3 1.4 -1.4 3 -1.4 -3 -3 -1.4 3 -1.4z" fill="#fff" stroke="${V}" stroke-width="1.4"/>`,
  mag: `<path d="M14 8 h12 v24 a6 6 0 0 0 12 0 v-24 h12 v24 a18 18 0 0 1 -36 0 z" fill="#ff3d6e" ${OL}/><rect x="14" y="8" width="12" height="9" fill="#e8e3f5" ${OL}/><rect x="38" y="8" width="12" height="9" fill="#e8e3f5" ${OL}/><path d="M19 30 q0 10 6 15" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".7"/><path d="M8 52 l4 -3 M56 52 l-4 -3 M32 60 v-4" stroke="#ffe14a" stroke-width="3" stroke-linecap="round"/>`,
  key: `<circle cx="20" cy="22" r="13" fill="#ffd23f" ${OL}/><circle cx="20" cy="22" r="5" fill="#2a0670" ${OL}/><path d="M30 30 L52 52 M42 42 l5 -5 M48 48 l5 -5" stroke="${V}" stroke-width="10" stroke-linecap="round"/><path d="M30 30 L52 52 M42 42 l5 -5 M48 48 l5 -5" stroke="#ffd23f" stroke-width="5" stroke-linecap="round"/><path d="M12 17 q3 -5 8 -5" stroke="#fff" stroke-width="2.6" stroke-linecap="round" fill="none"/>`,
  pfeife: `<path d="M8 30 h26 a14 14 0 1 1 -2 14 h-24 z" fill="#ff7ad9" ${OL}/><circle cx="44" cy="38" r="5" fill="#ffd1f0" ${OL}/><rect x="10" y="24" width="10" height="8" rx="2" fill="#ff3d9a" ${OL}/><path d="M44 14 q6 -4 12 0 M48 6 q6 -4 12 0" stroke="#ffe14a" stroke-width="3" stroke-linecap="round" fill="none"/>`,
  kompass: `<circle cx="32" cy="34" r="24" fill="#f2cf74" ${OL}/><circle cx="32" cy="34" r="18" fill="#fff8e6" ${OL}/><path d="M32 18 L37 34 L32 50 L27 34 Z" fill="#ff3d6e" stroke="${V}" stroke-width="2.4" stroke-linejoin="round"/><path d="M32 34 L37 34 L32 50 L27 34 Z" fill="#5b2bd6"/><circle cx="32" cy="34" r="3" fill="${V}"/><path d="M32 2 l3 6 6 1 -4.5 4 1 6 -5.5 -3 -5.5 3 1 -6 -4.5 -4 6 -1z" fill="#ffe14a" stroke="${V}" stroke-width="2"/>`,
  tausch: `<rect x="10" y="6" width="44" height="54" rx="7" fill="#2fe6ff" ${OL}/><rect x="16" y="12" width="32" height="42" rx="4" fill="#e9fdff"/><path d="M22 28 a10 10 0 0 1 18 -4 M42 36 a10 10 0 0 1 -18 4" stroke="${V}" stroke-width="3.4" stroke-linecap="round" fill="none"/><path d="M41 17 l0 8 -8 0 Z M23 47 l0 -8 8 0 Z" fill="${V}"/>`,
  fahne: `<path d="M16 6 V60" stroke="${V}" stroke-width="5" stroke-linecap="round"/><path d="M16 6 V60" stroke="#c9a46a" stroke-width="2"/><path d="M18 8 C30 4 36 14 52 9 L46 22 L54 33 C38 38 30 28 18 32 Z" fill="#ff8a2e" ${OL}/><path d="M30 14 l2.4 5 5 .6 -3.8 3.4 1 5 -4.6 -2.6 -4.6 2.6 1 -5 -3.8 -3.4 5 -.6z" fill="#ffe14a" stroke="${V}" stroke-width="1.4"/>`,
  tuete: `<path d="M14 22 h36 l4 34 a4 4 0 0 1 -4 4 h-36 a4 4 0 0 1 -4 -4 z" fill="#ffd23f" ${OL}/><path d="M22 22 c0 -12 20 -12 20 0" stroke="${V}" stroke-width="3.4" fill="none"/><path d="M32 30 l3.6 7.4 8 1 -6 5.4 1.6 8 -7.2 -4 -7.2 4 1.6 -8 -6 -5.4 8 -1z" fill="#fff6b0" stroke="${V}" stroke-width="2"/><path d="M17 28 v20" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>`,
};
export const itemSVG = (i: ItemId) => `<svg viewBox="0 0 64 64" aria-hidden="true">${ITEM_ART[i]}</svg>`;

// ---------------- Kumpel ----------------
const face = (cx: number, cy: number, s = 1) => `<g transform="translate(${cx} ${cy}) scale(${s})"><ellipse cx="-7" cy="0" rx="4" ry="5" fill="${V}"/><ellipse cx="7" cy="0" rx="4" ry="5" fill="${V}"/><circle cx="-6" cy="-2" r="1.5" fill="#fff"/><circle cx="8" cy="-2" r="1.5" fill="#fff"/><path d="M-4 7 q4 4 8 0" stroke="${V}" stroke-width="2.4" stroke-linecap="round" fill="none"/><ellipse cx="-13" cy="6" rx="3" ry="2" fill="#ff6fb1" opacity=".8"/><ellipse cx="13" cy="6" rx="3" ry="2" fill="#ff6fb1" opacity=".8"/></g>`;
const BUD_ART: Record<BuddyId, string> = {
  lumi: `<circle cx="32" cy="34" r="27" fill="#fff6b0" opacity=".35"/><path d="M14 26 C2 14 4 36 16 36 M50 26 C62 14 60 36 48 36" fill="#e9fdff" ${OL}/><circle cx="32" cy="34" r="18" fill="#ffe14a" ${OL}/>${face(32, 34)}<path d="M22 24 q4 -5 10 -5" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none"/>`,
  pips: `<ellipse cx="32" cy="58" rx="14" ry="3.5" fill="${V}" opacity=".35"/><circle cx="32" cy="32" r="22" fill="#7dff8a" ${OL}/><path d="M18 26 q4 -10 14 -11" stroke="#fff" stroke-width="3.4" stroke-linecap="round" fill="none"/>${face(32, 34)}<path d="M30 10 q2 -8 8 -6" stroke="${V}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  klecks: `<path d="M32 4 C40 18 54 28 54 42 a22 20 0 0 1 -44 0 C10 28 24 18 32 4 Z" fill="#b46bff" ${OL}/><path d="M20 36 q0 -8 6 -14" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".8"/>${face(32, 42)}`,
  bolle: `<path d="M14 50 a10 10 0 0 1 -2 -19 a13 13 0 0 1 20 -14 a12 12 0 0 1 21 7 a10 10 0 0 1 -1 26 Z" fill="#ffffff" ${OL}/>${face(32, 38)}<path d="M18 30 q2 -6 9 -7" stroke="#cfe8ff" stroke-width="3" stroke-linecap="round" fill="none"/>`,
  funz: `<path d="M32 14 L37 26 L50 22 L42 33 L54 40 L40 42 L42 56 L32 46 L22 56 L24 42 L10 40 L22 33 L14 22 L27 26 Z" fill="#ffb340" ${OL}/>${face(32, 37, 0.85)}<rect x="22" y="2" width="20" height="13" rx="2" fill="${V}"/><rect x="17" y="13" width="30" height="5" rx="2" fill="${V}"/><rect x="22" y="9" width="20" height="3" fill="#ff3d9a"/>`,
  mopp: `<path d="M32 46 L32 62" stroke="${V}" stroke-width="6" stroke-linecap="round"/><path d="M32 46 L32 62" stroke="#c9a46a" stroke-width="3" stroke-linecap="round"/><path d="M32 6 c6 0 8 5 12 5 c5 0 10 5 9 10 c4 3 4 9 1 12 c2 5 -2 10 -7 10 c-3 4 -9 5 -15 5 c-6 0 -12 -1 -15 -5 c-5 0 -9 -5 -7 -10 c-3 -3 -3 -9 1 -12 c-1 -5 4 -10 9 -10 c4 0 6 -5 12 -5 z" fill="#ff9ad5" ${OL}/>${face(32, 28)}`,
};
export const buddySVG = (b: BuddyId) => `<svg viewBox="0 0 64 64" aria-hidden="true">${BUD_ART[b]}</svg>`;

// ---------------- characters ----------------
/** Krempel, the shopkeeper: a round apricot fellow with a lime top hat, monocle and moustache. */
export const keeperSVG = () => `<svg viewBox="0 0 220 230" class="keeper" aria-hidden="true">
  <g class="kp-body">
    <path d="M110 58 C170 58 196 98 196 150 C196 200 160 222 110 222 C60 222 24 200 24 150 C24 98 50 58 110 58 Z" fill="#ffb27a" ${OL.replace('3', '4')}/>
    <path d="M52 110 C56 86 74 72 96 68" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none" opacity=".55"/>
    <path d="M58 170 C58 150 162 150 162 170 L166 222 L54 222 Z" fill="#ff3d9a" ${OL}/>
    <path d="M70 158 V222 M90 154 V222 M110 153 V222 M130 154 V222 M150 158 V222" stroke="#ffd1ea" stroke-width="5" opacity=".9"/>
    <rect x="94" y="178" width="32" height="22" rx="4" fill="#ffe14a" ${OL}/><text x="110" y="195" text-anchor="middle" font-family="Archivo, sans-serif" font-weight="900" font-style="italic" font-size="16" fill="${V}">K</text>
    <g class="kp-eyes"><ellipse cx="86" cy="116" rx="12" ry="14" fill="#fff" ${OL}/><ellipse cx="134" cy="116" rx="12" ry="14" fill="#fff" ${OL}/><circle cx="89" cy="119" r="6" fill="${V}"/><circle cx="131" cy="119" r="6" fill="${V}"/><circle cx="91" cy="116" r="2.2" fill="#fff"/><circle cx="133" cy="116" r="2.2" fill="#fff"/></g>
    <circle cx="134" cy="116" r="17" fill="none" stroke="#f2cf74" stroke-width="4"/><path d="M150 122 q10 20 2 40" stroke="#f2cf74" stroke-width="2.5" fill="none"/>
    <path d="M74 96 q12 -8 22 -2 M124 94 q12 -6 22 2" stroke="${V}" stroke-width="5" stroke-linecap="round" fill="none"/>
    <circle cx="110" cy="134" r="10" fill="#ff7a5c" ${OL}/>
    <g class="kp-mouth"><path d="M98 152 q12 12 24 0 q-12 4 -24 0z" fill="#7a1033" ${OL}/></g>
    <g class="kp-stache"><path d="M110 142 C96 134 78 136 66 148 C80 146 92 152 110 148 C128 152 140 146 154 148 C142 136 124 134 110 142 Z" fill="#fffdf5" ${OL}/></g>
    <ellipse cx="66" cy="140" rx="9" ry="5" fill="#ff6fb1" opacity=".6"/><ellipse cx="154" cy="140" rx="9" ry="5" fill="#ff6fb1" opacity=".6"/>
  </g>
  <g class="kp-hat"><rect x="80" y="18" width="60" height="46" rx="6" fill="#dcff1f" ${OL}/><rect x="80" y="44" width="60" height="10" fill="#ff3d9a" ${OL}/><rect x="62" y="56" width="96" height="12" rx="6" fill="#dcff1f" ${OL}/><path d="M90 26 v14" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".7"/></g>
</svg>`;

/** Madame Komet, the star host: a night-blue round lady with a comet tail for hair and a star wand. */
export const kometSVG = () => `<svg viewBox="0 0 240 240" class="komet" aria-hidden="true">
  <defs><linearGradient id="kmTail" x1="0" x2="1"><stop offset="0" stop-color="#ff7ad9" stop-opacity="0"/><stop offset=".45" stop-color="#ff7ad9"/><stop offset="1" stop-color="#ffe14a"/></linearGradient></defs>
  <g class="km-tail"><path d="M118 66 C70 30 30 50 6 20 C28 70 64 84 104 92 Z" fill="url(#kmTail)" ${OL}/><path d="M112 80 C70 70 40 92 14 76 C36 108 78 108 106 104 Z" fill="url(#kmTail)" ${OL}/></g>
  <g class="km-body">
    <circle cx="138" cy="130" r="74" fill="#2a1a8f" ${OL.replace('3', '4')}/>
    <path d="M86 98 C94 76 112 64 134 60" stroke="#8fa0ff" stroke-width="7" stroke-linecap="round" fill="none" opacity=".7"/>
    <circle cx="96" cy="160" r="4" fill="#ffe14a"/><circle cx="182" cy="96" r="3" fill="#fff"/><circle cx="176" cy="178" r="3.5" fill="#2fe6ff"/>
    <g class="km-eyes"><ellipse cx="120" cy="124" rx="11" ry="13" fill="#fff" ${OL}/><ellipse cx="160" cy="124" rx="11" ry="13" fill="#fff" ${OL}/><circle cx="122" cy="127" r="6" fill="${V}"/><circle cx="158" cy="127" r="6" fill="${V}"/><circle cx="124" cy="124" r="2" fill="#fff"/><circle cx="160" cy="124" r="2" fill="#fff"/></g>
    <path d="M108 106 l-6 -6 M114 103 l-3 -8 M172 106 l6 -6 M166 103 l3 -8" stroke="${V}" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="104" cy="146" rx="9" ry="5" fill="#ff6fb1" opacity=".7"/><ellipse cx="176" cy="146" rx="9" ry="5" fill="#ff6fb1" opacity=".7"/>
    <g class="km-mouth"><path d="M128 150 q12 12 24 0" stroke="${V}" stroke-width="4" stroke-linecap="round" fill="#ff7a9a"/></g>
    <path d="M138 178 l5 10 11 1.5 -8 7.5 2 11 -10 -5.5 -10 5.5 2 -11 -8 -7.5 11 -1.5z" fill="#ffe14a" ${OL}/>
  </g>
  <g class="km-wand"><path d="M206 176 L222 86" stroke="${V}" stroke-width="7" stroke-linecap="round"/><path d="M206 176 L222 86" stroke="#f2cf74" stroke-width="3.5" stroke-linecap="round"/><path d="M223 62 l6 13 14 1.6 -10.4 9.6 2.8 14 -12.4 -7 -12.4 7 2.8 -14 -10.4 -9.6 14 -1.6z" fill="#ffe14a" ${OL}/><circle cx="206" cy="176" r="9" fill="#2a1a8f" ${OL}/></g>
</svg>`;

/** The big star (pedestal prize). */
export const bigStarSVG = (fill = '#ffe14a') => `<svg viewBox="-4 -4 108 104" aria-hidden="true"><path d="M50 2 L63 33 L97 35 L71 57 L79 91 L50 73 L21 91 L29 57 L3 35 L37 33 Z" fill="${fill}" stroke="${V}" stroke-width="5" stroke-linejoin="round"/><path d="M26 40 L40 39 L46 22" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".7"/><ellipse cx="41" cy="52" rx="4.5" ry="6" fill="${V}"/><ellipse cx="59" cy="52" rx="4.5" ry="6" fill="${V}"/><path d="M44 64 q6 5 12 0" stroke="${V}" stroke-width="3.5" stroke-linecap="round" fill="none"/></svg>`;

export const crateSVG = (open = false) => `<svg viewBox="0 0 64 64" aria-hidden="true">${open ? `<path d="M6 18 L30 4 L36 14 L12 28 Z" fill="#e0913c" ${OL}/>` : `<rect x="6" y="14" width="52" height="12" rx="2" fill="#e0913c" ${OL}/>`}<rect x="8" y="24" width="48" height="34" rx="2" fill="#c06a22" ${OL}/><path d="M8 24 L56 58 M56 24 L8 58" stroke="#8a4512" stroke-width="4"/><rect x="26" y="34" width="12" height="12" rx="2" fill="#ffd23f" ${OL}/></svg>`;

/** A European roulette wheel (37 pockets), as an SVG group string; pocket k sits at angle k·360/37. */
export function rouletteSVG(pockets: number[], red: Set<number>) {
  const n = pockets.length, R = 100, r = 66;
  const seg = pockets.map((num, k) => {
    const a0 = ((k - 0.5) / n) * Math.PI * 2 - Math.PI / 2, a1 = ((k + 0.5) / n) * Math.PI * 2 - Math.PI / 2;
    const p = (a: number, rr: number) => `${(Math.cos(a) * rr).toFixed(2)} ${(Math.sin(a) * rr).toFixed(2)}`;
    const col = num === 0 ? '#1fae5b' : red.has(num) ? '#e0244f' : '#1a1030';
    const am = (k / n) * 360;
    return `<path d="M${p(a0, r)} L${p(a0, R)} A${R} ${R} 0 0 1 ${p(a1, R)} L${p(a1, r)} A${r} ${r} 0 0 0 ${p(a0, r)}Z" fill="${col}" stroke="#f2cf74" stroke-width="1"/><text transform="rotate(${am.toFixed(2)}) translate(0 -86)" text-anchor="middle" font-family="Archivo, sans-serif" font-weight="800" font-size="9" fill="#fff">${num}</text>`;
  }).join('');
  return `<svg viewBox="-112 -112 224 224" aria-hidden="true"><circle r="110" fill="#5a2d0c" stroke="${V}" stroke-width="4"/><circle r="104" fill="#f2cf74"/>${seg}<circle r="66" fill="#3a1a08" stroke="#f2cf74" stroke-width="3"/><circle r="44" fill="#7a3d12" stroke="${V}" stroke-width="3"/><path d="M0 -40 V40 M-40 0 H40" stroke="#f2cf74" stroke-width="7" stroke-linecap="round"/><circle r="12" fill="#f2cf74" stroke="${V}" stroke-width="3"/></svg>`;
}

/** The Neonstadt turntable seen from above, arrow pointing up (north). */
export const turntableSVG = () => `<svg viewBox="-110 -110 220 220" aria-hidden="true"><circle r="104" fill="#ff7ad9" stroke="${V}" stroke-width="5"/><circle r="88" fill="#ffd1f0" stroke="${V}" stroke-width="3"/>${Array.from({ length: 12 }, (_, k) => `<circle cx="${(Math.cos((k / 12) * Math.PI * 2) * 96).toFixed(1)}" cy="${(Math.sin((k / 12) * Math.PI * 2) * 96).toFixed(1)}" r="4.5" fill="${k % 2 ? '#ffe14a' : '#2fe6ff'}" stroke="${V}" stroke-width="1.6"/>`).join('')}<path d="M0 -84 L26 -40 L10 -40 L10 30 L-10 30 L-10 -40 L-26 -40 Z" fill="#dcff1f" stroke="${V}" stroke-width="4" stroke-linejoin="round"/><circle r="26" fill="#2a0670" stroke="${V}" stroke-width="3"/><path d="M0 -16 l4.7 9.6 10.5 1.5 -7.6 7.4 1.8 10.5 -9.4 -5 -9.4 5 1.8 -10.5 -7.6 -7.4 10.5 -1.5z" fill="#ffe14a" stroke="${V}" stroke-width="2"/></svg>`;

/** Small helpers. */
export const handshakeSVG = `<svg viewBox="0 0 64 64" aria-hidden="true"><g transform="rotate(-30 32 32)"><rect x="4" y="20" width="32" height="24" rx="12" fill="none" stroke="${V}" stroke-width="10"/><rect x="4" y="20" width="32" height="24" rx="12" fill="none" stroke="#2fe6c8" stroke-width="5"/><rect x="28" y="20" width="32" height="24" rx="12" fill="none" stroke="${V}" stroke-width="10"/><rect x="28" y="20" width="32" height="24" rx="12" fill="none" stroke="#ff7ad9" stroke-width="5"/><path d="M8 32 v-4" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M28 24 h4" stroke="#2fe6c8" stroke-width="5"/></g></svg>`;
export const boltSVG = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M36 2 L12 36 H30 L24 62 L52 24 H34 Z" fill="#ff3d9a" ${OL}/><path d="M34 10 L20 32" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/></svg>`;
export const vsSVG = `<svg viewBox="0 0 120 80" aria-hidden="true"><text x="60" y="64" text-anchor="middle" font-family="Archivo, sans-serif" font-weight="900" font-style="italic" font-size="70" fill="#ffe14a" stroke="${V}" stroke-width="5" paint-order="stroke">VS</text></svg>`;
