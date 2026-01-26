import { supabase } from '../config/database';
import logger from '../config/logger';

export interface SubscriptionMetrics {
    total_subscriptions: number;
    active_subscriptions: number;
    category_distribution: Record<string, number>;
    total_monthly_revenue: number;
}

export interface RenewalMetrics {
    total_delivery_attempts: number;
    success_rate: number;
    failure_rate: number;
    channel_distribution: Record<string, { success: number; failure: number }>;
}

export interface AgentActivity {
    pending_reminders: number;
    processed_reminders_last_24h: number;
    confirmed_blockchain_events: number;
    failed_blockchain_events: number;
}

export class MonitoringService {
    /**
     * Get subscription metrics
     */
    async getSubscriptionMetrics(): Promise<SubscriptionMetrics> {
        try {
            const { data: subscriptions, error } = await supabase
                .from('subscriptions')
                .select('category, price, status, billing_cycle');

            if (error) throw error;

            const metrics: SubscriptionMetrics = {
                total_subscriptions: subscriptions.length,
                active_subscriptions: subscriptions.filter(s => s.status === 'active').length,
                category_distribution: {},
                total_monthly_revenue: 0,
            };

            for (const sub of subscriptions) {
                // Category distribution
                metrics.category_distribution[sub.category] = (metrics.category_distribution[sub.category] || 0) + 1;

                // Revenue calculation (normalize to monthly)
                if (sub.status === 'active') {
                    let monthlyPrice = sub.price;
                    if (sub.billing_cycle === 'yearly') monthlyPrice = sub.price / 12;
                    else if (sub.billing_cycle === 'weekly') monthlyPrice = sub.price * 4;
                    metrics.total_monthly_revenue += monthlyPrice;
                }
            }

            return metrics;
        } catch (error) {
            logger.error('Error fetching subscription metrics:', error);
            throw error;
        }
    }

    /**
     * Get renewal metrics based on notification deliveries
     */
    async getRenewalMetrics(): Promise<RenewalMetrics> {
        try {
            const { data: deliveries, error } = await supabase
                .from('notification_deliveries')
                .select('channel, status');

            if (error) throw error;

            const metrics: RenewalMetrics = {
                total_delivery_attempts: deliveries.length,
                success_rate: 0,
                failure_rate: 0,
                channel_distribution: {},
            };

            if (deliveries.length === 0) return metrics;

            let successes = 0;
            let failures = 0;

            for (const d of deliveries) {
                if (!metrics.channel_distribution[d.channel]) {
                    metrics.channel_distribution[d.channel] = { success: 0, failure: 0 };
                }

                if (d.status === 'sent') {
                    successes++;
                    metrics.channel_distribution[d.channel].success++;
                } else if (d.status === 'failed') {
                    failures++;
                    metrics.channel_distribution[d.channel].failure++;
                }
            }

            metrics.success_rate = (successes / deliveries.length) * 100;
            metrics.failure_rate = (failures / deliveries.length) * 100;

            return metrics;
        } catch (error) {
            logger.error('Error fetching renewal metrics:', error);
            throw error;
        }
    }

    /**
     * Get agent activity summary
     */
    async getAgentActivity(): Promise<AgentActivity> {
        try {
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

            const [
                { count: pendingCount },
                { count: processedCount },
                { data: bcLogs }
            ] = await Promise.all([
                supabase.from('reminder_schedules').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
                supabase.from('reminder_schedules').select('*', { count: 'exact', head: true }).neq('status', 'pending').gte('updated_at', yesterday),
                supabase.from('blockchain_logs').select('status')
            ]);

            return {
                pending_reminders: pendingCount || 0,
                processed_reminders_last_24h: processedCount || 0,
                confirmed_blockchain_events: bcLogs?.filter(l => l.status === 'confirmed').length || 0,
                failed_blockchain_events: bcLogs?.filter(l => l.status === 'failed').length || 0,
            };
        } catch (error) {
            logger.error('Error fetching agent activity:', error);
            throw error;
        }
    }
}

export const monitoringService = new MonitoringService();
