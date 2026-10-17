<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import AppIcon from '@/components/AppIcon.vue';
import DinerAvatar from '@/components/DinerAvatar.vue';
import LanguagePicker from '@/components/LanguagePicker.vue';
import { money } from '@/lib/format';
import { reportLocation } from '@/lib/reportContext';
import { useBillStore } from '@/stores/bill';
import { useHistoryStore, type RecentBill } from '@/stores/history';

const store = useBillStore();
const router = useRouter();
const history = useHistoryStore();
const { t, locale } = useI18n();

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

// The bill in progress is kept in the recent bills, so starting another loses nothing.
function startNewBill(): void {
  store.reset();
  void router.push({ name: 'items' });
}

function scan(): void {
  void router.push({ name: 'scan' });
}

const RECENT_SHOWN = 5;
const showAllRecent = ref(false);
const recentShown = computed(() =>
  showAllRecent.value ? history.recent : history.recent.slice(0, RECENT_SHOWN),
);

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(locale.value, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function recentTitle(entry: RecentBill): string {
  return entry.bill.merchant ?? t('home.billOn', { date: formatDate(entry.updatedAt) });
}

function openRecent(id: string): void {
  if (!history.open(id)) return;
  void router.push(resumeRoute.value);
}

const removed = ref<RecentBill | null>(null);
let removedTimer: ReturnType<typeof setTimeout> | undefined;

function removeRecent(id: string): void {
  removed.value = history.remove(id);
  clearTimeout(removedTimer);
  removedTimer = setTimeout(() => (removed.value = null), 5000);
}

function undoRemove(): void {
  if (removed.value) history.putBack(removed.value);
  removed.value = null;
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

    <section
      v-if="history.recent.length"
      class="flex flex-col gap-3"
      aria-labelledby="recent-bills"
    >
      <h2 id="recent-bills" class="text-[15px] font-bold">{{ t('home.recent') }}</h2>
      <ul class="card flex flex-col" :aria-label="t('home.recent')">
        <li
          v-for="entry in recentShown"
          :key="entry.bill.id"
          class="border-line-soft flex items-center border-b last:border-b-0"
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-3 py-3 pr-2 pl-4 text-left"
            @click="openRecent(entry.bill.id)"
          >
            <span
              class="bg-surface-sunken text-ink-soft flex size-9 shrink-0 items-center justify-center rounded-xl"
              :title="entry.bill.source === 'scan' ? t('home.scanned') : undefined"
            >
              <AppIcon :name="entry.bill.source === 'scan' ? 'scan' : 'split'" :size="18" />
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-[15px] font-semibold">{{ recentTitle(entry) }}</span>
              <span class="text-ink-muted truncate text-[13px]">
                <template v-if="entry.bill.merchant">{{ formatDate(entry.updatedAt) }} · </template>
                {{ t('common.people', { n: entry.bill.diners.length }, entry.bill.diners.length) }}
                <template v-if="entry.shared"> · {{ t('home.shared') }}</template>
              </span>
            </span>
            <span class="text-[15px] font-bold tabular-nums">
              {{ money(entry.total, entry.bill.currency) }}
            </span>
          </button>
          <button
            type="button"
            class="text-ink-muted flex size-11 shrink-0 items-center justify-center rounded-xl"
            :aria-label="t('home.removeRecent', { name: recentTitle(entry) })"
            @click="removeRecent(entry.bill.id)"
          >
            <AppIcon name="close" :size="16" />
          </button>
        </li>
      </ul>
      <button
        v-if="history.recent.length > RECENT_SHOWN"
        type="button"
        class="text-accent-text self-start text-sm font-bold"
        @click="showAllRecent = !showAllRecent"
      >
        {{ showAllRecent ? t('home.showLess') : t('home.showAll', { n: history.recent.length }) }}
      </button>
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

    <div
      v-if="removed"
      role="status"
      class="bg-inverse text-inverse-ink fixed inset-x-5 bottom-8 z-10 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg"
    >
      <span>{{ t('home.removed') }}</span>
      <button type="button" class="font-bold underline underline-offset-2" @click="undoRemove">
        {{ t('common.undo') }}
      </button>
    </div>
  </main>
</template>
