import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import type { ReceiptParser } from '../src/receipts/parser';
import { testDependencies } from './helpers';

const config = loadConfig({ NODE_ENV: 'test', RECEIPT_RATE_LIMIT: '3' });
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);

function appWith(parse: ReceiptParser['parse']) {
  return createApp(config, testDependencies({ receiptParser: { parse } }));
}

describe('POST /api/receipts/parse', () => {
  it('returns the scanned receipt and its issues', async () => {
    const parse = vi.fn<ReceiptParser['parse']>(async () => ({
      status: 'ok',
      receipt: { merchant: null, currency: 'EUR', lines: [], total: null },
      issues: [{ type: 'no_lines' }],
      model: 'claude-haiku-5-5',
    }));

    const response = await request(appWith(parse))
      .post('/api/receipts/parse')
      .set('Content-Type', 'image/jpeg')
      .send(jpeg);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      model: 'claude-haiku-5-5',
      issues: [{ type: 'no_lines' }],
    });
    expect(parse).toHaveBeenCalledWith({ data: jpeg, mediaType: 'image/jpeg' });
  });

  it('answers 422 when the photo is not a receipt', async () => {
    const response = await request(appWith(async () => ({ status: 'not_a_receipt' })))
      .post('/api/receipts/parse')
      .set('Content-Type', 'image/png')
      .send(jpeg);

    expect(response.status).toBe(422);
    expect(response.body).toEqual({ error: 'not_a_receipt' });
  });

  it('rejects other content types and empty bodies', async () => {
    const app = appWith(async () => ({ status: 'unreadable' }));

    const wrongType = await request(app)
      .post('/api/receipts/parse')
      .set('Content-Type', 'application/pdf')
      .send(jpeg);
    expect(wrongType.status).toBe(415);

    const empty = await request(app).post('/api/receipts/parse').set('Content-Type', 'image/jpeg');
    expect(empty.status).toBe(400);
  });

  it('rejects images over the size limit', async () => {
    const response = await request(appWith(async () => ({ status: 'unreadable' })))
      .post('/api/receipts/parse')
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.alloc(7 * 1024 * 1024));

    expect(response.status).toBe(413);
    expect(response.body).toEqual({ error: 'payload_too_large' });
  });

  it('rate limits each client', async () => {
    const app = appWith(async () => ({ status: 'unreadable' }));
    const send = () =>
      request(app).post('/api/receipts/parse').set('Content-Type', 'image/jpeg').send(jpeg);

    for (let attempt = 0; attempt < 3; attempt++) expect((await send()).status).toBe(422);
    const limited = await send();
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: 'rate_limited' });
  });
});
