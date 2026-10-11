import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { ImageMediaType } from '../receipts/parser';
import { newRequestId } from '../observability/requestId';
import type { ReportInput } from './schema';

export interface ReportAttachment {
  kind: 'receipt' | 'screenshot';
  mediaType: ImageMediaType;
  data: Buffer;
}

export type NewReport = Omit<ReportInput, 'attachments'> & { attachments: ReportAttachment[] };

export interface StoredReport extends Omit<ReportInput, 'attachments'> {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  attachments: { kind: ReportAttachment['kind']; mediaType: ImageMediaType; bytes: number }[];
  /** Secret part of attachment links, so they can be opened from the issue. */
  accessToken: string;
  issueUrl?: string;
}

/** Bug reports from users. They are deleted after a retention period. */
export interface ReportStore {
  create(report: NewReport): Promise<StoredReport>;
  /** The attachment, only if the access token matches. */
  attachment(id: string, index: number, accessToken: string): Promise<ReportAttachment | null>;
  setIssueUrl(id: string, issueUrl: string): Promise<void>;
}

export const REPORT_ID_PATTERN = /^[0-9A-Z]{8}$/;

/** Same format as request ids: short enough to read out over the phone. */
export function newReportId(): string {
  return newRequestId();
}

export function newAccessToken(): string {
  return randomBytes(24).toString('base64url');
}

export function tokensMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function summarizeAttachments(attachments: ReportAttachment[]): StoredReport['attachments'] {
  return attachments.map(({ kind, mediaType, data }) => ({ kind, mediaType, bytes: data.length }));
}

/** In-process store for development and tests. */
export function createMemoryReportStore(options: { ttlMs: number }): ReportStore & {
  all(): StoredReport[];
} {
  const reports = new Map<string, { report: StoredReport; attachments: ReportAttachment[] }>();

  return {
    async create({ attachments, ...input }) {
      const createdAt = new Date();
      const report: StoredReport = {
        ...input,
        id: newReportId(),
        createdAt,
        expiresAt: new Date(createdAt.getTime() + options.ttlMs),
        attachments: summarizeAttachments(attachments),
        accessToken: newAccessToken(),
      };
      reports.set(report.id, { report, attachments });
      return structuredClone(report);
    },

    async attachment(id, index, accessToken) {
      const entry = reports.get(id);
      if (!entry || !tokensMatch(accessToken, entry.report.accessToken)) return null;
      return entry.attachments[index] ?? null;
    },

    async setIssueUrl(id, issueUrl) {
      const entry = reports.get(id);
      if (entry) entry.report.issueUrl = issueUrl;
    },

    all() {
      return [...reports.values()].map((entry) => structuredClone(entry.report));
    },
  };
}
