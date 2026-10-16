// Key art for the launcher, drawn as inline SVG (no image files). Deterministic, so every visit looks the same.

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f = (n: number) => Math.round(n * 10) / 10;

/** Four-point glint used across the art. */
function glint(x: number, y: number, r: number, fill: string, op = 1) {
  const k = r * 0.22;
  return `<path d="M${f(x)} ${f(y - r)}L${f(x + k)} ${f(y - k)}L${f(x + r)} ${f(y)}L${f(x + k)} ${f(y + k)}L${f(x)} ${f(y + r)}L${f(x - k)} ${f(y + k)}L${f(x - r)} ${f(y)}L${f(x - k)} ${f(y - k)}z" fill="${fill}" opacity="${op}"/>`;
}

/** Palais Lumen: an art-deco hotel tower at night, brass lines, lit windows, crescent moon. */
export function palaisArt() {
  const r = rng(7);
  let stars = '';
  for (let i = 0; i < 46; i++) {
    const x = r() * 640, y = r() * 170, s = r();
    stars += s > 0.9 ? glint(x, y, 4 + r() * 3, '#fff2c0', 0.9) : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.6 + s * 1.1)}" fill="#d8e6ff" opacity="${f(0.35 + s * 0.5)}"/>`;
  }
  let rays = '';
  for (let i = 0; i < 15; i++) {
    const a = Math.PI + (i + 0.5) * (Math.PI / 15);
    rays += `<path d="M320 300L${f(320 + Math.cos(a - 0.05) * 520)} ${f(300 + Math.sin(a - 0.05) * 520)}L${f(320 + Math.cos(a + 0.05) * 520)} ${f(300 + Math.sin(a + 0.05) * 520)}z" fill="url(#pl-ray)"/>`;
  }
  // windows: tower body x 250..390, wings 150..250 and 390..490
  let win = '';
  const lit = (x: number, y: number, w: number, h: number) => {
    const on = r();
    const c = on > 0.55 ? '#ffcf7a' : on > 0.35 ? '#e0b25a' : '#243062';
    win += `<rect x="${f(x)}" y="${f(y)}" width="${w}" height="${h}" rx="1" fill="${c}" opacity="${on > 0.35 ? f(0.65 + on * 0.35) : 0.9}"/>`;
  };
  for (let row = 0; row < 9; row++) for (let col = 0; col < 6; col++) lit(262 + col * 21, 112 + row * 20, 9, 12);
  for (let row = 0; row < 6; row++) for (let col = 0; col < 4; col++) { lit(162 + col * 22, 182 + row * 18, 9, 10); lit(402 + col * 22, 182 + row * 18, 9, 10); }
  return `<svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="pl-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#090d1f"/><stop offset=".6" stop-color="#182042"/><stop offset="1" stop-color="#2b2350"/></linearGradient>
  <linearGradient id="pl-ray" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#e0b25a" stop-opacity=".32"/><stop offset="1" stop-color="#e0b25a" stop-opacity="0"/></linearGradient>
  <linearGradient id="pl-stone" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#141a36"/><stop offset=".5" stop-color="#1f2850"/><stop offset="1" stop-color="#11162e"/></linearGradient>
  <linearGradient id="pl-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a1226"/><stop offset="1" stop-color="#0a0a12"/></linearGradient>
  <radialGradient id="pl-moon" cx=".5" cy=".5" r=".5"><stop offset=".55" stop-color="#ffcf7a" stop-opacity=".45"/><stop offset="1" stop-color="#ffcf7a" stop-opacity="0"/></radialGradient>
</defs>
<rect width="640" height="360" fill="url(#pl-sky)"/>
${rays}
${stars}
<circle cx="540" cy="70" r="58" fill="url(#pl-moon)"/>
<circle cx="540" cy="70" r="26" fill="#ffcf7a"/><circle cx="551" cy="62" r="22" fill="#121836"/>
<g stroke="#e0b25a" stroke-width="2" stroke-linejoin="round">
  <path d="M300 104V64h40v40M310 64V40h20v24M318 40V16h4v24" fill="url(#pl-stone)"/>
  <path d="M250 300V104h140v196z" fill="url(#pl-stone)"/>
  <path d="M150 300V170h100v130zM390 300V170h100v130z" fill="url(#pl-stone)"/>
  <path d="M110 300V236h40v64zM490 300V236h40v64z" fill="url(#pl-stone)"/>
</g>
<g fill="none" stroke="#e0b25a" stroke-width="1.2" opacity=".7">
  <path d="M256 104v196M384 104v196M320 104v20M300 88h40M290 104l30-22 30 22"/>
  <path d="M150 178h100M390 178h100M150 296h340"/>
</g>
${win}
<path d="M292 300v-36a28 28 0 0 1 56 0v36z" fill="#ffcf7a" opacity=".9"/>
<path d="M298 300v-34a22 22 0 0 1 44 0v34z" fill="#fff2c0"/>
<path d="M270 262h100v8H270z" fill="#7e1f36" stroke="#e0b25a" stroke-width="1.5"/>
<rect y="300" width="640" height="60" fill="url(#pl-floor)"/>
<path d="M292 300h56l30 60H262z" fill="#ffcf7a" opacity=".12"/>
<path d="M0 300h640" stroke="#e0b25a" stroke-width="2"/>
<path d="M0 312h640M0 330h640" stroke="#e0b25a" stroke-width="1" opacity=".22"/>
</svg>`;
}

/** CS Gambler: a glowing orange case, skins in rarity colours fanning out behind it. */
export function csArt() {
  const r = rng(21);
  const rar = ['#4b69ff', '#8847ff', '#d32ce6', '#eb4b4b', '#ffd700'];
  let rays = '';
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    rays += `<path d="M320 200L${f(320 + Math.cos(a - 0.06) * 600)} ${f(200 + Math.sin(a - 0.06) * 600)}L${f(320 + Math.cos(a + 0.06) * 600)} ${f(200 + Math.sin(a + 0.06) * 600)}z" fill="#ff8a1f" opacity=".07"/>`;
  }
  // skin cards fanned behind the case
  let cards = '';
  const fan = [-52, -26, 0, 26, 52];
  fan.forEach((deg, i) => {
    const c = rar[i];
    cards += `<g transform="rotate(${deg} 320 330)"><rect x="286" y="70" width="68" height="120" rx="6" fill="#141920" stroke="${c}" stroke-width="2.5"/><rect x="286" y="174" width="68" height="16" rx="0" fill="${c}"/><path d="M296 128h30l6-6h12v8h-8l-4 6h-10l-4 12h-8l2-12h-16z" fill="${c}" opacity=".85"/></g>`;
  });
  let sparks = '';
  for (let i = 0; i < 22; i++) {
    const x = 60 + r() * 520, y = 30 + r() * 260;
    sparks += r() > 0.6 ? glint(x, y, 3 + r() * 5, r() > 0.5 ? '#ffd27a' : '#fff', 0.85) : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1 + r() * 1.6)}" fill="#ffb15e" opacity="${f(0.4 + r() * 0.5)}"/>`;
  }
  return `<svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
<defs>
  <radialGradient id="cs-bg" cx=".5" cy=".62" r=".7"><stop offset="0" stop-color="#3a1c05"/><stop offset=".55" stop-color="#151215"/><stop offset="1" stop-color="#0b0d11"/></radialGradient>
  <radialGradient id="cs-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff8a1f" stop-opacity=".75"/><stop offset="1" stop-color="#ff8a1f" stop-opacity="0"/></radialGradient>
  <linearGradient id="cs-top" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffc27a"/><stop offset="1" stop-color="#ff8a1f"/></linearGradient>
  <linearGradient id="cs-l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9a33"/><stop offset="1" stop-color="#c25a06"/></linearGradient>
  <linearGradient id="cs-r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d96a0a"/><stop offset="1" stop-color="#7a3a06"/></linearGradient>
</defs>
<rect width="640" height="360" fill="url(#cs-bg)"/>
${rays}
${cards}
<ellipse cx="320" cy="250" rx="190" ry="120" fill="url(#cs-glow)"/>
<ellipse cx="320" cy="322" rx="120" ry="16" fill="#000" opacity=".55"/>
<g stroke="#1a0d02" stroke-width="3" stroke-linejoin="round">
  <path d="M220 214l100-50 100 50-100 50z" fill="url(#cs-top)"/>
  <path d="M220 214v62l100 50v-62z" fill="url(#cs-l)"/>
  <path d="M420 214v62l-100 50v-62z" fill="url(#cs-r)"/>
</g>
<path d="M220 236l100 50 100-50" fill="none" stroke="#5a2a04" stroke-width="7"/>
<path d="M304 270l16 8 16-8v24l-16 8-16-8z" fill="#ffe2c2" stroke="#1a0d02" stroke-width="2.5"/>
<path d="M262 200l58-29 58 29" fill="none" stroke="#fff3e0" stroke-width="2" opacity=".55"/>
${sparks}
<path d="M0 340h640" stroke="#ff8a1f" stroke-width="1.5" opacity=".35"/>
</svg>`;
}

/** Teaser pictograms for the coming-soon cards, two-tone on violet. */
export function teaserArt(kind: string) {
  const bg = `<rect width="400" height="300" fill="#1d1033"/>`;
  const open = `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">${bg}`;
  if (kind === 'board') {
    const pts: [number, number][] = [[50, 240], [95, 250], [140, 236], [170, 200], [160, 160], [190, 126], [235, 120], [270, 146], [300, 180], [340, 176], [360, 136], [345, 96], [306, 74]];
    const cols = ['#ff3d9a', '#2fe6ff', '#dcff1f', '#ff3d9a', '#b38cff'];
    const path = 'M' + pts.map((p) => p.join(' ')).join('L');
    return `${open}<path d="${path}" fill="none" stroke="#2a0670" stroke-width="30" stroke-linejoin="round" stroke-linecap="round"/>
${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="12" fill="${cols[i % cols.length]}"/>`).join('')}
${glint(306, 74, 26, '#ffe14a')}
<g transform="rotate(-14 96 120)"><rect x="60" y="84" width="72" height="72" rx="14" fill="#f7f2ff"/><g fill="#0b0614"><circle cx="78" cy="102" r="7"/><circle cx="96" cy="120" r="7"/><circle cx="114" cy="138" r="7"/></g></g>
</svg>`;
  }
  if (kind === 'race') {
    let lines = '';
    for (let i = 0; i < 7; i++) lines += `<path d="M${20 + i * 8} ${70 + i * 26}h${70 + (i % 3) * 30}" stroke="#2fe6ff" stroke-width="4" stroke-linecap="round" opacity="${f(0.25 + (i % 3) * 0.2)}"/>`;
    return `${open}<path d="M170 60h60l170 240H0z" fill="#140a24"/>
<path d="M170 60L0 300M230 60l170 240" stroke="#ff3d9a" stroke-width="6"/>
<path d="M200 70v22M200 116v34M200 182v50M200 262v38" stroke="#dcff1f" stroke-width="6"/>
${lines}
<g transform="translate(150 182)"><path d="M10 50l14-34h52l14 34z" fill="#2fe6ff"/><path d="M30 18l8-16h24l8 16z" fill="#f7f2ff"/><rect x="0" y="44" width="24" height="22" rx="5" fill="#0b0614"/><rect x="76" y="44" width="24" height="22" rx="5" fill="#0b0614"/><path d="M-6 30h18M88 30h18" stroke="#ff3d9a" stroke-width="5" stroke-linecap="round"/></g>
</svg>`;
  }
  if (kind === 'quiz') {
    return `${open}<circle cx="200" cy="150" r="118" fill="none" stroke="#2a0670" stroke-width="22"/>
<path d="M200 32a118 118 0 0 1 102 59" fill="none" stroke="#dcff1f" stroke-width="22" stroke-linecap="round"/>
<ellipse cx="200" cy="212" rx="78" ry="20" fill="#0b0614"/>
<path d="M130 208v-22a70 46 0 0 1 140 0v22z" fill="#ff3d9a"/>
<ellipse cx="200" cy="186" rx="70" ry="18" fill="#ff7ac2"/>
<text x="200" y="150" text-anchor="middle" font-family="Archivo, Impact, sans-serif" font-style="italic" font-weight="900" font-size="120" fill="#f7f2ff">?</text>
${glint(318, 70, 16, '#dcff1f')}${glint(86, 92, 10, '#f7f2ff', 0.8)}
</svg>`;
  }
  // poker
  return `${open}<g transform="rotate(-16 180 170)"><rect x="104" y="56" width="120" height="168" rx="12" fill="#f7f2ff"/><path d="M164 112c-18 20-30 30-30 44 0 10 8 16 16 16 6 0 10-3 14-8-2 8-6 14-10 18h20c-4-4-8-10-10-18 4 5 8 8 14 8 8 0 16-6 16-16 0-14-12-24-30-44z" fill="#0b0614"/></g>
<g transform="rotate(12 230 170)"><rect x="170" y="60" width="120" height="168" rx="12" fill="#f7f2ff"/><path d="M230 112c-10-14-38-8-34 14 3 16 24 30 34 42 10-12 31-26 34-42 4-22-24-28-34-14z" fill="#ff2948"/></g>
<g>${[0, 1, 2, 3].map((i) => `<ellipse cx="318" cy="${246 - i * 14}" rx="44" ry="14" fill="${i % 2 ? '#e0b25a' : '#2a0670'}" stroke="#e0b25a" stroke-width="3"/>`).join('')}<ellipse cx="318" cy="204" rx="26" ry="7" fill="none" stroke="#fff2c0" stroke-width="2" stroke-dasharray="6 6"/></g>
${glint(80, 60, 14, '#e0b25a')}
</svg>`;
}

/** Unser Uno Spiel: a hand of our own cards fanned out on violet, a big "UNO!" sticker, glitter. */
export function unoArt() {
  const r = rng(33);
  const COL = ['#ff2e4d', '#ffcf1a', '#18c96a', '#2f7dff'];
  let rays = '';
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    rays += `<path d="M320 210L${f(320 + Math.cos(a - 0.05) * 620)} ${f(210 + Math.sin(a - 0.05) * 620)}L${f(320 + Math.cos(a + 0.05) * 620)} ${f(210 + Math.sin(a + 0.05) * 620)}z" fill="#ff3d9a" opacity=".07"/>`;
  }
  // one card: colour body, slashes, dark slanted slab with the face
  const card = (x: number, y: number, rot: number, col: string, face: string, faceCol = col) => `<g transform="rotate(${rot} ${x + 46} ${y + 140})">
<rect x="${x}" y="${y}" width="92" height="138" rx="10" fill="${col}" stroke="#fbf8ff" stroke-width="5"/>
<path d="M${x + 10} ${y + 120}l60-110M${x + 30} ${y + 132}l60-110" stroke="#fff" stroke-width="5" opacity=".14"/>
<path d="M${x + 22} ${y + 30}h56l-8 78H${x + 14}z" fill="#0b0614"/>
<path d="M${x + 24} ${y + 32}h56l-8 78H${x + 16}z" fill="none" stroke="#fff" stroke-width="2" opacity=".55" transform="translate(4 4)"/>
<text x="${x + 47}" y="${y + 92}" text-anchor="middle" font-family="Archivo, Impact, sans-serif" font-style="italic" font-weight="900" font-stretch="62%" font-size="58" fill="${faceCol}">${face}</text>
</g>`;
  const wild = (x: number, y: number, rot: number) => `<g transform="rotate(${rot} ${x + 46} ${y + 140})">
<rect x="${x}" y="${y}" width="92" height="138" rx="10" fill="#17102a" stroke="#fbf8ff" stroke-width="5"/>
<path d="M${x + 3} ${y + 3}h30L${x + 3} ${y + 33}z" fill="${COL[0]}"/><path d="M${x + 89} ${y + 3}v30L${x + 59} ${y + 3}z" fill="${COL[3]}"/>
<path d="M${x + 3} ${y + 135}v-30L${x + 33} ${y + 135}z" fill="${COL[1]}"/><path d="M${x + 89} ${y + 135}h-30L${x + 89} ${y + 105}z" fill="${COL[2]}"/>
<path d="M${x + 22} ${y + 30}h56l-8 78H${x + 14}z" fill="#0b0614"/>
<text x="${x + 47}" y="${y + 84}" text-anchor="middle" font-family="Archivo, Impact, sans-serif" font-style="italic" font-weight="900" font-size="44" fill="#fbf8ff">+4</text>
${COL.map((c, i) => `<path d="M${x + 22 + i * 13} ${y + 92}h10l-2 9h-10z" fill="${c}"/>`).join('')}
</g>`;
  let sparks = '';
  for (let i = 0; i < 26; i++) {
    const x = 30 + r() * 580, y = 20 + r() * 300;
    sparks += r() > 0.55 ? glint(x, y, 3 + r() * 6, r() > 0.5 ? '#dcff1f' : '#fff', 0.9) : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1 + r() * 1.5)}" fill="#ff7ac2" opacity="${f(0.4 + r() * 0.5)}"/>`;
  }
  return `<svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
<defs>
  <radialGradient id="un-bg" cx=".5" cy=".55" r=".75"><stop offset="0" stop-color="#5b2bd6"/><stop offset=".5" stop-color="#2a0670"/><stop offset="1" stop-color="#0b0614"/></radialGradient>
  <radialGradient id="un-felt" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#2a0d5c"/><stop offset="1" stop-color="#2a0d5c" stop-opacity="0"/></radialGradient>
</defs>
<rect width="640" height="360" fill="url(#un-bg)"/>
${rays}
<ellipse cx="320" cy="300" rx="300" ry="80" fill="url(#un-felt)"/>
<ellipse cx="320" cy="300" rx="280" ry="66" fill="none" stroke="#ff3d9a" stroke-width="2" opacity=".45"/>
${card(140, 120, -34, COL[3], '7')}
${card(196, 92, -17, COL[1], '2')}
${card(252, 80, 0, COL[2], '+2')}
${card(308, 92, 17, COL[0], '9')}
${wild(364, 120, 34)}
<g transform="rotate(-9 470 80)">
  <rect x="402" y="40" width="190" height="78" fill="#dcff1f"/>
  <rect x="402" y="40" width="190" height="78" fill="none" stroke="#0b0614" stroke-width="5"/>
  <text x="497" y="106" text-anchor="middle" font-family="Archivo, Impact, sans-serif" font-style="italic" font-weight="900" font-stretch="62%" font-size="76" fill="#ff3d9a" stroke="#0b0614" stroke-width="3" paint-order="stroke">UNO!</text>
</g>
${sparks}
<path d="M0 344h640" stroke="#2fe6ff" stroke-width="1.5" opacity=".35"/>
</svg>`;
}

/** Unser Party Spiel: a winding board of round spaces on violet, the star, dice block and our bean cast. */
export function partyArt() {
  const r = rng(71);
  const SP = ['#2b9dff', '#ff3d6e', '#ffd23f', '#3fdc7a', '#b46bff', '#2b9dff', '#ff8a2e', '#2b9dff', '#ff7ad9'];
  const pts: [number, number][] = [[40, 300], [96, 318], [154, 312], [204, 286], [236, 244], [282, 222], [336, 230], [388, 252], [440, 262], [492, 244], [530, 204], [540, 156], [512, 112], [462, 92], [408, 98]];
  const path = 'M' + pts.map((p) => p.join(' ')).join('L');
  const spaces = pts.map(([x, y], i) => `<g><ellipse cx="${x}" cy="${y + 5}" rx="22" ry="12" fill="#2a1258"/><ellipse cx="${x}" cy="${y}" rx="20" ry="11" fill="${SP[i % SP.length]}" stroke="#f7f2ff" stroke-width="2.5"/></g>`).join('');
  const bean = (x: number, y: number, s: number, col: string, feat: string, acc: string) => {
    const ears = feat === 'ears' ? `<path d="M-9 -38c-4-14 0-24 6-24 4 0 4 12 2 24M9 -38c4-14 0-24-6-24-4 0-4 12-2 24" fill="${col}" stroke="#1a0b33" stroke-width="3"/>` : '';
    const cap = feat === 'cap' ? `<path d="M-20 -30a20 16 0 0 1 40 0z" fill="${acc}" stroke="#1a0b33" stroke-width="3"/><path d="M14 -31h16" stroke="${acc}" stroke-width="6" stroke-linecap="round"/>` : '';
    const ant = feat === 'ant' ? `<path d="M0 -40v-14" stroke="#1a0b33" stroke-width="3"/><circle cx="0" cy="-56" r="5" fill="${acc}" stroke="#1a0b33" stroke-width="2.5"/>` : '';
    const horns = feat === 'horns' ? `<path d="M-14 -34l-6-14 12 8M14 -34l6-14-12 8" fill="${acc}" stroke="#1a0b33" stroke-width="2.5" stroke-linejoin="round"/>` : '';
    return `<g transform="translate(${x} ${y}) scale(${s})">${ears}<path d="M-22 0v-26a22 22 0 0 1 44 0v26c0 6-6 8-22 8s-22-2-22-8z" fill="${col}" stroke="#1a0b33" stroke-width="3.5"/>${cap}${ant}${horns}
<circle cx="-8" cy="-22" r="6.5" fill="#fff" stroke="#1a0b33" stroke-width="2"/><circle cx="8" cy="-22" r="6.5" fill="#fff" stroke="#1a0b33" stroke-width="2"/><circle cx="-7" cy="-21" r="3" fill="#1a0b33"/><circle cx="9" cy="-21" r="3" fill="#1a0b33"/>
<path d="M-6 -11q6 5 12 0" fill="none" stroke="#1a0b33" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="-15" cy="-13" rx="4" ry="2.5" fill="#ff7ac2" opacity=".7"/><ellipse cx="15" cy="-13" rx="4" ry="2.5" fill="#ff7ac2" opacity=".7"/></g>`;
  };
  const star = (x: number, y: number, R: number) => {
    let d = '';
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? R * 0.48 : R; d += `${i ? 'L' : 'M'}${f(x + Math.cos(a) * rr)} ${f(y + Math.sin(a) * rr)}`; }
    return `<path d="${d}z" fill="#ffe14a" stroke="#1a0b33" stroke-width="5" stroke-linejoin="round"/><circle cx="${f(x - R * 0.18)}" cy="${f(y)}" r="${f(R * 0.08)}" fill="#1a0b33"/><circle cx="${f(x + R * 0.18)}" cy="${f(y)}" r="${f(R * 0.08)}" fill="#1a0b33"/>`;
  };
  let sparks = '';
  for (let i = 0; i < 22; i++) {
    const x = 20 + r() * 600, y = 16 + r() * 200;
    sparks += r() > 0.5 ? glint(x, y, 3 + r() * 6, r() > 0.5 ? '#dcff1f' : '#fff', 0.85) : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1 + r() * 1.5)}" fill="#2fe6ff" opacity="${f(0.4 + r() * 0.5)}"/>`;
  }
  return `<svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
<defs><radialGradient id="pa-bg" cx=".55" cy=".45" r=".8"><stop offset="0" stop-color="#5b2bd6"/><stop offset=".55" stop-color="#2a0670"/><stop offset="1" stop-color="#0b0614"/></radialGradient></defs>
<rect width="640" height="360" fill="url(#pa-bg)"/>
<path d="M0 300C120 250 200 330 320 300S520 240 640 280V360H0z" fill="#3a1690" opacity=".7"/>
${sparks}
<path d="${path}" fill="none" stroke="#fff1d6" stroke-width="12" stroke-linejoin="round" stroke-linecap="round" opacity=".9"/>
${spaces}
<g transform="translate(408 70)"><ellipse cx="0" cy="34" rx="34" ry="9" fill="#ffe14a" opacity=".35"/>${star(0, -6, 36)}</g>
<g transform="rotate(-12 150 150)"><rect x="112" y="108" width="78" height="78" rx="14" fill="#ffe14a" stroke="#1a0b33" stroke-width="5"/><text x="151" y="166" text-anchor="middle" font-family="Archivo, Impact, sans-serif" font-style="italic" font-weight="900" font-size="54" fill="#1a0b33">?</text></g>
${bean(214, 280, 1.15, '#b8f02a', 'cap', '#ff3d9a')}
${bean(282, 214, 1, '#ff5fae', 'ears', '#ffe14a')}
${bean(345, 222, 0.95, '#35d4ff', 'ant', '#ff3d9a')}
${bean(494, 236, 1.05, '#ffc93c', 'horns', '#8a4bff')}
<path d="M0 344h640" stroke="#ff3d9a" stroke-width="1.5" opacity=".35"/>
</svg>`;
}
