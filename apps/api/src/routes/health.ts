import { Router } from 'express';
import type { BillStore } from '../bills/store';

/**
 * Liveness and readiness in one: 200 when the API can serve shared bills,
 * 503 when the database is unreachable, so uptime monitors notice.
 */
export function createHealthRouter(billStore: BillStore): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      await billStore.ping();
      res.json({ status: 'ok' });
    } catch (error) {
      req.log.error({ err: error }, 'health check failed: database unreachable');
      res.status(503).json({ status: 'unavailable', database: 'unreachable' });
    }
  });

  return router;
}
