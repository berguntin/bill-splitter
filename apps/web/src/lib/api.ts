import type { Bill, ReceiptIssue, ScannedReceipt } from '@bill-splitter/core';

const API_URL = import.meta.env.VITE_API_URL ?? '';

export type ScanError =
  | 'not_a_receipt'
  | 'unreadable'
  | 'unsupported_image'
  | 'too_large'
  | 'rate_limited'
  | 'offline'
  | 'server';

export type ScanResult =
  { ok: true; receipt: ScannedReceipt; issues: ReceiptIssue[] } | { ok: false; error: ScanError };

const ERROR_BY_STATUS: Record<number, ScanError> = {
  413: 'too_large',
  415: 'unsupported_image',
  429: 'rate_limited',
};

/** Sends a receipt photo to the API and returns the lines it read. */
export async function scanReceipt(image: Blob, signal?: AbortSignal): Promise<ScanResult> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/receipts/parse`, {
      method: 'POST',
      headers: { 'Content-Type': image.type || 'image/jpeg' },
      body: image,
      signal: signal ?? null,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return { ok: false, error: 'offline' };
  }

  if (response.ok) {
    const body = (await response.json()) as { receipt: ScannedReceipt; issues: ReceiptIssue[] };
    return { ok: true, receipt: body.receipt, issues: body.issues };
  }
  if (response.status === 422) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: body.error === 'not_a_receipt' ? 'not_a_receipt' : 'unreadable' };
  }
  return { ok: false, error: ERROR_BY_STATUS[response.status] ?? 'server' };
}

export interface SharedBill {
  id: string;
  bill: Bill;
  version: number;
  updatedAt: string;
  expiresAt: string;
}

export type ShareError =
  'not_found' | 'forbidden' | 'invalid' | 'rate_limited' | 'offline' | 'server';

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ShareError };

function shareError(status: number): ShareError {
  if (status === 404) return 'not_found';
  if (status === 401 || status === 403) return 'forbidden';
  if (status === 400) return 'invalid';
  if (status === 429) return 'rate_limited';
  return 'server';
}

async function sendJson<T>(path: string, init: RequestInit): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, init);
  } catch {
    return { ok: false, error: 'offline' };
  }
  if (!response.ok) return { ok: false, error: shareError(response.status) };
  return { ok: true, value: (await response.json()) as T };
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
  | { ok: false; error: ShareError };

/** Reads a shared bill; with the last ETag, an unchanged bill costs a 304 and no body. */
export async function fetchSharedBill(
  id: string,
  etag?: string | null,
): Promise<FetchSharedResult> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/bills/${encodeURIComponent(id)}`, {
      headers: etag ? { 'If-None-Match': etag } : {},
      cache: 'no-cache',
    });
  } catch {
    return { ok: false, error: 'offline' };
  }
  if (response.status === 304) return { ok: true, changed: false };
  if (!response.ok) return { ok: false, error: shareError(response.status) };
  return {
    ok: true,
    changed: true,
    value: (await response.json()) as SharedBill,
    etag: response.headers.get('ETag'),
  };
}
