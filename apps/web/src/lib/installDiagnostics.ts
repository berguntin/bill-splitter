import type { App } from 'vue';
import type { Router } from 'vue-router';
import { recordError, recordNavigation } from './diagnostics';

/** Keeps recent errors and screens in memory, to attach to a bug report. */
export function installDiagnostics(app: App, router: Router): void {
  const previous = app.config.errorHandler;
  app.config.errorHandler = (error, instance, info) => {
    recordError('vue', error);
    if (previous) previous(error, instance, info);
    else console.error(error);
  };
  window.addEventListener('error', (event) => recordError('window', event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => recordError('promise', event.reason));
  router.afterEach((to, _from, failure) => {
    if (!failure) recordNavigation(to.fullPath);
  });
}
