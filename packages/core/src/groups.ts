import type { DinerBreakdown, Breakdown } from './split';
import type { Bill, Cents, DinerGroup, DinerId } from './types';

/**
 * Makes the given diners pay together. Groups they already belong to are
 * merged into the new one, so selecting "Ana & Ben" and Cleo yields one group
 * of three. Groups left with fewer than two members disappear.
 */
export function groupDiners(
  groups: readonly DinerGroup[],
  dinerIds: readonly DinerId[],
  groupId: string,
): DinerGroup[] {
  const selected = new Set(dinerIds);
  for (const group of groups) {
    if (group.dinerIds.some((id) => selected.has(id))) {
      for (const id of group.dinerIds) selected.add(id);
    }
  }
  if (selected.size < 2) return groups.map((group) => ({ ...group }));
  const others = groups.filter((group) => !group.dinerIds.some((id) => selected.has(id)));
  return [...others.map((group) => ({ ...group })), { id: groupId, dinerIds: [...selected] }];
}

/** Splits a group so each member pays on their own again. */
export function ungroup(groups: readonly DinerGroup[], groupId: string): DinerGroup[] {
  return groups.filter((group) => group.id !== groupId).map((group) => ({ ...group }));
}

/** Drops diners that no longer exist, and the groups left with fewer than two members. */
export function pruneGroups(
  groups: readonly DinerGroup[],
  dinerIds: readonly DinerId[],
): DinerGroup[] {
  const existing = new Set(dinerIds);
  return groups
    .map((group) => ({ ...group, dinerIds: group.dinerIds.filter((id) => existing.has(id)) }))
    .filter((group) => group.dinerIds.length >= 2);
}

/** One line of "who pays what": a diner on their own, or a group paying together. */
export type Payer =
  | { kind: 'diner'; dinerId: DinerId; total: Cents; breakdown: DinerBreakdown }
  | {
      kind: 'group';
      groupId: string;
      dinerIds: DinerId[];
      total: Cents;
      members: DinerBreakdown[];
    };

/**
 * Lists who pays what, in diner order: a group takes the place of its first
 * member. A group's total is the sum of its members' totals, so the payers'
 * totals still add up to the diners' totals, to the cent.
 */
export function payers(bill: Bill, breakdown: Breakdown): Payer[] {
  const groups = pruneGroups(
    bill.groups ?? [],
    breakdown.diners.map((diner) => diner.dinerId),
  );
  const groupOf = new Map<DinerId, DinerGroup>();
  for (const group of groups) for (const id of group.dinerIds) groupOf.set(id, group);
  const byDiner = new Map(breakdown.diners.map((diner) => [diner.dinerId, diner]));

  const result: Payer[] = [];
  const placed = new Set<string>();
  for (const diner of breakdown.diners) {
    const group = groupOf.get(diner.dinerId);
    if (!group) {
      result.push({ kind: 'diner', dinerId: diner.dinerId, total: diner.total, breakdown: diner });
      continue;
    }
    if (placed.has(group.id)) continue;
    placed.add(group.id);
    // Members in diner order, whatever order they were selected in.
    const members = breakdown.diners.filter((candidate) =>
      group.dinerIds.includes(candidate.dinerId),
    );
    result.push({
      kind: 'group',
      groupId: group.id,
      dinerIds: members.map((member) => member.dinerId),
      total: members.reduce((sum, member) => sum + byDiner.get(member.dinerId)!.total, 0),
      members,
    });
  }
  return result;
}
