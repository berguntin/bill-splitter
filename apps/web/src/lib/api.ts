import type { ReceiptIssue, ScannedReceipt } from '@bill-splitter/core';

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
