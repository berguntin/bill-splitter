import { describe, expect, it } from 'vitest';
import { timeAgo } from '../relativeTime';

const now = new Date('2026-10-11T12:00:00Z');
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);

describe('timeAgo', () => {
  it('describes recent times in English', () => {
    expect(timeAgo(ago(10), now)).toBe('now');
    expect(timeAgo(ago(120), now)).toBe('2 minutes ago');
    expect(timeAgo(ago(3 * 3600), now)).toBe('3 hours ago');
    expect(timeAgo(ago(86_400), now)).toBe('yesterday');
  });

  it('describes them in Spanish too', () => {
    expect(timeAgo(ago(10), now, 'es')).toBe('ahora');
    expect(timeAgo(ago(120), now, 'es')).toBe('hace 2 minutos');
  });
});
