import * as Sentry from '@sentry/node';
import type { Config } from '../config';

/**
 * Sentry collects request data, local variables and AI prompts by default.
 * Bills hold people's names and receipts are photos, so none of that is sent:
 * a stack trace, the route and the request id are enough to find the logs.
 */
const PRIVATE_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  databaseQueryData: false,
  genAI: { inputs: false, outputs: false },
  stackFrameVariables: false,
} satisfies Sentry.NodeOptions['dataCollection'];

/**
 * Reports unexpected errors to Sentry when SENTRY_DSN is set; otherwise does
 * nothing. Only errors are sent (no tracing), without personal data.
 */
export function initSentry(config: Config): boolean {
  if (!config.SENTRY_DSN) return false;
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.SENTRY_ENVIRONMENT ?? config.NODE_ENV,
    ...(config.RELEASE ? { release: config.RELEASE } : {}),
    tracesSampleRate: 0,
    dataCollection: PRIVATE_DATA_COLLECTION,
    initialScope: { tags: { service: 'api' } },
  });
  return true;
}

/** Sends an error with the request id, so Sentry and the logs point at each other. */
export function reportError(error: unknown, context: { requestId: string; route: string }): void {
  Sentry.withScope((scope) => {
    scope.setTag('request_id', context.requestId);
    scope.setTag('route', context.route);
    Sentry.captureException(error);
  });
}

export async function flushSentry(): Promise<void> {
  await Sentry.flush(2000);
}
