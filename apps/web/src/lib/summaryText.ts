import { payers, type Bill, type Breakdown } from '@bill-splitter/core';
import { joinNames, money } from './format';
import { t } from './i18n';

/** Plain-text summary for pasting into a chat. */
export function summaryText(bill: Bill, breakdown: Breakdown): string {
  const { currency } = bill;
  const { totals } = breakdown;
  const header =
    totals.adjustments === 0
      ? t('summaryText.header', { total: money(totals.grand, currency) })
      : t('summaryText.headerWithTip', {
          total: money(totals.grand, currency),
          items: money(totals.items, currency),
          tip: money(totals.adjustments, currency),
        });

  const names = new Map(bill.diners.map((diner) => [diner.id, diner.name]));
  const name = (id: string) => names.get(id) ?? '?';
  const lines = payers(bill, breakdown).map((payer) => {
    if (payer.kind === 'diner') return `${name(payer.dinerId)}: ${money(payer.total, currency)}`;
    const shares = payer.members
      .map((member) => `${name(member.dinerId)} ${money(member.total, currency)}`)
      .join(' + ');
    return `${joinNames(payer.dinerIds.map(name))}: ${money(payer.total, currency)} (${shares})`;
  });
  if (breakdown.unassigned.total !== 0) {
    lines.push(
      t('summaryText.unassigned', { amount: money(breakdown.unassigned.total, currency) }),
    );
  }

  return [header, '', ...lines].join('\n');
}
