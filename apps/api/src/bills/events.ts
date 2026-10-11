/** What subscribers learn about a change: enough to decide whether to refetch. */
export interface BillChange {
  version: number;
}

interface Listener {
  onChange(change: BillChange): void;
  /** Called when the API shuts down, so open streams can end. */
  onClose(): void;
}

/**
 * Tells everyone following a shared bill that it changed. In-process: with
 * several API instances this would need a shared channel (e.g. MongoDB change
 * streams), and clients would still catch up through their fallback polling.
 */
export interface BillEvents {
  subscribe(billId: string, listener: Listener): () => void;
  publish(billId: string, change: BillChange): void;
  /** Open subscriptions, in total and for one bill. */
  count(billId?: string): number;
  /** Ends every subscription, e.g. on shutdown. */
  close(): void;
}

export function createBillEvents(): BillEvents {
  const listeners = new Map<string, Set<Listener>>();
  let total = 0;

  return {
    subscribe(billId, listener) {
      let set = listeners.get(billId);
      if (!set) {
        set = new Set();
        listeners.set(billId, set);
      }
      set.add(listener);
      total += 1;
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        total -= 1;
        set.delete(listener);
        if (set.size === 0) listeners.delete(billId);
      };
    },

    publish(billId, change) {
      for (const listener of listeners.get(billId) ?? []) listener.onChange(change);
    },

    count(billId) {
      return billId === undefined ? total : (listeners.get(billId)?.size ?? 0);
    },

    close() {
      const all = [...listeners.values()].flatMap((set) => [...set]);
      listeners.clear();
      total = 0;
      for (const listener of all) listener.onClose();
    },
  };
}
