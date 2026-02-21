-- Renewal locks table for preventing concurrent renewal execution
CREATE TABLE IF NOT EXISTS renewal_locks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id),
    cycle_id BIGINT NOT NULL,
    locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    lock_holder TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'expired'))
);

-- Atomic locking: only one active lock per (subscription_id, cycle_id) at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_renewal_locks_active_unique
    ON renewal_locks (subscription_id, cycle_id)
    WHERE status = 'active';

-- Efficient cleanup of expired locks
CREATE INDEX IF NOT EXISTS idx_renewal_locks_expires_active
    ON renewal_locks (expires_at)
    WHERE status = 'active';

-- Enable RLS
ALTER TABLE renewal_locks ENABLE ROW LEVEL SECURITY;

-- Service role only policy
CREATE POLICY "Service role access only"
    ON renewal_locks
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
