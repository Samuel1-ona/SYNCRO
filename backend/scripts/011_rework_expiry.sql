-- 011: Rework auto-expiry to use env-based per-cycle thresholds
-- Removes per-subscription expiry_threshold column and updates indexes

ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS expiry_threshold;
DROP INDEX IF EXISTS idx_subscriptions_expiry_candidates;

-- New index: active subs with non-lifetime billing cycles
CREATE INDEX IF NOT EXISTS idx_subscriptions_expiry_candidates_v2
  ON public.subscriptions (billing_cycle, last_used_at, created_at)
  WHERE status = 'active' AND billing_cycle IN ('monthly', 'quarterly', 'yearly');

-- GIN index on notifications for warning dedup containment queries
CREATE INDEX IF NOT EXISTS idx_notifications_subscription_data
  ON public.notifications USING gin (subscription_data);
