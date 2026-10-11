import Anthropic from '@anthropic-ai/sdk';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createMemoryBillStore } from '../src/bills/store';
import { loadConfig } from '../src/config';
import { testDependencies } from './helpers';

const app = createApp(loadConfig({ NODE_ENV: 'test' }), testDependencies());

describe('API', () => {
  it('reports health', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('reports the database as unreachable with a 503', async () => {
    const billStore = createMemoryBillStore({ ttlMs: 60_000 });
    billStore.ping = async () => {
      throw new Error('connection refused');
    };
    const response = await request(
      createApp(loadConfig({ NODE_ENV: 'test' }), testDependencies({ billStore })),
    ).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'unavailable', database: 'unreachable' });
  });

  it('tags every response with a request id, reusing a valid one from the client', async () => {
    const generated = await request(app).get('/api/health');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9A-Z]{8}$/);

    const reused = await request(app).get('/api/health').set('X-Request-Id', 'WEB12345');
    expect(reused.headers['x-request-id']).toBe('WEB12345');

    const rejected = await request(app).get('/api/health').set('X-Request-Id', '<script>');
    expect(rejected.headers['x-request-id']).toMatch(/^[0-9A-Z]{8}$/);
  });

  it('lets browsers read the request id across origins', async () => {
    const response = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(response.headers['access-control-expose-headers']).toBe('X-Request-Id');
  });

  it('returns the request id with unexpected errors so users can quote it', async () => {
    const failing = createApp(
      loadConfig({ NODE_ENV: 'test' }),
      testDependencies({
        receiptParser: {
          parse: async () => {
            throw new Error('boom');
          },
        },
      }),
    );
    const response = await request(failing)
      .post('/api/receipts/parse')
      .set('Content-Type', 'image/jpeg')
      .set('X-Request-Id', 'WEB12345')
      .send(Buffer.from('jpeg'));

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'internal_error', requestId: 'WEB12345' });
  });

  it('blames Claude, not the client, when the Claude API rejects our key', async () => {
    const failing = createApp(
      loadConfig({ NODE_ENV: 'test' }),
      testDependencies({
        receiptParser: {
          parse: async () => {
            throw new Anthropic.AuthenticationError(401, {}, 'invalid x-api-key', new Headers());
          },
        },
      }),
    );
    const response = await request(failing)
      .post('/api/receipts/parse')
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from('jpeg'));

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({ error: 'upstream_error' });
  });

  it('answers unknown routes with a JSON 404', async () => {
    const response = await request(app).get('/api/nope');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });
});

describe('loadConfig', () => {
  it('parses a comma-separated origin list', () => {
    const config = loadConfig({ CORS_ORIGINS: 'https://a.test, https://b.test' });
    expect(config.CORS_ORIGINS).toEqual(['https://a.test', 'https://b.test']);
  });

  it('fails fast on invalid values', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/Invalid configuration/);
  });

  it('uses the Claude parser when an API key is set, and the fake one otherwise', () => {
    expect(loadConfig({ ANTHROPIC_API_KEY: 'sk-test' }).RECEIPT_PARSER).toBe('claude');
    expect(loadConfig({ ANTHROPIC_API_KEY: ' ' }).RECEIPT_PARSER).toBe('fake');
  });

  it('takes the release from Railway unless set explicitly', () => {
    expect(loadConfig({}).RELEASE).toBeUndefined();
    expect(loadConfig({ RAILWAY_GIT_COMMIT_SHA: 'abc123' }).RELEASE).toBe('abc123');
    expect(loadConfig({ RAILWAY_GIT_COMMIT_SHA: 'abc123', RELEASE: 'v1' }).RELEASE).toBe('v1');
  });

  it('treats an empty LOG_LEVEL as unset', () => {
    expect(loadConfig({ LOG_LEVEL: '' }).LOG_LEVEL).toBeUndefined();
    expect(loadConfig({ LOG_LEVEL: 'debug' }).LOG_LEVEL).toBe('debug');
  });

  it('uses its own database name unless told otherwise', () => {
    expect(loadConfig({}).MONGODB_DATABASE).toBe('bill-splitter');
    expect(loadConfig({ MONGODB_DATABASE: 'staging' }).MONGODB_DATABASE).toBe('staging');
  });

  it('refuses to run in production without a real receipt parser or database', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => loadConfig({ NODE_ENV: 'production', ANTHROPIC_API_KEY: 'sk-test' })).toThrow(
      /MONGODB_URI/,
    );
    expect(() => loadConfig({ RECEIPT_PARSER: 'claude' })).toThrow(/ANTHROPIC_API_KEY/);
  });
});
