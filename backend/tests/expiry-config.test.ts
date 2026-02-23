import { loadExpiryConfig, getThresholdForCycle, ExpiryConfig } from '../src/config/expiry';

describe('loadExpiryConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.EXPIRY_DAYS_MONTHLY;
    delete process.env.EXPIRY_DAYS_QUARTERLY;
    delete process.env.EXPIRY_DAYS_YEARLY;
    delete process.env.EXPIRY_WARNING_DAYS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return null thresholds when env vars are unset', () => {
    const config = loadExpiryConfig();
    expect(config.monthly).toBeNull();
    expect(config.quarterly).toBeNull();
    expect(config.yearly).toBeNull();
  });

  it('should parse valid integer env vars', () => {
    process.env.EXPIRY_DAYS_MONTHLY = '60';
    process.env.EXPIRY_DAYS_QUARTERLY = '180';
    process.env.EXPIRY_DAYS_YEARLY = '400';

    const config = loadExpiryConfig();
    expect(config.monthly).toBe(60);
    expect(config.quarterly).toBe(180);
    expect(config.yearly).toBe(400);
  });

  it('should return null for invalid env values', () => {
    process.env.EXPIRY_DAYS_MONTHLY = 'abc';
    process.env.EXPIRY_DAYS_QUARTERLY = '-5';
    process.env.EXPIRY_DAYS_YEARLY = '0';

    const config = loadExpiryConfig();
    expect(config.monthly).toBeNull();
    expect(config.quarterly).toBeNull();
    expect(config.yearly).toBeNull();
  });

  it('should return null for empty string env values', () => {
    process.env.EXPIRY_DAYS_MONTHLY = '';

    const config = loadExpiryConfig();
    expect(config.monthly).toBeNull();
  });

  it('should use default warning days when env var is unset', () => {
    const config = loadExpiryConfig();
    expect(config.warningDays).toEqual([7, 3, 1]);
  });

  it('should parse custom warning days', () => {
    process.env.EXPIRY_WARNING_DAYS = '14,7,3';

    const config = loadExpiryConfig();
    expect(config.warningDays).toEqual([14, 7, 3]);
  });

  it('should sort warning days descending', () => {
    process.env.EXPIRY_WARNING_DAYS = '1,7,3';

    const config = loadExpiryConfig();
    expect(config.warningDays).toEqual([7, 3, 1]);
  });

  it('should fall back to defaults for empty warning days', () => {
    process.env.EXPIRY_WARNING_DAYS = '';

    const config = loadExpiryConfig();
    expect(config.warningDays).toEqual([7, 3, 1]);
  });

  it('should filter out invalid warning day values', () => {
    process.env.EXPIRY_WARNING_DAYS = '7,abc,-1,3';

    const config = loadExpiryConfig();
    expect(config.warningDays).toEqual([7, 3]);
  });
});

describe('getThresholdForCycle', () => {
  const config: ExpiryConfig = {
    monthly: 60,
    quarterly: 180,
    yearly: 400,
    warningDays: [7, 3, 1],
  };

  it('should return monthly threshold', () => {
    expect(getThresholdForCycle(config, 'monthly')).toBe(60);
  });

  it('should return quarterly threshold', () => {
    expect(getThresholdForCycle(config, 'quarterly')).toBe(180);
  });

  it('should return yearly threshold', () => {
    expect(getThresholdForCycle(config, 'yearly')).toBe(400);
  });

  it('should return null for lifetime', () => {
    expect(getThresholdForCycle(config, 'lifetime')).toBeNull();
  });

  it('should return null for unrecognized cycles', () => {
    expect(getThresholdForCycle(config, 'weekly')).toBeNull();
    expect(getThresholdForCycle(config, '')).toBeNull();
  });

  it('should return null when a cycle is not configured', () => {
    const partialConfig: ExpiryConfig = {
      monthly: 60,
      quarterly: null,
      yearly: null,
      warningDays: [7, 3, 1],
    };
    expect(getThresholdForCycle(partialConfig, 'quarterly')).toBeNull();
    expect(getThresholdForCycle(partialConfig, 'yearly')).toBeNull();
  });
});
