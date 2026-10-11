import type { Bill } from '@bill-splitter/core';
import { MongoClient, type Collection } from 'mongodb';
import {
  hashToken,
  newBillId,
  newOwnerToken,
  tokenMatches,
  type BillStore,
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

function toRecord(document: BillDocument): StoredBill {
  return {
    id: document._id,
    bill: document.bill,
    version: document.version,
    updatedAt: document.updatedAt,
    expiresAt: document.expiresAt,
  };
}

/**
 * MongoDB-backed store. A TTL index deletes bills once `expiresAt` passes; reads
 * also filter on it because the TTL monitor only runs about once a minute.
 */
export async function createMongoBillStore(options: {
  uri: string;
  ttlMs: number;
  /** Defaults to the database named in the URI. */
  database?: string;
}): Promise<BillStore> {
  const client = await MongoClient.connect(options.uri);
  const bills: Collection<BillDocument> = client
    .db(options.database)
    .collection<BillDocument>('bills');
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

      const updated = await bills.findOneAndUpdate(
        { _id: id, ownerTokenHash: current.ownerTokenHash },
        {
          $set: { bill: { ...bill, id }, updatedAt: now, expiresAt: expiry(now) },
          $inc: { version: 1 },
        },
        { returnDocument: 'after' },
      );
      return updated ? toRecord(updated) : 'not_found';
    },

    async close() {
      await client.close();
    },
  };
}
