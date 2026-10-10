import {
  computeBreakdown,
  type Assignment,
  type Bill,
  type Cents,
  type Diner,
  type DinerId,
  type ItemId,
} from '@bill-splitter/core';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

/** Palette tokens handed out to diners in order. */
const DINER_COLORS = ['coral', 'teal', 'amber', 'violet', 'sky', 'lime', 'rose', 'slate'] as const;

function createId(): string {
  return crypto.randomUUID();
}

function emptyBill(): Bill {
  return { id: createId(), currency: 'EUR', diners: [], items: [], adjustments: [] };
}

/**
 * Holds the bill being split. All money logic lives in `@bill-splitter/core`;
 * this store only edits the bill and exposes the derived breakdown.
 */
export const useBillStore = defineStore('bill', () => {
  const bill = ref<Bill>(emptyBill());

  const breakdown = computed(() => computeBreakdown(bill.value));

  function reset(): void {
    bill.value = emptyBill();
  }

  function addDiner(name: string): Diner {
    const diner: Diner = {
      id: createId(),
      name: name.trim(),
      color: DINER_COLORS[bill.value.diners.length % DINER_COLORS.length]!,
    };
    bill.value.diners.push(diner);
    return diner;
  }

  function removeDiner(id: DinerId): void {
    // Items assigned to this diner fall back to "unassigned" inside the engine.
    bill.value.diners = bill.value.diners.filter((diner) => diner.id !== id);
  }

  function addItem(name: string, total: Cents, quantity = 1): ItemId {
    const id = createId();
    bill.value.items.push({
      id,
      name: name.trim(),
      quantity,
      unitPrice: Math.round(total / quantity),
      total,
      assignment: { mode: 'unassigned' },
    });
    return id;
  }

  function assign(itemId: ItemId, assignment: Assignment): void {
    const item = bill.value.items.find((candidate) => candidate.id === itemId);
    if (item) item.assignment = assignment;
  }

  return { bill, breakdown, reset, addDiner, removeDiner, addItem, assign };
});
