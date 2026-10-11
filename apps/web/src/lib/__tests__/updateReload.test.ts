import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isChunkLoadError, reloadForNewVersion } from '../updateReload';

describe('isChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://x/assets/DinersView-abc.js',
    'Importing a module script failed.',
    'error loading dynamically imported module',
    "'text/html' is not a valid JavaScript MIME type.",
  ])('recognizes %j', (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
  });
});

describe('reloadForNewVersion', () => {
  const assign = vi.fn();

  beforeEach(() => {
    window.sessionStorage.clear();
    vi.stubGlobal('location', { ...window.location, assign, href: 'https://app.test/bill/items' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    assign.mockReset();
  });

  it('reloads once into the requested path, then gives up to avoid loops', () => {
    expect(reloadForNewVersion('/bill/people')).toBe(true);
    expect(assign).toHaveBeenCalledWith('/bill/people');

    expect(reloadForNewVersion('/bill/people')).toBe(false);
    expect(assign).toHaveBeenCalledTimes(1);
  });
});
