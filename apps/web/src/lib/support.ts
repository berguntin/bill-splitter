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
