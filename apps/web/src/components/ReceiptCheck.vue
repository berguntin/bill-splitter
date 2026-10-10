<script setup lang="ts">
import { computed } from 'vue';
import { money } from '@/lib/format';
import { useBillStore } from '@/stores/bill';
import AppIcon from './AppIcon.vue';

const store = useBillStore();

const state = computed(() => {
  const { receiptDifference, totals } = store.breakdown;
  const count = store.bill.items.length;
  const summary = `${count} ${count === 1 ? 'item' : 'items'} · ${money(totals.items, store.bill.currency)}`;

  if (receiptDifference === null)
    return { tone: 'neutral', title: 'Items total', summary } as const;
  if (receiptDifference === 0) {
    return { tone: 'success', title: 'Items add up to the receipt total', summary } as const;
  }
  const gap = money(Math.abs(receiptDifference), store.bill.currency);
  return {
    tone: 'warning',
    title:
      receiptDifference > 0
        ? `${gap} missing compared to the receipt`
        : `${gap} more than the receipt total`,
    summary,
  } as const;
});
</script>

<template>
  <div
    role="status"
    class="flex items-center gap-3 rounded-2xl px-4 py-3.5"
    :class="{
      'bg-success-soft text-success-ink': state.tone === 'success',
      'bg-warning-soft text-warning-ink': state.tone === 'warning',
      'bg-surface-sunken text-ink-soft': state.tone === 'neutral',
    }"
  >
    <AppIcon :name="state.tone === 'warning' ? 'warning' : 'check'" :size="22" />
    <div class="flex flex-col">
      <span class="text-sm font-bold">{{ state.title }}</span>
      <span class="text-[13px]">{{ state.summary }}</span>
    </div>
  </div>
</template>
