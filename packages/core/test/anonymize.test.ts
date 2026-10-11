import { describe, expect, it } from 'vitest';
import { anonymizeBill, computeBreakdown } from '../src';
import { ana, ben, bill, item } from './fixtures';

describe('anonymizeBill', () => {
  it('replaces names and keeps everything needed to reproduce the split', () => {
    const original = bill({
      diners: [ana, ben],
      items: [item('pizza', 1200, { mode: 'single', dinerId: 'ben' })],
    });

    const anonymous = anonymizeBill(original);

    expect(anonymous.diners.map((diner) => diner.name)).toEqual(['Person 1', 'Person 2']);
    expect(anonymous.diners.map((diner) => diner.id)).toEqual(['ana', 'ben']);
    expect(computeBreakdown(anonymous).totals).toEqual(computeBreakdown(original).totals);
    expect(original.diners[0]!.name).toBe('Ana');
  });
});
