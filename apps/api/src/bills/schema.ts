import {
  pruneGroups,
  type Adjustment,
  type Assignment,
  type Bill,
  type Diner,
  type Item,
} from '@bill-splitter/core';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const MAX_CENTS = 10_000_000;

const id = z.string().min(1).max(64);
const label = z.string().trim().min(1).max(80);
const cents = z.number().int().min(-MAX_CENTS).max(MAX_CENTS);

const AssignmentSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('unassigned') }),
  z.object({ mode: z.literal('everyone') }),
  z.object({ mode: z.literal('single'), dinerId: id }),
  z.object({
    mode: z.literal('shared'),
    shares: z.array(z.object({ dinerId: id, weight: z.number().positive().max(1000) })).max(50),
  }),
  z.object({
    mode: z.literal('units'),
    units: z.array(z.object({ dinerId: id, count: z.number().int().min(0).max(1000) })).max(50),
  }),
]);

const DinerSchema = z.object({ id, name: label, color: z.string().max(32) });

const ItemSchema = z.object({
  id: id.optional(),
  name: label,
  quantity: z.number().positive().max(1000).default(1),
  unitPrice: cents.optional(),
  total: cents,
  assignment: AssignmentSchema.default({ mode: 'unassigned' }),
  needsReview: z.boolean().optional(),
});

const AdjustmentSchema = z.object({
  id,
  kind: z.enum(['tip', 'service', 'discount']),
  value: z.discriminatedUnion('type', [
    z.object({ type: z.literal('amount'), amount: cents }),
    z.object({ type: z.literal('percent'), basisPoints: z.number().int().min(0).max(10_000) }),
  ]),
  distribution: z.enum(['proportional', 'equal']).default('proportional'),
});

/** Who pays together; a diner may appear in one group only. */
export const GroupsSchema = z
  .array(z.object({ id, dinerIds: z.array(id).min(2).max(30) }))
  .max(15)
  .refine(
    (groups) => {
      const ids = groups.flatMap((group) => group.dinerIds);
      return new Set(ids).size === ids.length;
    },
    { message: 'A diner can only be in one group' },
  );

/**
 * Bill sent by the web app or by another app (e.g. Camarero Digital). Only
 * names, amounts and assignments are required; ids, unit prices and empty
 * lists are filled in, so an integration can post just its order lines.
 */
export const BillInputSchema = z.object({
  currency: z
    .string()
    .regex(/^[A-Za-z]{3}$/)
    .transform((value) => value.toUpperCase())
    .default('EUR'),
  diners: z.array(DinerSchema).max(30).default([]),
  items: z.array(ItemSchema).min(1).max(300),
  adjustments: z.array(AdjustmentSchema).max(10).default([]),
  receiptTotal: cents.optional(),
  source: z.enum(['manual', 'scan', 'import']).optional(),
  merchant: z.string().trim().min(1).max(120).optional(),
  groups: GroupsSchema.optional(),
});

export type BillInput = z.infer<typeof BillInputSchema>;

/** Builds a domain `Bill` from validated input, without `undefined`-valued keys. */
export function toBill(id: string, input: BillInput): Bill {
  const bill: Bill = {
    id,
    currency: input.currency,
    diners: input.diners.map((diner): Diner => ({ ...diner })),
    items: input.items.map((item): Item => {
      const built: Item = {
        id: item.id ?? randomUUID(),
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice ?? Math.round(item.total / item.quantity),
        total: item.total,
        assignment: item.assignment as Assignment,
      };
      if (item.needsReview) built.needsReview = true;
      return built;
    }),
    adjustments: input.adjustments.map((adjustment): Adjustment => ({ ...adjustment })),
  };
  if (input.receiptTotal !== undefined) bill.receiptTotal = input.receiptTotal;
  if (input.source !== undefined) bill.source = input.source;
  if (input.merchant !== undefined) bill.merchant = input.merchant;
  if (input.groups?.length) {
    bill.groups = pruneGroups(
      input.groups,
      bill.diners.map((diner) => diner.id),
    );
  }
  return bill;
}
