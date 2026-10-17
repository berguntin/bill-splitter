import { allocate, assertInteger } from './allocate';
import type {
  Adjustment,
  AdjustmentKind,
  Bill,
  Cents,
  Diner,
  DinerId,
  Item,
  ItemId,
} from './types';

export interface ItemLine {
  itemId: ItemId;
  name: string;
  amount: Cents;
  /** This diner's weight and the total weight, e.g. 1 of 3 for a three-way split. */
  weight: number;
  totalWeight: number;
  /** Units this diner had, when the line is counted by units. */
  units?: number;
}

export interface AdjustmentLine {
  adjustmentId: string;
  kind: AdjustmentKind;
  amount: Cents;
}

export interface DinerBreakdown {
  dinerId: DinerId;
  items: ItemLine[];
  itemsSubtotal: Cents;
  adjustments: AdjustmentLine[];
  total: Cents;
}

export interface UnassignedBreakdown {
  /** Items nobody has claimed, or with units nobody has claimed yet. */
  itemIds: ItemId[];
  itemsSubtotal: Cents;
  /** Share of proportional adjustments that belongs to unassigned items. */
  adjustmentsTotal: Cents;
  total: Cents;
}

export interface Breakdown {
  diners: DinerBreakdown[];
  unassigned: UnassignedBreakdown;
  totals: { items: Cents; adjustments: Cents; grand: Cents };
  /**
   * `receiptTotal - totals.items`, or `null` when the receipt total is unknown.
   * Anything other than 0 means an item was misread or is missing.
   */
  receiptDifference: Cents | null;
}

/**
 * Computes how much each diner owes.
 *
 * Invariant: the diners' totals plus the unassigned total always equal
 * `totals.grand`, to the cent.
 */
export function computeBreakdown(bill: Bill): Breakdown {
  const dinerTotals = new Map<DinerId, DinerBreakdown>(
    bill.diners.map((diner) => [diner.id, emptyDinerBreakdown(diner.id)]),
  );
  const unassigned: UnassignedBreakdown = {
    itemIds: [],
    itemsSubtotal: 0,
    adjustmentsTotal: 0,
    total: 0,
  };

  let itemsTotal = 0;
  for (const item of bill.items) {
    assertInteger(item.total, `Total of item "${item.name}"`);
    itemsTotal += item.total;

    if (item.assignment.mode === 'units') {
      const units = resolveUnits(item, bill.diners);
      const claimed = units.reduce((sum, unit) => sum + unit.count, 0);
      // Units nobody claimed yet: their part of the price stays unassigned.
      const leftover = Math.max(0, unitCount(item) - claimed);
      const amounts = allocate(item.total, [...units.map((unit) => unit.count), leftover]);
      units.forEach((unit, index) => {
        const breakdown = dinerTotals.get(unit.dinerId)!;
        const amount = amounts[index] ?? 0;
        breakdown.items.push({
          itemId: item.id,
          name: item.name,
          amount,
          weight: unit.count,
          totalWeight: claimed + leftover,
          units: unit.count,
        });
        breakdown.itemsSubtotal += amount;
      });
      if (leftover > 0) {
        unassigned.itemIds.push(item.id);
        unassigned.itemsSubtotal += amounts.at(-1) ?? 0;
      }
      continue;
    }

    const shares = resolveShares(item, bill.diners);
    if (shares.length === 0) {
      unassigned.itemIds.push(item.id);
      unassigned.itemsSubtotal += item.total;
      continue;
    }

    const totalWeight = shares.reduce((sum, share) => sum + share.weight, 0);
    const amounts = allocate(
      item.total,
      shares.map((share) => share.weight),
    );
    shares.forEach((share, index) => {
      const breakdown = dinerTotals.get(share.dinerId)!;
      const amount = amounts[index] ?? 0;
      breakdown.items.push({
        itemId: item.id,
        name: item.name,
        amount,
        weight: share.weight,
        totalWeight,
      });
      breakdown.itemsSubtotal += amount;
    });
  }

  let adjustmentsTotal = 0;
  for (const adjustment of bill.adjustments) {
    const amount = adjustmentAmount(adjustment, itemsTotal);
    adjustmentsTotal += amount;
    if (amount === 0) continue;

    const recipients = adjustmentRecipients(adjustment, [...dinerTotals.values()], unassigned);
    const amounts = allocate(
      amount,
      recipients.map((recipient) => recipient.weight),
    );
    recipients.forEach((recipient, index) => {
      const part = amounts[index] ?? 0;
      if (recipient.breakdown === null) {
        unassigned.adjustmentsTotal += part;
      } else {
        recipient.breakdown.adjustments.push({
          adjustmentId: adjustment.id,
          kind: adjustment.kind,
          amount: part,
        });
      }
    });
  }

  const diners = [...dinerTotals.values()].map((breakdown) => ({
    ...breakdown,
    total:
      breakdown.itemsSubtotal + breakdown.adjustments.reduce((sum, line) => sum + line.amount, 0),
  }));
  unassigned.total = unassigned.itemsSubtotal + unassigned.adjustmentsTotal;

  return {
    diners,
    unassigned,
    totals: {
      items: itemsTotal,
      adjustments: adjustmentsTotal,
      grand: itemsTotal + adjustmentsTotal,
    },
    receiptDifference: bill.receiptTotal === undefined ? null : bill.receiptTotal - itemsTotal,
  };
}

/** Signed amount of an adjustment: positive for tips and service, negative for discounts. */
export function adjustmentAmount(adjustment: Adjustment, itemsTotal: Cents): Cents {
  const { value } = adjustment;
  let magnitude: Cents;
  if (value.type === 'amount') {
    assertInteger(value.amount, `Amount of adjustment "${adjustment.id}"`);
    magnitude = Math.abs(value.amount);
  } else {
    magnitude = Math.abs(roundHalfAwayFromZero((itemsTotal * value.basisPoints) / 10_000));
  }
  return adjustment.kind === 'discount' ? -magnitude : magnitude;
}

/**
 * Normalizes an assignment into a list of positive shares among existing
 * diners. Unknown diners and non-positive weights are dropped, and repeated
 * diners are merged, so stale data never breaks the split.
 */
function resolveShares(
  item: Item,
  diners: readonly Diner[],
): { dinerId: DinerId; weight: number }[] {
  const known = new Set(diners.map((diner) => diner.id));
  const { assignment } = item;

  switch (assignment.mode) {
    case 'unassigned':
    case 'units':
      return [];
    case 'single':
      return known.has(assignment.dinerId) ? [{ dinerId: assignment.dinerId, weight: 1 }] : [];
    case 'everyone':
      return diners.map((diner) => ({ dinerId: diner.id, weight: 1 }));
    case 'shared': {
      const merged = new Map<DinerId, number>();
      for (const { dinerId, weight } of assignment.shares) {
        if (!known.has(dinerId) || !Number.isFinite(weight) || weight <= 0) continue;
        merged.set(dinerId, (merged.get(dinerId) ?? 0) + weight);
      }
      // Keep the diners' order so results do not depend on how shares were added.
      return diners
        .filter((diner) => merged.has(diner.id))
        .map((diner) => ({ dinerId: diner.id, weight: merged.get(diner.id)! }));
    }
  }
}

/** Units of a line that can be counted: its quantity when it is a whole number, else 1. */
export function unitCount(item: Item): number {
  return Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1;
}

/** Claimed units among existing diners, in the diners' order, merged and positive. */
function resolveUnits(item: Item, diners: readonly Diner[]): { dinerId: DinerId; count: number }[] {
  if (item.assignment.mode !== 'units') return [];
  const merged = new Map<DinerId, number>();
  for (const { dinerId, count } of item.assignment.units) {
    if (!Number.isInteger(count) || count <= 0) continue;
    merged.set(dinerId, (merged.get(dinerId) ?? 0) + count);
  }
  return diners
    .filter((diner) => merged.has(diner.id))
    .map((diner) => ({ dinerId: diner.id, count: merged.get(diner.id)! }));
}

interface Recipient {
  /** `null` stands for the unassigned bucket. */
  breakdown: DinerBreakdown | null;
  weight: number;
}

function adjustmentRecipients(
  adjustment: Adjustment,
  diners: DinerBreakdown[],
  unassigned: UnassignedBreakdown,
): Recipient[] {
  if (diners.length === 0) {
    return [{ breakdown: null, weight: 1 }];
  }

  if (adjustment.distribution === 'proportional') {
    const recipients: Recipient[] = [
      ...diners.map((breakdown) => ({ breakdown, weight: Math.max(0, breakdown.itemsSubtotal) })),
      { breakdown: null, weight: Math.max(0, unassigned.itemsSubtotal) },
    ];
    if (recipients.some((recipient) => recipient.weight > 0)) {
      return recipients;
    }
    // Nothing consumed yet: fall back to an even split.
  }

  return diners.map((breakdown) => ({ breakdown, weight: 1 }));
}

function emptyDinerBreakdown(dinerId: DinerId): DinerBreakdown {
  return { dinerId, items: [], itemsSubtotal: 0, adjustments: [], total: 0 };
}

function roundHalfAwayFromZero(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}
