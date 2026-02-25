import { monitoringService } from '../src/services/monitoring-service';
import { supabase } from '../src/config/database';

// Mock Supabase client
jest.mock('../src/config/database', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

// Mock logger
jest.mock('../src/config/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  __esModule: true,
}));

describe('MonitoringService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSubscriptionMetrics()', () => {
    it('should calculate subscription metrics correctly', async () => {
      const mockSubscriptions = [
        {
          category: 'entertainment',
          price: 15.99,
          status: 'active',
          billing_cycle: 'monthly',
        },
        {
          category: 'productivity',
          price: 120,
          status: 'active',
          billing_cycle: 'yearly',
        },
        {
          category: 'entertainment',
          price: 10.99,
          status: 'cancelled',
          billing_cycle: 'monthly',
        },
      ];

      const mockQuery = {
        select: jest.fn().mockResolvedValue({
          data: mockSubscriptions,
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      const metrics = await monitoringService.getSubscriptionMetrics();

      expect(metrics.total_subscriptions).toBe(3);
      expect(metrics.active_subscriptions).toBe(2);
      expect(metrics.category_distribution['entertainment']).toBe(2);
      expect(metrics.category_distribution['productivity']).toBe(1);
    });

    it('should calculate monthly revenue correctly for different billing cycles', async () => {
      const mockSubscriptions = [
        {
          category: 'entertainment',
          price: 12,
          status: 'active',
          billing_cycle: 'monthly',
        },
        {
          category: 'productivity',
          price: 120,
          status: 'active',
          billing_cycle: 'yearly',
        },
        {
          category: 'tools',
          price: 5,
          status: 'active',
          billing_cycle: 'weekly',
        },
      ];

      const mockQuery = {
        select: jest.fn().mockResolvedValue({
          data: mockSubscriptions,
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      const metrics = await monitoringService.getSubscriptionMetrics();

      // Monthly: 12
      // Yearly: 120/12 = 10
      // Weekly: 5*4 = 20
      // Total: 12 + 10 + 20 = 42
      expect(metrics.total_monthly_revenue).toBe(42);
    });

    it('should exclude cancelled subscriptions from revenue calculation', async () => {
      const mockSubscriptions = [
        {
          category: 'entertainment',
          price: 15.99,
          status: 'active',
          billing_cycle: 'monthly',
        },
        {
          category: 'entertainment',
          price: 10.99,
          status: 'cancelled',
          billing_cycle: 'monthly',
        },
      ];

      const mockQuery = {
        select: jest.fn().mockResolvedValue({
          data: mockSubscriptions,
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      const metrics = await monitoringService.getSubscriptionMetrics();

      expect(metrics.total_monthly_revenue).toBe(15.99);
    });

    it('should handle empty subscription list', async () => {
      const mockQuery = {
        select: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      const metrics = await monitoringService.getSubscriptionMetrics();

      expect(metrics.total_subscriptions).toBe(0);
      expect(metrics.active_subscriptions).toBe(0);
      expect(metrics.total_monthly_revenue).toBe(0);
      expect(Object.keys(metrics.category_distribution).length).toBe(0);
    });

    it('should handle null categories gracefully', async () => {
      const mockSubscriptions = [
        {
          category: null as any,
          price: 15.99,
          status: 'active',
          billing_cycle: 'monthly',
        },
        {
          category: 'entertainment',
          price: 10.99,
          status: 'active',
          billing_cycle: 'monthly',
        },
      ];

      const mockQuery = {
        select: jest.fn().mockResolvedValue({
          data: mockSubscriptions,
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      const metrics = await monitoringService.getSubscriptionMetrics();

      expect(metrics.total_subscriptions).toBe(2);
      expect(metrics.category_distribution['entertainment']).toBe(1);
    });

    it('should throw error on database failure', async () => {
      const mockQuery = {
        select: jest.fn().mockResolvedValue({
          data: null,
          error: new Error('Database error'),
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      await expect(monitoringService.getSubscriptionMetrics()).rejects.toThrow(
        'Database error'
      );
    });
  });

  describe('getRenewalMetrics()', () => {
    it('should calculate renewal metrics correctly', async () => {
      const mockDeliveries = [
        { channel: 'email', status: 'sent' },
        { channel: 'email', status: 'sent' },
        { channel: 'sms', status: 'sent' },
        { channel: 'email', status: 'failed' },
        { channel: 'sms', status: 'failed' },
      ];

      const mockQuery = {
        select: jest.fn().mockResolvedValue({
          data: mockDeliveries,
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      const metrics = await monitoringService.getRenewalMetrics();

      expect(metrics.total_delivery_attempts).toBe(5);
      expect(metrics.success_rate).toBe(60); // 3 out of 5
      expect(metrics.failure_rate).toBe(40); // 2 out of 5
    });

    it('should distribute metrics by channel correctly', async () => {
      const mockDeliveries = [
        { channel: 'email', status: 'sent' },
        { channel: 'email', status: 'sent' },
        { channel: 'email', status: 'failed' },
        { channel: 'sms', status: 'sent' },
        { channel: 'sms', status: 'failed' },
        { channel: 'push', status: 'sent' },
      ];

      const mockQuery = {
        select: jest.fn().mockResolvedValue({
          data: mockDeliveries,
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      const metrics = await monitoringService.getRenewalMetrics();

      expect(metrics.channel_distribution['email']).toEqual({
        success: 2,
        failure: 1,
      });
      expect(metrics.channel_distribution['sms']).toEqual({
        success: 1,
        failure: 1,
      });
      expect(metrics.channel_distribution['push']).toEqual({
        success: 1,
        failure: 0,
      });
    });

    it('should handle empty delivery list', async () => {
      const mockQuery = {
        select: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      const metrics = await monitoringService.getRenewalMetrics();

      expect(metrics.total_delivery_attempts).toBe(0);
      expect(metrics.success_rate).toBe(0);
      expect(metrics.failure_rate).toBe(0);
      expect(Object.keys(metrics.channel_distribution).length).toBe(0);
    });

    it('should handle 100% success rate', async () => {
      const mockDeliveries = [
        { channel: 'email', status: 'sent' },
        { channel: 'sms', status: 'sent' },
        { channel: 'push', status: 'sent' },
      ];

      const mockQuery = {
        select: jest.fn().mockResolvedValue({
          data: mockDeliveries,
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      const metrics = await monitoringService.getRenewalMetrics();

      expect(metrics.success_rate).toBe(100);
      expect(metrics.failure_rate).toBe(0);
    });

    it('should handle 100% failure rate', async () => {
      const mockDeliveries = [
        { channel: 'email', status: 'failed' },
        { channel: 'sms', status: 'failed' },
        { channel: 'push', status: 'failed' },
      ];

      const mockQuery = {
        select: jest.fn().mockResolvedValue({
          data: mockDeliveries,
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      const metrics = await monitoringService.getRenewalMetrics();

      expect(metrics.success_rate).toBe(0);
      expect(metrics.failure_rate).toBe(100);
    });

    it('should ignore unknown status values', async () => {
      const mockDeliveries = [
        { channel: 'email', status: 'sent' },
        { channel: 'email', status: 'failed' },
        { channel: 'email', status: 'pending' }, // Unknown status
        { channel: 'email', status: 'retrying' }, // Unknown status
      ];

      const mockQuery = {
        select: jest.fn().mockResolvedValue({
          data: mockDeliveries,
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      const metrics = await monitoringService.getRenewalMetrics();

      expect(metrics.total_delivery_attempts).toBe(4);
      expect(metrics.success_rate).toBe(25); // Only 1 success
      expect(metrics.failure_rate).toBe(25); // Only 1 failure
    });

    it('should throw error on database failure', async () => {
      const mockQuery = {
        select: jest.fn().mockResolvedValue({
          data: null,
          error: new Error('Database error'),
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      await expect(monitoringService.getRenewalMetrics()).rejects.toThrow(
        'Database error'
      );
    });
  });

  describe('getAgentActivity()', () => {
    it('should retrieve agent activity metrics', async () => {
      const mockReminders = { count: 25 };
      const mockProcessed = { count: 150 };
      const mockLogs = [
        { status: 'confirmed' },
        { status: 'confirmed' },
        { status: 'failed' },
      ];

      (supabase.from as jest.Mock)
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue(mockReminders),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          neq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockResolvedValue(mockProcessed),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue({
            data: mockLogs,
            error: null,
          }),
        });

      const activity = await monitoringService.getAgentActivity();

      expect(activity.pending_reminders).toBe(25);
      expect(activity.processed_reminders_last_24h).toBe(150);
      expect(activity.confirmed_blockchain_events).toBe(2);
      expect(activity.failed_blockchain_events).toBe(1);
    });

    it('should handle missing blockchain logs', async () => {
      const mockReminders = { count: 10 };
      const mockProcessed = { count: 100 };

      (supabase.from as jest.Mock)
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue(mockReminders),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          neq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockResolvedValue(mockProcessed),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        });

      const activity = await monitoringService.getAgentActivity();

      expect(activity.confirmed_blockchain_events).toBe(0);
      expect(activity.failed_blockchain_events).toBe(0);
    });

    it('should handle zero pending reminders', async () => {
      const mockReminders = { count: 0 };
      const mockProcessed = { count: 500 };
      const mockLogs = [
        { status: 'confirmed' },
        { status: 'failed' },
        { status: 'failed' },
      ];

      (supabase.from as jest.Mock)
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue(mockReminders),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          neq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockResolvedValue(mockProcessed),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue({
            data: mockLogs,
            error: null,
          }),
        });

      const activity = await monitoringService.getAgentActivity();

      expect(activity.pending_reminders).toBe(0);
      expect(activity.processed_reminders_last_24h).toBe(500);
    });

    it('should handle undefined count values', async () => {
      (supabase.from as jest.Mock)
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ count: undefined }),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          neq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockResolvedValue({ count: undefined }),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        });

      const activity = await monitoringService.getAgentActivity();

      expect(activity.pending_reminders).toBe(0);
      expect(activity.processed_reminders_last_24h).toBe(0);
    });

    it('should throw error on database failure', async () => {
      (supabase.from as jest.Mock)
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
        });

      await expect(monitoringService.getAgentActivity()).rejects.toThrow();
    });

    it('should filter blockchain logs correctly by status', async () => {
      const mockReminders = { count: 5 };
      const mockProcessed = { count: 50 };
      const mockLogs = [
        { status: 'confirmed' },
        { status: 'confirmed' },
        { status: 'confirmed' },
        { status: 'failed' },
        { status: 'pending' }, // Should be ignored
        { status: 'failed' },
      ];

      (supabase.from as jest.Mock)
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue(mockReminders),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          neq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockResolvedValue(mockProcessed),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue({
            data: mockLogs,
            error: null,
          }),
        });

      const activity = await monitoringService.getAgentActivity();

      expect(activity.confirmed_blockchain_events).toBe(3);
      expect(activity.failed_blockchain_events).toBe(2);
    });

    it('should calculate 24-hour window correctly', async () => {
      const mockReminders = { count: 10 };
      const mockProcessed = { count: 100 };
      const mockLogs: any[] = [];

      (supabase.from as jest.Mock)
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue(mockReminders),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          neq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockImplementation((field, value) => {
            // Verify that a timestamp 24 hours ago is passed
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const passedDate = new Date(value);
            expect(passedDate.getTime()).toBeLessThanOrEqual(yesterday.getTime() + 1000);
            return Promise.resolve(mockProcessed);
          }),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue({
            data: mockLogs,
            error: null,
          }),
        });

      await monitoringService.getAgentActivity();

      expect(supabase.from).toHaveBeenCalled();
    });
  });

  describe('Batch Operations', () => {
    it('should retrieve all three metrics concurrently', async () => {
      const mockSubscriptions = [
        {
          category: 'entertainment',
          price: 15.99,
          status: 'active',
          billing_cycle: 'monthly',
        },
      ];

      const mockDeliveries = [
        { channel: 'email', status: 'sent' },
      ];

      const mockReminders = { count: 5 };
      const mockProcessed = { count: 50 };
      const mockLogs = [{ status: 'confirmed' }];

      (supabase.from as jest.Mock)
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue({
            data: mockSubscriptions,
            error: null,
          }),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue({
            data: mockDeliveries,
            error: null,
          }),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue(mockReminders),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          neq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockResolvedValue(mockProcessed),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue({
            data: mockLogs,
            error: null,
          }),
        });

      const [subscriptionMetrics, renewalMetrics, agentActivity] = await Promise.all([
        monitoringService.getSubscriptionMetrics(),
        monitoringService.getRenewalMetrics(),
        monitoringService.getAgentActivity(),
      ]);

      expect(subscriptionMetrics.total_subscriptions).toBe(1);
      expect(renewalMetrics.total_delivery_attempts).toBe(1);
      expect(agentActivity.pending_reminders).toBe(5);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle division by zero in rate calculations', async () => {
      const mockQuery = {
        select: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      const metrics = await monitoringService.getRenewalMetrics();

      expect(metrics.success_rate).toBe(0);
      expect(metrics.failure_rate).toBe(0);
      expect(isNaN(metrics.success_rate)).toBe(false);
    });

    it('should handle very large numbers in revenue calculation', async () => {
      const mockSubscriptions = [
        {
          category: 'premium',
          price: Number.MAX_SAFE_INTEGER,
          status: 'active',
          billing_cycle: 'monthly',
        },
      ];

      const mockQuery = {
        select: jest.fn().mockResolvedValue({
          data: mockSubscriptions,
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      const metrics = await monitoringService.getSubscriptionMetrics();

      expect(metrics.total_monthly_revenue).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER * 2);
    });

    it('should handle negative prices gracefully', async () => {
      const mockSubscriptions = [
        {
          category: 'refund',
          price: -10,
          status: 'active',
          billing_cycle: 'monthly',
        },
      ];

      const mockQuery = {
        select: jest.fn().mockResolvedValue({
          data: mockSubscriptions,
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      const metrics = await monitoringService.getSubscriptionMetrics();

      expect(metrics.total_monthly_revenue).toBe(-10);
    });
  });
});
