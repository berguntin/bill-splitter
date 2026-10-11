import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { createBillEvents } from '../src/bills/events';
import { loadConfig } from '../src/config';
import { testDependencies } from './helpers';

describe('createBillEvents', () => {
  it('tells only the subscribers of that bill, until they leave', () => {
    const events = createBillEvents();
    const ana = { onChange: vi.fn(), onClose: vi.fn() };
    const other = { onChange: vi.fn(), onClose: vi.fn() };
    const leave = events.subscribe('bill-a', ana);
    events.subscribe('bill-b', other);

    events.publish('bill-a', { version: 2 });
    expect(ana.onChange).toHaveBeenCalledWith({ version: 2 });
    expect(other.onChange).not.toHaveBeenCalled();
    expect(events.count()).toBe(2);
    expect(events.count('bill-a')).toBe(1);

    leave();
    leave();
    events.publish('bill-a', { version: 3 });
    expect(ana.onChange).toHaveBeenCalledTimes(1);
    expect(events.count()).toBe(1);
  });

  it('ends every subscription on close', () => {
    const events = createBillEvents();
    const listener = { onChange: vi.fn(), onClose: vi.fn() };
    events.subscribe('bill-a', listener);

    events.close();

    expect(listener.onClose).toHaveBeenCalledOnce();
    expect(events.count()).toBe(0);
  });
});

describe('GET /api/bills/:id/events', () => {
  const servers: { close(): void }[] = [];
  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
  });

  async function start() {
    const dependencies = testDependencies();
    const server = createApp(loadConfig({ NODE_ENV: 'test' }), dependencies).listen(0);
    servers.push({ close: () => (dependencies.billEvents.close(), server.close()) });
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return { base, dependencies };
  }

  /** Reads server-sent events until `count` of them arrived. */
  async function readEvents(response: Response, count: number): Promise<string[]> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const found: string[] = [];
    while (found.length < count) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop()!;
      for (const part of parts) if (part.startsWith('event:')) found.push(part);
    }
    return found;
  }

  it('sends the current version, then one event per change', async () => {
    const { base, dependencies } = await start();
    const bill = {
      diners: [
        { id: 'ana', name: 'Ana', color: 'coral' },
        { id: 'ben', name: 'Ben', color: 'teal' },
      ],
      items: [{ name: 'Pizza', total: 1200 }],
    };
    const created = (await (
      await fetch(`${base}/api/bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bill }),
      })
    ).json()) as { id: string; ownerToken: string };

    const controller = new AbortController();
    const stream = await fetch(`${base}/api/bills/${created.id}/events`, {
      signal: controller.signal,
    });
    expect(stream.headers.get('content-type')).toBe('text/event-stream');
    const received = readEvents(stream, 3);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(dependencies.billEvents.count(created.id)).toBe(1);
    await fetch(`${base}/api/bills/${created.id}/groups`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groups: [{ id: 'g', dinerIds: ['ana', 'ben'] }] }),
    });
    await fetch(`${base}/api/bills/${created.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${created.ownerToken}`,
      },
      body: JSON.stringify({ bill: { ...bill, merchant: 'Casa Lola' } }),
    });

    expect(await received).toEqual([
      'event: version\ndata: {"version":1}',
      'event: version\ndata: {"version":2}',
      'event: version\ndata: {"version":3}',
    ]);
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(dependencies.billEvents.count()).toBe(0);
  });

  it('answers 404 for unknown bills', async () => {
    const { base } = await start();
    const response = await fetch(`${base}/api/bills/Abc1234567/events`);
    expect(response.status).toBe(404);
  });
});
