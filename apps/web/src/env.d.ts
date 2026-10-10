/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

interface ImportMetaEnv {
  /** Base URL of the API. Empty means the same origin (proxied in development). */
  readonly VITE_API_URL?: string;
}
