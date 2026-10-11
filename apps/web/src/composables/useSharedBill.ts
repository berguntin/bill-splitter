import type { Bill } from '@bill-splitter/core';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { fetchSharedBill, type ShareError } from '@/lib/api';

export const POLL_INTERVAL_MS = 5000;

/**
 * Follows a shared bill by polling. Requests carry the last ETag, so an
 * unchanged bill costs a bodiless 304. Polling pauses while the tab is hidden.
 */
export function useSharedBill(id: string) {
  const bill = ref<Bill | null>(null);
  const updatedAt = ref<Date | null>(null);
  const state = ref<'loading' | 'ready' | 'not_found' | 'error'>('loading');
  const error = ref<ShareError | null>(null);
  const errorRef = ref<string | null>(null);
  let etag: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  async function refresh(): Promise<void> {
    const result = await fetchSharedBill(id, etag);
    if (stopped) return;
    if (result.ok) {
      error.value = null;
      errorRef.value = null;
      if (result.changed) {
        bill.value = result.value.bill;
        updatedAt.value = new Date(result.value.updatedAt);
        etag = result.etag;
      }
      state.value = 'ready';
    } else if (result.error === 'not_found') {
      state.value = 'not_found';
      return; // Expired or never existed; nothing to poll for.
    } else {
      error.value = result.error;
      errorRef.value = result.requestId;
      // Keep showing the last known bill when a refresh fails.
      if (!bill.value) state.value = 'error';
    }
    schedule();
  }

  function schedule(): void {
    clearTimeout(timer);
    if (!stopped && !document.hidden) timer = setTimeout(() => void refresh(), POLL_INTERVAL_MS);
  }

  function onVisibilityChange(): void {
    if (document.hidden) clearTimeout(timer);
    else void refresh();
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibilityChange);
    void refresh();
  });

  onBeforeUnmount(() => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  });

  return { bill, updatedAt, state, error, errorRef, refresh };
}
