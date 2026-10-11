import Anthropic from '@anthropic-ai/sdk';
import { createBillEvents, type BillEvents } from './bills/events';
import { createMongoBillStore } from './bills/mongo';
import { createMemoryBillStore, type BillStore } from './bills/store';
import type { Config } from './config';
import { connectMongo } from './db/mongo';
import { createLogger, type Logger } from './observability/logger';
import { createClaudeExtractor } from './receipts/claude';
import { createFakeReceiptParser } from './receipts/fake';
import { createReceiptParser, type ReceiptParser } from './receipts/parser';
import { createGitHubNotifier, noopNotifier, type ReportNotifier } from './reports/github';
import { createMongoReportStore } from './reports/mongo';
import { createMemoryReportStore, type ReportStore } from './reports/store';

export interface Dependencies {
  receiptParser: ReceiptParser;
  billStore: BillStore;
  billEvents: BillEvents;
  reportStore: ReportStore;
  reportNotifier: ReportNotifier;
  logger: Logger;
  /** Releases connections on shutdown. */
  close(): Promise<void>;
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

  const billTtlMs = config.BILL_TTL_DAYS * DAY_MS;
  const reportTtlMs = config.REPORT_TTL_DAYS * DAY_MS;
  const mongo = config.MONGODB_URI
    ? await connectMongo({ uri: config.MONGODB_URI, database: config.MONGODB_DATABASE, logger })
    : null;

  const billStore = mongo
    ? await createMongoBillStore({ db: mongo.db, ttlMs: billTtlMs })
    : createMemoryBillStore({ ttlMs: billTtlMs });
  const reportStore = mongo
    ? await createMongoReportStore({ db: mongo.db, ttlMs: reportTtlMs })
    : createMemoryReportStore({ ttlMs: reportTtlMs });

  const reportNotifier = config.GITHUB_TOKEN
    ? createGitHubNotifier({
        token: config.GITHUB_TOKEN,
        repository: config.GITHUB_REPOSITORY,
        logger,
      })
    : noopNotifier;

  const billEvents = createBillEvents();

  return {
    receiptParser,
    billStore,
    billEvents,
    reportStore,
    reportNotifier,
    logger,
    close: async () => {
      billEvents.close();
      await mongo?.close();
    },
  };
}
