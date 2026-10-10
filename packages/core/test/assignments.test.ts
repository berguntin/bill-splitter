import { describe, expect, it } from 'vitest';
import { assignedDinerIds, toggleDiner, toggleEveryone, type Assignment } from '../src';
import { ana, ben, cleo } from './fixtures';

const diners = [ana, ben, cleo];

describe('assignedDinerIds', () => {
  it.each<[Assignment, string[]]>([
    [{ mode: 'unassigned' }, []],
    [{ mode: 'everyone' }, ['ana', 'ben', 'cleo']],
    [{ mode: 'single', dinerId: 'ben' }, ['ben']],
    [{ mode: 'single', dinerId: 'ghost' }, []],
    [
      {
        mode: 'shared',
        shares: [
          { dinerId: 'cleo', weight: 1 },
          { dinerId: 'ana', weight: 2 },
          { dinerId: 'ben', weight: 0 },
        ],
      },
      ['ana', 'cleo'],
    ],
  ])('resolves %j', (assignment, expected) => {
    expect(assignedDinerIds(assignment, diners)).toEqual(expected);
  });
});

describe('toggleDiner', () => {
  it('assigns an unassigned item to a single diner', () => {
    expect(toggleDiner({ mode: 'unassigned' }, 'ana', diners)).toEqual({
      mode: 'single',
      dinerId: 'ana',
    });
  });

  it('turns a single item into a shared one, in the diners order', () => {
    expect(toggleDiner({ mode: 'single', dinerId: 'cleo' }, 'ana', diners)).toEqual({
      mode: 'shared',
      shares: [
        { dinerId: 'ana', weight: 1 },
        { dinerId: 'cleo', weight: 1 },
      ],
    });
  });

  it('goes back to single and then unassigned when diners are removed', () => {
    const shared: Assignment = {
      mode: 'shared',
      shares: [
        { dinerId: 'ana', weight: 1 },
        { dinerId: 'ben', weight: 1 },
      ],
    };
    const single = toggleDiner(shared, 'ana', diners);
    expect(single).toEqual({ mode: 'single', dinerId: 'ben' });
    expect(toggleDiner(single, 'ben', diners)).toEqual({ mode: 'unassigned' });
  });

  it('keeps existing weights for the diners who stay', () => {
    const shared: Assignment = {
      mode: 'shared',
      shares: [
        { dinerId: 'ana', weight: 2 },
        { dinerId: 'ben', weight: 1 },
      ],
    };
    expect(toggleDiner(shared, 'cleo', diners)).toEqual({
      mode: 'shared',
      shares: [
        { dinerId: 'ana', weight: 2 },
        { dinerId: 'ben', weight: 1 },
        { dinerId: 'cleo', weight: 1 },
      ],
    });
  });

  it('leaves an "everyone" item shared among the rest when one diner is removed', () => {
    expect(toggleDiner({ mode: 'everyone' }, 'ben', diners)).toEqual({
      mode: 'shared',
      shares: [
        { dinerId: 'ana', weight: 1 },
        { dinerId: 'cleo', weight: 1 },
      ],
    });
  });
});

describe('toggleEveryone', () => {
  it('switches between everyone and unassigned', () => {
    expect(toggleEveryone({ mode: 'single', dinerId: 'ana' })).toEqual({ mode: 'everyone' });
    expect(toggleEveryone({ mode: 'everyone' })).toEqual({ mode: 'unassigned' });
  });
});
