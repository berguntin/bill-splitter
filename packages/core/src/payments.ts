import type { Payer } from './groups';
import type { Cents, DinerId, Payment } from './types';

/**
 * Records that these diners paid, replacing any earlier payment of theirs.
 * `amounts` holds what each owed at that moment.
 */
export function markPaid(
  payments: readonly Payment[],
  amounts: ReadonlyMap<DinerId, Cents>,
  paidAt: string,
): Payment[] {
  const ids = new Set(amounts.keys());
  return [
    ...payments.filter((payment) => !ids.has(payment.dinerId)),
    ...[...amounts].map(([dinerId, amount]) => ({ dinerId, amount, paidAt })),
  ];
}

/** Forgets the payments of these diners. */
export function markUnpaid(payments: readonly Payment[], dinerIds: readonly DinerId[]): Payment[] {
  const ids = new Set(dinerIds);
  return payments.filter((payment) => !ids.has(payment.dinerId));
}

export type PaymentStatus =
  /** Nobody covered by this payer has paid. */
  | { state: 'unpaid' }
  /** Everyone paid exactly what they owe now. */
  | { state: 'paid'; paidAt: string }
  /** Everyone paid, but the bill changed since: `due` is what is still owed (or, if negative, owed back). */
  | { state: 'changed'; paid: Cents; due: Cents }
  /** Some members of a group paid, others not yet. */
  | { state: 'partial'; paid: Cents };

/** Whether a diner or group has settled up, comparing payments with what they owe now. */
export function paymentStatus(payer: Payer, payments: readonly Payment[] = []): PaymentStatus {
  const dinerIds = payer.kind === 'group' ? payer.dinerIds : [payer.dinerId];
  const byDiner = new Map(payments.map((payment) => [payment.dinerId, payment]));
  const made = dinerIds.flatMap((id) => byDiner.get(id) ?? []);
  if (made.length === 0) return { state: 'unpaid' };
  const paid = made.reduce((sum, payment) => sum + payment.amount, 0);
  if (made.length < dinerIds.length) return { state: 'partial', paid };
  if (paid !== payer.total) return { state: 'changed', paid, due: payer.total - paid };
  const latest = made
    .map((payment) => payment.paidAt)
    .sort()
    .at(-1)!;
  return { state: 'paid', paidAt: latest };
}
