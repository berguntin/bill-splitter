import { receiptIssues, type ScannedReceipt } from '@bill-splitter/core';
import type { ReceiptParser } from './parser';

const SAMPLE_RECEIPT: ScannedReceipt = {
  merchant: 'Casa Lola',
  currency: 'EUR',
  lines: [
    { name: 'Caña', quantity: 2, total: 480, confidence: 'high' },
    { name: 'Patatas bravas', quantity: 1, total: 650, confidence: 'high' },
    { name: 'Croquetas de jamón', quantity: 1, total: 800, confidence: 'high' },
    { name: 'Pulpo a la gallega', quantity: 1, total: 1850, confidence: 'low' },
    { name: 'Entrecot', quantity: 1, total: 2400, confidence: 'high' },
    { name: 'Ensalada mixta', quantity: 1, total: 900, confidence: 'high' },
    { name: 'Agua 1.5 L', quantity: 1, total: 320, confidence: 'high' },
    { name: 'Tarta de queso', quantity: 1, total: 600, confidence: 'high' },
  ],
  total: 8000,
};

/**
 * Returns the same sample receipt for any image, so the app can be developed
 * and tested without an API key. Never used in production (see config).
 */
export function createFakeReceiptParser(delayMs = 800): ReceiptParser {
  return {
    async parse() {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return {
        status: 'ok',
        receipt: SAMPLE_RECEIPT,
        issues: receiptIssues(SAMPLE_RECEIPT),
        model: 'fake',
      };
    },
  };
}
