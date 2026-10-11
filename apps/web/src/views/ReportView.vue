<script setup lang="ts">
import { anonymizeBill } from '@bill-splitter/core';
import { computed, onBeforeUnmount, ref } from 'vue';
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

const TOPICS: { value: ReportTopic; label: string }[] = [
  { value: 'scan', label: 'Reading the receipt' },
  { value: 'split', label: 'Splitting the bill' },
  { value: 'share', label: 'Sharing' },
  { value: 'other', label: 'Something else' },
];

const requestedTopic = queryString('topic');
const topic = ref<ReportTopic>(
  TOPICS.some((option) => option.value === requestedTopic)
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

const ERROR_MESSAGES: Record<ReportError, string> = {
  invalid: "Something in the report wasn't accepted. Try without the attachments.",
  too_large: 'The photos are too large. Try without one of them.',
  rate_limited: "You've sent several reports in a short time. Try again later.",
  offline: "We couldn't reach the server. Check your connection and try again.",
  timeout: 'Sending took too long. Try again, maybe without photos.',
  server: 'Something went wrong on our side. Try again in a moment.',
};

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
    <StepHeader title="Report a problem" :back="from" hide-report />

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
      <h2 class="text-2xl font-extrabold">Thanks, we got it</h2>
      <p class="text-ink-muted max-w-xs">
        We'll look into it. If you left your email, we may write to you about it.
      </p>
      <p v-if="reportId" class="text-ink-muted text-sm">
        Reference
        <span class="text-ink font-mono font-semibold tracking-wide select-all">
          {{ formatReference(reportId) }}
        </span>
      </p>
      <button type="button" class="btn-primary mt-6" @click="goBack">Back to the app</button>
    </section>

    <form v-else class="flex flex-1 flex-col gap-5" novalidate @submit.prevent="submit">
      <p class="text-ink-muted -mt-1 text-[15px] leading-relaxed">
        Tell us what went wrong. Technical details are attached so we can find the cause.
      </p>

      <fieldset class="flex flex-col gap-2.5">
        <legend class="mb-2.5 text-[15px] font-bold">What is it about?</legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="option in TOPICS"
            :key="option.value"
            class="has-checked:bg-inverse has-checked:text-inverse-ink has-checked:border-inverse border-line bg-surface-raised has-focus-visible:ring-accent flex h-10 cursor-pointer items-center rounded-full border px-4 text-sm font-semibold transition has-focus-visible:ring-2"
          >
            <input
              v-model="topic"
              type="radio"
              name="topic"
              :value="option.value"
              class="sr-only"
            />
            {{ option.label }}
          </label>
        </div>
      </fieldset>

      <label class="flex flex-col gap-2">
        <span class="text-[15px] font-bold">What happened?</span>
        <textarea
          v-model="description"
          rows="5"
          maxlength="5000"
          required
          class="field h-auto min-h-32 resize-y py-3 leading-relaxed"
          placeholder="For example: the total doesn't match the receipt after adding a tip."
        />
      </label>

      <label class="flex flex-col gap-2">
        <span class="text-[15px] font-bold">
          Email <span class="text-ink-muted font-medium">(optional)</span>
        </span>
        <input
          v-model="email"
          type="email"
          inputmode="email"
          autocomplete="email"
          class="field"
          :aria-invalid="!emailLooksValid"
          placeholder="So we can follow up with you"
        />
        <span v-if="!emailLooksValid" class="text-warning-ink text-sm font-semibold">
          This email doesn't look right.
        </span>
      </label>

      <div class="flex flex-col gap-2.5">
        <span class="text-[15px] font-bold">Attach</span>

        <label v-if="billStore.hasProgress" class="card flex cursor-pointer items-start gap-3 p-4">
          <input v-model="includeBill" type="checkbox" class="accent-accent mt-1 size-5 shrink-0" />
          <span class="flex flex-col gap-0.5">
            <span class="text-[15px] font-semibold">The current bill</span>
            <span class="text-ink-muted text-sm">
              Items, amounts and who had what. Names are replaced with Person 1, Person 2…
            </span>
          </span>
        </label>

        <label v-if="receiptPhotoUrl" class="card flex cursor-pointer items-center gap-3 p-4">
          <input v-model="includeReceipt" type="checkbox" class="accent-accent size-5 shrink-0" />
          <span class="flex flex-1 flex-col gap-0.5">
            <span class="text-[15px] font-semibold">The receipt photo</span>
            <span class="text-ink-muted text-sm">Helps us fix receipts that were misread.</span>
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
            alt="Screenshot to attach"
            class="border-line size-14 shrink-0 rounded-lg border object-cover"
          />
          <span class="flex-1 text-[15px] font-semibold">Screenshot</span>
          <button
            type="button"
            class="icon-btn"
            aria-label="Remove screenshot"
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
          Add a screenshot
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
        <summary class="cursor-pointer font-semibold">What else is sent</summary>
        <p class="mt-2 leading-relaxed">
          The app version, your device and browser, the screens you visited, recent errors and
          server requests in this session<template v-if="errorRef">
            and the error reference
            <span class="font-mono">{{ formatReference(errorRef) }}</span></template
          >. Reports are deleted after 90 days.
        </p>
      </details>

      <p
        v-if="error"
        role="alert"
        class="bg-warning-soft text-warning-ink rounded-2xl px-4 py-3 text-sm font-semibold"
      >
        {{ ERROR_MESSAGES[error] }}
      </p>

      <div class="flex-1" />

      <button type="submit" class="btn-primary" :disabled="!canSend">
        {{ state === 'sending' ? 'Sending…' : 'Send report' }}
      </button>
    </form>
  </main>
</template>
