import { describe, expect, it } from 'vitest';
import { computeBreakdown, groupDiners, payers, pruneGroups, ungroup } from '../src';
import { ana, ben, bill, cleo, item, tip } from './fixtures';

describe('groupDiners', () => {
  it('creates a group from two diners', () => {
    expect(groupDiners([], ['ana', 'ben'], 'g1')).toEqual([{ id: 'g1', dinerIds: ['ana', 'ben'] }]);
  });

  it('merges groups the selected diners already belong to', () => {
    const groups = [
      { id: 'g1', dinerIds: ['ana', 'ben'] },
      { id: 'g2', dinerIds: ['dan', 'eve'] },
    ];
    expect(groupDiners(groups, ['ben', 'cleo'], 'g3')).toEqual([
      { id: 'g2', dinerIds: ['dan', 'eve'] },
      { id: 'g3', dinerIds: ['ben', 'cleo', 'ana'] },
    ]);
  });

  it('does nothing for fewer than two diners', () => {
    expect(groupDiners([], ['ana'], 'g1')).toEqual([]);
  });

  it('does not change its input', () => {
    const groups = [{ id: 'g1', dinerIds: ['ana', 'ben'] }];
    groupDiners(groups, ['ben', 'cleo'], 'g2');
    expect(groups).toEqual([{ id: 'g1', dinerIds: ['ana', 'ben'] }]);
  });
});

describe('ungroup and pruneGroups', () => {
  it('removes a group', () => {
    expect(ungroup([{ id: 'g1', dinerIds: ['ana', 'ben'] }], 'g1')).toEqual([]);
  });

  it('forgets removed diners and groups left alone', () => {
    const groups = [
      { id: 'g1', dinerIds: ['ana', 'ben', 'cleo'] },
      { id: 'g2', dinerIds: ['dan', 'eve'] },
    ];
    expect(pruneGroups(groups, ['ana', 'ben', 'dan'])).toEqual([
      { id: 'g1', dinerIds: ['ana', 'ben'] },
    ]);
  });
});

describe('payers', () => {
  const split = bill({
    diners: [ana, ben, cleo],
    items: [
      item('pizza', 1000, { mode: 'everyone' }),
      item('wine', 1501, { mode: 'single', dinerId: 'cleo' }),
    ],
    adjustments: [tip({ type: 'percent', basisPoints: 1000 })],
  });

  it('lists everyone on their own without groups', () => {
    const result = payers(split, computeBreakdown(split));
    expect(result.map((payer) => payer.kind)).toEqual(['diner', 'diner', 'diner']);
  });

  it('adds up a group in place of its first member, keeping the grand total', () => {
    const grouped = { ...split, groups: [{ id: 'g1', dinerIds: ['cleo', 'ana'] }] };
    const breakdown = computeBreakdown(grouped);
    const result = payers(grouped, breakdown);

    const [first, second] = result;
    expect(first).toMatchObject({ kind: 'group', groupId: 'g1', dinerIds: ['ana', 'cleo'] });
    expect(second).toMatchObject({ kind: 'diner', dinerId: 'ben' });
    const byId = new Map(breakdown.diners.map((diner) => [diner.dinerId, diner.total]));
    expect(first!.total).toBe(byId.get('ana')! + byId.get('cleo')!);
    expect(result.reduce((sum, payer) => sum + payer.total, 0)).toBe(
      breakdown.totals.grand - breakdown.unassigned.total,
    );
  });

  it('ignores groups whose members were removed', () => {
    const grouped = {
      ...split,
      diners: [ana, ben],
      groups: [{ id: 'g1', dinerIds: ['ana', 'cleo'] }],
    };
    expect(payers(grouped, computeBreakdown(grouped)).map((payer) => payer.kind)).toEqual([
      'diner',
      'diner',
    ]);
  });
});
