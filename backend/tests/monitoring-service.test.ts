import { monitoringService } from '../src/services/monitoring-service';
import { supabase } from '../src/config/database';

// Mock Supabase client
jest.mock('../src/config/database', () => ({
    supabase: {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        neq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
    },
}));

describe('MonitoringService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return subscription metrics correctly', async () => {
        const mockSubs = [
            { category: 'Streaming', price: 10, status: 'active', billing_cycle: 'monthly' },
            { category: 'Streaming', price: 15, status: 'active', billing_cycle: 'monthly' },
            { category: 'SaaS', price: 120, status: 'active', billing_cycle: 'yearly' },
            { category: 'Software', price: 5, status: 'inactive', billing_cycle: 'monthly' },
        ];

        (supabase.from as jest.Mock).mockReturnValue({
            select: jest.fn().mockResolvedValue({ data: mockSubs, error: null }),
        });

        const metrics = await monitoringService.getSubscriptionMetrics();
        expect(metrics.total_subscriptions).toBe(4);
        expect(metrics.active_subscriptions).toBe(3);
        expect(metrics.category_distribution['Streaming']).toBe(2);
        expect(metrics.category_distribution['SaaS']).toBe(1);
        expect(metrics.total_monthly_revenue).toBe(10 + 15 + (120 / 12));
    });

    it('should return renewal metrics correctly', async () => {
        const mockDeliveries = [
            { channel: 'email', status: 'sent' },
            { channel: 'email', status: 'failed' },
            { channel: 'push', status: 'sent' },
        ];

        (supabase.from as jest.Mock).mockReturnValue({
            select: jest.fn().mockResolvedValue({ data: mockDeliveries, error: null }),
        });

        const metrics = await monitoringService.getRenewalMetrics();
        expect(metrics.total_delivery_attempts).toBe(3);
        expect(metrics.success_rate).toBeCloseTo((2 / 3) * 100);
        expect(metrics.failure_rate).toBeCloseTo((1 / 3) * 100);
        expect(metrics.channel_distribution['email'].success).toBe(1);
        expect(metrics.channel_distribution['email'].failure).toBe(1);
        expect(metrics.channel_distribution['push'].success).toBe(1);
    });

    it('should return agent activity correctly', async () => {
        // Mock multiple calls to from()
        (supabase.from as jest.Mock).mockImplementation((table: string) => {
            if (table === 'reminder_schedules') {
                return {
                    select: jest.fn().mockReturnThis(),
                    eq: jest.fn().mockResolvedValue({ count: 5, error: null }),
                    neq: jest.fn().mockReturnThis(),
                    gte: jest.fn().mockResolvedValue({ count: 10, error: null }),
                };
            }
            if (table === 'blockchain_logs') {
                return {
                    select: jest.fn().mockResolvedValue({
                        data: [{ status: 'confirmed' }, { status: 'confirmed' }, { status: 'failed' }],
                        error: null
                    }),
                };
            }
            return {};
        });

        const activity = await monitoringService.getAgentActivity();
        expect(activity.pending_reminders).toBe(5);
        expect(activity.processed_reminders_last_24h).toBe(10);
        expect(activity.confirmed_blockchain_events).toBe(2);
        expect(activity.failed_blockchain_events).toBe(1);
    });
});
