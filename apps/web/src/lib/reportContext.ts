import type { RouteLocationRaw } from 'vue-router';
import type { ReportTopic } from './api';
import {
  lastScanRecord,
  recentErrors,
  recentNavigation,
  recentRequests,
  type ScanRecord,
} from './diagnostics';
import { APP_RELEASE, lastErrorEventId } from './monitoring';

/** Link to the report screen from wherever the user is, carrying what we already know. */
export function reportLocation(
  from: string,
  extras: { ref?: string | null; topic?: ReportTopic } = {},
): RouteLocationRaw {
  const query: Record<string, string> = { from };
  if (extras.ref) query.ref = extras.ref;
  if (extras.topic) query.topic = extras.topic;
  return { name: 'report', query };
}

/** Best guess of what a report is about, from the screen it was started on. */
export function topicForScreen(screen: string | undefined): ReportTopic {
  switch (screen) {
    case 'scan':
      return 'scan';
    case 'items':
    case 'diners':
    case 'assign':
    case 'summary':
      return 'split';
    case 'share':
    case 'guest':
      return 'share';
    default:
      return 'other';
  }
}

export interface ReportContext {
  release: string;
  route: string;
  screen?: string;
  userAgent: string;
  language: string;
  timeZone: string;
  viewport: { width: number; height: number; pixelRatio: number };
  online: boolean;
  standalone: boolean;
  errorRef?: string;
  sentryEventId?: string;
  recentRequests: ReturnType<typeof recentRequests>;
  recentErrors: ReturnType<typeof recentErrors>;
  navigation: ReturnType<typeof recentNavigation>;
  lastScan?: ScanRecord;
}

/** Everything technical we can attach to a report without asking the user. */
export function collectReportContext(options: {
  route: string;
  screen?: string;
  errorRef?: string;
}): ReportContext {
  const context: ReportContext = {
    release: APP_RELEASE,
    route: options.route,
    userAgent: navigator.userAgent,
    language: navigator.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      pixelRatio: window.devicePixelRatio || 1,
    },
    online: navigator.onLine,
    standalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
    // The report itself is not part of the problem.
    recentRequests: recentRequests().filter((request) => request.path !== '/api/reports'),
    recentErrors: recentErrors(),
    navigation: recentNavigation().filter((step) => !step.path.startsWith('/report')),
  };
  if (options.screen) context.screen = options.screen;
  if (options.errorRef) context.errorRef = options.errorRef;
  const sentryEventId = lastErrorEventId();
  if (sentryEventId) context.sentryEventId = sentryEventId;
  const lastScan = lastScanRecord();
  if (lastScan) context.lastScan = lastScan;
  return context;
}

/** Base64 of a photo, without the `data:` prefix, for a JSON body. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image'));
    reader.readAsDataURL(blob);
  });
}

export const ATTACHABLE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
