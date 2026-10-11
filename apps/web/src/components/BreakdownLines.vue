<script setup lang="ts">
import type { DinerBreakdown } from '@bill-splitter/core';
import { useI18n } from 'vue-i18n';
import { fractionLabel, money } from '@/lib/format';

defineProps<{ breakdown: DinerBreakdown; currency: string }>();
const { t } = useI18n();
</script>

<template>
  <p v-if="breakdown.items.length === 0">{{ t('common.nothingAssigned') }}</p>
  <div v-for="line in breakdown.items" :key="line.itemId" class="flex justify-between gap-3">
    <span>
      <template v-if="fractionLabel(line.weight, line.totalWeight)">
        {{ fractionLabel(line.weight, line.totalWeight) }} ·
      </template>
      {{ line.name }}
    </span>
    <span class="tabular-nums">{{ money(line.amount, currency) }}</span>
  </div>
  <div
    v-for="line in breakdown.adjustments"
    :key="line.adjustmentId"
    class="border-line-soft flex justify-between border-t pt-2"
  >
    <span>{{ t(`common.adjustment.${line.kind}`) }}</span>
    <span class="tabular-nums">{{ money(line.amount, currency) }}</span>
  </div>
</template>
