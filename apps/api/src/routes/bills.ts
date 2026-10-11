import express, { Router, type Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { BillInputSchema, toBill } from '../bills/schema';
import { BILL_ID_PATTERN, newBillId, type BillStore, type StoredBill } from '../bills/store';

const BodySchema = z.object({ bill: BillInputSchema });

function limiter(limit: number) {
  return rateLimit({
    windowMs: 10 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: 'rate_limited' });
    },
  });
}

function bearerToken(req: Request): string | null {
  const match = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '');
  return match?.[1] ?? null;
}

function billIdParam(req: Request): string {
  const value = req.params.id;
  return typeof value === 'string' ? value : '';
}

function publicBody(record: StoredBill) {
  return {
    id: record.id,
    bill: record.bill,
    version: record.version,
    updatedAt: record.updatedAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
  };
}

/**
 * Shared bills: the owner creates one and keeps it in sync; anyone with the
 * link can read it. GET responses carry an ETag, so polling clients get a
 * cheap 304 while nothing changes.
 */
export function createBillsRouter(store: BillStore): Router {
  const router = Router();
  const json = express.json({ limit: '200kb' });

  router.post('/', limiter(30), json, async (req, res) => {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_bill', issues: z.flattenError(parsed.error) });
      return;
    }
    // The store assigns the real id; this placeholder is replaced on insert.
    const { record, ownerToken } = await store.create(toBill(newBillId(), parsed.data.bill));
    res.status(201).json({ ...publicBody(record), ownerToken });
  });

  router.put('/:id', limiter(600), json, async (req, res) => {
    const id = billIdParam(req);
    const token = bearerToken(req);
    if (!BILL_ID_PATTERN.test(id)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (!token) {
      res.status(401).json({ error: 'missing_token' });
      return;
    }
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_bill', issues: z.flattenError(parsed.error) });
      return;
    }

    const result = await store.update(id, token, toBill(id, parsed.data.bill));
    if (result === 'not_found') res.status(404).json({ error: 'not_found' });
    else if (result === 'forbidden') res.status(403).json({ error: 'forbidden' });
    else res.json(publicBody(result));
  });

  // Guests on the same restaurant wifi share an IP; each polls ~120 times per 10 minutes.
  router.get('/:id', limiter(3000), async (req, res) => {
    const id = billIdParam(req);
    const record = BILL_ID_PATTERN.test(id) ? await store.get(id) : null;
    if (!record) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    // Always revalidate; Express answers 304 itself when the ETag matches.
    res.set('Cache-Control', 'no-cache');
    res.json(publicBody(record));
  });

  return router;
}
