import type { BrowserOptions } from '@sentry/vue';
import type { App } from 'vue';
import type { Router } from 'vue-router';
import { isChunkLoadError } from './updateReload';

export const APP_RELEASE = __APP_RELEASE__;

/**
 * Sentry collects request data and local variables by default. Bills hold
 * people's names, so none of that is sent; stack traces and breadcrumbs
 * (screens visited, API calls with their status) are enough.
 */
const PRIVATE_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  stackFrameVariables: false,
} satisfies BrowserOptions['dataCollection'];

let getLastEventId: (() => string | undefined) | null = null;

/**
 * Reports unexpected errors to Sentry when VITE_SENTRY_DSN is set. The SDK is
 * loaded after the app starts, so it does not slow down the first screen. A
 * session replay is kept only for sessions with an error, with every text,
 * input and image masked.
 */
export async function initMonitoring(app: App, router: Router): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) return;

  // Destructured so the bundler leaves out the parts of the SDK we don't use.
  const { init, replayIntegration, getCurrentScope, lastEventId } = await import('@sentry/vue');
  init({
    app,
    dsn,
    release: APP_RELEASE,
    environment: import.meta.env.MODE,
    dataCollection: PRIVATE_DATA_COLLECTION,
    integrations: [
      replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true }),
    ],
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1,
    initialScope: { tags: { service: 'web' } },
    // Code chunks from an old deploy are handled by reloading (see updateReload).
    beforeSend: (event, hint) => (isChunkLoadError(hint.originalException) ? null : event),
  });
  getLastEventId = lastEventId;

  // Group events by screen ("assign") rather than by full URL with ids.
  const tagScreen = () =>
    getCurrentScope().setTag(
      'screen',
      String(router.currentRoute.value.name ?? router.currentRoute.value.path),
    );
  tagScreen();
  router.afterEach(tagScreen);
}

/** Id of the last error sent to Sentry, to link it from a bug report. */
export function lastErrorEventId(): string | undefined {
  return getLastEventId?.();
}
