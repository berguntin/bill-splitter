import type { Assignment, Diner, DinerId } from './types';

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
  }
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
