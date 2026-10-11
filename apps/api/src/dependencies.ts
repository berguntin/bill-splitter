import Anthropic from '@anthropic-ai/sdk';
import { createMongoBillStore } from './bills/mongo';
import { createMemoryBillStore, type BillStore } from './bills/store';
import type { Config } from './config';
import { createLogger, type Logger } from './observability/logger';
import { createClaudeExtractor } from './receipts/claude';
import { createFakeReceiptParser } from './receipts/fake';
import { createReceiptParser, type ReceiptParser } from './receipts/parser';

export interface Dependencies {
  receiptParser: ReceiptParser;
  billStore: BillStore;
  logger: Logger;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Builds the services the app needs from configuration, connecting to MongoDB if set. */
export async function createDependencies(
  config: Config,
  logger: Logger = createLogger(config),
): Promise<Dependencies> {
  const receiptParser =
    config.RECEIPT_PARSER === 'claude'
      ? createReceiptParser(
          createClaudeExtractor(new Anthropic({ apiKey: config.ANTHROPIC_API_KEY ?? null })),
        )
      : createFakeReceiptParser();

  const ttlMs = config.BILL_TTL_DAYS * DAY_MS;
  const billStore = config.MONGODB_URI
    ? await createMongoBillStore({
        uri: config.MONGODB_URI,
        database: config.MONGODB_DATABASE,
        ttlMs,
        logger,
      })
    : createMemoryBillStore({ ttlMs });

  return { receiptParser, billStore, logger };
}
