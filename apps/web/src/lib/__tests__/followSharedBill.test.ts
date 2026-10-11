import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FALLBACK_POLL_MS, followSharedBill, LIVE_POLL_MS } from '../followSharedBill';

/** Minimal EventSource that tests drive by hand. */
class FakeEventSource {
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];
  readyState = 0;
  closed = false;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, () => void>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }

  emit(type: string): void {
    this.listeners.get(type)?.();
  }

  close(): void {
    this.closed = true;
  }
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('followSharedBill', () => {
  const stops: (() => void)[] = [];
  const follow = (onChange: () => void): (() => void) => {
    const stop = followSharedBill('Abc1234567', onChange);
    stops.push(stop);
    return stop;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  afterEach(() => {
    for (const stop of stops.splice(0)) stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setHidden(false);
  });

  it('refetches on every live event and polls rarely while connected', () => {
    const onChange = vi.fn();
    const stop = follow(onChange);
    const [source] = FakeEventSource.instances;
    expect(source!.url).toBe('/api/bills/Abc1234567/events');

    source!.onopen!();
    source!.emit('version');
    expect(onChange).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(FALLBACK_POLL_MS);
    expect(onChange).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(LIVE_POLL_MS);
    expect(onChange).toHaveBeenCalledTimes(2);

    stop();
    expect(source!.closed).toBe(true);
  });

  it('polls often while live updates are down', () => {
    const onChange = vi.fn();
    follow(onChange);
    const [source] = FakeEventSource.instances;
    source!.onopen!();
    source!.readyState = FakeEventSource.CLOSED;
    source!.onerror!();

    vi.advanceTimersByTime(FALLBACK_POLL_MS);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('works without EventSource, by polling', () => {
    vi.stubGlobal('EventSource', undefined);
    const onChange = vi.fn();
    follow(onChange);

    vi.advanceTimersByTime(FALLBACK_POLL_MS * 2);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('pauses while hidden and catches up when shown', () => {
    const onChange = vi.fn();
    follow(onChange);
    const [first] = FakeEventSource.instances;

    setHidden(true);
    expect(first!.closed).toBe(true);
    vi.advanceTimersByTime(LIVE_POLL_MS);
    expect(onChange).not.toHaveBeenCalled();

    setHidden(false);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(FakeEventSource.instances).toHaveLength(2);
  });
});
