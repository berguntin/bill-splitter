/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

interface ImportMetaEnv {
  /** Base URL of the API. Empty means the same origin (proxied in development). */
  readonly VITE_API_URL?: string;
  /** Sentry project DSN (Vue). Without it, errors are not reported. */
  readonly VITE_SENTRY_DSN?: string;
  /** Ko-fi page (https) for the support link. Without it, the link is hidden. */
  readonly VITE_KOFI_URL?: string;
}

/** Commit the app was built from, or `dev`. */
declare const __APP_RELEASE__: string;
