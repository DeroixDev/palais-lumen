// One entry point for every painted decor kind, whichever floor it was painted for.

import type { DecorPlacement, RoomTheme } from '../../core/registry';
import type { BuiltDecor } from '../decor';
import { buildPainted } from './foyerProps';
import { buildPaintedVelvet } from './propsVelvet';
import { buildPaintedGarden } from './propsGarden';
import { buildPaintedClockwork } from './propsClockwork';
import { buildPaintedCrystal } from './propsCrystal';

const builders = [buildPainted, buildPaintedVelvet, buildPaintedGarden, buildPaintedClockwork, buildPaintedCrystal];

export function buildPaintedDecor(d: DecorPlacement, t: RoomTheme): BuiltDecor[] | null {
  for (const b of builders) {
    const r = b(d, t);
    if (r) return r;
  }
  return null;
}
