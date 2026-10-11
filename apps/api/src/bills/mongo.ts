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
  database: string;
}): Promise<BillStore> {
  let client: MongoClient;
  try {
    client = await MongoClient.connect(options.uri);
  } catch (error) {
    console.error(`Could not connect to MongoDB. ${describeMongoUri(options.uri)}`);
    throw error;
  }
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

/**
 * Summarizes a connection string for logs without revealing the password, so
 * a misconfigured MONGODB_URI can be diagnosed from the host's logs.
 */
export function describeMongoUri(uri: string): string {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return 'MONGODB_URI is not a valid URL; check for spaces, quotes or unescaped characters.';
  }

  const parts = [
    `scheme=${url.protocol.replace(/:$/, '')}`,
    `user=${JSON.stringify(safeDecode(url.username))}`,
    `passwordLength=${safeDecode(url.password).length}`,
    `host=${url.hostname}`,
    `pathDatabase=${JSON.stringify(url.pathname.replace(/^\//, ''))}`,
    `authSource=${url.searchParams.get('authSource') ?? '(default)'}`,
  ];
  const warnings = [];
  if (/[<>]/.test(uri)) warnings.push('contains < or >, likely a leftover placeholder');
  if (uri !== uri.trim()) warnings.push('has leading or trailing whitespace');
  if (/^["']|["']$/.test(uri.trim())) warnings.push('is wrapped in quotes');
  if (/%(?![0-9A-Fa-f]{2})/.test(url.password)) warnings.push('password has a stray %');
  return `${parts.join(' ')}${warnings.length ? ` WARNING: the URI ${warnings.join('; ')}.` : ''}`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
