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
  { status: 'ok'; answer: ModelReceipt } | { status: 'refused' } | { status: 'unreadable' }
>;

export type ParseOutcome =
  | { status: 'ok'; receipt: ScannedReceipt; issues: ReceiptIssue[]; model: string }
  | { status: 'not_a_receipt' }
  | { status: 'unreadable' };

export interface ReceiptParser {
  parse(image: ReceiptImage): Promise<ParseOutcome>;
}

/**
 * Reads a receipt with the primary model and only escalates to the fallback
 * model when the result has issues (lines that do not add up to the total,
 * uncertain lines, a refusal...). The more trustworthy of the two wins.
 */
export function createReceiptParser(extract: Extractor): ReceiptParser {
  async function attempt(image: ReceiptImage, model: string, effort: Effort) {
    const result = await extract({ image, model, effort });
    if (result.status !== 'ok') return result;
    if (!result.answer.is_receipt) return { status: 'not_a_receipt' as const };
    const receipt = toScannedReceipt(result.answer);
    const issues = receiptIssues(receipt);
    return { status: 'ok' as const, receipt, issues, model, score: receiptIssueScore(issues) };
  }

  return {
    async parse(image) {
      let primary: Awaited<ReturnType<typeof attempt>> | null = null;
      try {
        primary = await attempt(image, PRIMARY_MODEL, 'low');
      } catch (error) {
        // Let the fallback model try; if it fails too, its error propagates.
        console.warn(`${PRIMARY_MODEL} failed, trying ${FALLBACK_MODEL}`, error);
      }

      if (primary?.status === 'ok' && primary.score === 0) return withoutScore(primary);
      if (primary?.status === 'not_a_receipt') return primary;

      const fallback = await attempt(image, FALLBACK_MODEL, 'medium');
      const candidates = [primary, fallback].filter(
        (candidate): candidate is Extract<typeof fallback, { status: 'ok' }> =>
          candidate?.status === 'ok',
      );
      if (candidates.length > 0) {
        const best = candidates.reduce((a, b) => (b.score < a.score ? b : a));
        return withoutScore(best);
      }
      return fallback.status === 'not_a_receipt' ? fallback : { status: 'unreadable' };
    },
  };
}

function withoutScore<T extends { score: number }>({
  score: _score,
  ...rest
}: T): Omit<T, 'score'> {
  return rest;
}
