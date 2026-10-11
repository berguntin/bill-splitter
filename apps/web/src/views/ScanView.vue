<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppIcon from '@/components/AppIcon.vue';
import ErrorReference from '@/components/ErrorReference.vue';
import { scanReceipt, type ScanError } from '@/lib/api';
import { compressImage } from '@/lib/compressImage';
import { reportLocation } from '@/lib/reportContext';
import { useBillStore } from '@/stores/bill';

const store = useBillStore();
const router = useRouter();
const route = useRoute();

const state = ref<'idle' | 'reading' | 'error'>('idle');
const error = ref<ScanError | null>(null);
/** Shown for failures worth reporting, to find the request in the API's logs. */
const errorRef = ref<string | null>(null);
const previewUrl = ref<string | null>(null);
const cameraInput = ref<HTMLInputElement | null>(null);
const galleryInput = ref<HTMLInputElement | null>(null);
let controller: AbortController | null = null;

const ERROR_MESSAGES: Record<ScanError, { title: string; hint: string }> = {
  not_a_receipt: {
    title: "That doesn't look like a receipt",
    hint: 'Try again with the whole receipt in the photo.',
  },
  unreadable: {
    title: "We couldn't read this receipt",
    hint: 'Try a sharper photo in better light, or enter the items yourself.',
  },
  unsupported_image: {
    title: "This image format isn't supported",
    hint: 'Use a JPEG, PNG or WebP photo.',
  },
  too_large: { title: 'This photo is too large', hint: 'Try a smaller photo.' },
  rate_limited: {
    title: 'Too many scans in a short time',
    hint: 'Wait a few minutes, or enter the items yourself.',
  },
  offline: {
    title: "We couldn't reach the server",
    hint: 'Check your connection and try again.',
  },
  timeout: {
    title: 'Reading the receipt took too long',
    hint: 'Try again, or enter the items yourself.',
  },
  server: { title: 'Something went wrong on our side', hint: 'Please try again in a moment.' },
};

const REPORTABLE = new Set<ScanError>(['unreadable', 'timeout', 'server']);

const message = computed(() => (error.value ? ERROR_MESSAGES[error.value] : null));

async function onFileChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  setPreview(URL.createObjectURL(file));
  state.value = 'reading';
  error.value = null;
  controller?.abort();
  controller = new AbortController();

  try {
    const result = await scanReceipt(await compressImage(file), controller.signal);
    if (result.ok) {
      store.loadScannedReceipt(result.receipt);
      await router.replace({ name: 'items' });
      return;
    }
    error.value = result.error;
    errorRef.value = REPORTABLE.has(result.error) ? result.requestId : null;
    state.value = 'error';
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === 'AbortError') return;
    error.value = 'server';
    errorRef.value = null;
    state.value = 'error';
  }
}

function setPreview(url: string | null): void {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = url;
}

function retry(): void {
  setPreview(null);
  state.value = 'idle';
  error.value = null;
}

function enterManually(): void {
  store.reset();
  void router.replace({ name: 'items' });
}

onBeforeUnmount(() => {
  controller?.abort();
  setPreview(null);
});
</script>

<template>
  <main class="bg-camera text-camera-ink -mx-5 flex min-h-dvh flex-col gap-5 px-5 pt-14 pb-10">
    <header class="flex items-center justify-between">
      <RouterLink
        :to="{ name: 'home' }"
        class="bg-camera-ink/10 flex size-11 items-center justify-center rounded-full"
        aria-label="Close"
      >
        <AppIcon name="close" />
      </RouterLink>
      <h1 class="text-[15px] font-semibold">Scan receipt</h1>
      <RouterLink
        :to="reportLocation(route.fullPath, { topic: 'scan' })"
        class="text-camera-muted flex size-11 items-center justify-center rounded-full"
        aria-label="Report a problem"
        title="Report a problem"
      >
        <AppIcon name="flag" :size="18" />
      </RouterLink>
    </header>

    <div
      class="bg-camera-panel relative flex flex-1 items-center justify-center overflow-hidden rounded-[28px]"
    >
      <img
        v-if="previewUrl"
        :src="previewUrl"
        alt="Your receipt photo"
        class="absolute inset-0 size-full object-contain"
        :class="{ 'opacity-60': state === 'reading' }"
      />
      <div v-else class="flex max-w-60 flex-col items-center gap-4 text-center">
        <AppIcon name="scan" :size="56" class="text-camera-muted" />
        <p class="text-camera-muted text-sm leading-relaxed">
          Lay the receipt flat in good light. Make sure the whole receipt, including the total, is
          in the photo.
        </p>
      </div>

      <template v-for="corner in ['tl', 'tr', 'bl', 'br']" :key="corner">
        <span
          aria-hidden="true"
          class="border-camera-ink absolute size-11"
          :class="{
            'top-7 left-7 rounded-tl-[18px] border-t-4 border-l-4': corner === 'tl',
            'top-7 right-7 rounded-tr-[18px] border-t-4 border-r-4': corner === 'tr',
            'bottom-7 left-7 rounded-bl-[18px] border-b-4 border-l-4': corner === 'bl',
            'right-7 bottom-7 rounded-br-[18px] border-r-4 border-b-4': corner === 'br',
          }"
        />
      </template>

      <div
        v-if="state === 'reading'"
        role="status"
        class="bg-camera/80 absolute bottom-20 flex items-center gap-2.5 rounded-full px-4 py-2 text-sm font-semibold"
      >
        <span class="bg-success size-2.5 animate-pulse rounded-full" />
        Reading your receipt…
      </div>
    </div>

    <section
      v-if="state === 'error' && message"
      role="alert"
      class="bg-camera-panel flex flex-col gap-3 rounded-2xl p-4"
    >
      <div class="flex flex-col gap-1">
        <p class="font-bold">{{ message.title }}</p>
        <p class="text-camera-muted text-sm">{{ message.hint }}</p>
        <ErrorReference v-if="errorRef" :request-id="errorRef" class="text-camera-muted" />
      </div>
      <div class="flex gap-2">
        <button
          type="button"
          class="bg-camera-ink text-camera h-11 flex-1 rounded-xl text-sm font-bold"
          @click="retry"
        >
          Try again
        </button>
        <button
          type="button"
          class="bg-camera-ink/10 h-11 flex-1 rounded-xl text-sm font-semibold"
          @click="enterManually"
        >
          Enter manually
        </button>
      </div>
      <RouterLink
        :to="reportLocation(route.fullPath, { ref: errorRef, topic: 'scan' })"
        class="text-camera-muted self-center text-sm font-semibold underline underline-offset-2"
      >
        Report this problem
      </RouterLink>
    </section>

    <template v-else>
      <p class="text-camera-muted text-center text-sm">
        {{
          state === 'reading'
            ? 'This takes a few seconds.'
            : 'Photos are only used to read the items and are never stored.'
        }}
      </p>

      <div class="flex items-center justify-between px-3">
        <button
          type="button"
          class="bg-camera-ink/10 flex size-13 items-center justify-center rounded-2xl disabled:opacity-40"
          aria-label="Choose a photo from the gallery"
          :disabled="state === 'reading'"
          @click="galleryInput?.click()"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="9" cy="9" r="2" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        </button>
        <button
          type="button"
          class="border-camera-ink flex size-20 items-center justify-center rounded-full border-4 transition active:scale-95 disabled:opacity-40"
          aria-label="Take photo"
          :disabled="state === 'reading'"
          @click="cameraInput?.click()"
        >
          <span class="bg-camera-ink size-[62px] rounded-full" />
        </button>
        <button
          type="button"
          class="flex size-13 items-center justify-center rounded-2xl text-[13px] font-semibold disabled:opacity-40"
          :disabled="state === 'reading'"
          @click="enterManually"
        >
          Type
        </button>
      </div>
    </template>

    <input
      ref="cameraInput"
      class="sr-only"
      type="file"
      accept="image/*"
      capture="environment"
      tabindex="-1"
      aria-hidden="true"
      data-testid="camera-input"
      @change="onFileChosen"
    />
    <input
      ref="galleryInput"
      class="sr-only"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      tabindex="-1"
      aria-hidden="true"
      data-testid="gallery-input"
      @change="onFileChosen"
    />
  </main>
</template>
