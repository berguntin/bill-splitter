import { allocate } from './allocate';
import type { Item } from './types';

/**
 * Turns a line with `quantity > 1` (e.g. "3x Beer") into one line per unit so
 * each unit can be assigned to a different diner. The units always add up to
 * the original line total, even when it is not an exact multiple.
 *
 * Unit ids are derived from the original id: `${item.id}#1`, `${item.id}#2`, ...
 */
export function splitIntoUnits(item: Item): Item[] {
  if (!Number.isInteger(item.quantity) || item.quantity <= 1) {
    return [item];
  }

  const totals = allocate(
    item.total,
    Array.from({ length: item.quantity }, () => 1),
  );
  return totals.map((total, index) => ({
    ...item,
    id: `${item.id}#${index + 1}`,
    quantity: 1,
    unitPrice: total,
    total,
  }));
}
