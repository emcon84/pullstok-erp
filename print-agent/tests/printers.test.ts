import { describe, expect, it } from 'vitest';
import { parsePrinterList } from '../src/printers';

describe('parsePrinterList', () => {
  it('parses a JSON array', () => {
    expect(parsePrinterList('["OCOM 58","PDF"]\r\n')).toEqual(['OCOM 58', 'PDF']);
  });
  it('accepts a single string', () => {
    expect(parsePrinterList('"OCOM"')).toEqual(['OCOM']);
  });
  it('returns [] for empty output', () => {
    expect(parsePrinterList('  \r\n')).toEqual([]);
  });
});
