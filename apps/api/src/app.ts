import Anthropic from '@anthropic-ai/sdk';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import type { Config } from './config';
import type { Dependencies } from './dependencies';
import { createBillsRouter } from './routes/bills';
import { healthRouter } from './routes/health';
import { createReceiptsRouter } from './routes/receipts';

/** Builds the Express app without binding a port, so tests can drive it directly. */
export function createApp(config: Config, dependencies: Dependencies): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGINS }));

  app.use('/api/health', healthRouter);
  app.use(
    '/api/receipts',
    createReceiptsRouter(dependencies.receiptParser, {
      requestsPer10Minutes: config.RECEIPT_RATE_LIMIT,
    }),
  );
  app.use('/api/bills', createBillsRouter(dependencies.billStore));

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    // Body parser errors carry a 4xx status, e.g. 413 for an oversized image.
    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? Number((error as { status: unknown }).status)
        : 500;
    if (status === 413) {
      res.status(413).json({ error: 'payload_too_large' });
      return;
    }
    if (status >= 400 && status < 500 && error instanceof Error && 'type' in error) {
      res.status(status).json({ error: 'bad_request' });
      return;
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`Claude API error ${error.status ?? ''}`, error.message);
      res.status(502).json({ error: 'upstream_error' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'internal_error' });
  };
  app.use(errorHandler);

  return app;
}
