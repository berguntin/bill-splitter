import { describe, expect, it } from 'vitest';
import { supportUrl } from '../support';

describe('supportUrl', () => {
  it('accepts an https link', () => {
    expect(supportUrl(' https://ko-fi.com/billsplitter ')).toBe('https://ko-fi.com/billsplitter');
  });

  it.each([
    undefined,
    '',
    '   ',
    'ko-fi.com/billsplitter',
    'http://ko-fi.com/x',
    'javascript:alert(1)',
  ])('hides the button for %j', (raw) => {
    expect(supportUrl(raw)).toBeNull();
  });
});
