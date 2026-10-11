<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import AppIcon from '@/components/AppIcon.vue';
import ErrorReference from '@/components/ErrorReference.vue';
import QrCode from '@/components/QrCode.vue';
import StepHeader from '@/components/StepHeader.vue';
import { reportLocation } from '@/lib/reportContext';
import { summaryText } from '@/lib/summaryText';
import { useBillStore } from '@/stores/bill';
import { useShareStore } from '@/stores/share';

const billStore = useBillStore();
const shareStore = useShareStore();
const copied = ref(false);
const route = useRoute();
const { t } = useI18n();

onMounted(() => {
  void shareStore.share();
});

const statusLabel = computed(() => t(`share.status.${shareStore.status}`));

const errorMessage = computed(() => {
  switch (shareStore.error) {
    case 'offline':
      return t('share.errors.offline');
    case 'rate_limited':
      return t('share.errors.rate_limited');
    case null:
      return null;
    default:
      return t('share.errors.other');
  }
});

async function copyLink(): Promise<void> {
  if (!shareStore.url) return;
  try {
    await navigator.clipboard.writeText(shareStore.url);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    // Clipboard blocked; the link is still visible to copy by hand.
  }
}

async function sendInChat(): Promise<void> {
  if (!shareStore.url) return;
  const details = t('share.seeDetails', { url: shareStore.url });
  const text = `${summaryText(billStore.bill, billStore.breakdown)}\n\n${details}`;
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: t('share.shareTitle'), text, url: shareStore.url });
    } catch {
      // The person closed the share sheet.
    }
  } else {
    await copyLink();
  }
}
</script>

<template>
  <main class="flex min-h-dvh flex-col gap-6 pt-14">
    <StepHeader :title="t('share.title')" :back="{ name: 'summary' }">
      <template #actions>
        <span
          role="status"
          class="flex h-9 items-center gap-2 rounded-full px-3 text-[13px] font-bold"
          :class="
            shareStore.status === 'error'
              ? 'bg-warning-soft text-warning-ink'
              : 'bg-success-soft text-success-ink'
          "
        >
          <span
            class="size-2 rounded-full"
            :class="{
              'bg-success': shareStore.status === 'saved',
              'bg-warning-line': shareStore.status === 'error',
              'bg-success animate-pulse':
                shareStore.status === 'saving' || shareStore.status === 'idle',
            }"
          />
          {{ statusLabel }}
        </span>
      </template>
    </StepHeader>

    <p class="text-ink-muted -mt-2 text-[15px] leading-relaxed">
      {{ t('share.intro') }}
    </p>

    <div class="card shadow-ink/5 mx-auto w-full max-w-[280px] rounded-[28px] p-5 shadow-xl">
      <QrCode v-if="shareStore.url" :value="shareStore.url" :label="t('share.qrLabel')" />
      <div v-else class="bg-surface-sunken aspect-square w-full animate-pulse rounded-xl" />
    </div>

    <div
      v-if="errorMessage"
      role="alert"
      class="bg-warning-soft text-warning-ink rounded-2xl px-4 py-3 text-sm font-semibold"
    >
      {{ errorMessage }}
      <button type="button" class="ml-1 underline" @click="shareStore.share()">
        {{ t('share.retry') }}
      </button>
      <div
        v-if="shareStore.errorRef && shareStore.error !== 'offline'"
        class="mt-1 flex items-center justify-between gap-3 font-normal"
      >
        <ErrorReference :request-id="shareStore.errorRef" />
        <RouterLink
          :to="reportLocation(route.fullPath, { ref: shareStore.errorRef, topic: 'share' })"
          class="text-xs font-semibold underline underline-offset-2"
        >
          {{ t('common.reportThisProblem') }}
        </RouterLink>
      </div>
    </div>

    <div class="card flex items-center gap-2.5 py-2 pr-2 pl-4">
      <span class="min-w-0 flex-1 truncate text-[15px] font-semibold" data-testid="share-url">
        {{ shareStore.url ?? t('share.creatingLink') }}
      </span>
      <button
        type="button"
        class="bg-inverse text-inverse-ink h-11 shrink-0 rounded-xl px-4 text-sm font-bold disabled:opacity-40"
        :disabled="!shareStore.url"
        @click="copyLink"
      >
        {{ copied ? t('share.copied') : t('share.copyLink') }}
      </button>
    </div>

    <p class="text-ink-muted flex items-center justify-center gap-2 text-[13px]">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      {{ t('share.guestsCanView') }}
    </p>

    <div class="bg-surface sticky bottom-0 mt-auto pt-3 pb-8">
      <button type="button" class="btn-primary" :disabled="!shareStore.url" @click="sendInChat">
        <AppIcon name="share" />
        {{ t('share.sendInChat') }}
      </button>
    </div>
  </main>
</template>
