import { describe, expect, it } from 'vitest';
import { toScannedReceipt } from '../src/receipts/schema';

describe('toScannedReceipt', () => {
  it('parses printed amounts into cents', () => {
    const receipt = toScannedReceipt({
      is_receipt: true,
      merchant: '  Casa Lola ',
      currency: 'eur',
      lines: [
        { name: 'CAÑA', quantity: 2, amount: '4,80', confidence: 'high' },
        { name: 'Descuento', quantity: 1, amount: '-1,00', confidence: 'high' },
      ],
      total: '3,80 €',
    });

    expect(receipt).toEqual({
      merchant: 'Casa Lola',
      currency: 'EUR',
      lines: [
        { name: 'CAÑA', quantity: 2, total: 480, confidence: 'high' },
        { name: 'Descuento', quantity: 1, total: -100, confidence: 'high' },
      ],
      total: 380,
    });
  });

  it('distrusts unreadable amounts, bad quantities, blank names and odd currencies', () => {
    const receipt = toScannedReceipt({
      is_receipt: true,
      merchant: '',
      currency: 'euros',
      lines: [
        { name: 'Vino', quantity: 0, amount: '??', confidence: 'high' },
        { name: '   ', quantity: 1, amount: '1,00', confidence: 'high' },
      ],
      total: null,
    });

    expect(receipt).toEqual({
      merchant: null,
      currency: 'EUR',
      lines: [{ name: 'Vino', quantity: 1, total: 0, confidence: 'low' }],
      total: null,
    });
  });
});
