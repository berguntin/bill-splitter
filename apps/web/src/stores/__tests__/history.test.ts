import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { useBillStore } from '../bill';
import { HISTORY_STORAGE_KEY, MAX_RECENT_BILLS, SAVE_DELAY_MS, useHistoryStore } from '../history';

async function settle(): Promise<void> {
  await nextTick();
  await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
}

describe('useHistoryStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the bill in progress, and lists it once another one starts', async () => {
    const bill = useBillStore();
    const history = useHistoryStore();
    bill.addItem({ name: 'Pizza', total: 1200 });
    await settle();
    expect(history.recent).toEqual([]);

    bill.reset();
    bill.addItem({ name: 'Wine', total: 1800 });
    await settle();

    expect(history.recent.map((entry) => entry.bill.items[0]!.name)).toEqual(['Pizza']);
    expect(history.recent[0]!.total).toBe(1200);
    expect(JSON.parse(window.localStorage.getItem(HISTORY_STORAGE_KEY)!)).toHaveLength(2);
  });

  it('opens a recent bill as it was, keeping the current one too', async () => {
    const bill = useBillStore();
    const history = useHistoryStore();
    bill.addDiner('Ana');
    bill.addItem({ name: 'Pizza', total: 1200 });
    await settle();
    const first = bill.bill.id;
    bill.reset();
    bill.addItem({ name: 'Wine', total: 1800 });

    expect(history.open(first)).toBe(true);

    expect(bill.bill.id).toBe(first);
    expect(bill.bill.diners.map((diner) => diner.name)).toEqual(['Ana']);
    expect(bill.canUndo).toBe(false);
    expect(history.recent.map((entry) => entry.bill.items[0]!.name)).toEqual(['Wine']);
  });

  it('ignores empty bills and keeps only the latest ones', async () => {
    const bill = useBillStore();
    const history = useHistoryStore();
    for (let index = 0; index <= MAX_RECENT_BILLS + 2; index += 1) {
      bill.reset();
      await settle();
      bill.addItem({ name: `Item ${index}`, total: 100 });
      await settle();
    }
    expect(history.entries).toHaveLength(MAX_RECENT_BILLS);
    expect(history.entries[0]!.bill.items[0]!.name).toBe(`Item ${MAX_RECENT_BILLS + 2}`);
  });

  it('removes a bill and puts it back', async () => {
    const bill = useBillStore();
    const history = useHistoryStore();
    bill.addItem({ name: 'Pizza', total: 1200 });
    await settle();
    bill.reset();

    const removed = history.remove(history.recent[0]!.bill.id)!;
    expect(history.recent).toEqual([]);
    history.putBack(removed);
    expect(history.recent).toHaveLength(1);
  });
});
