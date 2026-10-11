import { describe, expect, it } from 'vitest';
import { BillInputSchema, toBill } from '../src/bills/schema';

const input = {
  diners: [
    { id: 'ana', name: 'Ana', color: 'coral' },
    { id: 'ben', name: 'Ben', color: 'teal' },
    { id: 'cleo', name: 'Cleo', color: 'amber' },
  ],
  items: [{ name: 'Pizza', total: 1200 }],
};

describe('toBill groups', () => {
  it('keeps diners paying together', () => {
    const parsed = BillInputSchema.parse({
      ...input,
      groups: [{ id: 'g1', dinerIds: ['ana', 'ben'] }],
    });
    expect(toBill('b', parsed).groups).toEqual([{ id: 'g1', dinerIds: ['ana', 'ben'] }]);
  });

  it('drops groups that point at unknown diners', () => {
    const parsed = BillInputSchema.parse({
      ...input,
      groups: [{ id: 'g1', dinerIds: ['ana', 'ghost'] }],
    });
    expect(toBill('b', parsed).groups).toEqual([]);
  });

  it('leaves groups out when there are none', () => {
    expect(toBill('b', BillInputSchema.parse(input))).not.toHaveProperty('groups');
  });

  it('rejects a group of one', () => {
    expect(
      BillInputSchema.safeParse({ ...input, groups: [{ id: 'g1', dinerIds: ['ana'] }] }).success,
    ).toBe(false);
  });
});
