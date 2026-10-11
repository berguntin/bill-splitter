/**
 * Monetary amount in the currency's minor unit (e.g. euro cents).
 * Always an integer: floating point is never used for money.
 */
export type Cents = number;

export type DinerId = string;
export type ItemId = string;

export interface Diner {
  id: DinerId;
  name: string;
  /** Display color token, chosen by the UI. */
  color: string;
}

export interface Share {
  dinerId: DinerId;
  /** Relative, positive integer weight. `{ a: 2, b: 1 }` gives `a` two thirds. */
  weight: number;
}

export type Assignment =
  | { mode: 'unassigned' }
  | { mode: 'single'; dinerId: DinerId }
  | { mode: 'shared'; shares: Share[] }
  /** Split equally among every diner, including diners added later. */
  | { mode: 'everyone' };

export interface Item {
  id: ItemId;
  name: string;
  quantity: number;
  unitPrice: Cents;
  /** Line total as printed on the receipt. Source of truth for the split. */
  total: Cents;
  assignment: Assignment;
  /** Set when the line was read from a photo with low confidence. */
  needsReview?: boolean;
}

export type AdjustmentKind = 'tip' | 'service' | 'discount';

export type AdjustmentValue =
  /** Fixed amount, always positive; the sign comes from the kind. */
  | { type: 'amount'; amount: Cents }
  /** Percentage of the items total in basis points (1000 = 10%). */
  | { type: 'percent'; basisPoints: number };

export interface Adjustment {
  id: string;
  kind: AdjustmentKind;
  value: AdjustmentValue;
  /** `proportional` follows what each diner consumed; `equal` splits it evenly. */
  distribution: 'proportional' | 'equal';
}

export interface Bill {
  id: string;
  /** ISO 4217 code, e.g. `EUR`. */
  currency: string;
  diners: Diner[];
  items: Item[];
  adjustments: Adjustment[];
  /** Total printed on the receipt, used to detect reading errors. */
  receiptTotal?: Cents;
  /** How the items were entered: by hand (or missing), from a photo, or by another app. */
  source?: 'manual' | 'scan' | 'import';
  /** Business name, when the bill was scanned from a receipt. */
  merchant?: string;
}
