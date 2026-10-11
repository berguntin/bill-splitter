import type { Bill, ReceiptIssue, ScannedReceipt } from '@bill-splitter/core';
import { newRequestId, recordRequest, REQUEST_ID_HEADER, type RequestRecord } from './diagnostics';

/**
 * Normalizes the configured API origin: `api.example.com/` and
 * `https://api.example.com` both become `https://api.example.com`. Without a
 * scheme the browser would treat the value as a path on the web app itself.
 */
export function apiBaseUrl(raw: string | undefined): string {
  const value = (raw ?? '').trim().replace(/\/+$/, '');
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

const API_URL = apiBaseUrl(import.meta.env.VITE_API_URL);

/** Reading a receipt can take a model retry; past this the request is given up. */
export const SCAN_TIMEOUT_MS = 60_000;
export const REQUEST_TIMEOUT_MS = 15_000;

function timeoutSignal(ms: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function isTimeout(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'TimeoutError';
}

type Sent =
  | { ok: true; response: Response; requestId: string }
  | { ok: false; caught: unknown; requestId: string };

/**
 * Calls the API with a fresh request id (echoed by the API in its logs) and
 * records the outcome for bug reports. Never throws: a failed request is returned.
 */
async function send(
  path: string,
  init: RequestInit & { headers?: Record<string, string> },
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Sent> {
  const requestId = newRequestId();
  const started = performance.now();
  const record: RequestRecord = {
    at: new Date().toISOString(),
    method: init.method ?? 'GET',
    path,
    requestId,
    status: null,
    durationMs: 0,
  };
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { ...init.headers, [REQUEST_ID_HEADER]: requestId },
      signal: timeoutSignal(timeoutMs, signal),
    });
    record.status = response.status;
    return { ok: true, response, requestId };
  } catch (caught) {
    record.failure = isTimeout(caught) ? 'timeout' : signal?.aborted ? 'aborted' : 'network';
    return { ok: false, caught, requestId };
  } finally {
    record.durationMs = Math.round(performance.now() - started);
    recordRequest(record);
  }
}

/** Parses a JSON body, or returns null when the server answered something else (e.g. HTML). */
async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export type ScanError =
  | 'not_a_receipt'
  | 'unreadable'
  | 'unsupported_image'
  | 'too_large'
  | 'rate_limited'
  | 'offline'
  | 'timeout'
  | 'server';

/** A failed call, with the id to quote when reporting it. */
export interface Failure<E> {
  ok: false;
  error: E;
  requestId: string;
}

export type ScanResult =
  { ok: true; receipt: ScannedReceipt; issues: ReceiptIssue[] } | Failure<ScanError>;

const ERROR_BY_STATUS: Record<number, ScanError> = {
  413: 'too_large',
  415: 'unsupported_image',
  429: 'rate_limited',
};

/** Sends a receipt photo to the API and returns the lines it read. */
export async function scanReceipt(image: Blob, signal?: AbortSignal): Promise<ScanResult> {
  const sent = await send(
    '/api/receipts/parse',
    { method: 'POST', headers: { 'Content-Type': image.type || 'image/jpeg' }, body: image },
    SCAN_TIMEOUT_MS,
    signal,
  );
  const fail = (error: ScanError): Failure<ScanError> => ({
    ok: false,
    error,
    requestId: sent.requestId,
  });
  if (!sent.ok) {
    if (isTimeout(sent.caught)) return fail('timeout');
    if (signal?.aborted) throw sent.caught;
    return fail('offline');
  }

  const { response } = sent;
  if (response.ok) {
    const body = await readJson<{ receipt: ScannedReceipt; issues: ReceiptIssue[] }>(response);
    // A 200 without JSON means the request reached the wrong server (e.g. a bad VITE_API_URL).
    if (!body?.receipt) return fail('server');
    return { ok: true, receipt: body.receipt, issues: body.issues };
  }
  if (response.status === 422) {
    const body = (await readJson<{ error?: string }>(response)) ?? {};
    return fail(body.error === 'not_a_receipt' ? 'not_a_receipt' : 'unreadable');
  }
  return fail(ERROR_BY_STATUS[response.status] ?? 'server');
}

export interface SharedBill {
  id: string;
  bill: Bill;
  version: number;
  updatedAt: string;
  expiresAt: string;
}

export type ShareError =
  'not_found' | 'forbidden' | 'invalid' | 'rate_limited' | 'offline' | 'timeout' | 'server';

export type ApiResult<T> = { ok: true; value: T } | Failure<ShareError>;

function shareError(status: number): ShareError {
  if (status === 404) return 'not_found';
  if (status === 401 || status === 403) return 'forbidden';
  if (status === 400) return 'invalid';
  if (status === 429) return 'rate_limited';
  return 'server';
}

function networkError(caught: unknown): ShareError {
  return isTimeout(caught) ? 'timeout' : 'offline';
}

async function sendJson<T>(
  path: string,
  init: RequestInit & { headers: Record<string, string> },
): Promise<ApiResult<T>> {
  const sent = await send(path, init, REQUEST_TIMEOUT_MS);
  const { requestId } = sent;
  if (!sent.ok) return { ok: false, error: networkError(sent.caught), requestId };
  if (!sent.response.ok) return { ok: false, error: shareError(sent.response.status), requestId };
  const value = await readJson<T>(sent.response);
  return value === null ? { ok: false, error: 'server', requestId } : { ok: true, value };
}

/** Publishes a bill so others can follow it; keep the returned token to update it. */
export function createSharedBill(
  bill: Bill,
): Promise<ApiResult<SharedBill & { ownerToken: string }>> {
  return sendJson('/api/bills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bill }),
  });
}

export function updateSharedBill(
  id: string,
  ownerToken: string,
  bill: Bill,
): Promise<ApiResult<SharedBill>> {
  return sendJson(`/api/bills/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ bill }),
  });
}

export type FetchSharedResult =
  | { ok: true; changed: true; value: SharedBill; etag: string | null }
  | { ok: true; changed: false }
  | Failure<ShareError>;

/** Reads a shared bill; with the last ETag, an unchanged bill costs a 304 and no body. */
export async function fetchSharedBill(
  id: string,
  etag?: string | null,
): Promise<FetchSharedResult> {
  const sent = await send(
    `/api/bills/${encodeURIComponent(id)}`,
    { headers: etag ? { 'If-None-Match': etag } : {}, cache: 'no-cache' },
    REQUEST_TIMEOUT_MS,
  );
  const { requestId } = sent;
  if (!sent.ok) return { ok: false, error: networkError(sent.caught), requestId };
  const { response } = sent;
  if (response.status === 304) return { ok: true, changed: false };
  if (!response.ok) return { ok: false, error: shareError(response.status), requestId };
  const value = await readJson<SharedBill>(response);
  if (!value?.bill) return { ok: false, error: 'server', requestId };
  return { ok: true, changed: true, value, etag: response.headers.get('ETag') };
}
