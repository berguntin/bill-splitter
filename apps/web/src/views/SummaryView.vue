<script setup lang="ts">
import { parseMoney } from '@bill-splitter/core';
import { computed, ref } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import DinerAvatar from '@/components/DinerAvatar.vue';
import StepHeader from '@/components/StepHeader.vue';
import { fractionLabel, money } from '@/lib/format';
import { summaryText } from '@/lib/summaryText';
import { useBillStore } from '@/stores/bill';

const store = useBillStore();
const currency = computed(() => store.bill.currency);

const TIP_OPTIONS = [
  { label: 'None', basisPoints: 0 },
  { label: '5%', basisPoints: 500 },
  { label: '10%', basisPoints: 1000 },
  { label: '15%', basisPoints: 1500 },
] as const;

const customTipOpen = ref(store.tip?.type === 'amount');
const customTip = ref(store.tip?.type === 'amount' ? (store.tip.amount / 100).toFixed(2) : '');
const expanded = ref<string | null>(store.bill.diners[0]?.id ?? null);
const toast = ref<string | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;

const rows = computed(() => {
  const diners = new Map(store.bill.diners.map((diner) => [diner.id, diner]));
  return store.breakdown.diners.flatMap((breakdown) => {
    const diner = diners.get(breakdown.dinerId);
    return diner ? [{ diner, breakdown }] : [];
  });
});

function isTipSelected(basisPoints: number): boolean {
  if (customTipOpen.value) return false;
  if (basisPoints === 0) return store.tip === null;
  return store.tip?.type === 'percent' && store.tip.basisPoints === basisPoints;
}

function pickTip(basisPoints: number): void {
  customTipOpen.value = false;
  store.setTip(basisPoints === 0 ? null : { type: 'percent', basisPoints });
}

function saveCustomTip(): void {
  const amount = parseMoney(customTip.value);
  store.setTip(
    amount === null || amount <= 0 ? null : { type: 'amount', amount: Math.abs(amount) },
  );
}

function toggle(id: string): void {
  expanded.value = expanded.value === id ? null : id;
}

function notify(message: string): void {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = null), 2500);
}

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(summaryText(store.bill, store.breakdown));
    notify('Copied to the clipboard');
  } catch {
    notify('Could not copy. Try sharing instead.');
  }
}

async function share(): Promise<void> {
  const text = summaryText(store.bill, store.breakdown);
  if (typeof navigator.share !== 'function') {
    await copy();
    return;
  }
  try {
    await navigator.share({ title: 'Bill split', text });
  } catch {
    // The person closed the share sheet; nothing to do.
  }
}
</script>

<template>
  <main class="flex min-h-dvh flex-col gap-4 pt-14">
    <StepHeader title="The split" :back="{ name: 'assign' }" />

    <section class="bg-inverse text-inverse-ink flex flex-col gap-3.5 rounded-[22px] p-4.5">
      <div class="flex items-end justify-between">
        <div class="flex flex-col gap-0.5">
          <span class="text-inverse-muted text-[13px] font-semibold">
            {{ store.breakdown.totals.adjustments ? 'Total with tip' : 'Total' }}
          </span>
          <span class="text-[34px] font-extrabold tracking-tight tabular-nums">
            {{ money(store.breakdown.totals.grand, currency) }}
          </span>
        </div>
        <span
          v-if="store.breakdown.totals.adjustments"
          class="text-inverse-muted text-right text-[13px]"
        >
          {{ money(store.breakdown.totals.items, currency) }} food<br />
          + {{ money(store.breakdown.totals.adjustments, currency) }} tip
        </span>
      </div>

      <div class="flex gap-1.5" role="group" aria-label="Tip">
        <button
          v-for="option in TIP_OPTIONS"
          :key="option.label"
          type="button"
          class="h-10 flex-1 rounded-xl text-sm font-semibold"
          :class="
            isTipSelected(option.basisPoints)
              ? 'bg-inverse-ink text-inverse font-bold'
              : 'bg-inverse-ink/10'
          "
          :aria-pressed="isTipSelected(option.basisPoints)"
          @click="pickTip(option.basisPoints)"
        >
          {{ option.label }}
        </button>
        <button
          type="button"
          class="h-10 flex-1 rounded-xl text-sm font-semibold"
          :class="customTipOpen ? 'bg-inverse-ink text-inverse font-bold' : 'bg-inverse-ink/10'"
          :aria-pressed="customTipOpen"
          @click="customTipOpen = true"
        >
          Other
        </button>
      </div>
      <label v-if="customTipOpen" class="flex items-center gap-3">
        <span class="flex-1 text-sm font-semibold">Tip amount</span>
        <input
          v-model="customTip"
          class="bg-inverse-ink/10 text-inverse-ink h-11 w-28 rounded-xl px-3 text-right font-semibold tabular-nums outline-none"
          type="text"
          inputmode="decimal"
          placeholder="0.00"
          @change="saveCustomTip"
        />
      </label>
    </section>

    <RouterLink
      v-if="store.breakdown.unassigned.total !== 0"
      :to="{ name: 'assign' }"
      class="bg-warning-soft text-warning-ink flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-bold"
    >
      <AppIcon name="warning" />
      {{ money(store.breakdown.unassigned.total, currency) }} is not assigned to anyone yet
    </RouterLink>

    <ul class="flex flex-col gap-2.5" aria-label="What each person owes">
      <li v-for="{ diner, breakdown } in rows" :key="diner.id" class="card flex flex-col">
        <button
          type="button"
          class="flex items-center gap-3 px-4 py-3 text-left"
          :aria-expanded="expanded === diner.id"
          @click="toggle(diner.id)"
        >
          <DinerAvatar :diner="diner" :size="36" />
          <span class="flex-1 text-base font-bold">{{ diner.name }}</span>
          <span class="text-[17px] font-extrabold tabular-nums">
            {{ money(breakdown.total, currency) }}
          </span>
          <AppIcon
            name="chevron-down"
            :size="18"
            class="text-ink-muted transition"
            :class="{ 'rotate-180': expanded === diner.id }"
          />
        </button>
        <div
          v-if="expanded === diner.id"
          class="text-ink-soft flex flex-col gap-2 pr-4 pb-4 pl-16 text-sm"
        >
          <p v-if="breakdown.items.length === 0">Nothing assigned yet.</p>
          <div
            v-for="line in breakdown.items"
            :key="line.itemId"
            class="flex justify-between gap-3"
          >
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
            <span class="capitalize">{{ line.kind }}</span>
            <span class="tabular-nums">{{ money(line.amount, currency) }}</span>
          </div>
        </div>
      </li>
    </ul>

    <div class="bg-surface sticky bottom-0 mt-auto flex gap-2.5 pt-3 pb-8">
      <button type="button" class="btn-secondary h-15 flex-1" @click="copy">
        <AppIcon name="copy" :size="18" />
        Copy
      </button>
      <button type="button" class="btn-primary flex-[2]" @click="share">
        <AppIcon name="share" />
        Share
      </button>
    </div>

    <Transition
      enter-from-class="opacity-0 translate-y-2"
      leave-to-class="opacity-0 translate-y-2"
      enter-active-class="transition"
      leave-active-class="transition"
    >
      <p
        v-if="toast"
        role="status"
        class="bg-inverse text-inverse-ink fixed inset-x-5 bottom-28 mx-auto max-w-sm rounded-2xl px-4 py-3 text-center text-sm font-semibold shadow-lg"
      >
        {{ toast }}
      </p>
    </Transition>
  </main>
</template>
