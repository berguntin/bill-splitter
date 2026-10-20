import { allocate, type Cents } from '@bill-splitter/core';

/**
 * Link to the page where people can support the app (Ko-fi). Only `https`
 * URLs are accepted, so a typo in the build variable hides the button
 * instead of linking somewhere unexpected.
 */
export function supportUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export const SUPPORT_URL = supportUrl(import.meta.env.VITE_KOFI_URL);

/** The author's profiles, linked from the credits in the home footer. */
export const AUTHOR_URL = 'https://github.com/berguntin';
export const HIRE_URL = 'https://www.linkedin.com/in/berguntin/';

/** Suggested donation, a coffee, in minor units of the bill's currency. */
export const COFFEE: Cents = 300;

/**
 * What each person would chip in if the table shared one coffee. `share` is
 * the largest part, so "about {share} each" never undersells it.
 */
export function coffeeSplit(people: number): { amount: Cents; share: Cents; exact: boolean } {
  const parts = allocate(
    COFFEE,
    Array.from({ length: Math.max(people, 1) }, () => 1),
  );
  const share = Math.max(...parts);
  return { amount: COFFEE, share, exact: parts.every((part) => part === share) };
}
