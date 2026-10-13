/**
 * Weapon models: layered 2D parts (side view, muzzle to the right, y down).
 * 'skin' parts take the skin texture; metal/dark/rubber/wood stay plain.
 * depth = extrusion thickness, z = centre offset, both in model units, for the 3D viewer.
 */
import type { WeaponModel, WeaponPart } from '../contract';
import { shape, rect, ellipse, part, spline, Pt } from './geom';

type Builder = () => WeaponModel;

const ar7: Builder = () => {
  const parts: WeaponPart[] = [
    part('barrel', rect(395, 57, 112, 9, 2), 'metal', 7, 1),
    part('muzzle', shape([[486, 52], [516, 53], [516, 70], [486, 71]], 2), 'dark', 11, 2),
    part('gastube', rect(300, 45, 132, 10, 4), 'dark', 9, 2),
    part('frontsight', shape([[452, 66], [452, 44], [458, 33], [466, 33], [468, 44], [474, 66]], 2), 'metal', 6, 3),
    part('stock', shape([[160, 48, 6], [24, 64, 4], [10, 66, 3], [8, 122, 3], [22, 124, 4], [160, 92, 6]]), 'skin', 18, 3),
    part('buttplate', shape([[6, 62], [16, 61], [17, 126], [6, 127]], 2), 'rubber', 20, 4),
    part('grip', shape([[198, 86, 4], [228, 86, 4], [216, 142, 6], [196, 150, 6], [186, 143, 4]]), 'skin', 20, 2),
    part('guard', [shape([[222, 88], [276, 88], [272, 104, 6], [262, 113, 8], [228, 113, 6]]), shape([[230, 90], [264, 90], [262, 102, 5], [256, 107, 5], [232, 107, 4]])], 'metal', 8, 2),
    part('trigger', shape([[240, 90], [246, 90], [249, 99, 3], [244, 106, 2], [242, 100]]), 'dark', 4, 1),
    part('mag', spline([[278, 86], [312, 86], [324, 120], [342, 166], [306, 176], [292, 128]], 6), 'skin', 16, 2),
    part('receiver', shape([[150, 48, 3], [176, 44, 6], [300, 42, 3], [312, 46, 2], [312, 90, 3], [150, 92, 3]]), 'skin', 26, 4),
    part('handguard', shape([[300, 54, 3], [404, 54, 6], [408, 82, 6], [300, 84, 3]]), 'skin', 24, 3),
    part('topguard', shape([[300, 40, 3], [392, 41, 6], [396, 54], [300, 54]]), 'skin', 18, 4),
    part('rearsight', shape([[286, 44], [290, 34, 2], [310, 34, 2], [312, 44]]), 'metal', 8, 5),
    part('charging', rect(282, 66, 20, 7, 3), 'metal', 6, 6, 14),
    part('dustcover', rect(180, 50, 104, 3, 1), 'dark', 2, 5, 13),
  ];
  return { box: [520, 180], parts };
};

const p9: Builder = () => {
  const parts: WeaponPart[] = [
    part('barrel', rect(262, 46, 18, 12, 3), 'metal', 8, 1),
    part('frame', shape([[50, 66, 4], [262, 66, 4], [262, 88, 6], [236, 92, 4], [168, 92], [62, 90, 6]]), 'skin', 26, 2),
    part('grip', shape([[62, 82, 6], [140, 84, 4], [152, 178, 8], [104, 190, 10], [84, 180, 6]]), 'skin', 30, 3),
    part('guard', [shape([[136, 86], [206, 86], [204, 106, 8], [190, 122, 10], [150, 124, 6], [140, 110, 4]]), shape([[148, 92], [196, 92], [192, 106, 6], [184, 114, 6], [156, 116, 5]])], 'dark', 10, 2),
    part('trigger', shape([[168, 92], [176, 92], [178, 104, 3], [170, 112, 2], [168, 104]]), 'dark', 4, 1),
    part('slide', shape([[42, 30, 5], [270, 30, 5], [272, 68, 3], [46, 68, 3]]), 'skin', 26, 4),
    part('serration', rect(58, 36, 40, 26, 2), 'dark', 2, 5, 13),
    part('sight-r', rect(52, 23, 18, 8, 2), 'dark', 8, 5),
    part('sight-f', rect(250, 24, 10, 7, 2), 'dark', 6, 5),
    part('port', rect(150, 33, 50, 10, 3), 'metal', 2, 5, 13),
  ];
  return { box: [300, 200], parts };
};

const krallmesser: Builder = () => {
  const blade: Pt[] = spline([[150, 128], [178, 92], [212, 60], [250, 36], [286, 24], [258, 52], [232, 92], [208, 128], [182, 150]], 8);
  const parts: WeaponPart[] = [
    part('blade', blade, 'skin', 6, 3),
    part('handle', [spline([[40, 190], [80, 168], [130, 138], [178, 136], [190, 158], [150, 182], [100, 210], [62, 236], [36, 226]], 6), ellipse(52, 216, 13, 13)], 'rubber', 20, 2),
    part('ring', [ellipse(52, 216, 24, 24), ellipse(52, 216, 13, 13)], 'metal', 14, 3),
    part('bolster', shape([[146, 128, 3], [184, 128, 3], [196, 150, 3], [160, 160, 3]]), 'metal', 16, 4),
  ];
  return { box: [300, 260], parts };
};

const BUILDERS: Record<string, Builder> = { ar7, p9, krallmesser };

/** Fallback per kind while not every weapon has its own model. */
const KIND_FALLBACK: Record<string, string> = {
  pistol: 'p9', smg: 'ar7', rifle: 'ar7', sniper: 'ar7', shotgun: 'ar7', heavy: 'ar7', knife: 'krallmesser', gloves: 'krallmesser',
};

const cache = new Map<string, WeaponModel>();

export function buildModel(id: string, kind?: string): WeaponModel {
  let m = cache.get(id);
  if (m) return m;
  const b = BUILDERS[id] ?? BUILDERS[KIND_FALLBACK[kind ?? ''] ?? 'ar7'];
  m = b();
  m.parts.sort((a, b2) => a.layer - b2.layer);
  cache.set(id, m);
  return m;
}

export const MODEL_IDS = () => Object.keys(BUILDERS);
