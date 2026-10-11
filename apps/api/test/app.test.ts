import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { testDependencies } from './helpers';

const app = createApp(loadConfig({ NODE_ENV: 'test' }), testDependencies());

describe('API', () => {
  it('reports health', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
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
