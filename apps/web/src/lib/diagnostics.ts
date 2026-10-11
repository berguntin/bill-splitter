/** Crockford base32, matching the API: no I, L, O or U, so ids are easy to read out. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const REQUEST_ID_HEADER = 'X-Request-Id';

/** 8-character id sent with every API call, so a failure can be found in the API's logs. */
export function newRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

/** `7F3K92QD` → `7F3K-92QD`, easier to read out or type in a bug report. */
export function formatReference(requestId: string): string {
  return /^[0-9A-Z]{8}$/.test(requestId)
    ? `${requestId.slice(0, 4)}-${requestId.slice(4)}`
    : requestId;
}

export interface RequestRecord {
  at: string;
  method: string;
  path: string;
  requestId: string;
  /** HTTP status, or null when no response arrived. */
  status: number | null;
  /** Why no response arrived. */
  failure?: 'network' | 'timeout' | 'aborted';
  durationMs: number;
}

const MAX_RECORDS = 30;
const records: RequestRecord[] = [];

/** Keeps the last API calls in memory, to attach to a bug report. */
export function recordRequest(record: RequestRecord): void {
  records.push(record);
  if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
}

export function recentRequests(): RequestRecord[] {
  return records.map((record) => ({ ...record }));
}

export function clearRecentRequests(): void {
  records.length = 0;
}
