import type { Cents } from './types';

/**
 * Splits an integer amount into parts proportional to `weights` using the
 * largest remainder method, so the parts always add up to `amount` exactly.
 *
 * Leftover cents go to the parts with the largest fractional remainder; ties
 * are broken by position, which keeps the result deterministic.
 *
 * @example allocate(1000, [1, 1, 1]) // => [334, 333, 333]
 */
export function allocate(amount: Cents, weights: readonly number[]): Cents[] {
  assertInteger(amount, 'amount');
  if (weights.length === 0) {
    throw new RangeError('allocate() needs at least one weight');
  }
  weights.forEach((weight, index) => {
    if (!Number.isFinite(weight) || weight < 0) {
      throw new RangeError(`Weight at index ${index} must be a non-negative number`);
    }
  });

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight === 0) {
    throw new RangeError('allocate() needs at least one positive weight');
  }

  // Work on the absolute value so negative amounts (discounts) round symmetrically.
  const sign = amount < 0 ? -1 : 1;
  const absolute = Math.abs(amount);

  const exact = weights.map((weight) => (absolute * weight) / totalWeight);
  const parts = exact.map(Math.floor);
  let leftover = absolute - parts.reduce((sum, part) => sum + part, 0);

  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .filter(({ index }) => (weights[index] ?? 0) > 0)
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (const { index } of byRemainder) {
    if (leftover === 0) break;
    parts[index] = (parts[index] ?? 0) + 1;
    leftover -= 1;
  }

  // `+ 0` normalizes -0 to 0.
  return parts.map((part) => sign * part + 0);
}

export function assertInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be an integer amount of cents, got ${value}`);
  }
}
