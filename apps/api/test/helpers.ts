import { createMemoryBillStore } from '../src/bills/store';
import type { Dependencies } from '../src/dependencies';
import { createLogger } from '../src/observability/logger';
import { noopNotifier } from '../src/reports/github';
import { createMemoryReportStore } from '../src/reports/store';
import { createFakeReceiptParser } from '../src/receipts/fake';

export function testDependencies(overrides: Partial<Dependencies> = {}): Dependencies {
  return {
    receiptParser: createFakeReceiptParser(0),
    billStore: createMemoryBillStore({ ttlMs: 60_000 }),
    reportStore: createMemoryReportStore({ ttlMs: 60_000 }),
    reportNotifier: noopNotifier,
    logger: createLogger({ NODE_ENV: 'test' }),
    close: async () => {},
    ...overrides,
  };
}
