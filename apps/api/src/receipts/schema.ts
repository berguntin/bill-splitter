import { parseMoney, type ScannedReceipt } from '@bill-splitter/core';
import { z } from 'zod';

/**
 * Shape the model must answer with. Amounts are copied as printed and parsed
 * here, so the model never does arithmetic or currency conversion.
 */
export const ModelReceiptSchema = z.object({
  is_receipt: z.boolean().describe('False when the photo is not a receipt or bill.'),
  merchant: z.string().nullable().describe('Business name as printed, or null.'),
  currency: z.string().describe('ISO 4217 code of the amounts, e.g. "EUR".'),
  lines: z.array(
    z.object({
      name: z.string().describe('Item name as printed, without the quantity.'),
      quantity: z.number().describe('Units on the line; 1 when not printed.'),
      amount: z
        .string()
        .describe('Line total exactly as printed, e.g. "4,80". Negative for discounts.'),
      confidence: z
        .enum(['high', 'low'])
        .describe('"low" when the name or the amount is hard to read or guessed.'),
    }),
  ),
  total: z.string().nullable().describe('Grand total exactly as printed, or null.'),
});

export type ModelReceipt = z.infer<typeof ModelReceiptSchema>;

/** Converts the model's answer into the domain shape, distrusting every field. */
export function toScannedReceipt(answer: ModelReceipt): ScannedReceipt {
  const currency = /^[A-Za-z]{3}$/.test(answer.currency.trim())
    ? answer.currency.trim().toUpperCase()
    : 'EUR';

  const lines = answer.lines.flatMap((line) => {
    const name = line.name.trim();
    if (!name) return [];
    const total = parseMoney(line.amount);
    const quantity = Number.isFinite(line.quantity) && line.quantity > 0 ? line.quantity : 1;
    return [
      {
        name,
        quantity,
        total: total ?? 0,
        // An amount we could not parse needs a human look, whatever the model said.
        confidence: total === null ? ('low' as const) : line.confidence,
      },
    ];
  });

  return {
    merchant: answer.merchant?.trim() || null,
    currency,
    lines,
    total: answer.total === null ? null : parseMoney(answer.total),
  };
}
