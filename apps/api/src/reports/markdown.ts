import { createHash } from 'node:crypto';
import type { StoredReport } from './store';

/** GitHub rejects issue bodies longer than this. */
const MAX_BODY = 65_000;

export interface ReportLinks {
  attachment(index: number): string;
}

/** Breaks `@user` mentions and `#12` issue references, which GitHub would act on. */
function defuse(value: string): string {
  return value.replace(/(^|[^\w`])([@#])(?=\w)/g, `$1$2\u200b`);
}

/** Keeps user text from pinging people, linking issues or breaking tables. */
function inline(value: string): string {
  return defuse(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function quote(value: string): string {
  return defuse(value)
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');
}

function code(value: string, language = ''): string {
  return `\`\`\`${language}\n${value.replace(/```/g, '`\u200b``')}\n\`\`\``;
}

/** `/api/bills/Abc1234567` → `/api/bills/:id`, so the same failure groups together. */
export function routePattern(path: string): string {
  return path.split('?')[0]!.replace(/\/api\/bills\/[^/]+/, '/api/bills/:id');
}

/**
 * Identifies the failure a report is about, so reports of the same failure
 * land on one issue. Reports without a technical signal get none: their text
 * alone cannot tell whether two people saw the same problem.
 */
export function reportFingerprint(report: StoredReport): string | null {
  const { recentRequests, recentErrors, lastScan, errorRef } = report.context;
  const failed = [...recentRequests]
    .reverse()
    .find(
      (request) =>
        request.requestId === errorRef ||
        (request.status === null && request.failure !== 'aborted') ||
        (request.status !== null && request.status >= 500),
    );
  let signal: string | null = null;
  if (failed) {
    signal = `${failed.method} ${routePattern(failed.path)} ${failed.status ?? failed.failure}`;
  } else if (recentErrors.length > 0) {
    // Numbers vary between occurrences (ids, positions); the message shape does not.
    signal = recentErrors.at(-1)!.message.split('\n')[0]!.replace(/\d+/g, 'N');
  } else if (lastScan && !lastScan.ok) {
    signal = `scan ${lastScan.error ?? 'failed'}`;
  }
  if (!signal) return null;
  return createHash('sha256').update(`${report.topic}|${signal}`).digest('hex').slice(0, 12);
}

export function fingerprintMarker(fingerprint: string): string {
  return `report-fingerprint-${fingerprint}`;
}

export function reportTitle(report: StoredReport): string {
  const summary = report.description.replace(/\s+/g, ' ').trim();
  const short = summary.length > 70 ? `${summary.slice(0, 67)}…` : summary;
  return `[${report.topic}] ${short}`;
}

function formatRow(label: string, value: string | undefined): string {
  return `| ${label} | ${value ? inline(value) : '—'} |`;
}

export function reportBody(report: StoredReport, links: ReportLinks): string {
  const { context } = report;
  const sections: string[] = [];

  sections.push(quote(report.description));

  sections.push(
    [
      '| | |',
      '| --- | --- |',
      formatRow('Report', report.id),
      formatRow('Topic', report.topic),
      formatRow('Email', report.email),
      formatRow('Received', report.createdAt.toISOString()),
      formatRow('Release', context.release),
      formatRow('Screen', `${context.screen ?? '?'} (${context.route})`),
      formatRow('Error reference', context.errorRef),
      formatRow('Sentry event', context.sentryEventId),
      formatRow('Device', context.userAgent),
      formatRow(
        'Viewport',
        `${context.viewport.width}×${context.viewport.height} @${context.viewport.pixelRatio}x`,
      ),
      formatRow('Language / time zone', `${context.language} / ${context.timeZone}`),
      formatRow(
        'Online / installed',
        `${context.online ? 'online' : 'offline'} / ${context.standalone ? 'yes' : 'no'}`,
      ),
    ].join('\n'),
  );

  if (report.attachments.length > 0) {
    sections.push(
      '### Attachments\n\n' +
        report.attachments
          .map(
            (attachment, index) =>
              `- [${attachment.kind} (${Math.round(attachment.bytes / 1024)} KB)](${links.attachment(index)})`,
          )
          .join('\n') +
        '\n\nLinks work until the report expires.',
    );
  }

  if (context.lastScan) {
    const scan = context.lastScan;
    sections.push(
      '### Last scan\n\n' +
        [
          `- ${scan.ok ? 'Read' : `Failed: \`${scan.error ?? 'unknown'}\``} at ${scan.at} in ${scan.durationMs} ms (request \`${scan.requestId}\`)`,
          scan.lines !== undefined ? `- ${scan.lines} lines` : null,
          scan.issues?.length ? `- Issues: ${scan.issues.join(', ')}` : null,
          scan.imageBytes !== undefined
            ? `- Image: ${Math.round(scan.imageBytes / 1024)} KB`
            : null,
        ]
          .filter(Boolean)
          .join('\n'),
    );
  }

  if (context.recentRequests.length > 0) {
    sections.push(
      '### Recent API calls\n\n| Time | Request | Status | ms | Id |\n| --- | --- | --- | --- | --- |\n' +
        context.recentRequests
          .map(
            (request) =>
              `| ${inline(request.at)} | ${inline(`${request.method} ${request.path}`)} | ${
                request.status ?? inline(request.failure ?? 'no response')
              } | ${request.durationMs} | \`${inline(request.requestId)}\` |`,
          )
          .join('\n'),
    );
  }

  if (context.recentErrors.length > 0) {
    sections.push(
      '### Errors in the app\n\n' +
        context.recentErrors
          .map(
            (error) =>
              `**${inline(error.source)}** at ${inline(error.at)}\n\n` +
              code(error.stack ?? error.message),
          )
          .join('\n\n'),
    );
  }

  if (context.navigation.length > 0) {
    sections.push(
      '### Screens visited\n\n' +
        context.navigation
          .map((step) => `- ${inline(step.at)} \`${inline(step.path)}\``)
          .join('\n'),
    );
  }

  const fingerprint = reportFingerprint(report);
  const footer = fingerprint ? `\n\n<!-- ${fingerprintMarker(fingerprint)} -->` : '';

  let body = sections.join('\n\n');
  if (report.bill !== undefined) {
    const bill = JSON.stringify(report.bill, null, 2);
    const room = MAX_BODY - body.length - footer.length - 200;
    const shown = bill.length <= room ? bill : `${bill.slice(0, Math.max(0, room))}\n… (truncated)`;
    body += `\n\n<details><summary>Bill (names anonymized)</summary>\n\n${code(shown, 'json')}\n\n</details>`;
  }
  return body.slice(0, MAX_BODY - footer.length) + footer;
}
