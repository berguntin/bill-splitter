import { describe, expect, it } from 'vitest';
import {
  clearRecentRequests,
  formatReference,
  newRequestId,
  recentRequests,
  recordRequest,
} from '../diagnostics';

describe('newRequestId', () => {
  it('makes 8 readable characters the API accepts', () => {
    const ids = new Set(Array.from({ length: 100 }, newRequestId));
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
  });
});

describe('formatReference', () => {
  it('splits ids in two halves and leaves other ids alone', () => {
    expect(formatReference('7F3K92QD')).toBe('7F3K-92QD');
    expect(formatReference('custom-id')).toBe('custom-id');
  });
});

describe('recentRequests', () => {
  it('keeps only the last 30 calls', () => {
    clearRecentRequests();
    for (let index = 0; index < 35; index += 1) {
      recordRequest({
        at: '2026-10-11T12:00:00Z',
        method: 'GET',
        path: `/api/bills/${index}`,
        requestId: newRequestId(),
        status: 200,
        durationMs: 10,
      });
    }

    const records = recentRequests();
    expect(records).toHaveLength(30);
    expect(records[0]!.path).toBe('/api/bills/5');
  });
});
