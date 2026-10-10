import type { Cents } from './types';

/** A line read from a receipt photo, before it becomes an `Item`. */
export interface ScannedLine {
  name: string;
  quantity: number;
  total: Cents;
  /** `low` when the text or the amount was hard to read. */
  confidence: 'high' | 'low';
}

export interface ScannedReceipt {
  merchant: string | null;
  /** ISO 4217 code, e.g. `EUR`. */
  currency: string;
  lines: ScannedLine[];
  /** Grand total printed on the receipt, if it could be read. */
  total: Cents | null;
}

export type ReceiptIssue =
  | { type: 'no_lines' }
  | { type: 'missing_total' }
  /** `difference` is `total - sum(lines)`. */
  | { type: 'total_mismatch'; difference: Cents }
  | { type: 'low_confidence'; lineIndexes: number[] };

/**
 * Lists the reasons a scanned receipt should not be trusted as-is. An empty
 * list means every line was read confidently and the lines add up to the total.
 */
export function receiptIssues(receipt: ScannedReceipt): ReceiptIssue[] {
  const issues: ReceiptIssue[] = [];
  if (receipt.lines.length === 0) issues.push({ type: 'no_lines' });

  if (receipt.total === null) {
    issues.push({ type: 'missing_total' });
  } else {
    const sum = receipt.lines.reduce((total, line) => total + line.total, 0);
    if (sum !== receipt.total) {
      issues.push({ type: 'total_mismatch', difference: receipt.total - sum });
    }
  }

  const lineIndexes = receipt.lines.flatMap((line, index) =>
    line.confidence === 'low' ? [index] : [],
  );
  if (lineIndexes.length > 0) issues.push({ type: 'low_confidence', lineIndexes });

  return issues;
}

/**
 * Orders scans from most to least trustworthy: a total that does not add up is
 * worse than a few uncertain lines, which is worse than a missing total.
 */
export function receiptIssueScore(issues: readonly ReceiptIssue[]): number {
  return issues.reduce((score, issue) => {
    switch (issue.type) {
      case 'no_lines':
        return score + 1000;
      case 'total_mismatch':
        return score + 100;
      case 'low_confidence':
        return score + 10 * issue.lineIndexes.length;
      case 'missing_total':
        return score + 5;
    }
  }, 0);
}
