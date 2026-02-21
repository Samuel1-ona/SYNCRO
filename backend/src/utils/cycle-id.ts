/**
 * Generates a deterministic cycle ID from a billing date.
 * Format: YYYYMMDD as a number (e.g., 20260315).
 * Uses UTC exclusively to avoid timezone drift.
 */
export function generateCycleId(billingDate: Date | string): number {
  const date = typeof billingDate === 'string' ? new Date(billingDate) : billingDate;

  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${billingDate}`);
  }

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  return year * 10000 + month * 100 + day;
}
