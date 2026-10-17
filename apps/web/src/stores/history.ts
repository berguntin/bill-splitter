import { computeBreakdown, type Bill } from '@bill-splitter/core';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { loadJson, saveJson } from '@/lib/storage';
import { useBillStore } from './bill';
import { useShareStore } from './share';

export const HISTORY_STORAGE_KEY = 'bill-splitter/history/v1';
/** Bills kept on this device; older ones are dropped. */
export const MAX_RECENT_BILLS = 20;
/** Saving waits for a pause in editing. */
export const SAVE_DELAY_MS = 500;

export interface RecentBill {
  bill: Bill;
  /** ISO 8601 time of the last change. */
  updatedAt: string;
}

function isRecentBillList(value: unknown): value is RecentBill[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as RecentBill).updatedAt === 'string' &&
        typeof (entry as RecentBill).bill?.id === 'string' &&
        Array.isArray((entry as RecentBill).bill.items),
    )
  );
}

function hasContent(bill: Bill): boolean {
  return bill.items.length > 0 || bill.diners.length > 0;
}

/**
 * The bills split on this device, newest first, kept in `localStorage`
 * (never sent anywhere). The current bill is saved as it changes, so
 * starting a new one never loses the previous one. Receipt photos are not kept.
 */
export const useHistoryStore = defineStore('history', () => {
  const billStore = useBillStore();
  const shareStore = useShareStore();
  const entries = ref<RecentBill[]>(loadJson(HISTORY_STORAGE_KEY, isRecentBillList) ?? []);

  watch(entries, (value) => saveJson(HISTORY_STORAGE_KEY, value), { deep: true });

  function save(bill: Bill): void {
    if (!hasContent(bill)) return;
    const others = entries.value.filter((entry) => entry.bill.id !== bill.id);
    const next = [
      { bill: JSON.parse(JSON.stringify(bill)) as Bill, updatedAt: new Date().toISOString() },
      ...others,
    ];
    for (const dropped of next.slice(MAX_RECENT_BILLS)) shareStore.forget(dropped.bill.id);
    entries.value = next.slice(0, MAX_RECENT_BILLS);
  }

  // Keep the current bill's entry up to date, after a short pause in editing.
  let timer: ReturnType<typeof setTimeout> | undefined;
  watch(
    () => billStore.bill,
    (bill) => {
      clearTimeout(timer);
      timer = setTimeout(() => save(bill), SAVE_DELAY_MS);
    },
    { deep: true },
  );
  // Save straight away when leaving the page.
  window.addEventListener('pagehide', () => {
    clearTimeout(timer);
    save(billStore.bill);
  });

  /** Recent bills other than the one open now. */
  const recent = computed(() =>
    entries.value
      .filter((entry) => entry.bill.id !== billStore.bill.id)
      .map((entry) => ({
        ...entry,
        total: computeBreakdown(entry.bill).totals.grand,
        shared: shareStore.isBillShared(entry.bill.id),
      })),
  );

  /** Opens a recent bill; the one open now stays in the list. */
  function open(id: string): boolean {
    const entry = entries.value.find((candidate) => candidate.bill.id === id);
    if (!entry) return false;
    clearTimeout(timer);
    save(billStore.bill);
    billStore.restore(entry.bill);
    return true;
  }

  /** Removes a recent bill; returns it so the removal can be undone. */
  function remove(id: string): RecentBill | null {
    const entry = entries.value.find((candidate) => candidate.bill.id === id) ?? null;
    if (!entry) return null;
    entries.value = entries.value.filter((candidate) => candidate !== entry);
    return entry;
  }

  /** Puts back a bill removed by mistake, in its place by date. */
  function putBack(entry: RecentBill): void {
    entries.value = [...entries.value, entry]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_RECENT_BILLS);
  }

  return { entries, recent, open, remove, putBack, save };
});
