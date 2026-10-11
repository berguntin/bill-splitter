import Anthropic from '@anthropic-ai/sdk';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import type { Config } from './config';
import type { Dependencies } from './dependencies';
import { createBillsRouter } from './routes/bills';
import { httpLogger } from './observability/http';
import { REQUEST_ID_HEADER } from './observability/requestId';
import { reportError } from './observability/sentry';
import { createHealthRouter } from './routes/health';
import { createReceiptsRouter } from './routes/receipts';
import { createReportsRouter } from './routes/reports';

/** Builds the Express app without binding a port, so tests can drive it directly. */
export function createApp(config: Config, dependencies: Dependencies): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);
  app.use(helmet());
  app.use(httpLogger(dependencies.logger));
  // Let the web app read the request id to show it next to an error.
  app.use(cors({ origin: config.CORS_ORIGINS, exposedHeaders: [REQUEST_ID_HEADER] }));

  app.use('/api/health', createHealthRouter(dependencies.billStore));
  app.use(
    '/api/receipts',
    createReceiptsRouter(dependencies.receiptParser, {
      requestsPer10Minutes: config.RECEIPT_RATE_LIMIT,
    }),
  );
  app.use('/api/bills', createBillsRouter(dependencies.billStore, dependencies.billEvents));
  app.use(
    '/api/reports',
    createReportsRouter(dependencies.reportStore, dependencies.reportNotifier),
  );

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
    // Checked first: Claude API errors also carry a status (e.g. 401 for a bad key),
    // but they are our upstream's failure, not the client's. The request id in the
    // body lets people quote it when reporting the problem.
    if (error instanceof Anthropic.APIError) {
      req.log.error(
        { err: error, upstream: { status: error.status, requestId: error.requestID } },
        'Claude API error',
      );
      reportError(error, { requestId: String(req.id), route: req.path });
      res.status(502).json({ error: 'upstream_error', requestId: req.id });
      return;
    }
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
    req.log.error({ err: error }, 'unhandled error');
    reportError(error, { requestId: String(req.id), route: req.path });
    res.status(500).json({ error: 'internal_error', requestId: req.id });
  };
  app.use(errorHandler);

  return app;
}
