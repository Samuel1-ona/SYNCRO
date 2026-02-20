-- Contract events table
CREATE TABLE IF NOT EXISTS contract_events (
  id BIGSERIAL PRIMARY KEY,
  sub_id BIGINT NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  ledger INTEGER NOT NULL,
  tx_hash VARCHAR(128) NOT NULL,
  event_data JSONB NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tx_hash, event_type, sub_id)
);

CREATE INDEX idx_contract_events_sub_id ON contract_events(sub_id);
CREATE INDEX idx_contract_events_ledger ON contract_events(ledger);
CREATE INDEX idx_contract_events_type ON contract_events(event_type);

-- Event cursor for tracking last processed ledger
CREATE TABLE IF NOT EXISTS event_cursor (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_ledger INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT single_cursor CHECK (id = 1)
);

-- Renewal approvals table
CREATE TABLE IF NOT EXISTS renewal_approvals (
  id BIGSERIAL PRIMARY KEY,
  blockchain_sub_id BIGINT NOT NULL,
  approval_id BIGINT NOT NULL,
  max_spend BIGINT NOT NULL,
  expires_at INTEGER NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  rejected BOOLEAN DEFAULT FALSE,
  rejection_reason INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(blockchain_sub_id, approval_id)
);

CREATE INDEX idx_renewal_approvals_sub_id ON renewal_approvals(blockchain_sub_id);

-- Add blockchain_sub_id to subscriptions if not exists
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS blockchain_sub_id BIGINT,
ADD COLUMN IF NOT EXISTS failure_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_subscriptions_blockchain_sub_id ON subscriptions(blockchain_sub_id);
