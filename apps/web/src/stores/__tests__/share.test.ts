import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { useBillStore } from '../bill';
import { FALLBACK_POLL_MS } from '@/lib/followSharedBill';
import { SYNC_DELAY_MS, useShareStore } from '../share';

type Handler = (url: string, init: RequestInit) => { status: number; body?: unknown };

function mockApi(handler: Handler) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const { status, body } = handler(url, init);
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const created = {
  id: 'Abc1234567',
  ownerToken: 'owner-secret',
  bill: {},
  version: 1,
  updatedAt: '2026-10-11T12:00:00Z',
  expiresAt: '2026-10-18T12:00:00Z',
};

function setUpBill() {
  const bill = useBillStore();
  bill.addDiner('Ana');
  bill.addItem({ name: 'Pizza', total: 1200 });
  return bill;
}

describe('useShareStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('publishes the bill once and exposes its public link', async () => {
    const fetchMock = mockApi(() => ({ status: 201, body: created }));
    setUpBill();
    const share = useShareStore();

    expect(await share.share()).toBe(true);

    expect(share.isShared).toBe(true);
    expect(share.url).toBe(`${window.location.origin}/b/Abc1234567`);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/bills',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('pushes later edits with the owner token, after a short pause', async () => {
    vi.useFakeTimers();
    const fetchMock = mockApi((_url, init) =>
      init.method === 'POST' ? { status: 201, body: created } : { status: 200, body: created },
    );
    const bill = setUpBill();
    const share = useShareStore();
    await share.share();

    bill.addItem({ name: 'Wine', total: 1800 });
    bill.addItem({ name: 'Water', total: 300 });
    await nextTick();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init = {}] = fetchMock.mock.calls[1]!;
    expect(url).toBe('/api/bills/Abc1234567');
    expect(init.method).toBe('PUT');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer owner-secret');
    expect(JSON.parse(String(init.body)).bill.items).toHaveLength(3);
  });

  it('publishes again under a new link when the old one expired', async () => {
    let posts = 0;
    mockApi((_url, init) => {
      if (init.method === 'PUT') return { status: 404, body: { error: 'not_found' } };
      posts += 1;
      return { status: 201, body: { ...created, id: posts === 1 ? 'Abc1234567' : 'Xyz7654321' } };
    });
    setUpBill();
    const share = useShareStore();
    await share.share();

    await share.share();

    expect(share.url).toBe(`${window.location.origin}/b/Xyz7654321`);
    expect(share.status).toBe('saved');
  });

  it('reports failures without losing the link', async () => {
    let online = true;
    mockApi((_url, init) => {
      if (!online) throw new TypeError('Failed to fetch');
      return { status: init.method === 'POST' ? 201 : 200, body: created };
    });
    setUpBill();
    const share = useShareStore();
    await share.share();

    online = false;
    expect(await share.share()).toBe(false);

    expect(share.status).toBe('error');
    expect(share.error).toBe('offline');
    expect(share.errorRef).toMatch(/^[0-9A-Z]{8}$/);
    expect(share.isShared).toBe(true);
  });

  it('keeps the link of the previous bill, and takes over a single link saved before', async () => {
    mockApi(() => ({ status: 201, body: created }));
    const bill = setUpBill();
    const firstBill = bill.bill.id;
    const share = useShareStore();
    await share.share();
    bill.reset();
    expect(share.isBillShared(firstBill)).toBe(true);

    window.localStorage.clear();
    window.localStorage.setItem(
      'bill-splitter/share/v1',
      JSON.stringify({ localBillId: 'old', remoteId: 'Old1234567', ownerToken: 't' }),
    );
    setActivePinia(createPinia());
    expect(useShareStore().isBillShared('old')).toBe(true);
  });

  it('forgets the link when a new bill is started', async () => {
    mockApi(() => ({ status: 201, body: created }));
    const bill = setUpBill();
    const share = useShareStore();
    await share.share();

    bill.reset();

    expect(share.isShared).toBe(false);
    expect(share.url).toBeNull();
  });

  describe('paying together', () => {
    function setUpTable() {
      const bill = useBillStore();
      const ana = bill.addDiner('Ana')!;
      const ben = bill.addDiner('Ben')!;
      bill.addItem({ name: 'Pizza', total: 1200 });
      return { bill, ana, ben };
    }

    it('sends groups made by the owner through the shared groups endpoint', async () => {
      vi.useFakeTimers();
      const sent: unknown[] = [];
      mockApi((url, init) => {
        if (url.endsWith('/groups')) {
          const { groups } = JSON.parse(String(init.body));
          sent.push(groups);
          return { status: 200, body: { ...created, bill: { groups } } };
        }
        return { status: init.method === 'POST' ? 201 : 200, body: created };
      });
      const { bill, ana, ben } = setUpTable();
      const share = useShareStore();
      await share.share();

      bill.groupDiners([ana.id, ben.id]);
      await nextTick();
      await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);

      expect(sent).toEqual([[expect.objectContaining({ dinerIds: [ana.id, ben.id] })]]);
      expect(share.status).toBe('saved');
    });

    it('applies groups that guests set, without an undo step', async () => {
      vi.useFakeTimers();
      let remoteGroups: unknown[] = [];
      const fetchMock = mockApi((_url, init) => {
        if (init.method === 'POST') return { status: 201, body: created };
        return { status: 200, body: { ...created, bill: { groups: remoteGroups } } };
      });
      const { bill, ana, ben } = setUpTable();
      const share = useShareStore();
      await share.share();
      const undoSteps = bill.canUndo;

      remoteGroups = [{ id: 'guest-group', dinerIds: [ana.id, ben.id] }];
      await vi.advanceTimersByTimeAsync(FALLBACK_POLL_MS);

      expect(bill.bill.groups).toEqual(remoteGroups);
      expect(bill.canUndo).toBe(undoSteps);
      // Applying the guests' groups does not bounce them back to the server.
      await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
      expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/groups'))).toEqual([]);
    });
  });
});
