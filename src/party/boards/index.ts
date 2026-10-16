// Board registry. To add a board: create ./<id>/index.ts exporting a BoardDef and list it here.
// See ./README.md.

import neonstadt from './neonstadt';
import type { BoardDef } from './types';

export const BOARDS: BoardDef[] = [neonstadt];

export function getBoard(id: string): BoardDef {
  return BOARDS.find((b) => b.id === id) ?? BOARDS[0];
}
