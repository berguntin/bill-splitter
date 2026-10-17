import { unitCount } from './split';
import type { Assignment, Diner, DinerId, Item } from './types';

/** Ids of the diners an assignment currently covers, in the diners' order. */
export function assignedDinerIds(assignment: Assignment, diners: readonly Diner[]): DinerId[] {
  switch (assignment.mode) {
    case 'unassigned':
      return [];
    case 'everyone':
      return diners.map((diner) => diner.id);
    case 'single':
      return diners.some((diner) => diner.id === assignment.dinerId) ? [assignment.dinerId] : [];
    case 'shared': {
      const ids = new Set(
        assignment.shares.filter((share) => share.weight > 0).map((share) => share.dinerId),
      );
      return diners.filter((diner) => ids.has(diner.id)).map((diner) => diner.id);
    }
    case 'units': {
      const ids = new Set(
        assignment.units.filter((unit) => unit.count > 0).map((unit) => unit.dinerId),
      );
      return diners.filter((diner) => ids.has(diner.id)).map((diner) => diner.id);
    }
  }
}

/** Units of a line each diner had; zero for diners not counted. */
export function unitsOf(assignment: Assignment, dinerId: DinerId): number {
  if (assignment.mode !== 'units') return 0;
  return assignment.units
    .filter((unit) => unit.dinerId === dinerId)
    .reduce((sum, unit) => sum + unit.count, 0);
}

/** Units of a line nobody has claimed yet (always 0 unless counted by units). */
export function unitsLeft(item: Item, diners: readonly Diner[]): number {
  if (item.assignment.mode !== 'units') return 0;
  const claimed = diners.reduce((sum, diner) => sum + unitsOf(item.assignment, diner.id), 0);
  return Math.max(0, unitCount(item) - claimed);
}

/**
 * Sets how many units of a line a diner had, between 0 and the units still
 * free plus theirs. Starts counting by units if the line was split another way.
 */
export function setUnits(
  item: Item,
  dinerId: DinerId,
  count: number,
  diners: readonly Diner[],
): Assignment {
  const current = item.assignment.mode === 'units' ? item.assignment.units : [];
  const others = current.filter((unit) => unit.dinerId !== dinerId && unit.count > 0);
  const known = new Set(diners.map((diner) => diner.id));
  const taken = others
    .filter((unit) => known.has(unit.dinerId))
    .reduce((sum, unit) => sum + unit.count, 0);
  const clamped = Math.max(0, Math.min(Math.floor(count), unitCount(item) - taken));
  const units = diners.flatMap((diner) => {
    if (diner.id === dinerId) return clamped > 0 ? [{ dinerId, count: clamped }] : [];
    return others.filter((unit) => unit.dinerId === diner.id);
  });
  return { mode: 'units', units };
}

/** Switches a line to counting by units (nobody counted yet) or back to equal parts. */
export function toggleUnitMode(item: Item, diners: readonly Diner[]): Assignment {
  if (item.assignment.mode !== 'units') return { mode: 'units', units: [] };
  // Back to equal parts among whoever had some units.
  const ids = assignedDinerIds(item.assignment, diners);
  if (ids.length === 0) return { mode: 'unassigned' };
  if (ids.length === 1) return { mode: 'single', dinerId: ids[0]! };
  return { mode: 'shared', shares: ids.map((id) => ({ dinerId: id, weight: 1 })) };
}

/**
 * Adds a diner to an item or removes them from it, choosing the simplest
 * assignment for the result: nobody, one diner, or a shared split.
 *
 * Removing one diner from an "everyone" item leaves it shared among the rest.
 * Existing weights are kept for the diners who stay.
 */
export function toggleDiner(
  assignment: Assignment,
  dinerId: DinerId,
  diners: readonly Diner[],
): Assignment {
  const current = assignedDinerIds(assignment, diners);
  const next = current.includes(dinerId)
    ? current.filter((id) => id !== dinerId)
    : diners.map((diner) => diner.id).filter((id) => id === dinerId || current.includes(id));

  if (next.length === 0) return { mode: 'unassigned' };
  if (next.length === 1) return { mode: 'single', dinerId: next[0]! };

  const weights = new Map(
    assignment.mode === 'shared'
      ? assignment.shares.map((share) => [share.dinerId, share.weight] as const)
      : [],
  );
  return {
    mode: 'shared',
    shares: next.map((id) => ({ dinerId: id, weight: weights.get(id) ?? 1 })),
  };
}

/** Switches an item between "everyone" and unassigned. */
export function toggleEveryone(assignment: Assignment): Assignment {
  return assignment.mode === 'everyone' ? { mode: 'unassigned' } : { mode: 'everyone' };
}
