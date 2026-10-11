import { describe, expect, it } from 'vitest';
import { reportBody, reportFingerprint, reportTitle, routePattern } from '../src/reports/markdown';
import { context, storedReport } from './reportFixtures';

const links = { attachment: (index: number) => `https://api.test/a/${index}?token=t` };

const failedScan = {
  at: '2026-10-11T12:00:00Z',
  method: 'POST',
  path: '/api/receipts/parse',
  requestId: 'AAAA1111',
  status: 502,
  durationMs: 2100,
};

describe('reportBody', () => {
  it('lists the context, attachments and anonymized bill', () => {
    const body = reportBody(
      storedReport({
        email: 'ana@example.com',
        attachments: [{ kind: 'receipt', mediaType: 'image/jpeg', bytes: 300_000 }],
        bill: { diners: [{ name: 'Person 1' }] },
        context: { ...context, errorRef: 'AAAA1111', recentRequests: [failedScan] },
      }),
      links,
    );

    expect(body).toContain('> The total is wrong');
    expect(body).toContain('| Email | ana@example.com |');
    expect(body).toContain('| Release | abc1234 |');
    expect(body).toContain('[receipt (293 KB)](https://api.test/a/0?token=t)');
    expect(body).toContain('| POST /api/receipts/parse | 502 | 2100 | `AAAA1111` |');
    expect(body).toContain('"name": "Person 1"');
    expect(body).toMatch(/<!-- report-fingerprint-[0-9a-f]{12} -->$/);
  });

  it('keeps user text from mentioning people or referencing issues', () => {
    const body = reportBody(storedReport({ description: 'cc @berguntin, same as #12' }), links);
    expect(body).not.toContain('@berguntin');
    expect(body).not.toContain(' #12');
  });

  it('stays under the GitHub size limit with a huge bill', () => {
    const body = reportBody(storedReport({ bill: { blob: 'x'.repeat(200_000) } }), links);
    expect(body.length).toBeLessThanOrEqual(65_000);
    expect(body).toContain('(truncated)');
  });
});

describe('reportFingerprint', () => {
  it('is the same for the same failure on different bills', () => {
    const on = (path: string, requestId: string) =>
      storedReport({
        context: {
          ...context,
          recentRequests: [{ ...failedScan, method: 'PUT', path, requestId, status: 500 }],
        },
      });
    const first = reportFingerprint(on('/api/bills/Abc1234567', 'A1'));
    expect(first).toMatch(/^[0-9a-f]{12}$/);
    expect(reportFingerprint(on('/api/bills/Xyz7654321', 'B2'))).toBe(first);
  });

  it('falls back to the last app error, ignoring numbers', () => {
    const withError = (message: string) =>
      storedReport({
        context: {
          ...context,
          recentErrors: [{ at: 'now', source: 'vue', message }],
        },
      });
    expect(reportFingerprint(withError('Cannot read item 3'))).toBe(
      reportFingerprint(withError('Cannot read item 7')),
    );
  });

  it('is null when nothing technical went wrong', () => {
    const ok = { ...failedScan, status: 200 };
    expect(reportFingerprint(storedReport())).toBeNull();
    expect(
      reportFingerprint(storedReport({ context: { ...context, recentRequests: [ok] } })),
    ).toBeNull();
  });
});

describe('reportTitle and routePattern', () => {
  it('shortens long descriptions', () => {
    expect(reportTitle(storedReport({ description: 'a'.repeat(100) }))).toBe(
      `[split] ${'a'.repeat(67)}…`,
    );
  });

  it('replaces bill ids in paths', () => {
    expect(routePattern('/api/bills/Abc1234567?x=1')).toBe('/api/bills/:id');
  });
});
