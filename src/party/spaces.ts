// The space types: colour, dark side colour, name and icon (used by the 3D board and the legend).

import type { SpaceType } from './boards/types';

export interface SpaceLook { c: string; d: string; name: string; short: string; icon: string }
export const SP: Record<SpaceType, SpaceLook> = {
  P: { c: '#2b9dff', d: '#164f9e', name: 'Plus-Feld', short: 'Plus: +3', icon: 'plus' },
  M: { c: '#ff3d6e', d: '#9a1239', name: 'Minus-Feld', short: 'Minus: −3', icon: 'minus' },
  E: { c: '#ffd23f', d: '#a87a00', name: 'Ereignis', short: 'Ereignis', icon: 'bang' },
  L: { c: '#3fdc7a', d: '#137a41', name: 'Glück', short: 'Glücksrad', icon: 'q' },
  S: { c: '#b46bff', d: '#5e24b0', name: 'Laden', short: 'Laden', icon: 'bag' },
  D: { c: '#ff8a2e', d: '#a64d08', name: 'Duell', short: 'Duell', icon: 'vs' },
  B: { c: '#ff7ad9', d: '#a8338c', name: 'Kumpel', short: 'Kumpel', icon: 'buddy' },
  T: { c: '#2fe6c8', d: '#11806e', name: 'Bande', short: 'Bande', icon: 'bande' },
  R: { c: '#2a0a2e', d: '#ff3d9a', name: 'Rivale', short: 'Rivale', icon: 'rival' },
  X: { c: '#b8f02a', d: '#5b7a0a', name: 'Brett-Feld', short: 'Brett-Feld', icon: 'spin' },
  G: { c: '#ffffff', d: '#8f80c0', name: 'Start', short: 'Start', icon: 'start' },
};
export const LEGEND: SpaceType[] = ['P', 'M', 'E', 'L', 'S', 'D', 'B', 'T', 'R', 'X'];
