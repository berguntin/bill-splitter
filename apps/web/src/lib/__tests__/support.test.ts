import { describe, expect, it } from 'vitest';
import { coffeeSplit, supportUrl } from '../support';

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

describe('coffeeSplit', () => {
  it('splits evenly when it can', () => {
    expect(coffeeSplit(4)).toEqual({ amount: 300, share: 75, exact: true });
  });

  it('rounds the share up when the cents do not divide evenly', () => {
    expect(coffeeSplit(7)).toEqual({ amount: 300, share: 43, exact: false });
  });

  it('treats an empty table as one person', () => {
    expect(coffeeSplit(0)).toEqual({ amount: 300, share: 300, exact: true });
  });
});
