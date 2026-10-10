import { describe, expect, it } from 'vitest';
import { fractionLabel, initial } from '../format';

describe('fractionLabel', () => {
  it.each([
    [1, 1, ''],
    [2, 2, ''],
    [1, 2, '½'],
    [2, 4, '½'],
    [1, 3, '⅓'],
    [2, 3, '⅔'],
    [1, 4, '¼'],
    [2, 5, '2/5'],
    [1, 7, '1/7'],
  ])('labels %i of %i as %j', (weight, total, expected) => {
    expect(fractionLabel(weight, total)).toBe(expected);
  });
});

describe('initial', () => {
  it('uses the first letter, upper-cased', () => {
    expect(initial(' lucía')).toBe('L');
    expect(initial('')).toBe('?');
  });
});
