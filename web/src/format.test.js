import { describe, expect, it } from 'vitest';
import { money, shortId, stockLabel, toCents } from './format';

describe('format', () => {
  it('formats cents as dollars', () => {
    expect(money(1490)).toBe('$14.90');
    expect(money(123456)).toBe('$1,234.56');
  });

  it('reads a typed price', () => {
    expect(toCents('12.90')).toBe(1290);
    expect(toCents('12,9')).toBe(1290);
    expect(toCents('$ 5')).toBe(500);
    expect(toCents('0')).toBe(null);
    expect(toCents('abc')).toBe(null);
    expect(toCents('1.234')).toBe(null);
  });

  it('labels the stock', () => {
    expect(stockLabel(0)).toBe('Out of stock');
    expect(stockLabel(3)).toBe('Only 3 left');
    expect(stockLabel(40)).toBe('In stock');
  });

  it('shortens the order id', () => {
    expect(shortId('3f2a9c1e-aaaa-bbbb')).toBe('3F2A9C1E');
  });
});
