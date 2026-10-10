import type { Cents } from './types';

/** Formats cents for display, e.g. `formatMoney(480, 'EUR', 'es-ES')` => `4,80 €`. */
export function formatMoney(amount: Cents, currency: string, locale?: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount / 100);
}

/**
 * Parses a user-typed or OCR-read amount into cents. Accepts both decimal
 * separators (`4,80`, `4.80`), thousands separators (`1.234,50`, `1,234.50`)
 * and a currency symbol. Returns `null` when the input is not a number.
 */
export function parseMoney(input: string): Cents | null {
  const cleaned = input.replace(/[^\d.,-]/g, '');
  if (!/\d/.test(cleaned)) return null;

  // The last separator followed by one or two digits is the decimal separator.
  const match = /^(-?)([\d.,]*?)(?:[.,](\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;

  const [, sign, whole = '', fraction = ''] = match;
  const integerPart = whole.replace(/[.,]/g, '');
  if (integerPart === '' && fraction === '') return null;

  const cents = Number(integerPart || '0') * 100 + Number(fraction.padEnd(2, '0'));
  return sign === '-' ? -cents : cents;
}
