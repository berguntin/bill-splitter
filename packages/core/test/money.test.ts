import { describe, expect, it } from 'vitest';
import { formatMoney, parseMoney } from '../src';

describe('formatMoney', () => {
  it('formats cents with the locale conventions', () => {
    expect(formatMoney(480, 'EUR', 'es-ES')).toBe('4,80 €');
    expect(formatMoney(123450, 'USD', 'en-US')).toBe('$1,234.50');
  });
});

describe('parseMoney', () => {
  it.each([
    ['4,80', 480],
    ['4.80', 480],
    ['4,8', 480],
    ['12', 1200],
    ['1.234,50', 123450],
    ['1,234.50', 123450],
    ['1.234', 123400],
    ['4,80 €', 480],
    ['€ 0.99', 99],
    ['-2,50', -250],
    [',50', 50],
  ])('parses %j as %i cents', (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it.each(['', 'abc', '€', '-'])('returns null for %j', (input) => {
    expect(parseMoney(input)).toBeNull();
  });
});
