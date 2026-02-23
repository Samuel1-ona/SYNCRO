import { supabase } from '../config/database';
import logger from '../config/logger';
import { monitoringService } from './monitoring-service';

export interface HealthThresholds {
  failedRenewalsPerHour: number;
  contractErrorsPerHour: number;
  agentInactivityHours: number;
}

export interface CurrentHealthMetrics {
  failedRenewalsLastHour: number;
  successfulDeliveriesLastHour: number;
  contractErrorsLastHour: number;
  blockchainFailedLastHour: number;
  lastAgentActivityAt: string | null;
  pendingReminders: number;
  processedRemindersLast24h: number;
}

export interface HealthAlert {
  id: string;
  message: string;
  severity: 'warning' | 'critical';
  value: number;
  threshold: number;
  triggeredAt: string;
}

export interface HealthSnapshot {
  recorded_at: string;
  failed_renewals_last_hour: number;
  successful_deliveries_last_hour: number;
  contract_errors_last_hour: number;
  blockchain_failed_last_hour: number;
  last_agent_activity_at: string | null;
  pending_reminders: number;
  processed_reminders_last_24h: number;
  alerts_triggered: HealthAlert[];
}

export interface AdminHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  metrics: CurrentHealthMetrics;
  alerts: HealthAlert[];
  thresholds: HealthThresholds;
  history?: HealthSnapshot[];
}

const DEFAULT_THRESHOLDS: HealthThresholds = {
  failedRenewalsPerHour: Number(process.env.HEALTH_THRESHOLD_FAILED_RENEWALS_PER_HOUR) || 10,
  contractErrorsPerHour: Number(process.env.HEALTH_THRESHOLD_CONTRACT_ERRORS_PER_HOUR) || 5,
  agentInactivityHours: Number(process.env.HEALTH_THRESHOLD_AGENT_INACTIVITY_HOURS) || 24,
};

export class HealthService {
  private thresholds: HealthThresholds = DEFAULT_THRESHOLDS;

  getThresholds(): HealthThresholds {
    return { ...this.thresholds };
  }

  /**
   * Gather current health metrics (failed renewals/hour, contract errors, agent activity).
   */
  async getCurrentMetrics(): Promise<CurrentHealthMetrics> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const [
      failedDeliveriesRes,
      successDeliveriesRes,
      contractErrorsRes,
      lastActivityRes,
      agentActivity,
    ] = await Promise.all([
      supabase
        .from('notification_deliveries')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('updated_at', oneHourAgo),
      supabase
        .from('notification_deliveries')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'sent')
        .gte('updated_at', oneHourAgo),
      supabase
        .from('blockchain_logs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('updated_at', oneHourAgo),
      supabase
        .from('reminder_schedules')
        .select('updated_at')
        .neq('status', 'pending')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      monitoringService.getAgentActivity(),
    ]);

    const lastActivityAt =
      lastActivityRes.data?.updated_at ?? null;

    return {
      failedRenewalsLastHour: failedDeliveriesRes.count ?? 0,
      successfulDeliveriesLastHour: successDeliveriesRes.count ?? 0,
      contractErrorsLastHour: contractErrorsRes.count ?? 0,
      blockchainFailedLastHour: contractErrorsRes.count ?? 0,
      lastAgentActivityAt: lastActivityAt,
      pendingReminders: agentActivity.pending_reminders,
      processedRemindersLast24h: agentActivity.processed_reminders_last_24h,
    };
  }

  /**
   * Evaluate metrics against thresholds and return triggered alerts.
   */
  evaluateAlerts(metrics: CurrentHealthMetrics): HealthAlert[] {
    const alerts: HealthAlert[] = [];
    const now = new Date().toISOString();

    if (metrics.failedRenewalsLastHour >= this.thresholds.failedRenewalsPerHour) {
      alerts.push({
        id: 'failed_renewals',
        message: `Failed renewals in the last hour (${metrics.failedRenewalsLastHour}) exceed threshold (${this.thresholds.failedRenewalsPerHour})`,
        severity: metrics.failedRenewalsLastHour >= this.thresholds.failedRenewalsPerHour * 2 ? 'critical' : 'warning',
        value: metrics.failedRenewalsLastHour,
        threshold: this.thresholds.failedRenewalsPerHour,
        triggeredAt: now,
      });
    }

    if (metrics.contractErrorsLastHour >= this.thresholds.contractErrorsPerHour) {
      alerts.push({
        id: 'contract_errors',
        message: `Contract/blockchain errors in the last hour (${metrics.contractErrorsLastHour}) exceed threshold (${this.thresholds.contractErrorsPerHour})`,
        severity: 'critical',
        value: metrics.contractErrorsLastHour,
        threshold: this.thresholds.contractErrorsPerHour,
        triggeredAt: now,
      });
    }

    if (metrics.lastAgentActivityAt) {
      const lastActivityMs = new Date(metrics.lastAgentActivityAt).getTime();
      const inactiveHours = (Date.now() - lastActivityMs) / (60 * 60 * 1000);
      if (inactiveHours >= this.thresholds.agentInactivityHours) {
        alerts.push({
          id: 'agent_inactivity',
          message: `No reminder processing activity for ${Math.round(inactiveHours)} hours (threshold: ${this.thresholds.agentInactivityHours}h)`,
          severity: inactiveHours >= this.thresholds.agentInactivityHours * 2 ? 'critical' : 'warning',
          value: Math.round(inactiveHours),
          threshold: this.thresholds.agentInactivityHours,
          triggeredAt: now,
        });
      }
    } else if (metrics.pendingReminders > 0) {
      alerts.push({
        id: 'agent_inactivity',
        message: 'Agent has never processed reminders but pending reminders exist',
        severity: 'warning',
        value: 0,
        threshold: this.thresholds.agentInactivityHours,
        triggeredAt: now,
      });
    }

    return alerts;
  }

  /**
   * Determine overall status from alerts.
   */
  getStatus(alerts: HealthAlert[]): 'healthy' | 'degraded' | 'unhealthy' {
    const hasCritical = alerts.some((a) => a.severity === 'critical');
    const hasWarning = alerts.some((a) => a.severity === 'warning');
    if (hasCritical) return 'unhealthy';
    if (hasWarning) return 'degraded';
    return 'healthy';
  }

  /**
   * Record current metrics and alerts to history.
   */
  async recordSnapshot(): Promise<void> {
    try {
      const metrics = await this.getCurrentMetrics();
      const alerts = this.evaluateAlerts(metrics);

      await supabase.from('health_metrics_snapshots').insert({
        recorded_at: new Date().toISOString(),
        failed_renewals_last_hour: metrics.failedRenewalsLastHour,
        successful_deliveries_last_hour: metrics.successfulDeliveriesLastHour,
        contract_errors_last_hour: metrics.contractErrorsLastHour,
        blockchain_failed_last_hour: metrics.blockchainFailedLastHour,
        last_agent_activity_at: metrics.lastAgentActivityAt,
        pending_reminders: metrics.pendingReminders,
        processed_reminders_last_24h: metrics.processedRemindersLast24h,
        alerts_triggered: alerts,
      });
    } catch (error) {
      logger.error('HealthService.recordSnapshot failed:', error);
    }
  }

  /**
   * Fetch recent historical snapshots.
   */
  async getHistory(limit: number = 50): Promise<HealthSnapshot[]> {
    const { data, error } = await supabase
      .from('health_metrics_snapshots')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('HealthService.getHistory failed:', error);
      return [];
    }

    return (data ?? []).map((row) => ({
      recorded_at: row.recorded_at,
      failed_renewals_last_hour: row.failed_renewals_last_hour,
      successful_deliveries_last_hour: row.successful_deliveries_last_hour,
      contract_errors_last_hour: row.contract_errors_last_hour,
      blockchain_failed_last_hour: row.blockchain_failed_last_hour,
      last_agent_activity_at: row.last_agent_activity_at,
      pending_reminders: row.pending_reminders,
      processed_reminders_last_24h: row.processed_reminders_last_24h,
      alerts_triggered: (row.alerts_triggered as HealthAlert[]) ?? [],
    }));
  }

  /**
   * Full admin health: current metrics, alerts, status, optional history.
   */
  async getAdminHealth(includeHistory: boolean = true): Promise<AdminHealthResponse> {
    const metrics = await this.getCurrentMetrics();
    const alerts = this.evaluateAlerts(metrics);
    const status = this.getStatus(alerts);
    const history = includeHistory ? await this.getHistory(24) : undefined;

    return {
      status,
      timestamp: new Date().toISOString(),
      metrics,
      alerts,
      thresholds: this.getThresholds(),
      history,
    };
  }
}

export const healthService = new HealthService();
