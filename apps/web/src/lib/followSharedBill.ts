import { apiUrl } from './api';

/** Polling interval when live updates are unavailable (old browser, proxy, server limit). */
export const FALLBACK_POLL_MS = 5000;
/** Safety-net polling while live updates are connected, in case an event is missed. */
export const LIVE_POLL_MS = 30_000;

/**
 * Calls `onChange` whenever a shared bill may have changed: at once through
 * server-sent events, and on a timer as a fallback. Everything pauses while
 * the page is hidden and catches up when it is shown again. Callers refetch
 * with the bill's ETag, so a call when nothing changed costs a 304.
 *
 * Returns a function that stops following.
 */
export function followSharedBill(id: string, onChange: () => void): () => void {
  let source: EventSource | null = null;
  let connected = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  function schedule(): void {
    clearTimeout(timer);
    if (stopped || document.hidden) return;
    timer = setTimeout(
      () => {
        onChange();
        schedule();
      },
      connected ? LIVE_POLL_MS : FALLBACK_POLL_MS,
    );
  }

  function connect(): void {
    if (typeof EventSource === 'undefined' || source) return;
    source = new EventSource(apiUrl(`/api/bills/${encodeURIComponent(id)}/events`));
    source.onopen = () => {
      connected = true;
      schedule();
    };
    source.addEventListener('version', () => onChange());
    source.onerror = () => {
      // The browser reconnects on its own unless the server refused (then it is closed).
      connected = false;
      if (source?.readyState === EventSource.CLOSED) source = null;
      schedule();
    };
  }

  function disconnect(): void {
    source?.close();
    source = null;
    connected = false;
  }

  function onVisibilityChange(): void {
    if (document.hidden) {
      clearTimeout(timer);
      disconnect();
    } else {
      onChange();
      connect();
      schedule();
    }
  }

  document.addEventListener('visibilitychange', onVisibilityChange);
  if (!document.hidden) {
    connect();
    schedule();
  }

  return () => {
    stopped = true;
    clearTimeout(timer);
    disconnect();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
