import type { Bill } from './types';

/**
 * Copy of a bill safe to attach to a bug report: diners' names become
 * "Person 1", "Person 2"... Ids, items, amounts and assignments are kept, so
 * the split can be reproduced exactly.
 */
export function anonymizeBill(bill: Bill): Bill {
  return {
    ...bill,
    diners: bill.diners.map((diner, index) => ({ ...diner, name: `Person ${index + 1}` })),
  };
}
