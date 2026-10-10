import type { Adjustment, Assignment, Bill, Diner, Item } from '../src';

export const ana: Diner = { id: 'ana', name: 'Ana', color: 'coral' };
export const ben: Diner = { id: 'ben', name: 'Ben', color: 'teal' };
export const cleo: Diner = { id: 'cleo', name: 'Cleo', color: 'amber' };

export function item(id: string, total: number, assignment: Assignment, quantity = 1): Item {
  return { id, name: id, quantity, unitPrice: Math.round(total / quantity), total, assignment };
}

export function bill(overrides: Partial<Bill> = {}): Bill {
  return { id: 'bill', currency: 'EUR', diners: [], items: [], adjustments: [], ...overrides };
}

export function tip(
  value: Adjustment['value'],
  distribution: Adjustment['distribution'] = 'proportional',
): Adjustment {
  return { id: 'tip', kind: 'tip', value, distribution };
}
