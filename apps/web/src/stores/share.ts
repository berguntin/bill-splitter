import type { Bill, DinerGroup, DinerId } from '@bill-splitter/core';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import {
  createSharedBill,
  fetchSharedBill,
  setSharedGroups,
  setSharedPaid,
  updateSharedBill,
  type Failure,
  type ShareError,
} from '@/lib/api';
import { followSharedBill } from '@/lib/followSharedBill';
import { loadJson, saveJson } from '@/lib/storage';
import { useBillStore } from './bill';

export const SHARE_STORAGE_KEY = 'bill-splitter/share/v2';
/** Before recent bills, only the current bill's link was kept. */
const LEGACY_SHARE_STORAGE_KEY = 'bill-splitter/share/v1';
/** Links kept, one per recent bill. */
const MAX_LINKS = 30;

/** Wait this long after the last edit before pushing, so a burst of taps is one request. */
export const SYNC_DELAY_MS = 800;

interface ShareLink {
  /** Local bill this link belongs to; a new bill means a new link. */
  localBillId: string;
  remoteId: string;
  ownerToken: string;
  /** Groups as last agreed with the server, to tell local changes from remote ones. */
  syncedGroups?: DinerGroup[];
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

function isShareLinkList(value: unknown): value is ShareLink[] {
  return Array.isArray(value) && value.every(isShareLink);
}

function loadLinks(): ShareLink[] {
  const links = loadJson(SHARE_STORAGE_KEY, isShareLinkList);
  if (links) return links;
  const legacy = loadJson(LEGACY_SHARE_STORAGE_KEY, isShareLink);
  return legacy ? [legacy] : [];
}

/** Order-insensitive fingerprint of a set of groups. */
function groupsKey(groups: DinerGroup[] | undefined): string {
  return JSON.stringify(
    (groups ?? [])
      .map((group) => [...group.dinerIds].sort())
      .sort((a, b) => a.join().localeCompare(b.join())),
  );
}

/** Everything the owner alone controls: the bill without its groups and payments. */
function ownerKey({ groups: _groups, payments: _payments, ...rest }: Bill): string {
  return JSON.stringify(rest);
}

/**
 * Publishes the current bill so guests can follow it from a link or QR code,
 * then keeps the published copy in sync with every local edit.
 *
 * Groups (who pays together) can also be changed by guests. They are synced
 * separately: a local change is sent, a remote one is applied, and when both
 * happen at once the local one wins.
 */
export const useShareStore = defineStore('share', () => {
  const billStore = useBillStore();

  /** One link per published bill, so a recent bill reopened keeps its QR code. */
  const links = ref<ShareLink[]>(loadLinks());
  const status = ref<SyncStatus>('idle');
  const error = ref<ShareError | null>(null);
  /** Request id of the last failure, to quote when reporting it. */
  const errorRef = ref<string | null>(null);

  watch(links, (value) => saveJson(SHARE_STORAGE_KEY, value), { deep: true });

  const activeLink = computed(
    () => links.value.find((candidate) => candidate.localBillId === billStore.bill.id) ?? null,
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
  /** What the server has of the owner's part of the bill, to skip pushes that change nothing. */
  let pushedOwnerKey: string | null = null;

  /** Publishes the bill, or pushes the latest version if it is already published. */
  function share(): Promise<boolean> {
    // Asked for explicitly (e.g. "Retry"): push even if nothing seems to have changed.
    pushedOwnerKey = null;
    return sync();
  }

  async function sync(): Promise<boolean> {
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
      return sync();
    }
    return status.value === 'saved';
  }

  async function push(): Promise<void> {
    status.value = 'saving';
    const bill = billStore.bill;
    const current = activeLink.value;

    if (current) {
      let remote: Bill | null = null;
      if (ownerKey(bill) !== pushedOwnerKey) {
        const key = ownerKey(bill);
        const result = await updateSharedBill(current.remoteId, current.ownerToken, bill);
        if (result.ok) {
          pushedOwnerKey = key;
          remote = result.value.bill;
        } else if (result.error !== 'not_found' && result.error !== 'forbidden') {
          return failed(result);
        } else {
          // Expired or no longer ours: publish again under a new link.
          return publish(bill);
        }
      }
      const reconciled = await reconcileGroups(remote);
      return reconciled === true ? saved() : failed(reconciled);
    }

    return publish(bill);
  }

  async function publish(bill: Bill): Promise<void> {
    const key = ownerKey(bill);
    const created = await createSharedBill(bill);
    if (!created.ok) return failed(created);
    pushedOwnerKey = key;
    links.value = [
      {
        localBillId: bill.id,
        remoteId: created.value.id,
        ownerToken: created.value.ownerToken,
        syncedGroups: created.value.bill.groups ?? [],
      },
      ...links.value.filter((candidate) => candidate.localBillId !== bill.id),
    ].slice(0, MAX_LINKS);
    saved();
  }

  /**
   * Brings local and shared groups together. `remote` is the latest shared
   * bill, if one was just received.
   */
  async function reconcileGroups(remote: Bill | null): Promise<true | Failure<ShareError>> {
    const current = activeLink.value;
    if (!current) return true;
    // Payments are only ever changed on the server; the local copy just mirrors them.
    if (remote) billStore.applySharedPayments(remote.payments ?? []);
    const local = billStore.bill.groups ?? [];
    const synced = current.syncedGroups ?? [];

    if (groupsKey(local) !== groupsKey(synced)) {
      const result = await setSharedGroups(current.remoteId, local);
      if (!result.ok) return result;
      current.syncedGroups = result.value.bill.groups ?? [];
      if (groupsKey(current.syncedGroups) !== groupsKey(billStore.bill.groups)) {
        billStore.applySharedGroups(current.syncedGroups);
      }
      return true;
    }
    if (remote && groupsKey(remote.groups) !== groupsKey(synced)) {
      current.syncedGroups = remote.groups ?? [];
      billStore.applySharedGroups(current.syncedGroups);
    }
    return true;
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
    (bill) => {
      if (!isShared.value) return;
      const groupsChanged = groupsKey(bill.groups) !== groupsKey(activeLink.value?.syncedGroups);
      if (!groupsChanged && ownerKey(bill) === pushedOwnerKey) return;
      clearTimeout(timer);
      timer = setTimeout(() => void sync(), SYNC_DELAY_MS);
    },
    { deep: true },
  );

  // Pick up groups that guests set, live while the bill is shared and the app is visible.
  let unfollow: (() => void) | null = null;
  let etag: string | null = null;

  async function pullRemote(): Promise<void> {
    const current = activeLink.value;
    if (!current || inFlight) return;
    const result = await fetchSharedBill(current.remoteId, etag);
    if (result.ok && result.changed && activeLink.value === current) {
      etag = result.etag;
      await reconcileGroups(result.value.bill);
    }
  }

  watch(
    () => activeLink.value?.remoteId,
    (remoteId) => {
      unfollow?.();
      unfollow = null;
      etag = null;
      if (remoteId) unfollow = followSharedBill(remoteId, () => void pullRemote());
    },
    { immediate: true },
  );

  function stopSharing(): void {
    clearTimeout(timer);
    forget(billStore.bill.id);
    status.value = 'idle';
    error.value = null;
    errorRef.value = null;
  }

  /** Notes that these diners paid (or not), e.g. someone who handed over cash. */
  async function setPaid(dinerIds: DinerId[], paid: boolean): Promise<boolean> {
    const current = activeLink.value;
    if (!current) return false;
    const result = await setSharedPaid(current.remoteId, dinerIds, paid);
    if (!result.ok) {
      failed(result);
      return false;
    }
    billStore.applySharedPayments(result.value.bill.payments ?? []);
    return true;
  }

  /** Drops the link of a bill that is gone from this device. */
  function forget(localBillId: string): void {
    links.value = links.value.filter((candidate) => candidate.localBillId !== localBillId);
  }

  /** Whether a bill (current or recent) has a link guests can open. */
  function isBillShared(localBillId: string): boolean {
    return links.value.some((candidate) => candidate.localBillId === localBillId);
  }

  return {
    isShared,
    url,
    status,
    error,
    errorRef,
    share,
    setPaid,
    stopSharing,
    forget,
    isBillShared,
  };
});
