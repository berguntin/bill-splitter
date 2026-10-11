import { computeBreakdown, type Bill } from '@bill-splitter/core';
import { describe, expect, it } from 'vitest';
import { summaryText } from '../summaryText';

const base: Bill = {
  id: 'b',
  currency: 'EUR',
  diners: [
    { id: 'ana', name: 'Ana', color: 'coral' },
    { id: 'ben', name: 'Ben', color: 'teal' },
  ],
  items: [
    {
      id: 'pizza',
      name: 'Pizza',
      quantity: 1,
      unitPrice: 1200,
      total: 1200,
      assignment: { mode: 'everyone' },
    },
  ],
  adjustments: [],
};

describe('summaryText', () => {
  it('lists what each person owes', () => {
    expect(summaryText(base, computeBreakdown(base))).toBe(
      'Bill split · €12.00\n\nAna: €6.00\nBen: €6.00',
    );
  });

  it('mentions the tip and anything left unassigned', () => {
    const bill: Bill = {
      ...base,
      items: [
        ...base.items,
        {
          id: 'wine',
          name: 'Wine',
          quantity: 1,
          unitPrice: 800,
          total: 800,
          assignment: { mode: 'unassigned' },
        },
      ],
      adjustments: [
        { id: 'tip', kind: 'tip', value: { type: 'amount', amount: 200 }, distribution: 'equal' },
      ],
    };

    expect(summaryText(bill, computeBreakdown(bill))).toBe(
      'Bill split · €22.00 (€20.00 + €2.00 tip)\n\nAna: €7.00\nBen: €7.00\nNot assigned yet: €8.00',
    );
  });

  it('adds up people paying together', () => {
    const bill: Bill = {
      ...base,
      diners: [...base.diners, { id: 'cleo', name: 'Cleo', color: 'amber' }],
      groups: [{ id: 'g', dinerIds: ['ana', 'cleo'] }],
    };
    expect(summaryText(bill, computeBreakdown(bill))).toBe(
      'Bill split · €12.00\n\nAna & Cleo: €8.00 (Ana €4.00 + Cleo €4.00)\nBen: €4.00',
    );
  });
});
