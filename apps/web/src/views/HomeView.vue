<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import AppIcon from '@/components/AppIcon.vue';
import DinerAvatar from '@/components/DinerAvatar.vue';
import LanguagePicker from '@/components/LanguagePicker.vue';
import { money } from '@/lib/format';
import { reportLocation } from '@/lib/reportContext';
import { useBillStore } from '@/stores/bill';

const store = useBillStore();
const router = useRouter();
const { t } = useI18n();

const resumeRoute = computed(() => {
  if (store.bill.items.length === 0) return { name: 'items' };
  if (store.bill.diners.length === 0) return { name: 'diners' };
  return store.pendingItemIds.length > 0 ? { name: 'assign' } : { name: 'summary' };
});

const progressLabel = computed(() => {
  const items = store.bill.items.length;
  const diners = store.bill.diners.length;
  return [
    t('common.items', { n: items }, items),
    diners > 0 ? t('common.people', { n: diners }, diners) : null,
  ]
    .filter(Boolean)
    .join(' · ');
});

/** Asks before discarding a bill in progress. */
function confirmDiscard(): boolean {
  return !store.hasProgress || window.confirm(t('home.confirmDiscard'));
}

function startNewBill(): void {
  if (!confirmDiscard()) return;
  store.reset();
  void router.push({ name: 'items' });
}

function scan(): void {
  if (confirmDiscard()) void router.push({ name: 'scan' });
}
</script>

<template>
  <main class="flex min-h-dvh flex-col gap-8 pt-16 pb-9">
    <div class="flex items-center gap-2.5">
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="9" class="fill-accent" />
        <path d="M10 8h12v16l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5z" fill="#fff" />
      </svg>
      <span class="text-[17px] font-bold tracking-tight">{{ t('common.appName') }}</span>
    </div>

    <div class="flex flex-col gap-3">
      <h1 class="text-[38px] leading-[1.1] font-extrabold tracking-[-0.03em]">
        {{ t('home.taglineLine1') }}<br />{{ t('home.taglineLine2') }}
      </h1>
      <p class="text-ink-muted text-[17px] leading-normal">
        {{ t('home.intro') }}
      </p>
    </div>

    <section v-if="store.hasProgress" class="flex flex-col gap-3" aria-labelledby="current-bill">
      <h2 id="current-bill" class="text-[15px] font-bold">{{ t('home.inProgress') }}</h2>
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
          <span class="text-[15px] font-semibold">{{ t('home.continue') }}</span>
          <span class="text-ink-muted text-[13px]">{{ progressLabel }}</span>
        </div>
        <span class="text-[15px] font-bold tabular-nums">
          {{ money(store.breakdown.totals.grand, store.bill.currency) }}
        </span>
      </RouterLink>
    </section>

    <div class="flex-1" />

    <section class="flex flex-col gap-3" :aria-label="t('home.startNew')">
      <button type="button" class="btn-primary shadow-accent/30 shadow-lg" @click="scan">
        <AppIcon name="scan" :size="22" />
        {{ t('home.scan') }}
      </button>
      <button type="button" class="btn-secondary" @click="startNewBill">
        {{ t('home.manual') }}
      </button>
      <div class="mt-2 flex items-center justify-between">
        <LanguagePicker />
        <RouterLink :to="reportLocation('/')" class="text-ink-muted text-[13px] font-semibold">
          {{ t('common.reportProblem') }}
        </RouterLink>
      </div>
    </section>
  </main>
</template>
