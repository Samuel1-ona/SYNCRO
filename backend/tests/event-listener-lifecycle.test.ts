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

describe('EventListener - LifecycleTimestampUpdated', () => {
  let EventListener: any;
  let LIFECYCLE_COLUMN_MAP: Record<number, string>;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.SOROBAN_CONTRACT_ADDRESS = 'test-contract-id';
    const mod = await import('../src/services/event-listener');
    EventListener = mod.EventListener;
    LIFECYCLE_COLUMN_MAP = mod.LIFECYCLE_COLUMN_MAP;
  });

  it.each([
    [1, 'blockchain_created_at'],
    [2, 'blockchain_activated_at'],
    [3, 'blockchain_last_renewed_at'],
    [4, 'blockchain_canceled_at'],
  ])('handles event_kind %i and updates %s column', async (eventKind, column) => {
    const listener = new EventListener();

    const updateEqMock = jest.fn().mockResolvedValue({ error: null });
    const updateMock = jest.fn().mockReturnValue({ eq: updateEqMock });
    (supabase.from as jest.Mock).mockReturnValue({ update: updateMock });

    const event = {
      type: 'LifecycleTimestampUpdated',
      ledger: 500,
      txHash: 'tx_lc_1',
      contractId: 'test-contract-id',
      topics: [],
      value: { sub_id: 42, event_kind: eventKind, timestamp: 1700000000 },
    };

    const result = await (listener as any).handleLifecycleTimestampUpdated(event);

    expect(updateMock).toHaveBeenCalledWith({ [column]: 1700000000 });
    expect(updateEqMock).toHaveBeenCalledWith('blockchain_sub_id', 42);
    expect(result).toEqual({
      sub_id: 42,
      event_type: 'lifecycle_timestamp_updated',
      ledger: 500,
      tx_hash: 'tx_lc_1',
      event_data: event.value,
    });
  });

  it('returns null for unknown event_kind', async () => {
    const listener = new EventListener();

    const event = {
      type: 'LifecycleTimestampUpdated',
      ledger: 500,
      txHash: 'tx_lc_2',
      contractId: 'test-contract-id',
      topics: [],
      value: { sub_id: 42, event_kind: 99, timestamp: 1700000000 },
    };

    const result = await (listener as any).handleLifecycleTimestampUpdated(event);
    expect(result).toBeNull();
  });

  it('maps all four lifecycle event kinds to correct columns', () => {
    expect(LIFECYCLE_COLUMN_MAP[1]).toBe('blockchain_created_at');
    expect(LIFECYCLE_COLUMN_MAP[2]).toBe('blockchain_activated_at');
    expect(LIFECYCLE_COLUMN_MAP[3]).toBe('blockchain_last_renewed_at');
    expect(LIFECYCLE_COLUMN_MAP[4]).toBe('blockchain_canceled_at');
  });

  it('returns undefined for unknown event kinds', () => {
    expect(LIFECYCLE_COLUMN_MAP[0]).toBeUndefined();
    expect(LIFECYCLE_COLUMN_MAP[5]).toBeUndefined();
  });
});
