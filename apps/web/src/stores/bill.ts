import {
  computeBreakdown,
  splitIntoUnits,
  toggleDiner as toggleDinerIn,
  toggleEveryone as toggleEveryoneIn,
  type Adjustment,
  type Bill,
  type Cents,
  type Diner,
  type DinerId,
  type Item,
  type ItemId,
} from '@bill-splitter/core';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { DINER_COLORS } from '@/lib/palette';
import { loadJson, saveJson } from '@/lib/storage';

export const BILL_STORAGE_KEY = 'bill-splitter/current-bill/v1';
export const RECENT_NAMES_STORAGE_KEY = 'bill-splitter/recent-names/v1';

const MAX_UNDO_STEPS = 50;
const MAX_RECENT_NAMES = 8;
const TIP_ID = 'tip';

export type Tip = { type: 'percent'; basisPoints: number } | { type: 'amount'; amount: Cents };

function createId(): string {
  return crypto.randomUUID();
}

function emptyBill(): Bill {
  return { id: createId(), currency: 'EUR', diners: [], items: [], adjustments: [] };
}

function isBill(value: unknown): value is Bill {
  if (typeof value !== 'object' || value === null) return false;
  const bill = value as Partial<Bill>;
  return (
    typeof bill.id === 'string' &&
    typeof bill.currency === 'string' &&
    Array.isArray(bill.diners) &&
    Array.isArray(bill.items) &&
    Array.isArray(bill.adjustments)
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Holds the bill being split. All money logic lives in `@bill-splitter/core`;
 * this store only edits the bill, keeps an undo history and persists it.
 */
export const useBillStore = defineStore('bill', () => {
  const bill = ref<Bill>(loadJson(BILL_STORAGE_KEY, isBill) ?? emptyBill());
  const recentNames = ref<string[]>(loadJson(RECENT_NAMES_STORAGE_KEY, isStringArray) ?? []);
  const history = ref<Bill[]>([]);

  watch(bill, (value) => saveJson(BILL_STORAGE_KEY, value), { deep: true });
  watch(recentNames, (value) => saveJson(RECENT_NAMES_STORAGE_KEY, value), { deep: true });

  const breakdown = computed(() => computeBreakdown(bill.value));
  const canUndo = computed(() => history.value.length > 0);
  const hasProgress = computed(() => bill.value.items.length > 0 || bill.value.diners.length > 0);
  const pendingItemIds = computed(() => breakdown.value.unassigned.itemIds);
  const tip = computed<Tip | null>(() => {
    const adjustment = bill.value.adjustments.find((candidate) => candidate.id === TIP_ID);
    return adjustment ? adjustment.value : null;
  });

  /** Applies a change and records the previous state so it can be undone. */
  function commit(change: (draft: Bill) => void): void {
    history.value.push(clone(bill.value));
    if (history.value.length > MAX_UNDO_STEPS) history.value.shift();
    change(bill.value);
  }

  function undo(): void {
    const previous = history.value.pop();
    if (previous) bill.value = previous;
  }

  function reset(): void {
    bill.value = emptyBill();
    history.value = [];
  }

  function findItem(id: ItemId): Item | undefined {
    return bill.value.items.find((item) => item.id === id);
  }

  function setReceiptTotal(total: Cents | null): void {
    commit((draft) => {
      if (total === null) delete draft.receiptTotal;
      else draft.receiptTotal = total;
    });
  }

  function addItem(input: { name: string; total: Cents; quantity?: number }): ItemId {
    const quantity = input.quantity ?? 1;
    const item: Item = {
      id: createId(),
      name: input.name.trim(),
      quantity,
      unitPrice: Math.round(input.total / quantity),
      total: input.total,
      assignment: { mode: 'unassigned' },
    };
    commit((draft) => {
      draft.items.push(item);
    });
    return item.id;
  }

  function removeItem(id: ItemId): void {
    commit((draft) => {
      draft.items = draft.items.filter((item) => item.id !== id);
    });
  }

  /** Replaces a multi-quantity line with one line per unit, in place. */
  function splitItem(id: ItemId): void {
    const index = bill.value.items.findIndex((item) => item.id === id);
    const item = bill.value.items[index];
    if (!item || splitIntoUnits(item).length === 1) return;
    commit((draft) => {
      draft.items.splice(index, 1, ...splitIntoUnits(item));
    });
  }

  function addDiner(name: string): Diner | null {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const used = new Set(bill.value.diners.map((diner) => diner.color));
    const color =
      DINER_COLORS.find((candidate) => !used.has(candidate)) ??
      DINER_COLORS[bill.value.diners.length % DINER_COLORS.length]!;
    const diner: Diner = { id: createId(), name: trimmed, color };
    commit((draft) => {
      draft.diners.push(diner);
    });
    rememberName(trimmed);
    return diner;
  }

  function removeDiner(id: DinerId): void {
    // Items assigned only to this diner fall back to "unassigned" in the engine.
    commit((draft) => {
      draft.diners = draft.diners.filter((diner) => diner.id !== id);
    });
  }

  function toggleDiner(itemId: ItemId, dinerId: DinerId): void {
    if (!findItem(itemId)) return;
    commit((draft) => {
      const item = draft.items.find((candidate) => candidate.id === itemId)!;
      item.assignment = toggleDinerIn(item.assignment, dinerId, draft.diners);
    });
  }

  function toggleEveryone(itemId: ItemId): void {
    if (!findItem(itemId)) return;
    commit((draft) => {
      const item = draft.items.find((candidate) => candidate.id === itemId)!;
      item.assignment = toggleEveryoneIn(item.assignment);
    });
  }

  /** Splits every item nobody has claimed among the whole table. */
  function assignRestToEveryone(): void {
    const pending = new Set(pendingItemIds.value);
    if (pending.size === 0) return;
    commit((draft) => {
      for (const item of draft.items) {
        if (pending.has(item.id)) item.assignment = { mode: 'everyone' };
      }
    });
  }

  function setTip(value: Tip | null): void {
    commit((draft) => {
      draft.adjustments = draft.adjustments.filter((adjustment) => adjustment.id !== TIP_ID);
      if (value === null) return;
      const adjustment: Adjustment = {
        id: TIP_ID,
        kind: 'tip',
        value,
        distribution: 'proportional',
      };
      draft.adjustments.push(adjustment);
    });
  }

  function rememberName(name: string): void {
    const others = recentNames.value.filter(
      (candidate) => candidate.toLowerCase() !== name.toLowerCase(),
    );
    recentNames.value = [name, ...others].slice(0, MAX_RECENT_NAMES);
  }

  return {
    bill,
    breakdown,
    canUndo,
    hasProgress,
    pendingItemIds,
    recentNames,
    tip,
    undo,
    reset,
    setReceiptTotal,
    addItem,
    removeItem,
    splitItem,
    addDiner,
    removeDiner,
    toggleDiner,
    toggleEveryone,
    assignRestToEveryone,
    setTip,
  };
});
