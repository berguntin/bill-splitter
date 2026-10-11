import { z } from 'zod';
import { ACCEPTED_IMAGE_TYPES } from '../receipts/parser';

/** Raw size of one attached photo; the web app compresses them well below this. */
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

const text = (max: number) => z.string().max(max);

const RequestRecordSchema = z.object({
  at: text(40),
  method: text(10),
  path: text(300),
  requestId: text(64),
  status: z.number().int().nullable(),
  failure: z.enum(['network', 'timeout', 'aborted']).optional(),
  durationMs: z.number().nonnegative(),
});

const ErrorRecordSchema = z.object({
  at: text(40),
  source: z.enum(['vue', 'window', 'promise']),
  message: text(500),
  stack: text(4000).optional(),
});

const ScanRecordSchema = z.object({
  at: text(40),
  ok: z.boolean(),
  error: text(40).optional(),
  requestId: text(64),
  durationMs: z.number().nonnegative(),
  imageBytes: z.number().int().nonnegative().optional(),
  lines: z.number().int().nonnegative().optional(),
  issues: z.array(text(40)).max(10).optional(),
});

export const ReportContextSchema = z.object({
  release: text(80),
  route: text(300),
  screen: text(60).optional(),
  userAgent: text(500),
  language: text(40),
  timeZone: text(60),
  viewport: z.object({
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative(),
    pixelRatio: z.number().positive(),
  }),
  online: z.boolean(),
  standalone: z.boolean().optional(),
  /** Request id shown on the error screen the report was started from. */
  errorRef: text(64).optional(),
  sentryEventId: text(64).optional(),
  recentRequests: z.array(RequestRecordSchema).max(30).default([]),
  recentErrors: z.array(ErrorRecordSchema).max(20).default([]),
  navigation: z
    .array(z.object({ at: text(40), path: text(300) }))
    .max(20)
    .default([]),
  lastScan: ScanRecordSchema.optional(),
});

export const REPORT_TOPICS = ['scan', 'split', 'share', 'other'] as const;
export type ReportTopic = (typeof REPORT_TOPICS)[number];

const AttachmentSchema = z.object({
  kind: z.enum(['receipt', 'screenshot']),
  mediaType: z.enum(ACCEPTED_IMAGE_TYPES),
  /** Base64; ~4/3 of the raw size. */
  data: z.base64().max(Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 4),
});

export const ReportInputSchema = z.object({
  description: z.string().trim().min(1).max(5000),
  email: z.email().max(200).optional(),
  topic: z.enum(REPORT_TOPICS).default('other'),
  context: ReportContextSchema,
  /**
   * Anonymized copy of the bill, if the user chose to attach it. Not
   * validated against the bill schema: a malformed bill may be the bug.
   */
  bill: z.unknown().optional(),
  attachments: z.array(AttachmentSchema).max(2).default([]),
});

export type ReportInput = z.infer<typeof ReportInputSchema>;
export type ReportContext = z.infer<typeof ReportContextSchema>;
