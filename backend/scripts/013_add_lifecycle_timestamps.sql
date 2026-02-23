-- 013: Add on-chain lifecycle timestamp columns to subscriptions.
-- These columns mirror immutable timestamps stored on the Soroban contract.
-- Values are Unix epoch seconds (BIGINT) from env.ledger().timestamp().

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS blockchain_created_at BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS blockchain_activated_at BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS blockchain_last_renewed_at BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS blockchain_canceled_at BIGINT DEFAULT NULL;
