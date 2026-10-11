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

export interface ErrorRecord {
  at: string;
  source: 'vue' | 'window' | 'promise';
  message: string;
  stack?: string;
}

export interface NavigationRecord {
  at: string;
  path: string;
}

export interface ScanRecord {
  at: string;
  ok: boolean;
  error?: string;
  requestId: string;
  durationMs: number;
  imageBytes?: number;
  lines?: number;
  issues?: string[];
}

const MAX_ERRORS = 20;
const MAX_NAVIGATION = 20;
const errors: ErrorRecord[] = [];
const navigation: NavigationRecord[] = [];
let lastScan: ScanRecord | null = null;
let lastScanPhoto: Blob | null = null;

function keepLast<T>(list: T[], item: T, max: number): void {
  list.push(item);
  if (list.length > max) list.splice(0, list.length - max);
}

export function recordError(source: ErrorRecord['source'], error: unknown): void {
  const record: ErrorRecord = {
    at: new Date().toISOString(),
    source,
    message: (error instanceof Error ? error.message : String(error)).slice(0, 500),
  };
  if (error instanceof Error && error.stack) record.stack = error.stack.slice(0, 4000);
  keepLast(errors, record, MAX_ERRORS);
}

export function recentErrors(): ErrorRecord[] {
  return errors.map((record) => ({ ...record }));
}

export function recordNavigation(path: string): void {
  keepLast(navigation, { at: new Date().toISOString(), path }, MAX_NAVIGATION);
}

export function recentNavigation(): NavigationRecord[] {
  return navigation.map((record) => ({ ...record }));
}

/**
 * The last scan and its photo, kept in memory only (never saved), so a user
 * reporting a misread receipt can choose to attach the photo.
 */
export function recordScan(record: ScanRecord, photo: Blob): void {
  lastScan = record;
  lastScanPhoto = photo;
}

export function lastScanRecord(): ScanRecord | null {
  return lastScan ? { ...lastScan } : null;
}

export function lastScanImage(): Blob | null {
  return lastScanPhoto;
}

export function clearDiagnostics(): void {
  records.length = 0;
  errors.length = 0;
  navigation.length = 0;
  lastScan = null;
  lastScanPhoto = null;
}
