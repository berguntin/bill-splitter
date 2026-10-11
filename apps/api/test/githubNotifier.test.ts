import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../src/observability/logger';
import { createGitHubNotifier } from '../src/reports/github';
import { context, storedReport } from './reportFixtures';

const links = { attachment: (index: number) => `https://api.test/a/${index}` };
const logger = createLogger({ NODE_ENV: 'test' });

type Route = (url: URL, init: RequestInit) => { status: number; body: unknown };

function fakeGitHub(route: Route) {
  return vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const { status, body } = route(new URL(String(input)), init);
    return new Response(JSON.stringify(body), { status });
  });
}

const failing = storedReport({
  context: {
    ...context,
    recentRequests: [
      {
        at: 'now',
        method: 'POST',
        path: '/api/receipts/parse',
        requestId: 'AAAA1111',
        status: 500,
        durationMs: 10,
      },
    ],
  },
});

describe('createGitHubNotifier', () => {
  it('opens a labelled issue when there is no open issue for the same failure', async () => {
    const fetch = fakeGitHub((url) =>
      url.pathname === '/search/issues'
        ? { status: 200, body: { items: [] } }
        : { status: 201, body: { number: 7, html_url: 'https://github.com/o/r/issues/7' } },
    );
    const notifier = createGitHubNotifier({ token: 't', repository: 'o/r', logger, fetch });

    expect(await notifier.notify(failing, links)).toBe('https://github.com/o/r/issues/7');

    const search = new URL(String(fetch.mock.calls[0]![0]));
    expect(search.searchParams.get('q')).toMatch(
      /^repo:o\/r is:issue is:open in:body "report-fingerprint-[0-9a-f]{12}"$/,
    );
    const [url, init] = fetch.mock.calls[1]!;
    expect(String(url)).toBe('https://api.github.com/repos/o/r/issues');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer t');
    expect(JSON.parse(String(init!.body))).toMatchObject({
      title: '[split] The total is wrong',
      labels: ['bug-report', 'area:split'],
    });
  });

  it('comments on the open issue for the same failure instead of opening another', async () => {
    const fetch = fakeGitHub((url) =>
      url.pathname === '/search/issues'
        ? {
            status: 200,
            body: { items: [{ number: 3, html_url: 'https://github.com/o/r/issues/3' }] },
          }
        : { status: 201, body: {} },
    );
    const notifier = createGitHubNotifier({ token: 't', repository: 'o/r', logger, fetch });

    expect(await notifier.notify(failing, links)).toBe('https://github.com/o/r/issues/3');
    expect(String(fetch.mock.calls[1]![0])).toBe(
      'https://api.github.com/repos/o/r/issues/3/comments',
    );
  });

  it('skips the search for reports without a technical signal', async () => {
    const fetch = fakeGitHub(() => ({
      status: 201,
      body: { number: 1, html_url: 'https://github.com/o/r/issues/1' },
    }));
    const notifier = createGitHubNotifier({ token: 't', repository: 'o/r', logger, fetch });

    await notifier.notify(storedReport(), links);

    expect(fetch).toHaveBeenCalledOnce();
  });

  it('retries without labels, and gives up quietly when GitHub keeps failing', async () => {
    const fetch = fakeGitHub((_url, init) =>
      JSON.parse(String(init.body)).labels
        ? { status: 403, body: {} }
        : { status: 201, body: { number: 2, html_url: 'https://github.com/o/r/issues/2' } },
    );
    const notifier = createGitHubNotifier({ token: 't', repository: 'o/r', logger, fetch });
    expect(await notifier.notify(storedReport(), links)).toBe('https://github.com/o/r/issues/2');

    const down = createGitHubNotifier({
      token: 't',
      repository: 'o/r',
      logger,
      fetch: fakeGitHub(() => ({ status: 503, body: {} })),
    });
    expect(await down.notify(storedReport(), links)).toBeNull();
  });
});
