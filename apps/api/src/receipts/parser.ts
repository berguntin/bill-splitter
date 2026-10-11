import {
  receiptIssues,
  receiptIssueScore,
  type ReceiptIssue,
  type ScannedReceipt,
} from '@bill-splitter/core';
import { toScannedReceipt, type ModelReceipt } from './schema';

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ImageMediaType = (typeof ACCEPTED_IMAGE_TYPES)[number];

export interface ReceiptImage {
  data: Buffer;
  mediaType: ImageMediaType;
}

/** Cheap, fast model tried first. */
export const PRIMARY_MODEL = 'claude-haiku-5-5';
/** Stronger model used only when the primary result does not check out. */
export const FALLBACK_MODEL = 'claude-sonnet-5-5';

export type Effort = 'low' | 'medium' | 'high';

/** One model call. Implemented with the Claude API in production and faked in tests. */
export type Extractor = (request: {
  image: ReceiptImage;
  model: string;
  effort: Effort;
}) => Promise<
  ({ status: 'ok'; answer: ModelReceipt } | { status: 'refused' } | { status: 'unreadable' }) & {
    usage?: TokenUsage;
  }
>;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** What one model call did, for logs: which model, how it went, how long and how many tokens. */
export interface ParseAttempt {
  model: string;
  status: 'ok' | 'not_a_receipt' | 'refused' | 'unreadable' | 'error';
  /** Issue types found in this attempt's result, e.g. `total_mismatch`. */
  issues?: ReceiptIssue['type'][];
  durationMs: number;
  usage?: TokenUsage;
}

export type ParseOutcome = (
  | { status: 'ok'; receipt: ScannedReceipt; issues: ReceiptIssue[]; model: string }
  | { status: 'not_a_receipt' }
  | { status: 'unreadable' }
) & { attempts?: ParseAttempt[] };

export interface ReceiptParser {
  parse(image: ReceiptImage): Promise<ParseOutcome>;
}

/**
 * Reads a receipt with the primary model and only escalates to the fallback
 * model when the result has issues (lines that do not add up to the total,
 * uncertain lines, a refusal...). The more trustworthy of the two wins.
 */
export function createReceiptParser(extract: Extractor): ReceiptParser {
  async function attempt(
    image: ReceiptImage,
    model: string,
    effort: Effort,
    attempts: ParseAttempt[],
  ) {
    const started = performance.now();
    const log: ParseAttempt = { model, status: 'error', durationMs: 0 };
    attempts.push(log);
    try {
      const result = await extract({ image, model, effort });
      if (result.usage) log.usage = result.usage;
      if (result.status !== 'ok') {
        log.status = result.status;
        return { status: result.status };
      }
      if (!result.answer.is_receipt) {
        log.status = 'not_a_receipt';
        return { status: 'not_a_receipt' as const };
      }
      const receipt = toScannedReceipt(result.answer);
      const issues = receiptIssues(receipt);
      log.status = 'ok';
      log.issues = issues.map((issue) => issue.type);
      return { status: 'ok' as const, receipt, issues, model, score: receiptIssueScore(issues) };
    } finally {
      log.durationMs = Math.round(performance.now() - started);
    }
  }

  return {
    async parse(image) {
      const attempts: ParseAttempt[] = [];
      let primary: Awaited<ReturnType<typeof attempt>> | null = null;
      try {
        primary = await attempt(image, PRIMARY_MODEL, 'low', attempts);
      } catch {
        // Let the fallback model try; if it fails too, its error propagates.
        // The failed attempt is still listed in `attempts`.
      }

      if (primary?.status === 'ok' && primary.score === 0) return finish(primary, attempts);
      if (primary?.status === 'not_a_receipt') return { status: 'not_a_receipt', attempts };

      const fallback = await attempt(image, FALLBACK_MODEL, 'medium', attempts);
      const candidates = [primary, fallback].filter(
        (candidate): candidate is Extract<typeof fallback, { status: 'ok' }> =>
          candidate?.status === 'ok',
      );
      if (candidates.length > 0) {
        const best = candidates.reduce((a, b) => (b.score < a.score ? b : a));
        return finish(best, attempts);
      }
      return {
        status: fallback.status === 'not_a_receipt' ? 'not_a_receipt' : 'unreadable',
        attempts,
      };
    },
  };
}

function finish(
  {
    score: _score,
    ...result
  }: {
    status: 'ok';
    receipt: ScannedReceipt;
    issues: ReceiptIssue[];
    model: string;
    score: number;
  },
  attempts: ParseAttempt[],
): ParseOutcome {
  return { ...result, attempts };
}
