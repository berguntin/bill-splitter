import { afterAll, describe, expect, it } from 'vitest';
import { connectMongo } from '../src/db/mongo';
import { createLogger } from '../src/observability/logger';
import { createMongoReportStore } from '../src/reports/mongo';
import { createMemoryReportStore, type ReportStore } from '../src/reports/store';
import { context } from './reportFixtures';

const photo = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

function contract(name: string, makeStore: () => Promise<ReportStore>) {
  describe(`${name} report store`, () => {
    it('stores a report and summarizes its attachments', async () => {
      const report = await (
        await makeStore()
      ).create({
        description: 'Broken',
        topic: 'other',
        context,
        attachments: [{ kind: 'screenshot', mediaType: 'image/png', data: photo }],
      });

      expect(report.id).toMatch(/^[0-9A-Z]{8}$/);
      expect(report.attachments).toEqual([
        { kind: 'screenshot', mediaType: 'image/png', bytes: 7 },
      ]);
      expect(report.accessToken.length).toBeGreaterThanOrEqual(32);
      expect(report.expiresAt.getTime()).toBeGreaterThan(report.createdAt.getTime());
    });

    it('returns an attachment only with the right token', async () => {
      const store = await makeStore();
      const report = await store.create({
        description: 'Broken',
        topic: 'scan',
        context,
        attachments: [{ kind: 'receipt', mediaType: 'image/jpeg', data: photo }],
      });

      const attachment = await store.attachment(report.id, 0, report.accessToken);
      expect(attachment?.mediaType).toBe('image/jpeg');
      expect(attachment?.data.equals(photo)).toBe(true);
      expect(await store.attachment(report.id, 0, 'wrong')).toBeNull();
      expect(await store.attachment(report.id, 1, report.accessToken)).toBeNull();
      expect(await store.attachment('UNKNOWN1', 0, report.accessToken)).toBeNull();
    });

    it('records the issue a report was sent to', async () => {
      const store = await makeStore();
      const report = await store.create({
        description: 'x',
        topic: 'other',
        context,
        attachments: [],
      });
      await expect(
        store.setIssueUrl(report.id, 'https://github.com/x/y/issues/1'),
      ).resolves.toBeUndefined();
    });
  });
}

contract('memory', async () => createMemoryReportStore({ ttlMs: 60_000 }));

const mongoUri = process.env.TEST_MONGODB_URI;
if (mongoUri) {
  const connection = connectMongo({
    uri: mongoUri,
    database: `test_reports_${Date.now()}`,
    logger: createLogger({ NODE_ENV: 'test' }),
  });
  afterAll(async () => {
    const { db, close } = await connection;
    await db.dropDatabase();
    await close();
  });
  contract('mongodb', async () =>
    createMongoReportStore({ db: (await connection).db, ttlMs: 60_000 }),
  );
} else {
  describe.skip('mongodb report store (set TEST_MONGODB_URI to run)', () => {
    it('is skipped', () => {});
  });
}
