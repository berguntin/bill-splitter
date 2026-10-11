import { describe, expect, it, vi } from 'vitest';
import {
  createReceiptParser,
  FALLBACK_MODEL,
  PRIMARY_MODEL,
  type Extractor,
  type ReceiptImage,
} from '../src/receipts/parser';
import type { ModelReceipt } from '../src/receipts/schema';

const image: ReceiptImage = { data: Buffer.from('fake'), mediaType: 'image/jpeg' };

function answer(overrides: Partial<ModelReceipt> = {}): ModelReceipt {
  return {
    is_receipt: true,
    merchant: 'Casa Lola',
    currency: 'EUR',
    lines: [
      { name: 'Caña', quantity: 2, amount: '4,80', confidence: 'high' },
      { name: 'Bravas', quantity: 1, amount: '6,50', confidence: 'high' },
    ],
    total: '11,30',
    ...overrides,
  };
}

function extractorReturning(byModel: Record<string, Awaited<ReturnType<Extractor>> | Error>) {
  return vi.fn<Extractor>(async ({ model }) => {
    const result = byModel[model];
    if (result instanceof Error) throw result;
    if (!result) throw new Error(`unexpected model ${model}`);
    return result;
  });
}

describe('createReceiptParser', () => {
  it('returns the primary result when it checks out, without calling the fallback', async () => {
    const extract = extractorReturning({ [PRIMARY_MODEL]: { status: 'ok', answer: answer() } });

    const outcome = await createReceiptParser(extract).parse(image);

    expect(outcome).toMatchObject({ status: 'ok', model: PRIMARY_MODEL, issues: [] });
    expect(extract).toHaveBeenCalledTimes(1);
    expect(extract).toHaveBeenCalledWith(expect.objectContaining({ effort: 'low' }));
  });

  it('escalates when the lines do not add up and keeps the better result', async () => {
    const extract = extractorReturning({
      [PRIMARY_MODEL]: { status: 'ok', answer: answer({ total: '12,30' }) },
      [FALLBACK_MODEL]: {
        status: 'ok',
        answer: answer({
          lines: [
            ...answer().lines,
            { name: 'Pan', quantity: 1, amount: '1,00', confidence: 'high' },
          ],
          total: '12,30',
        }),
      },
    });

    const outcome = await createReceiptParser(extract).parse(image);

    expect(outcome).toMatchObject({ status: 'ok', model: FALLBACK_MODEL, issues: [] });
    expect(extract).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: FALLBACK_MODEL, effort: 'medium' }),
    );
  });

  it('keeps the primary result when the fallback is worse', async () => {
    const lowConfidence = answer({
      lines: [
        { name: 'Caña', quantity: 2, amount: '4,80', confidence: 'low' },
        { name: 'Bravas', quantity: 1, amount: '6,50', confidence: 'high' },
      ],
    });
    const extract = extractorReturning({
      [PRIMARY_MODEL]: { status: 'ok', answer: lowConfidence },
      [FALLBACK_MODEL]: { status: 'ok', answer: answer({ total: '99,00' }) },
    });

    const outcome = await createReceiptParser(extract).parse(image);

    expect(outcome).toMatchObject({ status: 'ok', model: PRIMARY_MODEL });
  });

  it('falls back when the primary model refuses or errors', async () => {
    for (const primary of [{ status: 'refused' } as const, new Error('overloaded')]) {
      const extract = extractorReturning({
        [PRIMARY_MODEL]: primary,
        [FALLBACK_MODEL]: { status: 'ok', answer: answer() },
      });
      const outcome = await createReceiptParser(extract).parse(image);
      expect(outcome).toMatchObject({ status: 'ok', model: FALLBACK_MODEL });
    }
  });

  it('stops early when the photo is not a receipt', async () => {
    const extract = extractorReturning({
      [PRIMARY_MODEL]: { status: 'ok', answer: answer({ is_receipt: false, lines: [] }) },
    });

    expect(await createReceiptParser(extract).parse(image)).toMatchObject({
      status: 'not_a_receipt',
    });
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it('reports an unreadable receipt when neither model produces a result', async () => {
    const extract = extractorReturning({
      [PRIMARY_MODEL]: { status: 'unreadable' },
      [FALLBACK_MODEL]: { status: 'refused' },
    });

    expect(await createReceiptParser(extract).parse(image)).toMatchObject({ status: 'unreadable' });
  });

  it('propagates the error when both models fail', async () => {
    const extract = extractorReturning({
      [PRIMARY_MODEL]: new Error('down'),
      [FALLBACK_MODEL]: new Error('still down'),
    });

    await expect(createReceiptParser(extract).parse(image)).rejects.toThrow('still down');
  });

  it('lists every model call with its outcome, issues and token usage', async () => {
    const extract = extractorReturning({
      [PRIMARY_MODEL]: new Error('overloaded'),
      [FALLBACK_MODEL]: {
        status: 'ok',
        answer: answer({ total: '12,30' }),
        usage: { inputTokens: 3800, outputTokens: 400 },
      },
    });

    const outcome = await createReceiptParser(extract).parse(image);

    expect(outcome.attempts).toEqual([
      { model: PRIMARY_MODEL, status: 'error', durationMs: expect.any(Number) },
      {
        model: FALLBACK_MODEL,
        status: 'ok',
        issues: ['total_mismatch'],
        durationMs: expect.any(Number),
        usage: { inputTokens: 3800, outputTokens: 400 },
      },
    ]);
  });
});
