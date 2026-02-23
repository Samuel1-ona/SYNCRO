ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS last_renewal_cycle_id BIGINT DEFAULT NULL;
