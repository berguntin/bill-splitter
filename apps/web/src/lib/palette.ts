/**
 * Diner colors. Each pairs a fill with the text color that stays readable on
 * it, so initials meet contrast requirements on every avatar.
 */
export const DINER_PALETTE = {
  coral: { fill: '#cf4229', ink: '#ffffff' },
  teal: { fill: '#1b7a6c', ink: '#ffffff' },
  amber: { fill: '#e8a531', ink: '#1f1a14' },
  violet: { fill: '#6d5bd0', ink: '#ffffff' },
  sky: { fill: '#2563a8', ink: '#ffffff' },
  lime: { fill: '#8fb339', ink: '#1f1a14' },
  rose: { fill: '#b83280', ink: '#ffffff' },
  slate: { fill: '#4a5568', ink: '#ffffff' },
} as const;

export type DinerColor = keyof typeof DINER_PALETTE;

export const DINER_COLORS = Object.keys(DINER_PALETTE) as DinerColor[];

export function dinerSwatch(color: string): { fill: string; ink: string } {
  return DINER_PALETTE[color as DinerColor] ?? DINER_PALETTE.slate;
}
