<script setup lang="ts">
import { computeBreakdown, type Diner } from '@bill-splitter/core';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import DinerAvatar from '@/components/DinerAvatar.vue';
import ErrorReference from '@/components/ErrorReference.vue';
import { useSharedBill } from '@/composables/useSharedBill';
import { fractionLabel, money } from '@/lib/format';
import { timeAgo } from '@/lib/relativeTime';
import { reportLocation } from '@/lib/reportContext';
import { loadJson, saveJson } from '@/lib/storage';

const props = defineProps<{ id: string }>();
const route = useRoute();

const { bill, updatedAt, state, error, errorRef } = useSharedBill(props.id);

const meKey = `bill-splitter/guest/${props.id}/me`;
const meId = ref<string | null>(
  loadJson(meKey, (value): value is string => typeof value === 'string'),
);
watch(meId, (value) => saveJson(meKey, value));

// Re-render "Updated x ago" while the page stays open.
const now = ref(new Date());
const clock = setInterval(() => (now.value = new Date()), 15_000);
onBeforeUnmount(() => clearInterval(clock));

const breakdown = computed(() => (bill.value ? computeBreakdown(bill.value) : null));

const rows = computed(() => {
  if (!bill.value || !breakdown.value) return [];
  const diners = new Map(bill.value.diners.map((diner) => [diner.id, diner]));
  return breakdown.value.diners.flatMap((entry) => {
    const diner = diners.get(entry.dinerId);
    return diner ? [{ diner, breakdown: entry }] : [];
  });
});

const me = computed(() => rows.value.find((row) => row.diner.id === meId.value) ?? null);
const others = computed(() => rows.value.filter((row) => row.diner.id !== meId.value));
const currency = computed(() => bill.value?.currency ?? 'EUR');

function pick(diner: Diner): void {
  meId.value = diner.id;
}
</script>

<template>
  <main class="flex min-h-dvh flex-col gap-4 pt-14 pb-10">
    <template v-if="state === 'loading'">
      <div class="bg-surface-sunken h-8 w-40 animate-pulse rounded-lg" />
      <div class="bg-surface-sunken h-40 animate-pulse rounded-[22px]" />
    </template>

    <section
      v-else-if="state === 'not_found'"
      class="flex flex-1 flex-col justify-center gap-3 text-center"
    >
      <h1 class="text-2xl font-extrabold">This bill is no longer available</h1>
      <p class="text-ink-muted">Shared bills are removed a few days after their last change.</p>
      <RouterLink :to="{ name: 'home' }" class="btn-secondary mt-4"
        >Split a bill of your own</RouterLink
      >
    </section>

    <section
      v-else-if="state === 'error'"
      class="flex flex-1 flex-col justify-center gap-3 text-center"
    >
      <h1 class="text-2xl font-extrabold">We couldn't load this bill</h1>
      <p class="text-ink-muted">
        {{ error === 'offline' ? 'Check your connection.' : 'Please try again in a moment.' }}
      </p>
      <ErrorReference
        v-if="errorRef && error !== 'offline'"
        :request-id="errorRef"
        class="text-ink-muted"
      />
      <RouterLink
        :to="reportLocation(route.fullPath, { ref: errorRef, topic: 'share' })"
        class="text-ink-muted text-sm font-semibold underline underline-offset-2"
      >
        Report this problem
      </RouterLink>
    </section>

    <template v-else-if="bill && breakdown">
      <header class="flex flex-col gap-1.5">
        <p class="text-ink-muted flex items-center gap-2 text-[13px] font-semibold" role="status">
          <span class="size-2 rounded-full" :class="error ? 'bg-warning-line' : 'bg-success'" />
          <template v-if="error">Can't refresh right now · showing the last version</template>
          <template v-else-if="updatedAt">Updated {{ timeAgo(updatedAt, now) }}</template>
        </p>
        <h1 class="text-[26px] font-extrabold tracking-tight">
          {{ bill.merchant ?? 'Shared bill' }}
        </h1>
        <p class="text-ink-muted text-[15px]">
          {{ money(breakdown.totals.grand, currency) }} split between {{ rows.length }}
          {{ rows.length === 1 ? 'person' : 'people' }}.
        </p>
      </header>

      <section v-if="!me" class="card flex flex-col gap-3 p-4" aria-labelledby="who">
        <h2 id="who" class="text-base font-bold">Who are you?</h2>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="{ diner } in rows"
            :key="diner.id"
            type="button"
            class="border-line bg-surface-raised flex h-11 items-center gap-2 rounded-full border pr-4 pl-1.5 text-sm font-semibold"
            @click="pick(diner)"
          >
            <DinerAvatar :diner="diner" :size="32" />
            {{ diner.name }}
          </button>
        </div>
      </section>

      <section
        v-else
        class="bg-surface-raised border-warning-line flex flex-col gap-3.5 rounded-[22px] border-2 p-4.5"
        aria-label="What you owe"
      >
        <div class="flex items-center gap-3">
          <DinerAvatar :diner="me.diner" :size="44" />
          <div class="flex flex-1 flex-col">
            <span class="text-ink-muted text-[13px] font-semibold"
              >You, {{ me.diner.name }}, owe</span
            >
            <span
              class="text-[30px] font-extrabold tracking-tight tabular-nums"
              data-testid="my-total"
            >
              {{ money(me.breakdown.total, currency) }}
            </span>
          </div>
          <button
            type="button"
            class="border-line h-9 rounded-[10px] border px-3 text-[13px] font-semibold"
            @click="meId = null"
          >
            Not you?
          </button>
        </div>
        <div class="text-ink-soft flex flex-col gap-2 text-sm">
          <p v-if="me.breakdown.items.length === 0">Nothing assigned to you yet.</p>
          <div
            v-for="line in me.breakdown.items"
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
            v-for="line in me.breakdown.adjustments"
            :key="line.adjustmentId"
            class="border-line-soft flex justify-between border-t pt-2"
          >
            <span class="capitalize">{{ line.kind }}</span>
            <span class="tabular-nums">{{ money(line.amount, currency) }}</span>
          </div>
        </div>
      </section>

      <p
        v-if="breakdown.unassigned.total !== 0"
        class="bg-warning-soft text-warning-ink rounded-2xl px-4 py-3 text-sm font-semibold"
      >
        {{ money(breakdown.unassigned.total, currency) }} is still being assigned.
      </p>

      <section v-if="others.length" class="flex flex-col gap-2.5" aria-labelledby="everyone">
        <h2 id="everyone" class="section-label mt-2">{{ me ? 'Everyone else' : 'Everyone' }}</h2>
        <ul class="card flex flex-col">
          <li
            v-for="{ diner, breakdown: entry } in others"
            :key="diner.id"
            class="border-line-soft flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
          >
            <DinerAvatar :diner="diner" :size="32" />
            <span class="flex-1 text-[15px] font-semibold">{{ diner.name }}</span>
            <span class="text-[15px] font-bold tabular-nums">{{
              money(entry.total, currency)
            }}</span>
          </li>
        </ul>
      </section>

      <p class="text-ink-muted mt-auto pt-6 text-center text-[13px]">
        Split with
        <RouterLink :to="{ name: 'home' }" class="text-accent-text font-bold"
          >Bill Splitter</RouterLink
        >
        ·
        <RouterLink :to="reportLocation(route.fullPath, { topic: 'share' })" class="font-semibold"
          >Report a problem</RouterLink
        >
      </p>
    </template>
  </main>
</template>
