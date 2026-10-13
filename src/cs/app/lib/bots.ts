// The simulated players: names, avatars, their drops for the live feed.

import { esc, hash01 } from './util';

export interface Player { id: string; name: string; kind: 'you' | 'bot' | 'friend'; avatar: number }

export const BOT_NAMES = [
  'Vex', 'NoScopeNorbert', 'HeadshotHelga', 'Schnitzelkönig', 'xX_Nachteule_Xx', 'FrostByte', 'Kaffeekanne', 'Bratwurst99',
  'ZockerMaus', 'Sturmfrei', 'PixelPaul', 'MiaMaus', 'Toastbrot', 'Lümmel', 'KnifeKarl', 'Glühwurm', 'Rushkönigin', 'Kalle_B',
  'Smokey', 'Eisbär', 'Dönerdealer', 'Ottokar', 'LuckyLuise', 'AWPAnna', 'Funkenflug', 'Bananenboot',
];

export function botPlayer(i: number): Player {
  const name = BOT_NAMES[i % BOT_NAMES.length];
  return { id: `bot-${i}`, name, kind: 'bot', avatar: Math.floor(hash01(name) * 12) };
}
export function randomBots(n: number, exclude: string[] = []): Player[] {
  const pool = BOT_NAMES.map((_, i) => i).filter((i) => !exclude.includes(`bot-${i}`));
  const out: Player[] = [];
  while (out.length < n && pool.length) out.push(botPlayer(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]));
  return out;
}

const AV_COLORS = [['#ff8a1f', '#5a2306'], ['#3ad7ff', '#0b2f4a'], ['#ff4fd8', '#3a0a3a'], ['#b6ff2a', '#1d3a10'], ['#ffd14a', '#4a3505'], ['#8847ff', '#1e0c4a'], ['#eb4b4b', '#4a0c0c'], ['#4b69ff', '#0c164a'], ['#2affd0', '#0b3b3a'], ['#ff7a5a', '#4a1a0c'], ['#c0c8d4', '#2a2f38'], ['#e0b25a', '#3a2a0a']];
const AV_SHAPES = [
  '<circle cx="20" cy="15" r="7"/><path d="M6 36c2-8 8-12 14-12s12 4 14 12z"/>',
  '<rect x="11" y="8" width="18" height="15" rx="5"/><path d="M6 36c1-7 7-11 14-11s13 4 14 11z"/><rect x="13" y="13" width="14" height="4" rx="2" fill="rgba(0,0,0,.55)"/>',
  '<path d="M20 5l6 6-6 13-6-13z"/><path d="M6 36c2-8 8-11 14-11s12 3 14 11z"/>',
  '<circle cx="20" cy="15" r="8"/><path d="M12 9l-4-5M28 9l4-5" stroke-width="3" stroke="currentColor"/><path d="M6 36c2-8 8-11 14-11s12 3 14 11z"/>',
];
/** A small painted avatar (SVG). */
export function avatarSVG(i: number, name = ''): string {
  const [a, b] = AV_COLORS[((i % 12) + 12) % 12];
  const shape = AV_SHAPES[i % AV_SHAPES.length];
  return `<span class="avatar" style="--a:${a};--b:${b}" title="${esc(name)}"><svg viewBox="0 0 40 40" aria-hidden="true"><g fill="${a}" color="${a}">${shape}</g></svg></span>`;
}
