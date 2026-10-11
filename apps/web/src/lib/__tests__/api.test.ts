import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiBaseUrl, fetchSharedBill, scanReceipt } from '../api';

function respond(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

const image = new Blob(['x'], { type: 'image/jpeg' });

describe('scanReceipt', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the image and returns the receipt', async () => {
    const receipt = { merchant: null, currency: 'EUR', lines: [], total: null };
    respond(200, { receipt, issues: [], model: 'claude-haiku-5-5' });

    expect(await scanReceipt(image)).toEqual({ ok: true, receipt, issues: [] });
    expect(fetch).toHaveBeenCalledWith(
      '/api/receipts/parse',
      expect.objectContaining({ method: 'POST', headers: { 'Content-Type': 'image/jpeg' } }),
    );
  });

  it.each([
    [422, { error: 'not_a_receipt' }, 'not_a_receipt'],
    [422, { error: 'unreadable' }, 'unreadable'],
    [413, { error: 'image_too_large' }, 'too_large'],
    [415, {}, 'unsupported_image'],
    [429, { error: 'rate_limited' }, 'rate_limited'],
    [502, { error: 'upstream_error' }, 'server'],
  ])('maps HTTP %i to a %s error', async (status, body, error) => {
    respond(status, body);
    expect(await scanReceipt(image)).toEqual({ ok: false, error });
  });

  it('reports network failures as offline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    expect(await scanReceipt(image)).toEqual({ ok: false, error: 'offline' });
  });

  it('reports a timeout when the request takes too long', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('The operation timed out.', 'TimeoutError');
      }),
    );
    expect(await scanReceipt(image)).toEqual({ ok: false, error: 'timeout' });
  });

  it('treats a 200 that is not JSON as a server error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response('<!doctype html><title>Bill Splitter</title>', { status: 200 }),
      ),
    );
    expect(await scanReceipt(image)).toEqual({ ok: false, error: 'server' });
    expect(await fetchSharedBill('Abc1234567')).toEqual({ ok: false, error: 'server' });
  });
});

describe('apiBaseUrl', () => {
  it.each([
    [undefined, ''],
    ['', ''],
    ['  ', ''],
    ['https://api.example.com', 'https://api.example.com'],
    ['https://api.example.com/', 'https://api.example.com'],
    ['api.example.com', 'https://api.example.com'],
    [' api.example.com/ ', 'https://api.example.com'],
    ['http://localhost:3000', 'http://localhost:3000'],
  ])('normalizes %j to %j', (raw, expected) => {
    expect(apiBaseUrl(raw)).toBe(expected);
  });
});
