import { describe, expect, it } from 'vitest';
import {
  computeBreakdown,
  setUnits,
  toggleUnitMode,
  unitsLeft,
  unitsOf,
  type Assignment,
} from '../src';
import { ana, ben, bill, cleo, item, tip } from './fixtures';

const diners = [ana, ben, cleo];

function beers(assignment: Assignment, total = 1000) {
  return item('beer', total, assignment, 5);
}

describe('splitting a line by units', () => {
  it('charges each diner for the units they had', () => {
    const line = beers({
      mode: 'units',
      units: [
        { dinerId: 'ana', count: 1 },
        { dinerId: 'ben', count: 2 },
        { dinerId: 'cleo', count: 2 },
      ],
    });
    const breakdown = computeBreakdown(bill({ diners, items: [line] }));

    expect(breakdown.diners.map((diner) => diner.total)).toEqual([200, 400, 400]);
    expect(breakdown.diners[1]!.items[0]).toMatchObject({ units: 2, weight: 2, totalWeight: 5 });
    expect(breakdown.unassigned.itemIds).toEqual([]);
  });

  it('keeps units nobody claimed unassigned, to the cent', () => {
    const line = beers({ mode: 'units', units: [{ dinerId: 'ana', count: 2 }] }, 999);
    const breakdown = computeBreakdown(
      bill({ diners, items: [line], adjustments: [tip({ type: 'percent', basisPoints: 1000 })] }),
    );

    expect(breakdown.unassigned.itemIds).toEqual(['beer']);
    expect(breakdown.diners[0]!.itemsSubtotal + breakdown.unassigned.itemsSubtotal).toBe(999);
    const sum =
      breakdown.diners.reduce((total, diner) => total + diner.total, 0) +
      breakdown.unassigned.total;
    expect(sum).toBe(breakdown.totals.grand);
  });

  it('ignores removed diners and bad counts', () => {
    const line = beers({
      mode: 'units',
      units: [
        { dinerId: 'ghost', count: 3 },
        { dinerId: 'ana', count: -1 },
        { dinerId: 'ben', count: 1.5 },
      ],
    });
    const breakdown = computeBreakdown(bill({ diners, items: [line] }));
    expect(breakdown.diners.every((diner) => diner.total === 0)).toBe(true);
    expect(breakdown.unassigned.itemsSubtotal).toBe(1000);
  });
});

describe('setUnits', () => {
  const line = beers({ mode: 'unassigned' });

  it('counts units per diner, in diner order, never above what is left', () => {
    let assignment = setUnits(line, 'ben', 2, diners);
    assignment = setUnits({ ...line, assignment }, 'ana', 9, diners);

    expect(assignment).toEqual({
      mode: 'units',
      units: [
        { dinerId: 'ana', count: 3 },
        { dinerId: 'ben', count: 2 },
      ],
    });
    expect(unitsLeft({ ...line, assignment }, diners)).toBe(0);
    expect(unitsOf(assignment, 'ana')).toBe(3);
  });

  it('drops diners set to zero', () => {
    const counted = { ...line, assignment: setUnits(line, 'ana', 2, diners) };
    expect(setUnits(counted, 'ana', 0, diners)).toEqual({ mode: 'units', units: [] });
    expect(unitsLeft(counted, diners)).toBe(3);
  });
});

describe('toggleUnitMode', () => {
  it('starts counting from scratch, and goes back to equal parts among those counted', () => {
    const line = beers({ mode: 'everyone' });
    const counting = toggleUnitMode(line, diners);
    expect(counting).toEqual({ mode: 'units', units: [] });

    const counted = setUnits({ ...line, assignment: counting }, 'ana', 1, diners);
    const both = setUnits({ ...line, assignment: counted }, 'cleo', 3, diners);
    expect(toggleUnitMode({ ...line, assignment: both }, diners)).toEqual({
      mode: 'shared',
      shares: [
        { dinerId: 'ana', weight: 1 },
        { dinerId: 'cleo', weight: 1 },
      ],
    });
    expect(toggleUnitMode({ ...line, assignment: counting }, diners)).toEqual({
      mode: 'unassigned',
    });
  });
});
