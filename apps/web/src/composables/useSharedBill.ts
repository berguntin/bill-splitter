import type { Bill, DinerGroup } from '@bill-splitter/core';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { fetchSharedBill, setSharedGroups, type Failure, type ShareError } from '@/lib/api';

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

  /**
   * Says who pays together. Shown at once, and rolled back if the server
   * refuses; the next refresh brings in anyone else's changes.
   */
  async function setGroups(groups: DinerGroup[]): Promise<true | Failure<ShareError>> {
    if (!bill.value) return true;
    const previous = bill.value.groups;
    bill.value = { ...bill.value, groups };
    const result = await setSharedGroups(id, groups);
    if (!result.ok) {
      if (bill.value) bill.value = { ...bill.value, groups: previous ?? [] };
      return result;
    }
    bill.value = result.value.bill;
    updatedAt.value = new Date(result.value.updatedAt);
    // The cached ETag is now stale; the next poll fetches the full bill.
    etag = null;
    return true;
  }

  return { bill, updatedAt, state, error, errorRef, refresh, setGroups };
}
