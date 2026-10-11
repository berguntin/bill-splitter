<script setup lang="ts">
import { parseMoney, type Diner, type Payer } from '@bill-splitter/core';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AppIcon from '@/components/AppIcon.vue';
import BreakdownLines from '@/components/BreakdownLines.vue';
import DinerAvatar from '@/components/DinerAvatar.vue';
import StepHeader from '@/components/StepHeader.vue';
import { joinNames, money } from '@/lib/format';
import { summaryText } from '@/lib/summaryText';
import SelectMark from '@/components/SelectMark.vue';
import { usePayTogether } from '@/composables/usePayTogether';
import { useBillStore } from '@/stores/bill';

const store = useBillStore();
const { t } = useI18n();
const currency = computed(() => store.bill.currency);

const TIP_OPTIONS = [
  { label: 'None', basisPoints: 0 },
  { label: '5%', basisPoints: 500 },
  { label: '10%', basisPoints: 1000 },
  { label: '15%', basisPoints: 1500 },
] as const;

const customTipOpen = ref(store.tip?.type === 'amount');
const customTip = ref(store.tip?.type === 'amount' ? (store.tip.amount / 100).toFixed(2) : '');
const expanded = ref<string | null>(null);
const toast = ref<{ message: string; undo: boolean } | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;

const dinersById = computed(() => new Map(store.bill.diners.map((diner) => [diner.id, diner])));

/** A payer with the diners it covers, keyed for selection and expansion. */
const rows = computed(() =>
  store.payers.map((payer) => {
    const ids = payer.kind === 'group' ? payer.dinerIds : [payer.dinerId];
    const diners = ids.flatMap((id) => dinersById.value.get(id) ?? []);
    return {
      key: payer.kind === 'group' ? `group:${payer.groupId}` : payer.dinerId,
      dinerIds: diners.map((diner) => diner.id),
      payer,
      diners,
      name: joinNames(diners.map((diner) => diner.name)),
    };
  }),
);

// Open the first card, as before groups existed.
expanded.value = rows.value[0]?.key ?? null;

const {
  selecting,
  selectedDinerIds,
  canGroup,
  start: startPicking,
  stop: stopGrouping,
  toggle: toggleSelected,
  isSelected,
} = usePayTogether(rows);

function startGrouping(): void {
  startPicking();
  expanded.value = null;
}

function payTogether(): void {
  if (!canGroup.value) return;
  const names = joinNames(
    selectedDinerIds.value.flatMap((id) => dinersById.value.get(id)?.name ?? []),
  );
  const groupId = store.groupDiners(selectedDinerIds.value);
  stopGrouping();
  if (groupId) {
    expanded.value = `group:${groupId}`;
    notify(t('common.groupedToast', { names }), true);
  }
}

function separate(payer: Extract<Payer, { kind: 'group' }>, diners: Diner[]): void {
  store.ungroup(payer.groupId);
  expanded.value = null;
  notify(t('common.separatedToast', { names: joinNames(diners.map((diner) => diner.name)) }), true);
}

function undo(): void {
  store.undo();
  toast.value = null;
}

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

function notify(message: string, withUndo = false): void {
  toast.value = { message, undo: withUndo };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = null), withUndo ? 5000 : 2500);
}

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(summaryText(store.bill, store.breakdown));
    notify(t('summary.copied'));
  } catch {
    notify(t('summary.copyFailed'));
  }
}
</script>

<template>
  <main class="flex min-h-dvh flex-col gap-4 pt-14">
    <StepHeader :title="t('summary.title')" :back="{ name: 'assign' }">
      <template #actions>
        <button
          type="button"
          class="icon-btn"
          :aria-label="t('common.undo')"
          :disabled="!store.canUndo"
          @click="undo"
        >
          <AppIcon name="undo" />
        </button>
      </template>
    </StepHeader>

    <section class="bg-inverse text-inverse-ink flex flex-col gap-3.5 rounded-[22px] p-4.5">
      <div class="flex items-end justify-between">
        <div class="flex flex-col gap-0.5">
          <span class="text-inverse-muted text-[13px] font-semibold">
            {{
              store.breakdown.totals.adjustments ? t('summary.totalWithTip') : t('summary.total')
            }}
          </span>
          <span class="text-[34px] font-extrabold tracking-tight tabular-nums">
            {{ money(store.breakdown.totals.grand, currency) }}
          </span>
        </div>
        <span
          v-if="store.breakdown.totals.adjustments"
          class="text-inverse-muted text-right text-[13px]"
        >
          {{ t('summary.food', { amount: money(store.breakdown.totals.items, currency) }) }}<br />
          {{
            t('summary.tipLine', { amount: money(store.breakdown.totals.adjustments, currency) })
          }}
        </span>
      </div>

      <div class="flex gap-1.5" role="group" :aria-label="t('summary.tip')">
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
          {{ option.basisPoints === 0 ? t('summary.noTip') : option.label }}
        </button>
        <button
          type="button"
          class="h-10 flex-1 rounded-xl text-sm font-semibold"
          :class="customTipOpen ? 'bg-inverse-ink text-inverse font-bold' : 'bg-inverse-ink/10'"
          :aria-pressed="customTipOpen"
          @click="customTipOpen = true"
        >
          {{ t('summary.other') }}
        </button>
      </div>
      <label v-if="customTipOpen" class="flex items-center gap-3">
        <span class="flex-1 text-sm font-semibold">{{ t('summary.tipAmount') }}</span>
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
      {{ t('summary.notAssigned', { amount: money(store.breakdown.unassigned.total, currency) }) }}
    </RouterLink>

    <div class="flex items-center justify-between">
      <h2 class="text-[15px] font-bold">
        {{ selecting ? t('common.whoPaysTogether') : t('summary.whoPaysWhat') }}
      </h2>
      <button
        v-if="!selecting && rows.length > 1"
        type="button"
        class="text-accent-text flex h-9 items-center gap-1.5 rounded-full px-1 text-sm font-bold"
        @click="startGrouping"
      >
        <AppIcon name="link" :size="16" />
        {{ t('common.payTogether') }}
      </button>
    </div>

    <ul class="flex flex-col gap-2.5" :aria-label="t('summary.listLabel')">
      <li v-for="row in rows" :key="row.key" class="card flex flex-col">
        <button
          type="button"
          class="flex items-center gap-3 px-4 py-3 text-left"
          :aria-expanded="selecting ? undefined : expanded === row.key"
          :aria-pressed="selecting ? isSelected(row.key) : undefined"
          @click="selecting ? toggleSelected(row.key) : toggle(row.key)"
        >
          <SelectMark v-if="selecting" :checked="isSelected(row.key)" />
          <span class="flex shrink-0">
            <DinerAvatar
              v-for="(diner, index) in row.diners"
              :key="diner.id"
              :diner="diner"
              :size="36"
              class="border-surface-raised"
              :class="{ '-ml-3 border-2': index > 0, 'border-2': row.diners.length > 1 }"
            />
          </span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-base font-bold">{{ row.name }}</span>
            <span
              v-if="row.payer.kind === 'group'"
              class="text-ink-muted flex items-center gap-1 text-[13px] font-semibold"
            >
              <AppIcon name="link" :size="12" />
              {{ t('common.payingTogether') }}
            </span>
          </span>
          <span class="text-[17px] font-extrabold tabular-nums">
            {{ money(row.payer.total, currency) }}
          </span>
          <AppIcon
            v-if="!selecting"
            name="chevron-down"
            :size="18"
            class="text-ink-muted transition"
            :class="{ 'rotate-180': expanded === row.key }"
          />
        </button>

        <template v-if="!selecting && expanded === row.key">
          <div
            v-if="row.payer.kind === 'diner'"
            class="text-ink-soft flex flex-col gap-2 pr-4 pb-4 pl-16 text-sm"
          >
            <BreakdownLines :breakdown="row.payer.breakdown" :currency="currency" />
          </div>
          <div v-else class="flex flex-col gap-3 px-4 pb-4">
            <div
              v-for="member in row.payer.members"
              :key="member.dinerId"
              class="bg-surface-sunken/60 flex flex-col gap-2 rounded-2xl p-3"
            >
              <div class="flex items-center gap-2.5">
                <DinerAvatar
                  v-if="dinersById.get(member.dinerId)"
                  :diner="dinersById.get(member.dinerId)!"
                  :size="24"
                />
                <span class="flex-1 text-sm font-bold">
                  {{ dinersById.get(member.dinerId)?.name }}
                </span>
                <span class="text-sm font-bold tabular-nums">
                  {{ money(member.total, currency) }}
                </span>
              </div>
              <div class="text-ink-soft flex flex-col gap-1.5 pl-[34px] text-[13px]">
                <BreakdownLines :breakdown="member" :currency="currency" />
              </div>
            </div>
            <button
              type="button"
              class="text-ink-muted self-start text-sm font-semibold underline underline-offset-2"
              @click="separate(row.payer, row.diners)"
            >
              {{ t('common.paySeparately') }}
            </button>
          </div>
        </template>
      </li>
    </ul>

    <div v-if="selecting" class="bg-surface sticky bottom-0 mt-auto flex gap-2.5 pt-3 pb-8">
      <button type="button" class="btn-secondary h-15 flex-1" @click="stopGrouping">
        {{ t('common.cancel') }}
      </button>
      <button type="button" class="btn-primary flex-[2]" :disabled="!canGroup" @click="payTogether">
        <AppIcon name="link" />
        {{
          canGroup
            ? t('common.payTogetherCount', { n: selectedDinerIds.length })
            : t('common.pickTwoOrMore')
        }}
      </button>
    </div>
    <div v-else class="bg-surface sticky bottom-0 mt-auto flex gap-2.5 pt-3 pb-8">
      <button type="button" class="btn-secondary h-15 flex-1" @click="copy">
        <AppIcon name="copy" :size="18" />
        {{ t('summary.copy') }}
      </button>
      <RouterLink :to="{ name: 'share' }" class="btn-primary flex-[2]">
        <AppIcon name="qr" />
        {{ t('summary.share') }}
      </RouterLink>
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
        class="bg-inverse text-inverse-ink fixed inset-x-5 bottom-28 mx-auto flex max-w-sm items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg"
        :class="toast.undo ? 'justify-between' : 'justify-center'"
      >
        <span>{{ toast.message }}</span>
        <button
          v-if="toast.undo"
          type="button"
          class="text-inverse-ink shrink-0 font-bold underline underline-offset-2"
          @click="undo"
        >
          {{ t('common.undo') }}
        </button>
      </div>
    </Transition>
  </main>
</template>
