<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { money } from '@/lib/format';
import { useBillStore } from '@/stores/bill';
import AppIcon from './AppIcon.vue';

const store = useBillStore();
const { t } = useI18n();

const state = computed(() => {
  const { receiptDifference, totals } = store.breakdown;
  const count = store.bill.items.length;
  const summary = `${t('common.items', { n: count }, count)} · ${money(totals.items, store.bill.currency)}`;

  if (receiptDifference === null)
    return { tone: 'neutral', title: t('receiptCheck.total'), summary } as const;
  if (receiptDifference === 0) {
    return { tone: 'success', title: t('receiptCheck.matches'), summary } as const;
  }
  const gap = money(Math.abs(receiptDifference), store.bill.currency);
  return {
    tone: 'warning',
    title:
      receiptDifference > 0
        ? t('receiptCheck.missing', { amount: gap })
        : t('receiptCheck.extra', { amount: gap }),
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
