<script setup lang="ts">
import {
  assignedDinerIds,
  unitsLeft,
  unitsOf,
  type Diner,
  type DinerId,
  type Item,
} from '@bill-splitter/core';
import { computed, ref } from 'vue';
import { I18nT, useI18n } from 'vue-i18n';
import AppIcon from '@/components/AppIcon.vue';
import DinerAvatar from '@/components/DinerAvatar.vue';
import SelectMark from '@/components/SelectMark.vue';
import StepHeader from '@/components/StepHeader.vue';
import { joinNames, money } from '@/lib/format';
import { dinerSwatch } from '@/lib/palette';
import { useBillStore } from '@/stores/bill';

/** Dots shown for who shares an item before collapsing the rest into "+N". */
const MAX_DOTS = 5;

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

// Items are assigned one person at a time: pick someone, then tap what they had.
const activeId = ref<DinerId | null>(store.bill.diners[0]?.id ?? null);
const active = computed<Diner>(
  () => store.bill.diners.find((diner) => diner.id === activeId.value) ?? store.bill.diners[0]!,
);
const activeSwatch = computed(() => dinerSwatch(active.value.color));
const nextDiner = computed(() => {
  const index = store.bill.diners.findIndex((diner) => diner.id === active.value.id);
  return store.bill.diners[index + 1] ?? null;
});

const picker = ref<HTMLElement | null>(null);

function choose(diner: Diner): void {
  activeId.value = diner.id;
  picker.value
    ?.querySelector(`[data-diner="${diner.id}"]`)
    ?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
}

function selectedIds(item: Item): string[] {
  return assignedDinerIds(item.assignment, store.bill.diners);
}

function isUnits(item: Item): boolean {
  return item.assignment.mode === 'units';
}

function hasIt(item: Item): boolean {
  return selectedIds(item).includes(active.value.id);
}

/** Who shares an item, as color dots; "everyone" says so in words instead. */
function sharers(item: Item): Diner[] {
  if (item.assignment.mode === 'everyone') return [];
  return store.bill.diners.filter((diner) =>
    isUnits(item) ? unitsOf(item.assignment, diner.id) > 0 : selectedIds(item).includes(diner.id),
  );
}

function status(item: Item): string {
  if (isUnits(item)) {
    const left = unitsLeft(item, store.bill.diners);
    if (left > 0) return t('assign.unitsLeft', { left, n: item.quantity });
    return store.bill.diners
      .filter((diner) => unitsOf(item.assignment, diner.id) > 0)
      .map((diner) => `${diner.name} ×${unitsOf(item.assignment, diner.id)}`)
      .join(' · ');
  }
  const ids = selectedIds(item);
  if (ids.length === 0) return t('assign.nobodyYet');
  const amount = money(shareAmounts.value.get(`${item.id}:${ids[0]}`) ?? 0, currency.value);
  if (item.assignment.mode === 'everyone') return t('assign.everyoneEach', { amount });
  const names = store.bill.diners
    .filter((diner) => ids.includes(diner.id))
    .map((diner) => diner.name);
  if (names.length === 1) return t('assign.paysAll', { name: names[0] });
  return t('assign.sharedEach', { names: joinNames(names), amount });
}

/** Attributes that turn an item's summary into the toggle for the active person. */
function toggleAttrs(item: Item): Record<string, unknown> {
  if (isUnits(item)) return {};
  return {
    type: 'button',
    'aria-pressed': hasIt(item),
    'aria-label': t('assign.dinerHad', { name: active.value.name, item: item.name }),
    onClick: () => store.toggleDiner(item.id, active.value.id),
  };
}

function pickerStyle(diner: Diner): Record<string, string> {
  if (diner.id !== active.value.id) return {};
  const { fill } = dinerSwatch(diner.color);
  return { borderColor: fill, boxShadow: `inset 0 0 0 1px ${fill}` };
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

    <div class="bg-surface sticky top-0 z-10 -mx-5 flex flex-col gap-3 px-5 pt-2 pb-3">
      <div
        ref="picker"
        class="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1"
        role="radiogroup"
        :aria-label="t('assign.choosePerson')"
      >
        <button
          v-for="diner in store.bill.diners"
          :key="diner.id"
          type="button"
          role="radio"
          :data-diner="diner.id"
          :aria-checked="diner.id === active.id"
          class="card flex min-w-[76px] flex-1 flex-col items-center gap-1 px-1 py-2.5 transition active:scale-95"
          :style="pickerStyle(diner)"
          @click="choose(diner)"
        >
          <DinerAvatar :diner="diner" :size="32" />
          <span class="text-ink-muted max-w-full truncate text-xs font-semibold">
            {{ diner.name }}
          </span>
          <span class="text-sm font-extrabold tabular-nums">
            {{ money(totals.get(diner.id) ?? 0, currency) }}
          </span>
        </button>
      </div>

      <div class="flex items-center gap-2">
        <span
          class="size-3 shrink-0 rounded-full"
          :style="{ backgroundColor: activeSwatch.fill }"
          aria-hidden="true"
        />
        <I18nT keypath="assign.whatDid" tag="p" class="min-w-0 flex-1 truncate text-base">
          <template #name>
            <strong class="font-extrabold">{{ active.name }}</strong>
          </template>
        </I18nT>
        <button
          v-if="nextDiner"
          type="button"
          class="border-line bg-surface-raised flex h-9 shrink-0 items-center gap-1 rounded-full border pr-2.5 pl-3.5 text-[13px] font-bold transition active:scale-95"
          @click="choose(nextDiner)"
        >
          {{ t('assign.next', { name: nextDiner.name }) }}
          <AppIcon name="back" :size="16" class="rotate-180" />
        </button>
      </div>
    </div>

    <ul class="flex flex-col gap-2.5" :aria-label="t('assign.items')">
      <li
        v-for="item in store.bill.items"
        :key="item.id"
        class="bg-surface-raised flex flex-col gap-2 rounded-[18px] px-3.5 py-3"
        :class="pending.has(item.id) ? 'border-warning-line border-[1.5px]' : 'border-line border'"
      >
        <div class="flex items-center gap-3">
          <component
            :is="isUnits(item) ? 'div' : 'button'"
            v-bind="toggleAttrs(item)"
            class="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <SelectMark v-if="!isUnits(item)" :checked="hasIt(item)" :swatch="activeSwatch" />
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="flex items-baseline gap-2">
                <span class="flex-1 text-[15px] font-bold">
                  <span v-if="item.quantity !== 1" class="text-ink-muted"
                    >{{ item.quantity }}×
                  </span>
                  {{ item.name }}
                </span>
                <span class="text-[15px] font-bold tabular-nums">
                  {{ money(item.total, currency) }}
                </span>
              </span>
              <span
                class="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold"
                :class="pending.has(item.id) ? 'text-warning-ink' : 'text-ink-muted'"
              >
                <span v-if="sharers(item).length" class="flex shrink-0" aria-hidden="true">
                  <span
                    v-for="diner in sharers(item).slice(0, MAX_DOTS)"
                    :key="diner.id"
                    class="ring-surface-raised -ml-0.5 size-2.5 rounded-full ring-2 first:ml-0"
                    :style="{ backgroundColor: dinerSwatch(diner.color).fill }"
                  />
                  <span v-if="sharers(item).length > MAX_DOTS" class="ml-1 text-xs">
                    +{{ sharers(item).length - MAX_DOTS }}
                  </span>
                </span>
                <span>{{ status(item) }}</span>
              </span>
            </span>
          </component>

          <div v-if="isUnits(item)" class="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              class="icon-btn size-9"
              :aria-label="t('assign.oneLess', { name: active.name })"
              :disabled="unitsOf(item.assignment, active.id) === 0"
              @click="store.setUnits(item.id, active.id, unitsOf(item.assignment, active.id) - 1)"
            >
              <AppIcon name="minus" :size="16" />
            </button>
            <span
              class="w-6 text-center text-[15px] font-bold tabular-nums"
              :data-testid="`units-${active.name}`"
            >
              {{ unitsOf(item.assignment, active.id) }}
            </span>
            <button
              type="button"
              class="icon-btn size-9"
              :aria-label="t('assign.oneMore', { name: active.name })"
              :disabled="unitsLeft(item, store.bill.diners) === 0"
              @click="store.setUnits(item.id, active.id, unitsOf(item.assignment, active.id) + 1)"
            >
              <AppIcon name="plus" :size="16" />
            </button>
          </div>
          <button
            v-else
            type="button"
            class="h-9 shrink-0 rounded-full border-[1.5px] px-3.5 text-[13px] font-bold transition active:scale-95"
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

        <button
          v-if="canCountUnits(item)"
          type="button"
          class="text-accent-text flex h-8 shrink-0 items-center gap-1 self-end text-[13px] font-bold"
          @click="store.toggleUnitMode(item.id)"
        >
          <AppIcon name="split" :size="16" />
          {{ isUnits(item) ? t('assign.splitEqually') : t('assign.byUnits') }}
        </button>
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
