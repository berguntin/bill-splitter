import Anthropic from '@anthropic-ai/sdk';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import type { Config } from './config';
import { createClaudeExtractor } from './receipts/claude';
import { createFakeReceiptParser } from './receipts/fake';
import { createReceiptParser, type ReceiptParser } from './receipts/parser';
import { healthRouter } from './routes/health';
import { createReceiptsRouter } from './routes/receipts';

export interface Dependencies {
  receiptParser: ReceiptParser;
}

function defaultDependencies(config: Config): Dependencies {
  const receiptParser =
    config.RECEIPT_PARSER === 'claude'
      ? createReceiptParser(
          createClaudeExtractor(new Anthropic({ apiKey: config.ANTHROPIC_API_KEY ?? null })),
        )
      : createFakeReceiptParser();
  return { receiptParser };
}

/** Builds the Express app without binding a port, so tests can drive it directly. */
export function createApp(
  config: Config,
  dependencies: Dependencies = defaultDependencies(config),
): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGINS }));
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/health', healthRouter);
  app.use(
    '/api/receipts',
    createReceiptsRouter(dependencies.receiptParser, {
      requestsPer10Minutes: config.RECEIPT_RATE_LIMIT,
    }),
  );

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
      res.status(413).json({ error: 'image_too_large' });
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
