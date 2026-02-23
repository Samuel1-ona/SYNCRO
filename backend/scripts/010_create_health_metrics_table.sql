-- Protocol Health Monitor: historical metrics for renewal system observability
-- Stores snapshots for failed renewals/hour, contract errors, agent activity

CREATE TABLE IF NOT EXISTS health_metrics_snapshots (
  id BIGSERIAL PRIMARY KEY,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Renewal health (last rolling hour)
  failed_renewals_last_hour INTEGER NOT NULL DEFAULT 0,
  successful_deliveries_last_hour INTEGER NOT NULL DEFAULT 0,

  -- Contract/blockchain errors (last rolling hour)
  contract_errors_last_hour INTEGER NOT NULL DEFAULT 0,
  blockchain_failed_last_hour INTEGER NOT NULL DEFAULT 0,

  -- Agent activity
  last_agent_activity_at TIMESTAMP WITH TIME ZONE,
  pending_reminders INTEGER NOT NULL DEFAULT 0,
  processed_reminders_last_24h INTEGER NOT NULL DEFAULT 0,

  -- Alert state at snapshot time (denormalized for history)
  alerts_triggered JSONB DEFAULT '[]'::jsonb
);

CREATE INDEX idx_health_metrics_recorded_at ON health_metrics_snapshots(recorded_at DESC);

COMMENT ON TABLE health_metrics_snapshots IS 'Historical protocol health metrics for monitoring and alerting';
