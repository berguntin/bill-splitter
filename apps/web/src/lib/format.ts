import { formatMoney, type Cents } from '@bill-splitter/core';

/** Formats cents in the viewer's locale, e.g. `€4.80` or `4,80 €`. */
export function money(amount: Cents, currency: string): string {
  return formatMoney(amount, currency);
}

const VULGAR_FRACTIONS: Record<string, string> = {
  '1/2': '½',
  '1/3': '⅓',
  '2/3': '⅔',
  '1/4': '¼',
  '3/4': '¾',
  '1/5': '⅕',
  '1/6': '⅙',
  '1/8': '⅛',
};

/**
 * Describes a share as a fraction, e.g. `½` for 1 of 2 or `2/5`.
 * Returns an empty string when the diner pays the whole item.
 */
export function fractionLabel(weight: number, totalWeight: number): string {
  if (weight >= totalWeight) return '';
  const divisor = gcd(weight, totalWeight);
  const key = `${weight / divisor}/${totalWeight / divisor}`;
  return VULGAR_FRACTIONS[key] ?? key;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}
