import { expiryService } from '../src/services/expiry-service';
import { supabase } from '../src/config/database';

// Mock Supabase client
jest.mock('../src/config/database', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

// Mock logger to suppress output during tests
jest.mock('../src/config/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  __esModule: true,
}));

describe('ExpiryService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.EXPIRY_DAYS_MONTHLY;
    delete process.env.EXPIRY_DAYS_QUARTERLY;
    delete process.env.EXPIRY_DAYS_YEARLY;
    delete process.env.EXPIRY_WARNING_DAYS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return zeros when no thresholds are configured', async () => {
    const result = await expiryService.processExpiries();
    expect(result).toEqual({ processed: 0, expired: 0, warnings: 0, errors: 0 });
  });

  it('should return zeros when no candidates found', async () => {
    process.env.EXPIRY_DAYS_MONTHLY = '60';

    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    const result = await expiryService.processExpiries();
    expect(result).toEqual({ processed: 0, expired: 0, warnings: 0, errors: 0 });
  });

  it('should expire a monthly subscription past its threshold', async () => {
    process.env.EXPIRY_DAYS_MONTHLY = '30';

    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const candidates = [
      {
        id: 'sub-1',
        user_id: 'user-1',
        name: 'Old Subscription',
        billing_cycle: 'monthly',
        last_used_at: sixtyDaysAgo,
        created_at: ninetyDaysAgo,
      },
    ];

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'subscriptions') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              in: jest.fn().mockResolvedValue({ data: candidates, error: null }),
            }),
          }),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null }),
            }),
          }),
        };
      }
      if (table === 'notifications') {
        return {
          insert: jest.fn().mockResolvedValue({ error: null }),
        };
      }
      return {};
    });

    const result = await expiryService.processExpiries();
    expect(result.processed).toBe(1);
    expect(result.expired).toBe(1);
    expect(result.errors).toBe(0);
  });

  it('should not expire subscriptions within their threshold', async () => {
    process.env.EXPIRY_DAYS_MONTHLY = '60';

    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const candidates = [
      {
        id: 'sub-1',
        user_id: 'user-1',
        name: 'Active Subscription',
        billing_cycle: 'monthly',
        last_used_at: fiveDaysAgo,
        created_at: ninetyDaysAgo,
      },
    ];

    const mockContains = jest.fn().mockReturnValue({
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'subscriptions') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              in: jest.fn().mockResolvedValue({ data: candidates, error: null }),
            }),
          }),
        };
      }
      if (table === 'notifications') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              contains: mockContains,
            }),
          }),
          insert: jest.fn().mockResolvedValue({ error: null }),
        };
      }
      return {};
    });

    const result = await expiryService.processExpiries();
    expect(result.processed).toBe(1);
    expect(result.expired).toBe(0);
    expect(result.errors).toBe(0);
  });

  it('should send warning when approaching threshold', async () => {
    process.env.EXPIRY_DAYS_MONTHLY = '60';

    // 55 days since last used → 5 days remaining → within 7-day warning tier
    const fiftyFiveDaysAgo = new Date(Date.now() - 55 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const candidates = [
      {
        id: 'sub-1',
        user_id: 'user-1',
        name: 'Nearly Expired',
        billing_cycle: 'monthly',
        last_used_at: fiftyFiveDaysAgo,
        created_at: ninetyDaysAgo,
      },
    ];

    const mockInsert = jest.fn().mockResolvedValue({ error: null });
    const mockContains = jest.fn().mockReturnValue({
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'subscriptions') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              in: jest.fn().mockResolvedValue({ data: candidates, error: null }),
            }),
          }),
        };
      }
      if (table === 'notifications') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              contains: mockContains,
            }),
          }),
          insert: mockInsert,
        };
      }
      return {};
    });

    const result = await expiryService.processExpiries();
    expect(result.warnings).toBe(1);
    expect(result.expired).toBe(0);
    expect(mockInsert).toHaveBeenCalled();
  });

  it('should not duplicate warning notifications', async () => {
    process.env.EXPIRY_DAYS_MONTHLY = '60';

    const fiftyFiveDaysAgo = new Date(Date.now() - 55 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const candidates = [
      {
        id: 'sub-1',
        user_id: 'user-1',
        name: 'Nearly Expired',
        billing_cycle: 'monthly',
        last_used_at: fiftyFiveDaysAgo,
        created_at: ninetyDaysAgo,
      },
    ];

    const mockInsert = jest.fn().mockResolvedValue({ error: null });
    const mockContains = jest.fn().mockReturnValue({
      limit: jest.fn().mockResolvedValue({ data: [{ id: 'notif-1' }], error: null }),
    });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'subscriptions') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              in: jest.fn().mockResolvedValue({ data: candidates, error: null }),
            }),
          }),
        };
      }
      if (table === 'notifications') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              contains: mockContains,
            }),
          }),
          insert: mockInsert,
        };
      }
      return {};
    });

    const result = await expiryService.processExpiries();
    expect(result.warnings).toBe(0);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('should continue processing when one subscription fails', async () => {
    process.env.EXPIRY_DAYS_MONTHLY = '30';

    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const candidates = [
      {
        id: 'sub-1',
        user_id: 'user-1',
        name: 'Will Fail',
        billing_cycle: 'monthly',
        last_used_at: sixtyDaysAgo,
        created_at: ninetyDaysAgo,
      },
      {
        id: 'sub-2',
        user_id: 'user-2',
        name: 'Will Succeed',
        billing_cycle: 'monthly',
        last_used_at: sixtyDaysAgo,
        created_at: ninetyDaysAgo,
      },
    ];

    let updateCallCount = 0;

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'subscriptions') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              in: jest.fn().mockResolvedValue({ data: candidates, error: null }),
            }),
          }),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockImplementation(() => {
                updateCallCount++;
                if (updateCallCount === 1) {
                  return Promise.resolve({ error: { message: 'DB error' } });
                }
                return Promise.resolve({ error: null });
              }),
            }),
          }),
        };
      }
      if (table === 'notifications') {
        return {
          insert: jest.fn().mockResolvedValue({ error: null }),
        };
      }
      return {};
    });

    const result = await expiryService.processExpiries();
    expect(result.processed).toBe(2);
    expect(result.expired).toBe(1);
    expect(result.errors).toBe(1);
  });

  it('should only query enabled billing cycles', async () => {
    process.env.EXPIRY_DAYS_MONTHLY = '60';
    // quarterly and yearly not set

    const mockIn = jest.fn().mockResolvedValue({ data: [], error: null });
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          in: mockIn,
        }),
      }),
    });

    await expiryService.processExpiries();
    expect(mockIn).toHaveBeenCalledWith('billing_cycle', ['monthly']);
  });
});
