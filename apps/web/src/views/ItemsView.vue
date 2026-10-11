<script setup lang="ts">
import { parseMoney, type Item } from '@bill-splitter/core';
import { computed, nextTick, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AppIcon from '@/components/AppIcon.vue';
import ReceiptCheck from '@/components/ReceiptCheck.vue';
import StepHeader from '@/components/StepHeader.vue';
import { money } from '@/lib/format';
import { useBillStore } from '@/stores/bill';

const store = useBillStore();
const { t } = useI18n();

const name = ref('');
const quantity = ref(1);
const price = ref('');
const error = ref<string | null>(null);
const nameInput = ref<HTMLInputElement | null>(null);
// A scanned bill starts with the add form folded away: most receipts need no new lines.
const formOpen = ref(!store.isScanned);

const receiptTotal = ref(
  store.bill.receiptTotal === undefined ? '' : (store.bill.receiptTotal / 100).toFixed(2),
);

/** Draft amounts typed into the lines that need review, keyed by item id. */
const drafts = ref<Record<string, string>>({});

const reviewCount = computed(() => store.bill.items.filter((item) => item.needsReview).length);

async function addItem(): Promise<void> {
  const total = parseMoney(price.value);
  if (!name.value.trim()) {
    error.value = t('items.errorName');
    return;
  }
  if (total === null || total < 0) {
    error.value = t('items.errorPrice');
    return;
  }
  const units = Number.isInteger(quantity.value) && quantity.value > 0 ? quantity.value : 1;
  store.addItem({ name: name.value, total, quantity: units });
  name.value = '';
  quantity.value = 1;
  price.value = '';
  error.value = null;
  await nextTick();
  nameInput.value?.focus();
}

async function openForm(): Promise<void> {
  formOpen.value = true;
  await nextTick();
  nameInput.value?.focus();
}

function draftFor(item: Item): string {
  return drafts.value[item.id] ?? (item.total / 100).toFixed(2);
}

/** Saves the typed amount, or confirms the scanned one when it was not changed. */
function confirmLine(item: Item): void {
  const total = parseMoney(draftFor(item));
  if (total !== null && total !== item.total) store.updateItemTotal(item.id, total);
  else store.confirmItem(item.id);
  delete drafts.value[item.id];
}

/** Applies every pending line at once, for blurry photos where many lines are flagged. */
function confirmAll(): void {
  for (const item of store.bill.items.filter((candidate) => candidate.needsReview)) {
    confirmLine(item);
  }
}

function saveReceiptTotal(): void {
  const total = receiptTotal.value.trim() ? parseMoney(receiptTotal.value) : null;
  if ((total ?? undefined) !== store.bill.receiptTotal) store.setReceiptTotal(total);
}
</script>

<template>
  <main class="flex min-h-dvh flex-col gap-4 pt-14">
    <StepHeader
      :title="store.isScanned ? t('items.titleScanned') : t('items.title')"
      :step="
        store.bill.merchant
          ? t('items.stepWithMerchant', { merchant: store.bill.merchant })
          : t('items.step')
      "
      :back="{ name: 'home' }"
    />

    <ReceiptCheck v-if="store.bill.items.length" />

    <div
      v-if="reviewCount > 1"
      class="bg-warning-soft text-warning-ink flex items-center gap-3 rounded-2xl px-4 py-3"
    >
      <span class="flex-1 text-sm font-semibold">
        {{ t('items.hardToRead', { n: reviewCount }) }}
      </span>
      <button
        type="button"
        class="bg-inverse text-inverse-ink h-9 shrink-0 rounded-full px-3.5 text-[13px] font-bold"
        @click="confirmAll"
      >
        {{ t('items.allLookRight') }}
      </button>
    </div>

    <ul
      v-if="store.bill.items.length"
      class="card flex flex-col overflow-hidden"
      :aria-label="t('items.list')"
    >
      <li
        v-for="item in store.bill.items"
        :key="item.id"
        class="border-line-soft border-b last:border-b-0"
        :class="{ 'bg-warning-soft': item.needsReview }"
      >
        <div class="flex items-center gap-3 py-2 pr-2 pl-4">
          <span class="text-ink-muted min-w-7 text-sm font-bold">{{ item.quantity }}×</span>
          <span class="flex-1 text-[15px] font-semibold">{{ item.name }}</span>
          <label
            v-if="item.needsReview"
            class="border-warning-line bg-surface-raised flex items-center rounded-[10px] border-[1.5px] px-2 py-1"
          >
            <span class="sr-only">{{ t('items.priceOf', { name: item.name }) }}</span>
            <input
              :value="draftFor(item)"
              class="w-16 bg-transparent text-right text-[15px] font-semibold tabular-nums outline-none"
              type="text"
              inputmode="decimal"
              @input="drafts[item.id] = ($event.target as HTMLInputElement).value"
              @keydown.enter.prevent="confirmLine(item)"
            />
          </label>
          <span v-else class="text-[15px] font-semibold tabular-nums">
            {{ money(item.total, store.bill.currency) }}
          </span>
          <button
            type="button"
            class="text-ink-muted flex size-11 items-center justify-center rounded-xl"
            :aria-label="t('items.remove', { name: item.name })"
            @click="store.removeItem(item.id)"
          >
            <AppIcon name="close" :size="18" />
          </button>
        </div>
        <div v-if="item.needsReview" class="flex items-center gap-3 pr-4 pb-3 pl-14">
          <span class="text-warning-ink flex-1 text-[13px] font-semibold">
            {{ t('items.lineHardToRead') }}
          </span>
          <button
            type="button"
            class="bg-inverse text-inverse-ink h-9 rounded-full px-3.5 text-[13px] font-bold"
            @click="confirmLine(item)"
          >
            {{ t('items.looksRight') }}
          </button>
        </div>
      </li>
    </ul>

    <form v-if="formOpen" class="card flex flex-col gap-3 p-4" novalidate @submit.prevent="addItem">
      <label class="flex flex-col gap-1.5">
        <span class="text-ink-soft text-[13px] font-semibold">{{ t('items.item') }}</span>
        <input
          ref="nameInput"
          v-model="name"
          class="field"
          type="text"
          :placeholder="t('items.itemPlaceholder')"
          autocomplete="off"
          enterkeyhint="next"
        />
      </label>
      <div class="flex gap-3">
        <label class="flex w-24 flex-col gap-1.5">
          <span class="text-ink-soft text-[13px] font-semibold">{{ t('items.qty') }}</span>
          <input
            v-model.number="quantity"
            class="field text-center"
            type="number"
            min="1"
            step="1"
            inputmode="numeric"
          />
        </label>
        <label class="flex flex-1 flex-col gap-1.5">
          <span class="text-ink-soft text-[13px] font-semibold">{{ t('items.lineTotal') }}</span>
          <input
            v-model="price"
            class="field text-right tabular-nums"
            type="text"
            inputmode="decimal"
            placeholder="0.00"
            autocomplete="off"
            enterkeyhint="done"
          />
        </label>
      </div>
      <p v-if="error" class="text-warning-ink text-[13px] font-semibold" role="alert">
        {{ error }}
      </p>
      <button type="submit" class="btn-secondary bg-inverse text-inverse-ink border-inverse h-12">
        <AppIcon name="plus" :size="18" />
        {{ t('items.add') }}
      </button>
    </form>
    <button
      v-else
      type="button"
      class="border-line-strong flex h-12 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed text-[15px] font-semibold"
      @click="openForm"
    >
      <AppIcon name="plus" :size="18" />
      {{ t('items.addMissing') }}
    </button>

    <label v-if="store.bill.items.length" class="flex items-center gap-3">
      <span class="text-ink-soft flex-1 text-sm font-semibold">
        {{ t('items.receiptTotal') }}
        <span class="text-ink-muted font-medium">{{ t('items.receiptTotalHint') }}</span>
      </span>
      <input
        v-model="receiptTotal"
        class="field h-11 w-28 text-right tabular-nums"
        type="text"
        inputmode="decimal"
        placeholder="0.00"
        @change="saveReceiptTotal"
      />
    </label>

    <div class="bg-surface sticky bottom-0 mt-auto pt-3 pb-8">
      <button v-if="reviewCount" type="button" class="btn-primary" disabled>
        {{ t('items.checkFirst', { n: reviewCount }, reviewCount) }}
      </button>
      <RouterLink v-else-if="store.bill.items.length" :to="{ name: 'diners' }" class="btn-primary">
        {{ store.isScanned ? t('items.looksGood') : t('items.next') }}
      </RouterLink>
      <button v-else type="button" class="btn-primary" disabled>{{ t('items.addOne') }}</button>
    </div>
  </main>
</template>
