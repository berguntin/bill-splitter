import {
  computeBreakdown,
  groupDiners as groupDinersIn,
  payers as payersOf,
  pruneGroups,
  setUnits as setUnitsIn,
  ungroup as ungroupIn,
  toggleDiner as toggleDinerIn,
  toggleEveryone as toggleEveryoneIn,
  toggleUnitMode as toggleUnitModeIn,
  type Adjustment,
  type Bill,
  type Cents,
  type Diner,
  type DinerGroup,
  type DinerId,
  type Item,
  type ItemId,
  type Payment,
  type ScannedReceipt,
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
  /** Who pays what: diners on their own and groups paying together. */
  const payers = computed(() => payersOf(bill.value, breakdown.value));
  const canUndo = computed(() => history.value.length > 0);
  const isScanned = computed(() => bill.value.source === 'scan');
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

  function updateItemTotal(id: ItemId, total: Cents): void {
    if (!findItem(id)) return;
    commit((draft) => {
      const item = draft.items.find((candidate) => candidate.id === id)!;
      item.total = total;
      item.unitPrice = Math.round(total / item.quantity);
      delete item.needsReview;
    });
  }

  /** Marks a line read with low confidence as checked by a person. */
  function confirmItem(id: ItemId): void {
    if (!findItem(id)?.needsReview) return;
    commit((draft) => {
      delete draft.items.find((candidate) => candidate.id === id)!.needsReview;
    });
  }

  /** Replaces the current bill with one built from a scanned receipt. */
  function loadScannedReceipt(receipt: ScannedReceipt): void {
    const next: Bill = {
      ...emptyBill(),
      source: 'scan',
      currency: receipt.currency,
      items: receipt.lines.map((line) => {
        const item: Item = {
          id: createId(),
          name: line.name,
          quantity: line.quantity,
          unitPrice: Math.round(line.total / line.quantity),
          total: line.total,
          assignment: { mode: 'unassigned' },
        };
        if (line.confidence === 'low') item.needsReview = true;
        return item;
      }),
    };
    if (receipt.total !== null) next.receiptTotal = receipt.total;
    if (receipt.merchant) next.merchant = receipt.merchant;
    bill.value = next;
    history.value = [];
  }

  function removeItem(id: ItemId): void {
    commit((draft) => {
      draft.items = draft.items.filter((item) => item.id !== id);
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
      if (draft.groups) {
        draft.groups = pruneGroups(
          draft.groups,
          draft.diners.map((diner) => diner.id),
        );
      }
    });
  }

  /** Makes these diners pay together, merging any groups they are already in. */
  function groupDiners(dinerIds: DinerId[]): string | null {
    const id = createId();
    const groups = groupDinersIn(bill.value.groups ?? [], dinerIds, id);
    if (!groups.some((group) => group.id === id)) return null;
    commit((draft) => {
      draft.groups = groups;
    });
    return id;
  }

  /**
   * Takes the groups others set on the shared copy. Not an undoable step:
   * undoing someone else's change from here would be surprising.
   */
  function applySharedGroups(groups: DinerGroup[]): void {
    bill.value.groups = pruneGroups(
      groups,
      bill.value.diners.map((diner) => diner.id),
    );
  }

  /** Takes who has paid from the shared copy; only the server changes payments. */
  function applySharedPayments(payments: Payment[]): void {
    if (JSON.stringify(payments) === JSON.stringify(bill.value.payments ?? [])) return;
    bill.value.payments = payments;
  }

  /** Each member of the group pays on their own again. */
  function ungroup(groupId: string): void {
    if (!bill.value.groups?.some((group) => group.id === groupId)) return;
    commit((draft) => {
      draft.groups = ungroupIn(draft.groups ?? [], groupId);
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

  /** Sets how many units of a multi-quantity line a diner had. */
  function setUnits(itemId: ItemId, dinerId: DinerId, count: number): void {
    const item = findItem(itemId);
    if (!item) return;
    const assignment = setUnitsIn(item, dinerId, count, bill.value.diners);
    if (JSON.stringify(assignment) === JSON.stringify(item.assignment)) return;
    commit((draft) => {
      draft.items.find((candidate) => candidate.id === itemId)!.assignment = assignment;
    });
  }

  /** Switches a line between equal parts and counting by units. */
  function toggleUnitMode(itemId: ItemId): void {
    const item = findItem(itemId);
    if (!item) return;
    commit((draft) => {
      const target = draft.items.find((candidate) => candidate.id === itemId)!;
      target.assignment = toggleUnitModeIn(target, draft.diners);
    });
  }

  /**
   * Splits every item nobody has claimed among the whole table. Lines counted
   * by units are left alone: their missing units are a question, not a default.
   */
  function assignRestToEveryone(): void {
    const pending = new Set(pendingItemIds.value);
    const targets = bill.value.items.filter(
      (item) => pending.has(item.id) && item.assignment.mode !== 'units',
    );
    if (targets.length === 0) return;
    const ids = new Set(targets.map((item) => item.id));
    commit((draft) => {
      for (const item of draft.items) {
        if (ids.has(item.id)) item.assignment = { mode: 'everyone' };
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
    isScanned,
    payers,
    pendingItemIds,
    recentNames,
    tip,
    undo,
    reset,
    setReceiptTotal,
    addItem,
    updateItemTotal,
    confirmItem,
    loadScannedReceipt,
    removeItem,
    setUnits,
    toggleUnitMode,
    addDiner,
    removeDiner,
    groupDiners,
    ungroup,
    applySharedGroups,
    applySharedPayments,
    toggleDiner,
    toggleEveryone,
    assignRestToEveryone,
    setTip,
  };
});
