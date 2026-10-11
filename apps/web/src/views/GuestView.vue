<script setup lang="ts">
import {
  computeBreakdown,
  groupDiners,
  payers,
  ungroup,
  type Diner,
  type DinerGroup,
} from '@bill-splitter/core';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import DinerAvatar from '@/components/DinerAvatar.vue';
import AppIcon from '@/components/AppIcon.vue';
import ErrorReference from '@/components/ErrorReference.vue';
import SelectMark from '@/components/SelectMark.vue';
import { usePayTogether } from '@/composables/usePayTogether';
import { useSharedBill } from '@/composables/useSharedBill';
import { fractionLabel, joinNames, money } from '@/lib/format';
import { timeAgo } from '@/lib/relativeTime';
import { reportLocation } from '@/lib/reportContext';
import { loadJson, saveJson } from '@/lib/storage';

const props = defineProps<{ id: string }>();
const route = useRoute();

const { bill, updatedAt, state, error, errorRef, setGroups } = useSharedBill(props.id);

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

/** Diners on their own and groups paying together, as the owner set them up. */
const payerRows = computed(() => {
  if (!bill.value || !breakdown.value) return [];
  const diners = new Map(bill.value.diners.map((diner) => [diner.id, diner]));
  return payers(bill.value, breakdown.value).map((payer) => {
    const ids = payer.kind === 'group' ? payer.dinerIds : [payer.dinerId];
    const members = ids.flatMap((id) => diners.get(id) ?? []);
    return {
      key: payer.kind === 'group' ? `group:${payer.groupId}` : payer.dinerId,
      dinerIds: members.map((diner) => diner.id),
      payer,
      members,
      name: joinNames(members.map((diner) => diner.name)),
      shares:
        payer.kind === 'group'
          ? payer.members
              .map(
                (member) =>
                  `${diners.get(member.dinerId)?.name ?? '?'} ${money(member.total, currency.value)}`,
              )
              .join(' + ')
          : null,
    };
  });
});

/** The group the viewer pays with, if any. */
const myGroup = computed(
  () =>
    payerRows.value.find(
      (row) => row.payer.kind === 'group' && row.members.some((diner) => diner.id === meId.value),
    ) ?? null,
);
const others = computed(() =>
  payerRows.value.filter(
    (row) => row !== myGroup.value && !row.members.some((diner) => diner.id === meId.value),
  ),
);
const currency = computed(() => bill.value?.currency ?? 'EUR');

const together = usePayTogether(payerRows);
const { selecting, selectedDinerIds, canGroup } = together;

/** Groups as they were before each change made here, newest last. */
const history = ref<DinerGroup[][]>([]);
const toast = ref<{ message: string; undo: boolean } | null>(null);
const saving = ref(false);
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function notify(message: string, undo: boolean): void {
  toast.value = { message, undo };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = null), undo ? 5000 : 3000);
}

async function changeGroups(next: DinerGroup[], message: string, record = true): Promise<void> {
  if (!bill.value || saving.value) return;
  const previous = bill.value.groups ?? [];
  saving.value = true;
  const result = await setGroups(next);
  saving.value = false;
  if (result !== true) {
    notify("Couldn't save that. Check your connection and try again.", false);
    return;
  }
  if (record) history.value.push(previous);
  notify(message, record);
}

function payTogether(): void {
  if (!bill.value || !canGroup.value) return;
  const names = joinNames(
    selectedDinerIds.value.flatMap(
      (id) => bill.value?.diners.find((diner) => diner.id === id)?.name ?? [],
    ),
  );
  const next = groupDiners(bill.value.groups ?? [], selectedDinerIds.value, crypto.randomUUID());
  together.stop();
  void changeGroups(next, `${names} pay together`);
}

function paySeparately(groupId: string, name: string): void {
  if (!bill.value) return;
  void changeGroups(ungroup(bill.value.groups ?? [], groupId), `${name} pay separately`);
}

function undo(): void {
  const previous = history.value.pop();
  if (previous) void changeGroups(previous, 'Undone', false);
  toast.value = null;
}

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
        <div
          v-if="myGroup"
          class="bg-surface-sunken flex items-center gap-3 rounded-2xl px-3.5 py-3"
          data-testid="my-group"
        >
          <span class="flex flex-1 flex-col">
            <span class="text-[13px] font-semibold">
              Paying together with
              {{
                joinNames(
                  myGroup.members.filter((diner) => diner.id !== meId).map((diner) => diner.name),
                )
              }}
            </span>
            <span class="text-ink-muted text-xs">{{ myGroup.shares }}</span>
          </span>
          <span class="flex flex-col items-end gap-0.5">
            <span class="text-base font-extrabold tabular-nums">
              {{ money(myGroup.payer.total, currency) }}
            </span>
            <button
              v-if="myGroup.payer.kind === 'group'"
              type="button"
              class="text-ink-muted text-xs font-semibold underline underline-offset-2"
              :disabled="saving"
              @click="paySeparately(myGroup.payer.groupId, myGroup.name)"
            >
              Pay separately
            </button>
          </span>
        </div>
      </section>

      <p
        v-if="breakdown.unassigned.total !== 0"
        class="bg-warning-soft text-warning-ink rounded-2xl px-4 py-3 text-sm font-semibold"
      >
        {{ money(breakdown.unassigned.total, currency) }} is still being assigned.
      </p>

      <section v-if="selecting" class="flex flex-col gap-2.5" aria-labelledby="pick">
        <h2 id="pick" class="section-label mt-2">Who pays together?</h2>
        <ul class="card flex flex-col" aria-label="Pick who pays together">
          <li
            v-for="row in payerRows"
            :key="row.key"
            class="border-line-soft border-b last:border-b-0"
          >
            <button
              type="button"
              class="flex w-full items-center gap-3 px-4 py-3 text-left"
              :aria-pressed="together.isSelected(row.key)"
              @click="together.toggle(row.key)"
            >
              <SelectMark :checked="together.isSelected(row.key)" />
              <span class="flex shrink-0">
                <DinerAvatar
                  v-for="(diner, index) in row.members"
                  :key="diner.id"
                  :diner="diner"
                  :size="32"
                  :class="{ 'border-surface-raised -ml-2.5 border-2': index > 0 }"
                />
              </span>
              <span class="min-w-0 flex-1 truncate text-[15px] font-semibold">{{ row.name }}</span>
              <span class="text-[15px] font-bold tabular-nums">{{
                money(row.payer.total, currency)
              }}</span>
            </button>
          </li>
        </ul>
      </section>

      <section v-else-if="others.length" class="flex flex-col gap-2.5" aria-labelledby="everyone">
        <div class="mt-2 flex items-center justify-between">
          <h2 id="everyone" class="section-label">{{ me ? 'Everyone else' : 'Everyone' }}</h2>
          <div class="flex items-center gap-3">
            <button
              v-if="history.length"
              type="button"
              class="text-ink-muted flex h-8 items-center gap-1 text-sm font-semibold"
              :disabled="saving"
              @click="undo"
            >
              <AppIcon name="undo" :size="15" />
              Undo
            </button>
            <button
              v-if="payerRows.length > 1"
              type="button"
              class="text-accent-text flex h-8 items-center gap-1.5 text-sm font-bold"
              @click="together.start()"
            >
              <AppIcon name="link" :size="15" />
              Pay together
            </button>
          </div>
        </div>
        <ul class="card flex flex-col">
          <li
            v-for="row in others"
            :key="row.key"
            class="border-line-soft flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
          >
            <span class="flex shrink-0">
              <DinerAvatar
                v-for="(diner, index) in row.members"
                :key="diner.id"
                :diner="diner"
                :size="32"
                :class="{ 'border-surface-raised -ml-2.5 border-2': index > 0 }"
              />
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-[15px] font-semibold">{{ row.name }}</span>
              <span v-if="row.shares" class="text-ink-muted text-xs">{{ row.shares }}</span>
            </span>
            <span class="flex flex-col items-end gap-0.5">
              <span class="text-[15px] font-bold tabular-nums">{{
                money(row.payer.total, currency)
              }}</span>
              <button
                v-if="row.payer.kind === 'group'"
                type="button"
                class="text-ink-muted text-xs font-semibold underline underline-offset-2"
                :disabled="saving"
                @click="paySeparately(row.payer.groupId, row.name)"
              >
                Pay separately
              </button>
            </span>
          </li>
        </ul>
      </section>

      <div v-if="selecting" class="bg-surface sticky bottom-0 mt-auto flex gap-2.5 pt-3 pb-2">
        <button type="button" class="btn-secondary h-15 flex-1" @click="together.stop()">
          Cancel
        </button>
        <button
          type="button"
          class="btn-primary flex-[2]"
          :disabled="!canGroup || saving"
          @click="payTogether"
        >
          <AppIcon name="link" />
          {{ canGroup ? `Pay together (${selectedDinerIds.length})` : 'Pick 2 or more' }}
        </button>
      </div>

      <Transition
        enter-from-class="opacity-0 translate-y-2"
        leave-to-class="opacity-0 translate-y-2"
        enter-active-class="transition"
        leave-active-class="transition"
      >
        <div
          v-if="toast"
          role="status"
          class="bg-inverse text-inverse-ink fixed inset-x-5 bottom-8 z-10 mx-auto flex max-w-sm items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg"
          :class="toast.undo ? 'justify-between' : 'justify-center'"
        >
          <span>{{ toast.message }}</span>
          <button
            v-if="toast.undo"
            type="button"
            class="shrink-0 font-bold underline underline-offset-2"
            @click="undo"
          >
            Undo
          </button>
        </div>
      </Transition>

      <p v-if="!selecting" class="text-ink-muted mt-auto pt-6 text-center text-[13px]">
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
