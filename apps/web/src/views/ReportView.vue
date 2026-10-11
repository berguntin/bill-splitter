<script setup lang="ts">
import { anonymizeBill } from '@bill-splitter/core';
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import AppIcon from '@/components/AppIcon.vue';
import StepHeader from '@/components/StepHeader.vue';
import { sendReport, type ReportAttachment, type ReportError, type ReportTopic } from '@/lib/api';
import { compressImage } from '@/lib/compressImage';
import { formatReference, lastScanImage } from '@/lib/diagnostics';
import {
  ATTACHABLE_TYPES,
  blobToBase64,
  collectReportContext,
  topicForScreen,
} from '@/lib/reportContext';
import { useBillStore } from '@/stores/bill';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const billStore = useBillStore();

function queryString(key: string): string | undefined {
  const value = route.query[key];
  return typeof value === 'string' && value ? value : undefined;
}

/** Where the report was started; the user goes back there afterwards. */
const from = queryString('from') ?? '/';
const fromScreen = (() => {
  const resolved = router.resolve(from);
  return resolved.matched.length && resolved.name ? String(resolved.name) : undefined;
})();
const errorRef = queryString('ref');

const TOPICS: ReportTopic[] = ['scan', 'split', 'share', 'other'];

const requestedTopic = queryString('topic');
const topic = ref<ReportTopic>(
  TOPICS.includes(requestedTopic as ReportTopic)
    ? (requestedTopic as ReportTopic)
    : topicForScreen(fromScreen),
);
const description = ref('');
const email = ref('');
const includeBill = ref(billStore.hasProgress);

const receiptPhoto = lastScanImage();
const receiptPhotoUrl = receiptPhoto ? URL.createObjectURL(receiptPhoto) : null;
const includeReceipt = ref(false);
const screenshot = ref<Blob | null>(null);
const screenshotUrl = ref<string | null>(null);
const screenshotInput = ref<HTMLInputElement | null>(null);

const state = ref<'editing' | 'sending' | 'sent'>('editing');
const error = ref<ReportError | null>(null);
const reportId = ref<string | null>(null);

const emailLooksValid = computed(
  () => !email.value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()),
);
const canSend = computed(
  () => description.value.trim().length > 0 && emailLooksValid.value && state.value === 'editing',
);

async function onScreenshotChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const compressed = await compressImage(file);
  setScreenshot(ATTACHABLE_TYPES.includes(compressed.type) ? compressed : null);
}

function setScreenshot(blob: Blob | null): void {
  if (screenshotUrl.value) URL.revokeObjectURL(screenshotUrl.value);
  screenshot.value = blob;
  screenshotUrl.value = blob ? URL.createObjectURL(blob) : null;
}

async function attachment(kind: ReportAttachment['kind'], blob: Blob): Promise<ReportAttachment> {
  return { kind, mediaType: blob.type, data: await blobToBase64(blob) };
}

async function submit(): Promise<void> {
  if (!canSend.value) return;
  state.value = 'sending';
  error.value = null;

  const attachments: ReportAttachment[] = [];
  if (includeReceipt.value && receiptPhoto && ATTACHABLE_TYPES.includes(receiptPhoto.type)) {
    attachments.push(await attachment('receipt', receiptPhoto));
  }
  if (screenshot.value) attachments.push(await attachment('screenshot', screenshot.value));

  const result = await sendReport({
    description: description.value.trim(),
    ...(email.value.trim() ? { email: email.value.trim() } : {}),
    topic: topic.value,
    context: collectReportContext({
      route: from,
      ...(fromScreen ? { screen: fromScreen } : {}),
      ...(errorRef ? { errorRef } : {}),
    }),
    ...(includeBill.value && billStore.hasProgress ? { bill: anonymizeBill(billStore.bill) } : {}),
    attachments,
  });

  if (result.ok) {
    reportId.value = result.id;
    state.value = 'sent';
  } else {
    error.value = result.error;
    state.value = 'editing';
  }
}

function goBack(): void {
  void router.replace(from);
}

onBeforeUnmount(() => {
  if (receiptPhotoUrl) URL.revokeObjectURL(receiptPhotoUrl);
  setScreenshot(null);
});
</script>

<template>
  <main class="flex min-h-dvh flex-col gap-5 pt-14 pb-9">
    <StepHeader :title="t('report.title')" :back="from" hide-report />

    <section
      v-if="state === 'sent'"
      class="flex flex-1 flex-col items-center justify-center gap-3 text-center"
      role="status"
    >
      <span
        class="bg-success-soft text-success-ink flex size-16 items-center justify-center rounded-full"
      >
        <AppIcon name="check" :size="32" />
      </span>
      <h2 class="text-2xl font-extrabold">{{ t('report.thanks') }}</h2>
      <p class="text-ink-muted max-w-xs">
        {{ t('report.thanksText') }}
      </p>
      <p v-if="reportId" class="text-ink-muted text-sm">
        {{ t('report.reference') }}
        <span class="text-ink font-mono font-semibold tracking-wide select-all">
          {{ formatReference(reportId) }}
        </span>
      </p>
      <button type="button" class="btn-primary mt-6" @click="goBack">
        {{ t('report.backToApp') }}
      </button>
    </section>

    <form v-else class="flex flex-1 flex-col gap-5" novalidate @submit.prevent="submit">
      <p class="text-ink-muted -mt-1 text-[15px] leading-relaxed">
        {{ t('report.intro') }}
      </p>

      <fieldset class="flex flex-col gap-2.5">
        <legend class="mb-2.5 text-[15px] font-bold">{{ t('report.topic') }}</legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="option in TOPICS"
            :key="option"
            class="has-checked:bg-inverse has-checked:text-inverse-ink has-checked:border-inverse border-line bg-surface-raised has-focus-visible:ring-accent flex h-10 cursor-pointer items-center rounded-full border px-4 text-sm font-semibold transition has-focus-visible:ring-2"
          >
            <input v-model="topic" type="radio" name="topic" :value="option" class="sr-only" />
            {{ t(`report.topics.${option}`) }}
          </label>
        </div>
      </fieldset>

      <label class="flex flex-col gap-2">
        <span class="text-[15px] font-bold">{{ t('report.whatHappened') }}</span>
        <textarea
          v-model="description"
          rows="5"
          maxlength="5000"
          required
          class="field h-auto min-h-32 resize-y py-3 leading-relaxed"
          :placeholder="t('report.descriptionPlaceholder')"
        />
      </label>

      <label class="flex flex-col gap-2">
        <span class="text-[15px] font-bold">
          {{ t('report.email') }}
          <span class="text-ink-muted font-medium">{{ t('report.optional') }}</span>
        </span>
        <input
          v-model="email"
          type="email"
          inputmode="email"
          autocomplete="email"
          class="field"
          :aria-invalid="!emailLooksValid"
          :placeholder="t('report.emailPlaceholder')"
        />
        <span v-if="!emailLooksValid" class="text-warning-ink text-sm font-semibold">
          {{ t('report.emailInvalid') }}
        </span>
      </label>

      <div class="flex flex-col gap-2.5">
        <span class="text-[15px] font-bold">{{ t('report.attach') }}</span>

        <label v-if="billStore.hasProgress" class="card flex cursor-pointer items-start gap-3 p-4">
          <input v-model="includeBill" type="checkbox" class="accent-accent mt-1 size-5 shrink-0" />
          <span class="flex flex-col gap-0.5">
            <span class="text-[15px] font-semibold">{{ t('report.bill') }}</span>
            <span class="text-ink-muted text-sm">
              {{ t('report.billHint') }}
            </span>
          </span>
        </label>

        <label v-if="receiptPhotoUrl" class="card flex cursor-pointer items-center gap-3 p-4">
          <input v-model="includeReceipt" type="checkbox" class="accent-accent size-5 shrink-0" />
          <span class="flex flex-1 flex-col gap-0.5">
            <span class="text-[15px] font-semibold">{{ t('report.receiptPhoto') }}</span>
            <span class="text-ink-muted text-sm">{{ t('report.receiptPhotoHint') }}</span>
          </span>
          <img
            :src="receiptPhotoUrl"
            alt=""
            class="border-line size-14 shrink-0 rounded-lg border object-cover"
          />
        </label>

        <div v-if="screenshotUrl" class="card flex items-center gap-3 p-4">
          <img
            :src="screenshotUrl"
            :alt="t('report.screenshotAlt')"
            class="border-line size-14 shrink-0 rounded-lg border object-cover"
          />
          <span class="flex-1 text-[15px] font-semibold">{{ t('report.screenshot') }}</span>
          <button
            type="button"
            class="icon-btn"
            :aria-label="t('report.removeScreenshot')"
            @click="setScreenshot(null)"
          >
            <AppIcon name="close" />
          </button>
        </div>
        <button
          v-else
          type="button"
          class="border-line text-ink-muted flex h-13 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed text-[15px] font-semibold"
          @click="screenshotInput?.click()"
        >
          <AppIcon name="image" />
          {{ t('report.addScreenshot') }}
        </button>
        <input
          ref="screenshotInput"
          type="file"
          accept="image/*"
          class="hidden"
          @change="onScreenshotChosen"
        />
      </div>

      <details class="text-ink-muted text-sm">
        <summary class="cursor-pointer font-semibold">{{ t('report.whatElse') }}</summary>
        <p class="mt-2 leading-relaxed">
          {{ t('report.whatElseText') }}
          <template v-if="errorRef">
            {{ t('report.whatElseRef', { ref: formatReference(errorRef) }) }}
          </template>
        </p>
      </details>

      <p
        v-if="error"
        role="alert"
        class="bg-warning-soft text-warning-ink rounded-2xl px-4 py-3 text-sm font-semibold"
      >
        {{ t(`report.errors.${error}`) }}
      </p>

      <div class="flex-1" />

      <button type="submit" class="btn-primary" :disabled="!canSend">
        {{ state === 'sending' ? t('report.sending') : t('report.send') }}
      </button>
    </form>
  </main>
</template>
