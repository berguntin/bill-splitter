import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { BILL_STORAGE_KEY, RECENT_NAMES_STORAGE_KEY, useBillStore } from '../bill';

function totals(store: ReturnType<typeof useBillStore>): number[] {
  return store.breakdown.diners.map((diner) => diner.total);
}

describe('useBillStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActivePinia(createPinia());
  });

  it('keeps the breakdown in sync with edits', () => {
    const store = useBillStore();
    const ana = store.addDiner('  Ana ')!;
    const ben = store.addDiner('Ben')!;
    const pizza = store.addItem({ name: 'Pizza', total: 1200 });

    expect(ana.name).toBe('Ana');
    expect(store.pendingItemIds).toEqual([pizza]);

    store.toggleEveryone(pizza);
    expect(totals(store)).toEqual([600, 600]);

    store.removeDiner(ben.id);
    expect(totals(store)).toEqual([1200]);
  });

  it('ignores blank names', () => {
    const store = useBillStore();
    expect(store.addDiner('   ')).toBeNull();
    expect(store.bill.diners).toEqual([]);
  });

  it('hands out distinct colors, reusing ones freed by removed diners', () => {
    const store = useBillStore();
    const [a, b] = [store.addDiner('A')!, store.addDiner('B')!];
    expect(a.color).not.toBe(b.color);

    store.removeDiner(a.id);
    expect(store.addDiner('C')!.color).toBe(a.color);
  });

  it('toggles diners on an item', () => {
    const store = useBillStore();
    const ana = store.addDiner('Ana')!;
    const ben = store.addDiner('Ben')!;
    const nachos = store.addItem({ name: 'Nachos', total: 900 });

    store.toggleDiner(nachos, ana.id);
    store.toggleDiner(nachos, ben.id);
    expect(totals(store)).toEqual([450, 450]);

    store.toggleDiner(nachos, ana.id);
    expect(totals(store)).toEqual([0, 900]);
  });

  it('undoes changes one step at a time', () => {
    const store = useBillStore();
    const ana = store.addDiner('Ana')!;
    const wine = store.addItem({ name: 'Wine', total: 2000 });
    store.toggleDiner(wine, ana.id);

    expect(store.canUndo).toBe(true);
    store.undo();
    expect(store.pendingItemIds).toEqual([wine]);
    store.undo();
    expect(store.bill.items).toEqual([]);
  });

  describe('paying together', () => {
    function table() {
      const store = useBillStore();
      const [ana, ben, cleo] = ['Ana', 'Ben', 'Cleo'].map((name) => store.addDiner(name)!);
      store.toggleEveryone(store.addItem({ name: 'Pizza', total: 1500 }));
      return { store, ana: ana!, ben: ben!, cleo: cleo! };
    }

    it('adds up a group and undoes it', () => {
      const { store, ana, ben } = table();

      const groupId = store.groupDiners([ana.id, ben.id])!;
      expect(store.payers).toEqual([
        expect.objectContaining({
          kind: 'group',
          groupId,
          dinerIds: [ana.id, ben.id],
          total: 1000,
        }),
        expect.objectContaining({ kind: 'diner', total: 500 }),
      ]);

      store.undo();
      expect(store.payers.map((payer) => payer.kind)).toEqual(['diner', 'diner', 'diner']);
    });

    it('separates a group, and the separation can be undone too', () => {
      const { store, ana, ben } = table();
      const groupId = store.groupDiners([ana.id, ben.id])!;

      store.ungroup(groupId);
      expect(store.payers).toHaveLength(3);

      store.undo();
      expect(store.payers[0]).toMatchObject({ kind: 'group', groupId });
    });

    it('ignores a group of one and forgets removed members', () => {
      const { store, ana, ben } = table();
      expect(store.groupDiners([ana.id])).toBeNull();
      expect(store.bill.groups).toBeUndefined();

      store.groupDiners([ana.id, ben.id]);
      store.removeDiner(ben.id);
      expect(store.bill.groups).toEqual([]);
    });
  });

  it('splits multi-quantity lines into units in place', () => {
    const store = useBillStore();
    store.addItem({ name: 'Bread', total: 200 });
    const beers = store.addItem({ name: 'Beer', total: 750, quantity: 3 });
    store.addItem({ name: 'Water', total: 300 });

    store.splitItem(beers);

    expect(store.bill.items.map((item) => item.name)).toEqual([
      'Bread',
      'Beer',
      'Beer',
      'Beer',
      'Water',
    ]);
    expect(store.bill.items.slice(1, 4).every((item) => item.total === 250)).toBe(true);
  });

  it('gives every unclaimed item to the whole table', () => {
    const store = useBillStore();
    const ana = store.addDiner('Ana')!;
    store.addDiner('Ben');
    const steak = store.addItem({ name: 'Steak', total: 2000 });
    store.addItem({ name: 'Water', total: 400 });
    store.toggleDiner(steak, ana.id);

    store.assignRestToEveryone();

    expect(store.pendingItemIds).toEqual([]);
    expect(totals(store)).toEqual([2200, 200]);
  });

  it('sets and clears the tip', () => {
    const store = useBillStore();
    store.addDiner('Ana');
    const menu = store.addItem({ name: 'Menu', total: 3000 });
    store.toggleEveryone(menu);

    store.setTip({ type: 'percent', basisPoints: 1000 });
    expect(store.tip).toEqual({ type: 'percent', basisPoints: 1000 });
    expect(store.breakdown.totals.grand).toBe(3300);

    store.setTip({ type: 'amount', amount: 500 });
    expect(store.bill.adjustments).toHaveLength(1);
    expect(store.breakdown.totals.grand).toBe(3500);

    store.setTip(null);
    expect(store.tip).toBeNull();
  });

  it('stores and clears the receipt total', () => {
    const store = useBillStore();
    store.addItem({ name: 'Menu', total: 3000 });

    store.setReceiptTotal(3200);
    expect(store.breakdown.receiptDifference).toBe(200);

    store.setReceiptTotal(null);
    expect('receiptTotal' in store.bill).toBe(false);
  });

  it('persists the bill and recent names across reloads', async () => {
    const first = useBillStore();
    first.addDiner('Ana');
    first.addItem({ name: 'Paella', total: 1800 });
    await nextTick();

    expect(window.localStorage.getItem(BILL_STORAGE_KEY)).toContain('Paella');
    expect(JSON.parse(window.localStorage.getItem(RECENT_NAMES_STORAGE_KEY)!)).toEqual(['Ana']);

    setActivePinia(createPinia());
    const second = useBillStore();
    expect(second.bill.items.map((item) => item.name)).toEqual(['Paella']);
    expect(second.recentNames).toEqual(['Ana']);
  });

  it('starts fresh when the stored bill is corrupt', () => {
    window.localStorage.setItem(BILL_STORAGE_KEY, '{"not":"a bill"}');
    const store = useBillStore();
    expect(store.bill.items).toEqual([]);
  });

  it('starts a fresh bill on reset and drops the undo history', () => {
    const store = useBillStore();
    const previousId = store.bill.id;
    store.addItem({ name: 'Water', total: 200 });

    store.reset();

    expect(store.bill.id).not.toBe(previousId);
    expect(store.bill.items).toEqual([]);
    expect(store.canUndo).toBe(false);
  });

  describe('scanned receipts', () => {
    const receipt = {
      merchant: 'Casa Lola',
      currency: 'EUR',
      lines: [
        { name: 'Caña', quantity: 2, total: 480, confidence: 'high' as const },
        { name: 'Pulpo', quantity: 1, total: 1850, confidence: 'low' as const },
      ],
      total: 2330,
    };

    it('replaces the bill with the scanned lines', () => {
      const store = useBillStore();
      store.addItem({ name: 'Old item', total: 100 });

      store.loadScannedReceipt(receipt);

      expect(store.isScanned).toBe(true);
      expect(store.bill.merchant).toBe('Casa Lola');
      expect(store.bill.receiptTotal).toBe(2330);
      expect(store.bill.items.map((item) => [item.name, item.total, item.needsReview])).toEqual([
        ['Caña', 480, undefined],
        ['Pulpo', 1850, true],
      ]);
      expect(store.canUndo).toBe(false);
    });

    it('clears the review flag when a line is confirmed or corrected', () => {
      const store = useBillStore();
      store.loadScannedReceipt({
        ...receipt,
        lines: receipt.lines.map((line) => ({ ...line, confidence: 'low' as const })),
      });
      const [cana, pulpo] = store.bill.items;

      store.confirmItem(cana!.id);
      store.updateItemTotal(pulpo!.id, 1950);

      expect(store.bill.items.every((item) => !item.needsReview)).toBe(true);
      expect(store.bill.items[1]?.total).toBe(1950);
      expect(store.breakdown.receiptDifference).toBe(-100);
    });
  });
});
