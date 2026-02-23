import { generateCycleId } from '../src/utils/cycle-id';

describe('generateCycleId', () => {
  it('should return YYYYMMDD from a Date object', () => {
    const date = new Date(Date.UTC(2026, 2, 15)); // March 15, 2026
    expect(generateCycleId(date)).toBe(20260315);
  });

  it('should return YYYYMMDD from an ISO string', () => {
    expect(generateCycleId('2026-03-15T00:00:00.000Z')).toBe(20260315);
  });

  it('should zero-pad single-digit month and day', () => {
    const date = new Date(Date.UTC(2026, 0, 5)); // January 5, 2026
    expect(generateCycleId(date)).toBe(20260105);
  });

  it('should handle year boundary (Dec 31 to Jan 1)', () => {
    expect(generateCycleId(new Date(Date.UTC(2026, 11, 31)))).toBe(20261231);
    expect(generateCycleId(new Date(Date.UTC(2027, 0, 1)))).toBe(20270101);
  });

  it('should throw on invalid date string', () => {
    expect(() => generateCycleId('not-a-date')).toThrow('Invalid date');
  });

  it('should handle date-only string input', () => {
    // Date-only strings are parsed as UTC per spec
    expect(generateCycleId('2026-07-20')).toBe(20260720);
  });
});
