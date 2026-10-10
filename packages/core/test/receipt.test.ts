import { describe, expect, it } from 'vitest';
import { receiptIssues, receiptIssueScore, type ScannedReceipt } from '../src';

function receipt(overrides: Partial<ScannedReceipt> = {}): ScannedReceipt {
  return {
    merchant: 'Casa Lola',
    currency: 'EUR',
    lines: [
      { name: 'Caña', quantity: 2, total: 480, confidence: 'high' },
      { name: 'Pulpo', quantity: 1, total: 1850, confidence: 'high' },
    ],
    total: 2330,
    ...overrides,
  };
}

describe('receiptIssues', () => {
  it('is empty for a clean scan', () => {
    expect(receiptIssues(receipt())).toEqual([]);
  });

  it('reports a total that does not add up', () => {
    expect(receiptIssues(receipt({ total: 2500 }))).toEqual([
      { type: 'total_mismatch', difference: 170 },
    ]);
  });

  it('accepts discount lines with negative totals', () => {
    const lines = [
      ...receipt().lines,
      { name: 'Promo', quantity: 1, total: -330, confidence: 'high' as const },
    ];
    expect(receiptIssues(receipt({ lines, total: 2000 }))).toEqual([]);
  });

  it('reports low-confidence lines and a missing total', () => {
    const lines = receipt().lines.map((line, index) =>
      index === 1 ? { ...line, confidence: 'low' as const } : line,
    );
    expect(receiptIssues(receipt({ lines, total: null }))).toEqual([
      { type: 'missing_total' },
      { type: 'low_confidence', lineIndexes: [1] },
    ]);
  });

  it('reports an empty scan', () => {
    expect(receiptIssues(receipt({ lines: [], total: null }))).toEqual([
      { type: 'no_lines' },
      { type: 'missing_total' },
    ]);
  });
});

describe('receiptIssueScore', () => {
  it('ranks a mismatched total above uncertain lines above a missing total', () => {
    const mismatch = receiptIssueScore([{ type: 'total_mismatch', difference: 10 }]);
    const uncertain = receiptIssueScore([{ type: 'low_confidence', lineIndexes: [0, 1] }]);
    const missing = receiptIssueScore([{ type: 'missing_total' }]);

    expect(receiptIssueScore([])).toBe(0);
    expect(mismatch).toBeGreaterThan(uncertain);
    expect(uncertain).toBeGreaterThan(missing);
    expect(receiptIssueScore([{ type: 'no_lines' }])).toBeGreaterThan(mismatch);
  });
});
