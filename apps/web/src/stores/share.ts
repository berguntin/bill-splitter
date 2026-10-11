import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { createSharedBill, updateSharedBill, type Failure, type ShareError } from '@/lib/api';
import { loadJson, saveJson } from '@/lib/storage';
import { useBillStore } from './bill';

export const SHARE_STORAGE_KEY = 'bill-splitter/share/v1';

/** Wait this long after the last edit before pushing, so a burst of taps is one request. */
export const SYNC_DELAY_MS = 800;

interface ShareLink {
  /** Local bill this link belongs to; a new bill means a new link. */
  localBillId: string;
  remoteId: string;
  ownerToken: string;
}

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error';

function isShareLink(value: unknown): value is ShareLink {
  if (typeof value !== 'object' || value === null) return false;
  const link = value as Partial<ShareLink>;
  return (
    typeof link.localBillId === 'string' &&
    typeof link.remoteId === 'string' &&
    typeof link.ownerToken === 'string'
  );
}

/**
 * Publishes the current bill so guests can follow it from a link or QR code,
 * then keeps the published copy in sync with every local edit.
 */
export const useShareStore = defineStore('share', () => {
  const billStore = useBillStore();

  const link = ref<ShareLink | null>(loadJson(SHARE_STORAGE_KEY, isShareLink));
  const status = ref<SyncStatus>('idle');
  const error = ref<ShareError | null>(null);
  /** Request id of the last failure, to quote when reporting it. */
  const errorRef = ref<string | null>(null);

  watch(link, (value) => saveJson(SHARE_STORAGE_KEY, value), { deep: true });

  const activeLink = computed(() =>
    link.value?.localBillId === billStore.bill.id ? link.value : null,
  );
  const isShared = computed(() => activeLink.value !== null);
  const url = computed(() =>
    activeLink.value
      ? new URL(`/b/${activeLink.value.remoteId}`, window.location.origin).href
      : null,
  );

  let inFlight: Promise<void> | null = null;
  let pendingAgain = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  /** Publishes the bill, or pushes the latest version if it is already published. */
  async function share(): Promise<boolean> {
    clearTimeout(timer);
    if (inFlight) {
      // Another push is running; make sure the latest edits follow it.
      pendingAgain = true;
      await inFlight;
      return isShared.value && status.value === 'saved';
    }
    inFlight = push().finally(() => {
      inFlight = null;
    });
    await inFlight;
    if (pendingAgain) {
      pendingAgain = false;
      return share();
    }
    return status.value === 'saved';
  }

  async function push(): Promise<void> {
    status.value = 'saving';
    const bill = billStore.bill;
    const current = activeLink.value;

    if (current) {
      const result = await updateSharedBill(current.remoteId, current.ownerToken, bill);
      if (result.ok) return saved();
      // Expired or no longer ours: publish again under a new link.
      if (result.error !== 'not_found' && result.error !== 'forbidden') return failed(result);
    }

    const created = await createSharedBill(bill);
    if (!created.ok) return failed(created);
    link.value = {
      localBillId: bill.id,
      remoteId: created.value.id,
      ownerToken: created.value.ownerToken,
    };
    saved();
  }

  function saved(): void {
    status.value = 'saved';
    error.value = null;
    errorRef.value = null;
  }

  function failed(failure: Failure<ShareError>): void {
    status.value = 'error';
    error.value = failure.error;
    errorRef.value = failure.requestId;
  }

  // Keep guests up to date while the bill is shared.
  watch(
    () => billStore.bill,
    () => {
      if (!isShared.value) return;
      clearTimeout(timer);
      timer = setTimeout(() => void share(), SYNC_DELAY_MS);
    },
    { deep: true },
  );

  function stopSharing(): void {
    clearTimeout(timer);
    link.value = null;
    status.value = 'idle';
    error.value = null;
    errorRef.value = null;
  }

  return { isShared, url, status, error, errorRef, share, stopSharing };
});
