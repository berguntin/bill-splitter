import { describe, expect, it } from 'vitest';
import { adjustmentAmount, computeBreakdown, type Bill, type Breakdown } from '../src';
import { ana, ben, bill, cleo, item, tip } from './fixtures';

function totalsByDiner(breakdown: Breakdown): Record<string, number> {
  return Object.fromEntries(breakdown.diners.map((diner) => [diner.dinerId, diner.total]));
}

function expectBalanced(breakdown: Breakdown): void {
  const assigned = breakdown.diners.reduce((sum, diner) => sum + diner.total, 0);
  expect(assigned + breakdown.unassigned.total).toBe(breakdown.totals.grand);
}

describe('computeBreakdown', () => {
  it('charges single items to their diner', () => {
    const result = computeBreakdown(
      bill({
        diners: [ana, ben],
        items: [
          item('burger', 1250, { mode: 'single', dinerId: 'ana' }),
          item('salad', 980, { mode: 'single', dinerId: 'ben' }),
        ],
      }),
    );

    expect(totalsByDiner(result)).toEqual({ ana: 1250, ben: 980 });
    expect(result.totals).toEqual({ items: 2230, adjustments: 0, grand: 2230 });
    expect(result.unassigned.total).toBe(0);
  });

  it('splits shared items by weight and records the fraction', () => {
    const result = computeBreakdown(
      bill({
        diners: [ana, ben, cleo],
        items: [
          item('nachos', 900, {
            mode: 'shared',
            shares: [
              { dinerId: 'ana', weight: 2 },
              { dinerId: 'ben', weight: 1 },
            ],
          }),
        ],
      }),
    );

    expect(totalsByDiner(result)).toEqual({ ana: 600, ben: 300, cleo: 0 });
    expect(result.diners[0]?.items[0]).toMatchObject({ amount: 600, weight: 2, totalWeight: 3 });
  });

  it('splits "everyone" items among all diners, including ones added later', () => {
    const water = item('water', 1000, { mode: 'everyone' });

    const before = computeBreakdown(bill({ diners: [ana, ben], items: [water] }));
    expect(totalsByDiner(before)).toEqual({ ana: 500, ben: 500 });

    const after = computeBreakdown(bill({ diners: [ana, ben, cleo], items: [water] }));
    expect(totalsByDiner(after)).toEqual({ ana: 334, ben: 333, cleo: 333 });
  });

  it('keeps unassigned items in a separate bucket', () => {
    const result = computeBreakdown(
      bill({
        diners: [ana],
        items: [
          item('coffee', 150, { mode: 'unassigned' }),
          item('cake', 400, { mode: 'single', dinerId: 'ana' }),
        ],
      }),
    );

    expect(result.unassigned).toEqual({
      itemIds: ['coffee'],
      itemsSubtotal: 150,
      adjustmentsTotal: 0,
      total: 150,
    });
    expectBalanced(result);
  });

  it('treats assignments to removed diners as unassigned', () => {
    const result = computeBreakdown(
      bill({
        diners: [ana],
        items: [
          item('wine', 2000, { mode: 'single', dinerId: 'ghost' }),
          item('bread', 300, {
            mode: 'shared',
            shares: [
              { dinerId: 'ghost', weight: 1 },
              { dinerId: 'ana', weight: 0 },
            ],
          }),
        ],
      }),
    );

    expect(result.unassigned.itemIds).toEqual(['wine', 'bread']);
    expect(totalsByDiner(result)).toEqual({ ana: 0 });
  });

  it('merges repeated diners and ignores share order', () => {
    const result = computeBreakdown(
      bill({
        diners: [ana, ben],
        items: [
          item('pizza', 1200, {
            mode: 'shared',
            shares: [
              { dinerId: 'ben', weight: 1 },
              { dinerId: 'ana', weight: 1 },
              { dinerId: 'ben', weight: 1 },
            ],
          }),
        ],
      }),
    );

    expect(totalsByDiner(result)).toEqual({ ana: 400, ben: 800 });
    expect(result.diners.map((diner) => diner.dinerId)).toEqual(['ana', 'ben']);
  });

  it('puts everything in the unassigned bucket when there are no diners', () => {
    const result = computeBreakdown(
      bill({
        items: [item('menu', 1500, { mode: 'everyone' })],
        adjustments: [tip({ type: 'amount', amount: 200 })],
      }),
    );

    expect(result.diners).toEqual([]);
    expect(result.unassigned.total).toBe(1700);
    expectBalanced(result);
  });

  describe('adjustments', () => {
    const base: Bill = bill({
      diners: [ana, ben],
      items: [
        item('steak', 3000, { mode: 'single', dinerId: 'ana' }),
        item('soup', 1000, { mode: 'single', dinerId: 'ben' }),
      ],
    });

    it('splits a tip in proportion to consumption', () => {
      const result = computeBreakdown({
        ...base,
        adjustments: [tip({ type: 'percent', basisPoints: 1000 })],
      });

      expect(result.totals.adjustments).toBe(400);
      expect(totalsByDiner(result)).toEqual({ ana: 3300, ben: 1100 });
      expect(result.diners[0]?.adjustments).toEqual([
        { adjustmentId: 'tip', kind: 'tip', amount: 300 },
      ]);
    });

    it('splits an equal tip evenly regardless of consumption', () => {
      const result = computeBreakdown({
        ...base,
        adjustments: [tip({ type: 'amount', amount: 500 }, 'equal')],
      });

      expect(totalsByDiner(result)).toEqual({ ana: 3250, ben: 1250 });
    });

    it('subtracts discounts', () => {
      const result = computeBreakdown({
        ...base,
        adjustments: [
          {
            id: 'promo',
            kind: 'discount',
            value: { type: 'amount', amount: 1000 },
            distribution: 'proportional',
          },
        ],
      });

      expect(result.totals.grand).toBe(3000);
      expect(totalsByDiner(result)).toEqual({ ana: 2250, ben: 750 });
    });

    it('reserves the unassigned share of proportional adjustments', () => {
      const result = computeBreakdown({
        ...base,
        items: [...base.items, item('dessert', 1000, { mode: 'unassigned' })],
        adjustments: [tip({ type: 'percent', basisPoints: 1000 })],
      });

      expect(result.unassigned.adjustmentsTotal).toBe(100);
      expect(result.unassigned.total).toBe(1100);
      expectBalanced(result);
    });

    it('falls back to an even split when nobody has consumed anything yet', () => {
      const result = computeBreakdown(
        bill({ diners: [ana, ben], adjustments: [tip({ type: 'amount', amount: 301 })] }),
      );

      expect(totalsByDiner(result)).toEqual({ ana: 151, ben: 150 });
    });

    it('skips zero adjustments', () => {
      const result = computeBreakdown({
        ...base,
        adjustments: [tip({ type: 'percent', basisPoints: 0 })],
      });

      expect(result.diners.every((diner) => diner.adjustments.length === 0)).toBe(true);
    });
  });

  describe('receipt check', () => {
    it('is null when the receipt total is unknown', () => {
      expect(computeBreakdown(bill()).receiptDifference).toBeNull();
    });

    it('reports how far the items are from the printed total', () => {
      const result = computeBreakdown(
        bill({ items: [item('beer', 250, { mode: 'unassigned' })], receiptTotal: 500 }),
      );
      expect(result.receiptDifference).toBe(250);
    });
  });

  it('rejects non-integer item totals', () => {
    expect(() =>
      computeBreakdown(bill({ items: [item('tea', 1.5, { mode: 'unassigned' })] })),
    ).toThrow(RangeError);
  });

  it('stays balanced on randomized bills', () => {
    const random = mulberry32(42);
    const diners = [ana, ben, cleo];

    for (let run = 0; run < 500; run++) {
      const items = Array.from({ length: 1 + Math.floor(random() * 8) }, (_, index) => {
        const total = Math.floor(random() * 5000);
        const roll = random();
        if (roll < 0.2) return item(`i${index}`, total, { mode: 'unassigned' });
        if (roll < 0.5) return item(`i${index}`, total, { mode: 'everyone' });
        if (roll < 0.8) {
          const dinerId = diners[Math.floor(random() * diners.length)]!.id;
          return item(`i${index}`, total, { mode: 'single', dinerId });
        }
        const shares = diners.map((diner) => ({
          dinerId: diner.id,
          weight: Math.floor(random() * 3),
        }));
        return item(`i${index}`, total, { mode: 'shared', shares });
      });

      const result = computeBreakdown(
        bill({
          diners: diners.slice(0, Math.floor(random() * 4)),
          items,
          adjustments: [
            tip({ type: 'percent', basisPoints: Math.floor(random() * 2000) }),
            {
              id: 'discount',
              kind: 'discount',
              value: { type: 'amount', amount: Math.floor(random() * 300) },
              distribution: random() < 0.5 ? 'equal' : 'proportional',
            },
          ],
        }),
      );

      expectBalanced(result);
    }
  });
});

describe('adjustmentAmount', () => {
  it('rounds percentages half away from zero', () => {
    // 10% of 1005 cents = 100.5 cents.
    expect(adjustmentAmount(tip({ type: 'percent', basisPoints: 1000 }), 1005)).toBe(101);
  });

  it('makes discounts negative even when entered as negative', () => {
    expect(
      adjustmentAmount(
        {
          id: 'd',
          kind: 'discount',
          value: { type: 'amount', amount: -250 },
          distribution: 'equal',
        },
        0,
      ),
    ).toBe(-250);
  });

  it('rejects non-integer fixed amounts', () => {
    expect(() => adjustmentAmount(tip({ type: 'amount', amount: 1.2 }), 0)).toThrow(RangeError);
  });
});

/** Small seeded PRNG so randomized tests are reproducible. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
