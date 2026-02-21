-- Add expiry columns to subscriptions table
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS expiry_threshold integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS expired_at timestamptz DEFAULT NULL;

-- Update status CHECK to include 'expired'
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'cancelled', 'paused', 'trial', 'expired'));

-- Partial index for the daily expiry cron query
CREATE INDEX IF NOT EXISTS idx_subscriptions_expiry_candidates
  ON public.subscriptions (last_used_at, created_at)
  WHERE status = 'active' AND expiry_threshold IS NOT NULL;
