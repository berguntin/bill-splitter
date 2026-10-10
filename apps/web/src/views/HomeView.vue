<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '@/components/AppIcon.vue';
import DinerAvatar from '@/components/DinerAvatar.vue';
import { money } from '@/lib/format';
import { useBillStore } from '@/stores/bill';

const store = useBillStore();
const router = useRouter();

const resumeRoute = computed(() => {
  if (store.bill.items.length === 0) return { name: 'items' };
  if (store.bill.diners.length === 0) return { name: 'diners' };
  return store.pendingItemIds.length > 0 ? { name: 'assign' } : { name: 'summary' };
});

const progressLabel = computed(() => {
  const items = store.bill.items.length;
  const diners = store.bill.diners.length;
  return [
    `${items} ${items === 1 ? 'item' : 'items'}`,
    diners > 0 ? `${diners} ${diners === 1 ? 'person' : 'people'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
});

function startNewBill(): void {
  if (
    store.hasProgress &&
    !window.confirm('Start a new bill? The one in progress will be discarded.')
  ) {
    return;
  }
  store.reset();
  void router.push({ name: 'items' });
}
</script>

<template>
  <main class="flex min-h-dvh flex-col gap-8 pt-16 pb-9">
    <div class="flex items-center gap-2.5">
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="9" class="fill-accent" />
        <path d="M10 8h12v16l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5z" fill="#fff" />
      </svg>
      <span class="text-[17px] font-bold tracking-tight">Bill Splitter</span>
    </div>

    <div class="flex flex-col gap-3">
      <h1 class="text-[38px] leading-[1.1] font-extrabold tracking-[-0.03em]">
        Split the bill,<br />not the friendship.
      </h1>
      <p class="text-ink-muted text-[17px] leading-normal">
        Snap the receipt, tap who had what, and everyone knows what they owe.
      </p>
    </div>

    <section v-if="store.hasProgress" class="flex flex-col gap-3" aria-labelledby="current-bill">
      <h2 id="current-bill" class="text-[15px] font-bold">Bill in progress</h2>
      <RouterLink :to="resumeRoute" class="card flex items-center gap-3.5 px-4 py-3.5">
        <div v-if="store.bill.diners.length" class="flex">
          <DinerAvatar
            v-for="(diner, index) in store.bill.diners.slice(0, 3)"
            :key="diner.id"
            :diner="diner"
            :size="28"
            class="border-surface-raised border-2"
            :class="{ '-ml-2': index > 0 }"
          />
        </div>
        <div class="flex flex-1 flex-col gap-0.5">
          <span class="text-[15px] font-semibold">Continue splitting</span>
          <span class="text-ink-muted text-[13px]">{{ progressLabel }}</span>
        </div>
        <span class="text-[15px] font-bold tabular-nums">
          {{ money(store.breakdown.totals.grand, store.bill.currency) }}
        </span>
      </RouterLink>
    </section>

    <div class="flex-1" />

    <section class="flex flex-col gap-3" aria-label="Start a new bill">
      <button type="button" class="btn-primary" disabled>
        <AppIcon name="scan" :size="22" />
        Scan receipt
        <span class="bg-line rounded-full px-2 py-0.5 text-xs">Soon</span>
      </button>
      <button type="button" class="btn-secondary" @click="startNewBill">
        Enter items manually
      </button>
    </section>
  </main>
</template>
