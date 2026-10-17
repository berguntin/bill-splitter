import type { Bill } from '@bill-splitter/core';
import { afterAll, describe, expect, it } from 'vitest';
import { createMongoBillStore } from '../src/bills/mongo';
import { BILL_ID_PATTERN, createMemoryBillStore, type BillStore } from '../src/bills/store';
import { connectMongo } from '../src/db/mongo';
import { createLogger } from '../src/observability/logger';

const bill: Bill = {
  id: 'local-id',
  currency: 'EUR',
  diners: [{ id: 'ana', name: 'Ana', color: 'coral' }],
  items: [
    {
      id: 'pizza',
      name: 'Pizza',
      quantity: 1,
      unitPrice: 1200,
      total: 1200,
      assignment: { mode: 'everyone' },
    },
  ],
  adjustments: [],
};

/** The same behavior is required from every store implementation. */
function contract(name: string, makeStore: () => Promise<BillStore>) {
  describe(`${name} bill store`, () => {
    const store = makeStore;

    it('answers a ping when it is reachable', async () => {
      await expect((await store()).ping()).resolves.toBeUndefined();
    });

    it('creates a bill with a short id and an owner token', async () => {
      const { record, ownerToken } = await (await store()).create(bill);

      expect(record.id).toMatch(BILL_ID_PATTERN);
      expect(record.bill).toEqual({ ...bill, id: record.id });
      expect(record.version).toBe(1);
      expect(record.expiresAt.getTime()).toBeGreaterThan(record.updatedAt.getTime());
      expect(ownerToken.length).toBeGreaterThanOrEqual(40);
    });

    it('reads a bill back, and nothing for unknown ids', async () => {
      const bills = await store();
      const { record } = await bills.create(bill);

      expect(await bills.get(record.id)).toEqual(record);
      expect(await bills.get('Unknown123')).toBeNull();
    });

    it('updates a bill only with its owner token', async () => {
      const bills = await store();
      const { record, ownerToken } = await bills.create(bill);
      const changed: Bill = { ...bill, merchant: 'Casa Lola' };

      expect(await bills.update(record.id, 'not-the-token', changed)).toBe('forbidden');
      expect(await bills.update('Unknown123', ownerToken, changed)).toBe('not_found');

      const updated = await bills.update(record.id, ownerToken, changed);
      expect(updated).toMatchObject({ version: 2, bill: { merchant: 'Casa Lola', id: record.id } });
      expect((await bills.get(record.id))?.bill.merchant).toBe('Casa Lola');
    });

    it('lets anyone set groups, which owner updates then keep', async () => {
      const bills = await store();
      const table: Bill = {
        ...bill,
        diners: [...bill.diners, { id: 'ben', name: 'Ben', color: 'teal' }],
      };
      const { record, ownerToken } = await bills.create(table);

      const grouped = await bills.setGroups(record.id, [{ id: 'g', dinerIds: ['ana', 'ben'] }]);
      expect(grouped).toMatchObject({ version: 2, bill: { groups: [{ id: 'g' }] } });
      expect(await bills.setGroups('missing123', [])).toBeNull();

      const updated = await bills.update(record.id, ownerToken, {
        ...table,
        merchant: 'Casa Lola',
        groups: [],
      });
      expect(updated).toMatchObject({
        version: 3,
        bill: { merchant: 'Casa Lola', groups: [{ id: 'g', dinerIds: ['ana', 'ben'] }] },
      });

      // Ben leaves and the merchant is cleared: the group goes, and so does the field.
      const removed = await bills.update(record.id, ownerToken, { ...table, diners: bill.diners });
      expect(removed).toMatchObject({ bill: { groups: [] } });
      expect((removed as { bill: Bill }).bill).not.toHaveProperty('merchant');
    });

    it('sets payments only at the expected version, and keeps them on owner updates', async () => {
      const bills = await store();
      const { record, ownerToken } = await bills.create(bill);
      const payment = { dinerId: 'ana', amount: 1200, paidAt: '2026-10-17T12:00:00.000Z' };

      expect(await bills.setPayments(record.id, record.version + 5, [payment])).toBe('conflict');
      expect(await bills.setPayments('missing123', 1, [payment])).toBeNull();
      const paid = await bills.setPayments(record.id, record.version, [payment]);
      expect(paid).toMatchObject({ version: 2, bill: { payments: [payment] } });

      const updated = await bills.update(record.id, ownerToken, { ...bill, payments: [] });
      expect(updated).toMatchObject({ version: 3, bill: { payments: [payment] } });
    });

    it('never exposes the owner token or its hash', async () => {
      const bills = await store();
      const { record, ownerToken } = await bills.create(bill);
      const read = JSON.stringify(await bills.get(record.id));

      expect(read).not.toContain(ownerToken);
      expect(read).not.toContain('ownerToken');
    });
  });
}

contract('memory', async () => createMemoryBillStore({ ttlMs: 60_000 }));

// Runs against a real MongoDB when one is available (CI starts a service container).
const mongoUri = process.env.TEST_MONGODB_URI;
if (mongoUri) {
  const connection = connectMongo({
    uri: mongoUri,
    database: `test_${Date.now()}`,
    logger: createLogger({ NODE_ENV: 'test' }),
  });
  afterAll(async () => {
    const { db, close } = await connection;
    await db.dropDatabase();
    await close();
  });
  contract('mongodb', async () =>
    createMongoBillStore({ db: (await connection).db, ttlMs: 60_000 }),
  );
} else {
  describe.skip('mongodb bill store (set TEST_MONGODB_URI to run)', () => {
    it('is skipped', () => {});
  });
}

describe('memory bill store expiry', () => {
  it('forgets bills once they expire, and an update extends the expiry', async () => {
    let now = new Date('2026-10-11T12:00:00Z');
    const bills = createMemoryBillStore({ ttlMs: 1000, now: () => now });
    const { record, ownerToken } = await bills.create(bill);

    now = new Date(now.getTime() + 900);
    expect(await bills.update(record.id, ownerToken, bill)).toMatchObject({ version: 2 });

    now = new Date(now.getTime() + 900);
    expect(await bills.get(record.id)).not.toBeNull();

    now = new Date(now.getTime() + 200);
    expect(await bills.get(record.id)).toBeNull();
    expect(await bills.update(record.id, ownerToken, bill)).toBe('not_found');
  });
});
