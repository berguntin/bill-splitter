import type { Router } from 'vue-router';

const RELOAD_FLAG = 'bill-splitter/reloaded-for-update';

/**
 * Browsers word a failed dynamic import differently; all of them mean the
 * chunk could not be loaded, usually because a newer deploy replaced it.
 */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed|module script|MIME type/i.test(
    message,
  );
}

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Reloads into `path` once per tab session; returns false if it already tried. */
export function reloadForNewVersion(path: string = window.location.href): boolean {
  const session = storage();
  if (session?.getItem(RELOAD_FLAG)) return false;
  session?.setItem(RELOAD_FLAG, '1');
  window.location.assign(path);
  return true;
}

/**
 * After a deploy, a tab opened earlier still points at the previous build's
 * code chunks, which no longer exist. Instead of failing silently when the
 * person moves to the next screen, load the new version of the app once.
 */
export function installUpdateReload(router: Router): void {
  // Every lazily loaded chunk is a route, so the router knows where the person
  // was heading; reloading there beats Vite's preload event, which only knows
  // the current URL.
  router.onError((error, to) => {
    if (isChunkLoadError(error)) reloadForNewVersion(to.fullPath);
  });

  // A successful navigation means this build works; allow a future reload.
  router.afterEach(() => {
    storage()?.removeItem(RELOAD_FLAG);
  });
}
