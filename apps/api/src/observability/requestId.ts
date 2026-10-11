import { randomInt } from 'node:crypto';

/** Crockford base32: no I, L, O or U, so ids are easy to read out and type. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const INCOMING_PATTERN = /^[0-9A-Za-z-]{6,64}$/;

export const REQUEST_ID_HEADER = 'X-Request-Id';

/** 8 characters (40 bits): short enough to quote in a bug report, unique enough to find. */
export function newRequestId(): string {
  return Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
}

/** Reuses the id the web app sent, so both sides log the same one; otherwise makes one. */
export function requestIdFrom(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  return value && INCOMING_PATTERN.test(value) ? value : newRequestId();
}
