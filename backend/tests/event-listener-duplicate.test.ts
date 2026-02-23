import { generateCycleId } from '../src/utils/cycle-id';
import { supabase } from '../src/config/database';

// Mock Supabase client
jest.mock('../src/config/database', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
  },
}));

// Mock logger — module uses `export default`, so mock must match
jest.mock('../src/config/logger', () => {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return { __esModule: true, default: logger };
});

// Mock reorg-handler
jest.mock('../src/services/reorg-handler', () => ({
  reorgHandler: { handleReorg: jest.fn() },
}));

describe('EventListener - DuplicateRenewalRejected', () => {
  let EventListener: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Set required env var before importing
    process.env.SOROBAN_CONTRACT_ADDRESS = 'test-contract-id';
    // Fresh import to pick up mocks
    const mod = await import('../src/services/event-listener');
    EventListener = mod.EventListener;
  });

  it('handleDuplicateRenewalRejected returns correct ProcessedEvent', async () => {
    const listener = new EventListener();

    const event = {
      type: 'DuplicateRenewalRejected',
      ledger: 1000,
      txHash: 'tx_abc',
      contractId: 'test-contract-id',
      topics: [],
      value: { sub_id: 42, cycle_id: 20260315 },
    };

    // Access private method via prototype
    const result = await (listener as any).handleDuplicateRenewalRejected(event);

    expect(result).toEqual({
      sub_id: 42,
      event_type: 'duplicate_renewal_rejected',
      ledger: 1000,
      tx_hash: 'tx_abc',
      event_data: { sub_id: 42, cycle_id: 20260315 },
    });
  });
});

describe('EventListener - handleRenewalSuccess with cycle_id', () => {
  let EventListener: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.SOROBAN_CONTRACT_ADDRESS = 'test-contract-id';
    const mod = await import('../src/services/event-listener');
    EventListener = mod.EventListener;
  });

  it('includes last_renewal_cycle_id when next_billing_date exists', async () => {
    const listener = new EventListener();

    // Mock the select chain for fetching subscription
    const singleMock = jest.fn().mockResolvedValue({
      data: { next_billing_date: '2026-03-15T00:00:00.000Z' },
    });
    const eqMock2 = jest.fn().mockReturnValue({ single: singleMock });
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock2 });

    // Mock the update chain
    const updateEqMock = jest.fn().mockResolvedValue({ error: null });
    const updateMock = jest.fn().mockReturnValue({ eq: updateEqMock });

    let callCount = 0;
    (supabase.from as jest.Mock).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call: select next_billing_date
        return { select: selectMock };
      }
      // Second call: update
      return { update: updateMock };
    });

    const event = {
      type: 'RenewalSuccess',
      ledger: 500,
      txHash: 'tx_xyz',
      contractId: 'test-contract-id',
      topics: [],
      value: { sub_id: 10, owner: 'GABC' },
    };

    await (listener as any).handleRenewalSuccess(event);

    // Verify update was called with last_renewal_cycle_id
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'active',
        failure_count: 0,
        last_renewal_cycle_id: 20260315,
      })
    );
  });

  it('omits last_renewal_cycle_id when next_billing_date is null', async () => {
    const listener = new EventListener();

    const singleMock = jest.fn().mockResolvedValue({
      data: { next_billing_date: null },
    });
    const eqMock2 = jest.fn().mockReturnValue({ single: singleMock });
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock2 });

    const updateEqMock = jest.fn().mockResolvedValue({ error: null });
    const updateMock = jest.fn().mockReturnValue({ eq: updateEqMock });

    let callCount = 0;
    (supabase.from as jest.Mock).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { select: selectMock };
      }
      return { update: updateMock };
    });

    const event = {
      type: 'RenewalSuccess',
      ledger: 500,
      txHash: 'tx_xyz',
      contractId: 'test-contract-id',
      topics: [],
      value: { sub_id: 10, owner: 'GABC' },
    };

    await (listener as any).handleRenewalSuccess(event);

    // Verify update was called WITHOUT last_renewal_cycle_id
    expect(updateMock).toHaveBeenCalledWith(
      expect.not.objectContaining({
        last_renewal_cycle_id: expect.anything(),
      })
    );
  });
});
