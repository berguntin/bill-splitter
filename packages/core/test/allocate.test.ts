import { describe, expect, it } from 'vitest';
import { allocate } from '../src';

describe('allocate', () => {
  it('splits evenly when possible', () => {
    expect(allocate(900, [1, 1, 1])).toEqual([300, 300, 300]);
  });

  it('hands leftover cents to the earliest parts on ties', () => {
    expect(allocate(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(allocate(1001, [1, 1, 1])).toEqual([334, 334, 333]);
  });

  it('respects weights', () => {
    expect(allocate(900, [2, 1])).toEqual([600, 300]);
    expect(allocate(100, [1, 2])).toEqual([33, 67]);
  });

  it('gives leftovers to the largest remainder, not just the first part', () => {
    // Exact parts: 14.28, 28.57, 57.14 -> remainders favor the second part.
    expect(allocate(100, [1, 2, 4])).toEqual([14, 29, 57]);
  });

  it('never gives anything to zero-weight parts', () => {
    expect(allocate(5, [0, 1, 1])).toEqual([0, 3, 2]);
  });

  it('handles negative amounts symmetrically', () => {
    expect(allocate(-1000, [1, 1, 1])).toEqual([-334, -333, -333]);
  });

  it('returns zeros for a zero amount', () => {
    expect(allocate(0, [1, 1])).toEqual([0, 0]);
  });

  it('rejects invalid input', () => {
    expect(() => allocate(10.5, [1])).toThrow(RangeError);
    expect(() => allocate(10, [])).toThrow(RangeError);
    expect(() => allocate(10, [0, 0])).toThrow(RangeError);
    expect(() => allocate(10, [-1, 2])).toThrow(RangeError);
    expect(() => allocate(10, [Number.NaN])).toThrow(RangeError);
  });

  it('always adds up to the amount', () => {
    for (let amount = -500; amount <= 500; amount += 7) {
      for (const weights of [[1], [1, 1], [1, 2, 3], [3, 0, 5, 7], [0.5, 1.5]]) {
        const parts = allocate(amount, weights);
        expect(parts.reduce((sum, part) => sum + part, 0)).toBe(amount);
      }
    }
  });
});
