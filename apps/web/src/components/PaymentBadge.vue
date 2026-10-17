<script setup lang="ts">
import type { PaymentStatus } from '@bill-splitter/core';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { money } from '@/lib/format';
import AppIcon from './AppIcon.vue';

const props = defineProps<{ status: PaymentStatus; currency: string }>();
const { t } = useI18n();

/** Label and tone for anything but "unpaid", which shows nothing. */
const badge = computed(() => {
  const { status, currency } = props;
  if (status.state === 'unpaid') return null;
  if (status.state === 'paid') return { tone: 'success', label: t('common.paid') } as const;
  if (status.state === 'partial') {
    return { tone: 'warning', label: t('common.partlyPaid') } as const;
  }
  return {
    tone: 'warning',
    label:
      status.due > 0
        ? t('common.paidDue', {
            paid: money(status.paid, currency),
            due: money(status.due, currency),
          })
        : t('common.paidBack', {
            paid: money(status.paid, currency),
            back: money(-status.due, currency),
          }),
  } as const;
});
</script>

<template>
  <span
    v-if="badge"
    class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold"
    :class="
      badge.tone === 'success'
        ? 'bg-success-soft text-success-ink'
        : 'bg-warning-soft text-warning-ink'
    "
    data-testid="payment-badge"
  >
    <AppIcon v-if="badge.tone === 'success'" name="check" :size="13" />
    {{ badge.label }}
  </span>
</template>
