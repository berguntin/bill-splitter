import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useBillStore } from '../bill';

describe('useBillStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('keeps the breakdown in sync with edits', () => {
    const store = useBillStore();
    const ana = store.addDiner('  Ana ');
    const ben = store.addDiner('Ben');
    const pizza = store.addItem('Pizza', 1200);

    expect(ana.name).toBe('Ana');
    expect(store.breakdown.unassigned.total).toBe(1200);

    store.assign(pizza, { mode: 'everyone' });
    expect(store.breakdown.diners.map((diner) => diner.total)).toEqual([600, 600]);

    store.removeDiner(ben.id);
    expect(store.breakdown.diners.map((diner) => diner.total)).toEqual([1200]);
  });

  it('hands out distinct colors to diners', () => {
    const store = useBillStore();
    const colors = ['A', 'B', 'C'].map((name) => store.addDiner(name).color);
    expect(new Set(colors).size).toBe(3);
  });

  it('starts a fresh bill on reset', () => {
    const store = useBillStore();
    const previousId = store.bill.id;
    store.addItem('Water', 200);

    store.reset();

    expect(store.bill.id).not.toBe(previousId);
    expect(store.bill.items).toEqual([]);
  });
});
