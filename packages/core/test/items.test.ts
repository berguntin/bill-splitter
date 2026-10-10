import { describe, expect, it } from 'vitest';
import { splitIntoUnits } from '../src';
import { item } from './fixtures';

describe('splitIntoUnits', () => {
  it('returns single-unit lines unchanged', () => {
    const coffee = item('coffee', 150, { mode: 'unassigned' });
    expect(splitIntoUnits(coffee)).toEqual([coffee]);
  });

  it('creates one line per unit with derived ids', () => {
    const beers = item('beer', 750, { mode: 'everyone' }, 3);
    const units = splitIntoUnits(beers);

    expect(units.map((unit) => unit.id)).toEqual(['beer#1', 'beer#2', 'beer#3']);
    expect(units.every((unit) => unit.quantity === 1 && unit.total === 250)).toBe(true);
    expect(units[0]?.assignment).toEqual({ mode: 'everyone' });
  });

  it('preserves the line total when it is not an exact multiple', () => {
    const units = splitIntoUnits(item('tapas', 1000, { mode: 'unassigned' }, 3));
    expect(units.map((unit) => unit.total)).toEqual([334, 333, 333]);
  });

  it('leaves fractional quantities (e.g. weighed goods) untouched', () => {
    const cheese = item('cheese', 640, { mode: 'unassigned' }, 1.5);
    expect(splitIntoUnits(cheese)).toEqual([cheese]);
  });
});
