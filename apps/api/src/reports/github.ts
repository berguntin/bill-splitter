import type { Logger } from '../observability/logger';
import {
  fingerprintMarker,
  reportBody,
  reportFingerprint,
  reportTitle,
  type ReportLinks,
} from './markdown';
import type { StoredReport } from './store';

/** Turns a stored report into something the team tracks. */
export interface ReportNotifier {
  /** Returns the URL where the report can be followed, or null if it could not be sent. */
  notify(report: StoredReport, links: ReportLinks): Promise<string | null>;
}

export const noopNotifier: ReportNotifier = { notify: async () => null };

interface IssueRef {
  number: number;
  html_url: string;
}

/**
 * Opens a GitHub issue per report, or comments on the open issue that has the
 * same failure fingerprint. Needs a fine-grained token with "Issues: read and
 * write" on the repository.
 */
export function createGitHubNotifier(options: {
  token: string;
  repository: string;
  logger: Logger;
  fetch?: typeof fetch;
}): ReportNotifier {
  const send = options.fetch ?? fetch;
  const base = 'https://api.github.com';

  async function github<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await send(`${base}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${options.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`GitHub ${init.method ?? 'GET'} ${path} answered ${response.status}`);
    }
    return (await response.json()) as T;
  }

  async function findOpenIssue(fingerprint: string): Promise<IssueRef | null> {
    const query = `repo:${options.repository} is:issue is:open in:body "${fingerprintMarker(fingerprint)}"`;
    const result = await github<{ items: IssueRef[] }>(
      `/search/issues?q=${encodeURIComponent(query)}&per_page=1`,
    );
    return result.items[0] ?? null;
  }

  async function createIssue(report: StoredReport, body: string): Promise<IssueRef> {
    const path = `/repos/${options.repository}/issues`;
    const issue = { title: reportTitle(report), body };
    try {
      return await github<IssueRef>(path, {
        method: 'POST',
        body: JSON.stringify({ ...issue, labels: ['bug-report', `area:${report.topic}`] }),
      });
    } catch {
      // Labels the token may not create; the issue matters more than its labels.
      return github<IssueRef>(path, { method: 'POST', body: JSON.stringify(issue) });
    }
  }

  return {
    async notify(report, links) {
      try {
        const body = reportBody(report, links);
        const fingerprint = reportFingerprint(report);
        const existing = fingerprint ? await findOpenIssue(fingerprint) : null;
        if (existing) {
          await github(`/repos/${options.repository}/issues/${existing.number}/comments`, {
            method: 'POST',
            body: JSON.stringify({ body: `**Another report of this problem**\n\n${body}` }),
          });
          return existing.html_url;
        }
        return (await createIssue(report, body)).html_url;
      } catch (error) {
        options.logger.error({ err: error, report: report.id }, 'could not send report to GitHub');
        return null;
      }
    },
  };
}
