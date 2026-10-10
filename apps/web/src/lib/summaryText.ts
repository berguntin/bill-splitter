import type { Bill, Breakdown } from '@bill-splitter/core';
import { money } from './format';

/** Plain-text summary for pasting into a chat. */
export function summaryText(bill: Bill, breakdown: Breakdown): string {
  const { currency } = bill;
  const { totals } = breakdown;
  const header =
    totals.adjustments === 0
      ? `Bill split · ${money(totals.grand, currency)}`
      : `Bill split · ${money(totals.grand, currency)} (${money(totals.items, currency)} + ${money(totals.adjustments, currency)} tip)`;

  const names = new Map(bill.diners.map((diner) => [diner.id, diner.name]));
  const lines = breakdown.diners.map(
    (diner) => `${names.get(diner.dinerId) ?? '?'}: ${money(diner.total, currency)}`,
  );
  if (breakdown.unassigned.total !== 0) {
    lines.push(`Not assigned yet: ${money(breakdown.unassigned.total, currency)}`);
  }

  return [header, '', ...lines].join('\n');
}
