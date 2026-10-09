// Großes Rad rules as pure functions (no Pixi), so scripts/rtp-wheel.mjs can check them.
//
// 48 equal segments. A bet on a field ×m wins m:1 (stake back plus m × stake) when the wheel
// stops on that field. The 3 Bonus segments start the small wheel: 10 equal segments, two per
// field; the field it stops on pays its bonus rate (also "to 1"), every other bet loses.
// Counts and bonus rates are chosen so every field returns 95–95.5 % (see FIELD_RTP).

export type Field = 'x1' | 'x2' | 'x5' | 'x10' | 'x20';
export type Segment = Field | 'bonus';

export const FIELDS: Field[] = ['x1', 'x2', 'x5', 'x10', 'x20'];
export const PAY: Record<Field, number> = { x1: 1, x2: 2, x5: 5, x10: 10, x20: 20 };
export const COUNT: Record<Segment, number> = { x1: 22, x2: 13, x5: 6, x10: 3, x20: 1, bonus: 3 };
export const BONUS_PAY: Record<Field, number> = { x1: 2, x2: 10, x5: 15, x10: 20, x20: 40 };
/** The small wheel: two segments per field. */
export const BONUS_WHEEL: Field[] = ['x1', 'x10', 'x2', 'x20', 'x5', 'x1', 'x10', 'x2', 'x20', 'x5'];

/** Spreads the segments round the wheel so equal fields sit far apart (rarest placed first). */
function layout(): Segment[] {
  const n = Object.values(COUNT).reduce((a, b) => a + b, 0);
  const slots: (Segment | null)[] = Array(n).fill(null);
  const order: Segment[] = ['x20', 'bonus', 'x10', 'x5', 'x2'];
  let phase = 0;
  for (const s of order) {
    const k = COUNT[s];
    for (let i = 0; i < k; i++) {
      let at = Math.round(phase + (i * n) / k) % n;
      // Nearest free slot, preferring ones without the same neighbour.
      for (let d = 0; d < n; d++) {
        const cand = [(at + d) % n, (at - d + n) % n];
        const hit = cand.find((c) => slots[c] === null && slots[(c + 1) % n] !== s && slots[(c + n - 1) % n] !== s) ?? cand.find((c) => slots[c] === null);
        if (hit !== undefined) {
          at = hit;
          break;
        }
      }
      slots[at] = s;
    }
    phase += n / k / 2 + 1;
  }
  return slots.map((s) => s ?? 'x1');
}

export const WHEEL: Segment[] = layout();
export const SEGMENTS = WHEEL.length;

/** Exact long-run return of a bet on one field. */
export function fieldRtp(f: Field) {
  const n = SEGMENTS;
  const main = (COUNT[f] / n) * (PAY[f] + 1);
  const share = BONUS_WHEEL.filter((x) => x === f).length / BONUS_WHEEL.length;
  const bonus = (COUNT.bonus / n) * share * (BONUS_PAY[f] + 1);
  return main + bonus;
}

export const FIELD_RTP: Record<Field, number> = Object.fromEntries(FIELDS.map((f) => [f, fieldRtp(f)])) as Record<Field, number>;
export const MIN_RTP = Math.min(...FIELDS.map((f) => FIELD_RTP[f]));

export interface SpinResult {
  /** Index of the main wheel segment under the pointer. */
  index: number;
  segment: Segment;
  /** Index on the small wheel when the main wheel hit Bonus. */
  bonusIndex: number;
  /** The field that pays this spin (null when none). */
  field: Field | null;
  /** "To 1" rate the paying field gets. */
  rate: number;
}

export function spin(rand = Math.random): SpinResult {
  const index = Math.floor(rand() * SEGMENTS);
  const segment = WHEEL[index];
  if (segment !== 'bonus') return { index, segment, bonusIndex: -1, field: segment, rate: PAY[segment] };
  const bonusIndex = Math.floor(rand() * BONUS_WHEEL.length);
  const field = BONUS_WHEEL[bonusIndex];
  return { index, segment, bonusIndex, field, rate: BONUS_PAY[field] };
}

/** Total paid back for a set of bets and a spin result. */
export function payout(bets: Partial<Record<Field, number>>, r: SpinResult) {
  if (!r.field) return 0;
  const stake = bets[r.field] ?? 0;
  return stake * (r.rate + 1);
}
