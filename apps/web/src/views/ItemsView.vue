<script setup lang="ts">
import { parseMoney } from '@bill-splitter/core';
import { nextTick, ref } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import ReceiptCheck from '@/components/ReceiptCheck.vue';
import StepHeader from '@/components/StepHeader.vue';
import { money } from '@/lib/format';
import { useBillStore } from '@/stores/bill';

const store = useBillStore();

const name = ref('');
const quantity = ref(1);
const price = ref('');
const error = ref<string | null>(null);
const nameInput = ref<HTMLInputElement | null>(null);

const receiptTotal = ref(
  store.bill.receiptTotal === undefined ? '' : (store.bill.receiptTotal / 100).toFixed(2),
);

async function addItem(): Promise<void> {
  const total = parseMoney(price.value);
  if (!name.value.trim()) {
    error.value = 'Give the item a name.';
    return;
  }
  if (total === null || total < 0) {
    error.value = 'Enter the price shown on the receipt, e.g. 4.80.';
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

function saveReceiptTotal(): void {
  const total = receiptTotal.value.trim() ? parseMoney(receiptTotal.value) : null;
  if ((total ?? undefined) !== store.bill.receiptTotal) store.setReceiptTotal(total);
}
</script>

<template>
  <main class="flex min-h-dvh flex-col gap-4 pt-14">
    <StepHeader title="Add the items" step="Step 1 of 3" :back="{ name: 'home' }" />

    <ReceiptCheck v-if="store.bill.items.length" />

    <form class="card flex flex-col gap-3 p-4" novalidate @submit.prevent="addItem">
      <label class="flex flex-col gap-1.5">
        <span class="text-ink-soft text-[13px] font-semibold">Item</span>
        <input
          ref="nameInput"
          v-model="name"
          class="field"
          type="text"
          placeholder="e.g. Patatas bravas"
          autocomplete="off"
          enterkeyhint="next"
        />
      </label>
      <div class="flex gap-3">
        <label class="flex w-24 flex-col gap-1.5">
          <span class="text-ink-soft text-[13px] font-semibold">Qty</span>
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
          <span class="text-ink-soft text-[13px] font-semibold">Line total</span>
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
        Add item
      </button>
    </form>

    <ul v-if="store.bill.items.length" class="card flex flex-col" aria-label="Items">
      <li
        v-for="item in store.bill.items"
        :key="item.id"
        class="border-line-soft flex items-center gap-3 border-b py-2 pr-2 pl-4 last:border-b-0"
      >
        <span class="text-ink-muted min-w-7 text-sm font-bold">{{ item.quantity }}×</span>
        <span class="flex-1 text-[15px] font-semibold">{{ item.name }}</span>
        <span class="text-[15px] font-semibold tabular-nums">
          {{ money(item.total, store.bill.currency) }}
        </span>
        <button
          type="button"
          class="text-ink-muted flex size-11 items-center justify-center rounded-xl"
          :aria-label="`Remove ${item.name}`"
          @click="store.removeItem(item.id)"
        >
          <AppIcon name="close" :size="18" />
        </button>
      </li>
    </ul>

    <label v-if="store.bill.items.length" class="flex items-center gap-3">
      <span class="text-ink-soft flex-1 text-sm font-semibold">
        Receipt total <span class="text-ink-muted font-medium">(optional, to double-check)</span>
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
      <RouterLink v-if="store.bill.items.length" :to="{ name: 'diners' }" class="btn-primary">
        Next: who's eating
      </RouterLink>
      <button v-else type="button" class="btn-primary" disabled>Add at least one item</button>
    </div>
  </main>
</template>
