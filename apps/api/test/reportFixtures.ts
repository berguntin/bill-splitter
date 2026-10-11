import type { ReportContext } from '../src/reports/schema';
import type { StoredReport } from '../src/reports/store';

export const context: ReportContext = {
  release: 'abc1234',
  route: '/bill/assign',
  screen: 'assign',
  userAgent: 'Mozilla/5.0 (iPhone)',
  language: 'es-ES',
  timeZone: 'Europe/Madrid',
  viewport: { width: 390, height: 844, pixelRatio: 3 },
  online: true,
  recentRequests: [],
  recentErrors: [],
  navigation: [],
};

export function storedReport(overrides: Partial<StoredReport> = {}): StoredReport {
  return {
    id: 'R7F3K92Q',
    createdAt: new Date('2026-10-11T12:00:00Z'),
    expiresAt: new Date('2027-01-09T12:00:00Z'),
    description: 'The total is wrong',
    topic: 'split',
    context,
    attachments: [],
    accessToken: 'secret-token',
    ...overrides,
  };
}

/** Smallest valid JPEG header, enough for a media type check. */
export const jpegBase64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).toString('base64');
