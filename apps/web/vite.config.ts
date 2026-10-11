import { sentryVitePlugin } from '@sentry/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Version of the code being built; Railway provides the commit at build time. */
const release = process.env.RELEASE ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? 'dev';

/**
 * With SENTRY_AUTH_TOKEN (plus SENTRY_ORG and SENTRY_PROJECT), source maps are
 * uploaded to Sentry and then deleted, so they are never served publicly.
 */
const uploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN);

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    uploadSourceMaps &&
      sentryVitePlugin({
        release: { name: release },
        sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
        telemetry: false,
      }),
  ],
  define: {
    __APP_RELEASE__: JSON.stringify(release),
  },
  build: {
    sourcemap: uploadSourceMaps ? 'hidden' : false,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
