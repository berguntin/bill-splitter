import { describe, expect, it } from 'vitest';
import { computeBreakdown, markPaid, markUnpaid, payers, paymentStatus } from '../src';
import { ana, ben, bill, cleo, item } from './fixtures';

const table = bill({
  diners: [ana, ben, cleo],
  items: [item('pizza', 1500, { mode: 'everyone' })],
  groups: [{ id: 'g', dinerIds: ['ben', 'cleo'] }],
});
const [anaPays, couple] = payers(table, computeBreakdown(table));

describe('markPaid and markUnpaid', () => {
  it('replaces earlier payments of the same diners', () => {
    const first = markPaid([], new Map([['ana', 500]]), '2026-10-17T12:00:00Z');
    const again = markPaid(first, new Map([['ana', 600]]), '2026-10-17T12:05:00Z');
    expect(again).toEqual([{ dinerId: 'ana', amount: 600, paidAt: '2026-10-17T12:05:00Z' }]);
    expect(markUnpaid(again, ['ana'])).toEqual([]);
  });
});

describe('paymentStatus', () => {
  it('is unpaid without payments', () => {
    expect(paymentStatus(anaPays!)).toEqual({ state: 'unpaid' });
  });

  it('is paid when the amount matches what is owed now', () => {
    const payments = markPaid([], new Map([['ana', 500]]), '2026-10-17T12:00:00Z');
    expect(paymentStatus(anaPays!, payments)).toEqual({
      state: 'paid',
      paidAt: '2026-10-17T12:00:00Z',
    });
  });

  it('notices when the bill changed after paying', () => {
    const payments = markPaid([], new Map([['ana', 400]]), '2026-10-17T12:00:00Z');
    expect(paymentStatus(anaPays!, payments)).toEqual({ state: 'changed', paid: 400, due: 100 });
  });

  it('needs every member of a group', () => {
    const half = markPaid([], new Map([['ben', 500]]), '2026-10-17T12:00:00Z');
    expect(paymentStatus(couple!, half)).toEqual({ state: 'partial', paid: 500 });
    const both = markPaid(half, new Map([['cleo', 500]]), '2026-10-17T12:01:00Z');
    expect(paymentStatus(couple!, both)).toEqual({
      state: 'paid',
      paidAt: '2026-10-17T12:01:00Z',
    });
  });
});
