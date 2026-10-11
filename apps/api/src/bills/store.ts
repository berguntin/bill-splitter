import { pruneGroups, type Bill, type DinerGroup } from '@bill-splitter/core';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export interface StoredBill {
  id: string;
  bill: Bill;
  /** Increases on every update; clients use it to detect changes. */
  version: number;
  updatedAt: Date;
  expiresAt: Date;
}

export type UpdateResult = StoredBill | 'not_found' | 'forbidden';

/**
 * Where shared bills live. Anyone with the id can read a bill; only the holder
 * of the owner token returned by `create` can change it. Bills expire after a
 * period without updates.
 */
export interface BillStore {
  create(bill: Bill): Promise<{ record: StoredBill; ownerToken: string }>;
  get(id: string): Promise<StoredBill | null>;
  /**
   * Replaces the bill, except its groups: those are shared by everyone at the
   * table through `setGroups`, so the owner's copy may be behind.
   */
  update(id: string, ownerToken: string, bill: Bill): Promise<UpdateResult>;
  /** Sets who pays together. Anyone with the link may, so it touches nothing else. */
  setGroups(id: string, groups: DinerGroup[]): Promise<StoredBill | null>;
  /** Resolves when the storage is reachable; rejects otherwise. */
  ping(): Promise<void>;
}

const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export const BILL_ID_PATTERN = /^[A-Za-z0-9]{10}$/;

/** Short, unguessable id for links and QR codes (57^10 ≈ 3.6e17 combinations). */
export function newBillId(): string {
  return Array.from({ length: 10 }, () => ID_ALPHABET[randomInt(ID_ALPHABET.length)]).join('');
}

/** The bill without its groups, which owner updates must not overwrite. */
export function withoutGroups(bill: Bill): Omit<Bill, 'groups'> {
  const copy: Bill = { ...bill };
  delete copy.groups;
  return copy;
}

/** Groups as stored may name diners the owner removed since; readers never see those. */
export function withLiveGroups(bill: Bill): Bill {
  if (!bill.groups) return bill;
  return {
    ...bill,
    groups: pruneGroups(
      bill.groups,
      bill.diners.map((diner) => diner.id),
    ),
  };
}

export function newOwnerToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only token hashes are stored, so a database leak does not grant edit access. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenMatches(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashToken(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

interface MemoryEntry extends StoredBill {
  ownerTokenHash: string;
}

/** In-process store for development and tests. Data is lost on restart. */
export function createMemoryBillStore(options: { ttlMs: number; now?: () => Date }): BillStore {
  const entries = new Map<string, MemoryEntry>();
  const now = options.now ?? (() => new Date());

  function live(id: string): MemoryEntry | null {
    const entry = entries.get(id);
    if (!entry) return null;
    if (entry.expiresAt <= now()) {
      entries.delete(id);
      return null;
    }
    return entry;
  }

  function publicView({ ownerTokenHash: _hash, ...record }: MemoryEntry): StoredBill {
    return structuredClone({ ...record, bill: withLiveGroups(record.bill) });
  }

  function touch(entry: MemoryEntry): void {
    const updatedAt = now();
    entry.version += 1;
    entry.updatedAt = updatedAt;
    entry.expiresAt = new Date(updatedAt.getTime() + options.ttlMs);
  }

  return {
    async create(bill) {
      const ownerToken = newOwnerToken();
      const id = newBillId();
      const updatedAt = now();
      const entry: MemoryEntry = {
        id,
        bill: structuredClone({ ...bill, id }),
        version: 1,
        updatedAt,
        expiresAt: new Date(updatedAt.getTime() + options.ttlMs),
        ownerTokenHash: hashToken(ownerToken),
      };
      entries.set(id, entry);
      return { record: publicView(entry), ownerToken };
    },

    async get(id) {
      const entry = live(id);
      return entry ? publicView(entry) : null;
    },

    async update(id, ownerToken, bill) {
      const entry = live(id);
      if (!entry) return 'not_found';
      if (!tokenMatches(ownerToken, entry.ownerTokenHash)) return 'forbidden';
      const rest = withoutGroups(structuredClone(bill));
      entry.bill = entry.bill.groups ? { ...rest, id, groups: entry.bill.groups } : { ...rest, id };
      touch(entry);
      return publicView(entry);
    },

    async setGroups(id, groups) {
      const entry = live(id);
      if (!entry) return null;
      entry.bill = { ...entry.bill, groups: structuredClone(groups) };
      touch(entry);
      return publicView(entry);
    },

    async ping() {},
  };
}
