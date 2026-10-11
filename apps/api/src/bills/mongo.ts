import type { Bill } from '@bill-splitter/core';
import type { Collection, Db } from 'mongodb';
import {
  hashToken,
  newBillId,
  newOwnerToken,
  tokenMatches,
  type BillStore,
  withLiveGroups,
  withoutGroups,
  type StoredBill,
} from './store';

interface BillDocument {
  _id: string;
  bill: Bill;
  version: number;
  updatedAt: Date;
  expiresAt: Date;
  ownerTokenHash: string;
}

/** Bill fields that may be absent and must then be removed on update. */
const OPTIONAL_FIELDS = ['receiptTotal', 'source', 'merchant'] as const;

function toRecord(document: BillDocument): StoredBill {
  return {
    id: document._id,
    bill: withLiveGroups(document.bill),
    version: document.version,
    updatedAt: document.updatedAt,
    expiresAt: document.expiresAt,
  };
}

/**
 * MongoDB-backed store. A TTL index deletes bills once `expiresAt` passes; reads
 * also filter on it because the TTL monitor only runs about once a minute.
 */
export async function createMongoBillStore(options: { db: Db; ttlMs: number }): Promise<BillStore> {
  const { db } = options;
  const bills: Collection<BillDocument> = db.collection<BillDocument>('bills');
  await bills.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  const expiry = (from: Date) => new Date(from.getTime() + options.ttlMs);

  return {
    async create(bill) {
      const ownerToken = newOwnerToken();
      const id = newBillId();
      const updatedAt = new Date();
      const document: BillDocument = {
        _id: id,
        bill: { ...bill, id },
        version: 1,
        updatedAt,
        expiresAt: expiry(updatedAt),
        ownerTokenHash: hashToken(ownerToken),
      };
      await bills.insertOne(document);
      return { record: toRecord(document), ownerToken };
    },

    async get(id) {
      const document = await bills.findOne({ _id: id, expiresAt: { $gt: new Date() } });
      return document ? toRecord(document) : null;
    },

    async update(id, ownerToken, bill) {
      const now = new Date();
      const current = await bills.findOne({ _id: id, expiresAt: { $gt: now } });
      if (!current) return 'not_found';
      if (!tokenMatches(ownerToken, current.ownerTokenHash)) return 'forbidden';

      // Field by field, so groups set by guests in the meantime are kept.
      const fields = withoutGroups({ ...bill, id });
      const unset = OPTIONAL_FIELDS.filter((field) => !(field in fields));
      const updated = await bills.findOneAndUpdate(
        { _id: id, ownerTokenHash: current.ownerTokenHash },
        {
          $set: {
            ...Object.fromEntries(
              Object.entries(fields).map(([key, value]) => [`bill.${key}`, value]),
            ),
            updatedAt: now,
            expiresAt: expiry(now),
          },
          ...(unset.length
            ? { $unset: Object.fromEntries(unset.map((field) => [`bill.${field}`, ''])) }
            : {}),
          $inc: { version: 1 },
        },
        { returnDocument: 'after' },
      );
      return updated ? toRecord(updated) : 'not_found';
    },

    async setGroups(id, groups) {
      const now = new Date();
      const updated = await bills.findOneAndUpdate(
        { _id: id, expiresAt: { $gt: now } },
        {
          $set: { 'bill.groups': groups, updatedAt: now, expiresAt: expiry(now) },
          $inc: { version: 1 },
        },
        { returnDocument: 'after' },
      );
      return updated ? toRecord(updated) : null;
    },

    async ping() {
      await db.command({ ping: 1 }, { timeoutMS: 2000 });
    },
  };
}
