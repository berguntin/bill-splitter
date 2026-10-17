<script setup lang="ts">
import { assignedDinerIds, unitsLeft, unitsOf, type Item } from '@bill-splitter/core';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import AppIcon from '@/components/AppIcon.vue';
import DinerAvatar from '@/components/DinerAvatar.vue';
import StepHeader from '@/components/StepHeader.vue';
import { initial, joinNames, money } from '@/lib/format';
import { dinerSwatch } from '@/lib/palette';
import { useBillStore } from '@/stores/bill';

const store = useBillStore();
const { t } = useI18n();
const currency = computed(() => store.bill.currency);

const totals = computed(
  () => new Map(store.breakdown.diners.map((diner) => [diner.dinerId, diner.itemsSubtotal])),
);

/** Amount each diner pays for an item, from the engine's breakdown. */
const shareAmounts = computed(() => {
  const amounts = new Map<string, number>();
  for (const diner of store.breakdown.diners) {
    for (const line of diner.items) amounts.set(`${line.itemId}:${diner.dinerId}`, line.amount);
  }
  return amounts;
});

const pendingCount = computed(() => store.pendingItemIds.length);
const pending = computed(() => new Set(store.pendingItemIds));

function selectedIds(item: Item): string[] {
  return assignedDinerIds(item.assignment, store.bill.diners);
}

function status(item: Item): string {
  if (item.assignment.mode === 'units') {
    const left = unitsLeft(item, store.bill.diners);
    if (left > 0) return t('assign.unitsLeft', { left, n: item.quantity });
    return store.bill.diners
      .filter((diner) => unitsOf(item.assignment, diner.id) > 0)
      .map((diner) => `${diner.name} ×${unitsOf(item.assignment, diner.id)}`)
      .join(' · ');
  }
  const ids = selectedIds(item);
  if (ids.length === 0) return t('assign.tapWho');
  const amount = money(shareAmounts.value.get(`${item.id}:${ids[0]}`) ?? 0, currency.value);
  if (item.assignment.mode === 'everyone') return t('assign.everyoneEach', { amount });
  const names = store.bill.diners
    .filter((diner) => ids.includes(diner.id))
    .map((diner) => diner.name);
  if (names.length === 1) return t('assign.paysAll', { name: names[0] });
  return t('assign.sharedEach', { names: joinNames(names), amount });
}

function chipStyle(color: string, selected: boolean): Record<string, string> {
  if (!selected) return {};
  const swatch = dinerSwatch(color);
  return { backgroundColor: swatch.fill, borderColor: swatch.fill, color: swatch.ink };
}

/** Lines like "5x Beer" can be counted unit by unit instead of split equally. */
function canCountUnits(item: Item): boolean {
  return Number.isInteger(item.quantity) && item.quantity > 1;
}
</script>

<template>
  <main class="flex min-h-dvh flex-col gap-4 pt-14">
    <StepHeader :title="t('assign.title')" :step="t('assign.step')" :back="{ name: 'diners' }">
      <template #actions>
        <button
          type="button"
          class="icon-btn"
          :aria-label="t('common.undo')"
          :disabled="!store.canUndo"
          @click="store.undo()"
        >
          <AppIcon name="undo" :size="18" />
        </button>
      </template>
    </StepHeader>

    <ul class="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1" :aria-label="t('assign.runningTotals')">
      <li
        v-for="diner in store.bill.diners"
        :key="diner.id"
        class="card flex min-w-[76px] flex-1 flex-col items-center gap-1 px-1 py-2.5"
      >
        <DinerAvatar :diner="diner" :size="32" />
        <span class="text-ink-muted max-w-full truncate text-xs font-semibold">
          {{ diner.name }}
        </span>
        <span class="text-sm font-extrabold tabular-nums">
          {{ money(totals.get(diner.id) ?? 0, currency) }}
        </span>
      </li>
    </ul>

    <ul class="flex flex-col gap-2.5" :aria-label="t('assign.items')">
      <li
        v-for="item in store.bill.items"
        :key="item.id"
        class="bg-surface-raised flex flex-col gap-2.5 rounded-[18px] px-4 py-3.5"
        :class="pending.has(item.id) ? 'border-warning-line border-[1.5px]' : 'border-line border'"
      >
        <div class="flex items-baseline gap-2">
          <span class="flex-1 text-[15px] font-bold">
            <span v-if="item.quantity !== 1" class="text-ink-muted">{{ item.quantity }}× </span>
            {{ item.name }}
          </span>
          <span class="text-[15px] font-bold tabular-nums">
            {{ money(item.total, currency) }}
          </span>
        </div>

        <ul
          v-if="item.assignment.mode === 'units'"
          class="flex flex-col gap-1.5"
          :aria-label="t('assign.whoHad', { name: item.name })"
        >
          <li v-for="diner in store.bill.diners" :key="diner.id" class="flex items-center gap-3">
            <DinerAvatar :diner="diner" :size="28" />
            <span class="flex-1 text-sm font-semibold">{{ diner.name }}</span>
            <button
              type="button"
              class="icon-btn size-9"
              :aria-label="t('assign.oneLess', { name: diner.name })"
              :disabled="unitsOf(item.assignment, diner.id) === 0"
              @click="store.setUnits(item.id, diner.id, unitsOf(item.assignment, diner.id) - 1)"
            >
              <AppIcon name="minus" :size="16" />
            </button>
            <span
              class="w-6 text-center text-[15px] font-bold tabular-nums"
              :data-testid="`units-${diner.name}`"
            >
              {{ unitsOf(item.assignment, diner.id) }}
            </span>
            <button
              type="button"
              class="icon-btn size-9"
              :aria-label="t('assign.oneMore', { name: diner.name })"
              :disabled="unitsLeft(item, store.bill.diners) === 0"
              @click="store.setUnits(item.id, diner.id, unitsOf(item.assignment, diner.id) + 1)"
            >
              <AppIcon name="plus" :size="16" />
            </button>
          </li>
        </ul>

        <div
          v-else
          class="flex flex-wrap items-center gap-2"
          role="group"
          :aria-label="t('assign.whoHad', { name: item.name })"
        >
          <button
            v-for="diner in store.bill.diners"
            :key="diner.id"
            type="button"
            class="text-ink-muted border-line-strong bg-surface-raised flex size-11 items-center justify-center rounded-full border-[1.5px] border-dashed text-[15px] font-bold transition active:scale-95"
            :class="{ 'border-solid': selectedIds(item).includes(diner.id) }"
            :style="chipStyle(diner.color, selectedIds(item).includes(diner.id))"
            :aria-label="diner.name"
            :aria-pressed="selectedIds(item).includes(diner.id)"
            @click="store.toggleDiner(item.id, diner.id)"
          >
            {{ initial(diner.name) }}
          </button>
          <button
            type="button"
            class="ml-auto h-11 rounded-full border-[1.5px] px-4 text-sm font-bold transition active:scale-95"
            :class="
              item.assignment.mode === 'everyone'
                ? 'bg-inverse text-inverse-ink border-inverse'
                : 'border-line bg-surface-raised'
            "
            :aria-pressed="item.assignment.mode === 'everyone'"
            @click="store.toggleEveryone(item.id)"
          >
            {{ t('assign.all') }}
          </button>
        </div>

        <div class="flex items-center justify-between gap-2">
          <span
            class="text-[13px] font-semibold"
            :class="pending.has(item.id) ? 'text-warning-ink' : 'text-ink-muted'"
          >
            {{ status(item) }}
          </span>
          <button
            v-if="canCountUnits(item)"
            type="button"
            class="text-accent-text flex h-8 shrink-0 items-center gap-1 text-[13px] font-bold"
            @click="store.toggleUnitMode(item.id)"
          >
            <AppIcon name="split" :size="16" />
            {{ item.assignment.mode === 'units' ? t('assign.splitEqually') : t('assign.byUnits') }}
          </button>
        </div>
      </li>
    </ul>

    <div class="bg-surface sticky bottom-0 mt-auto flex flex-col gap-2 pt-3 pb-8">
      <template v-if="pendingCount">
        <button type="button" class="btn-primary" disabled>
          {{ t('assign.left', { n: pendingCount }, pendingCount) }}
        </button>
        <button
          type="button"
          class="text-accent-text h-11 text-sm font-bold"
          @click="store.assignRestToEveryone()"
        >
          {{ t('assign.restToEveryone') }}
        </button>
      </template>
      <RouterLink v-else :to="{ name: 'summary' }" class="btn-primary">{{
        t('assign.seeSplit')
      }}</RouterLink>
    </div>
  </main>
</template>
