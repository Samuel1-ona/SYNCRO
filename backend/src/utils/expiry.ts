/**
 * Calculate whole days elapsed since a given date.
 */
export function daysSince(date: string | Date): number {
  const then = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Check whether a subscription should be considered expired by inactivity.
 * Uses last_used_at with created_at as fallback when last_used_at is null.
 */
export function isExpiredByInactivity(
  lastUsedAt: string | null,
  createdAt: string,
  thresholdDays: number
): boolean {
  const referenceDate = lastUsedAt || createdAt;
  return daysSince(referenceDate) >= thresholdDays;
}

/**
 * Calculate how many days remain before the subscription hits the expiry threshold.
 * A negative value means the subscription is already past the threshold.
 */
export function daysUntilExpiry(
  lastUsedAt: string | null,
  createdAt: string,
  thresholdDays: number
): number {
  const referenceDate = lastUsedAt || createdAt;
  return thresholdDays - daysSince(referenceDate);
}
