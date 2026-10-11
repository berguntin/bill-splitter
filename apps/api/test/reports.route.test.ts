import { Writable } from 'node:stream';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import type { ReportNotifier } from '../src/reports/github';
import { createMemoryReportStore } from '../src/reports/store';
import { testDependencies } from './helpers';
import { context, jpegBase64 } from './reportFixtures';

function setUp(notify: ReportNotifier['notify'] = async () => null) {
  const reportStore = createMemoryReportStore({ ttlMs: 60_000 });
  const notifier = { notify: vi.fn(notify) };
  const app = createApp(
    loadConfig({ NODE_ENV: 'test' }),
    testDependencies({ reportStore, reportNotifier: notifier }),
  );
  return { app, reportStore, notifier };
}

const report = {
  description: '  The scan never finished  ',
  email: 'ana@example.com',
  topic: 'scan',
  context: { ...context, errorRef: 'WEB12345' },
  bill: { id: 'b', diners: [{ id: 'd1', name: 'Person 1' }] },
  attachments: [{ kind: 'receipt', mediaType: 'image/jpeg', data: jpegBase64 }],
};

describe('POST /api/reports', () => {
  it('stores the report, notifies the team and answers its id', async () => {
    const { app, reportStore, notifier } = setUp(
      async () => 'https://github.com/berguntin/bill-splitter/issues/1',
    );

    const response = await request(app).post('/api/reports').send(report);

    expect(response.status).toBe(201);
    expect(response.body.id).toMatch(/^[0-9A-Z]{8}$/);
    const [stored] = reportStore.all();
    expect(stored).toMatchObject({
      id: response.body.id,
      description: 'The scan never finished',
      email: 'ana@example.com',
      topic: 'scan',
      context: { errorRef: 'WEB12345' },
      bill: report.bill,
      attachments: [{ kind: 'receipt', mediaType: 'image/jpeg', bytes: 6 }],
      issueUrl: 'https://github.com/berguntin/bill-splitter/issues/1',
    });
    expect(notifier.notify).toHaveBeenCalledOnce();
  });

  it('serves attachments only with the link token from the issue', async () => {
    let link = '';
    const { app } = setUp(async (_report, links) => {
      link = new URL(links.attachment(0)).pathname + new URL(links.attachment(0)).search;
      return null;
    });
    await request(app).post('/api/reports').send(report);

    const photo = await request(app).get(link);
    expect(photo.status).toBe(200);
    expect(photo.headers['content-type']).toBe('image/jpeg');
    expect(photo.headers['cache-control']).toBe('private, no-store');
    expect(Buffer.from(photo.body).toString('base64')).toBe(jpegBase64);

    const wrongToken = await request(app).get(link.replace(/token=.*/, 'token=nope'));
    expect(wrongToken.status).toBe(404);
    const noToken = await request(app).get(link.split('?')[0]!);
    expect(noToken.status).toBe(404);
  });

  it('keeps attachment tokens out of the logs', async () => {
    const lines: string[] = [];
    const logger = pino(
      new Writable({
        write(chunk, _encoding, done) {
          lines.push(String(chunk));
          done();
        },
      }),
    );
    const app = createApp(loadConfig({ NODE_ENV: 'test' }), testDependencies({ logger }));

    await request(app).get('/api/reports/ABCD1234/attachments/0?token=super-secret');

    expect(lines.join('')).toContain('token=[redacted]');
    expect(lines.join('')).not.toContain('super-secret');
  });

  it('still accepts the report when the team cannot be notified', async () => {
    const { app, reportStore } = setUp(async () => null);

    const response = await request(app).post('/api/reports').send(report);

    expect(response.status).toBe(201);
    expect(reportStore.all()[0]!.issueUrl).toBeUndefined();
  });

  it('rejects reports without a description, with a bad email or too many photos', async () => {
    const { app, reportStore } = setUp();
    const attachment = report.attachments[0];

    for (const body of [
      { ...report, description: '   ' },
      { ...report, email: 'not-an-email' },
      { ...report, attachments: [attachment, attachment, attachment] },
      { ...report, attachments: [{ ...attachment, mediaType: 'image/gif' }] },
      { description: 'No context' },
    ]) {
      const response = await request(app).post('/api/reports').send(body);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_report');
    }
    expect(reportStore.all()).toHaveLength(0);
  });

  it('accepts a minimal report', async () => {
    const { app, reportStore } = setUp();

    const response = await request(app)
      .post('/api/reports')
      .send({ description: 'Something broke', context });

    expect(response.status).toBe(201);
    expect(reportStore.all()[0]).toMatchObject({ topic: 'other', attachments: [] });
  });
});
