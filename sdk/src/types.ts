/**
 * Retry configuration for SDK requests
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds for exponential backoff (default: 30000) */
  maxDelayMs?: number;
  /** HTTP status codes to retry on (default: [408, 429, 500, 502, 503, 504]) */
  retryableStatusCodes?: number[];
}

/**
 * Stellar wallet for blockchain operations
 */
export interface StellarWallet {
  publicKey?: string | (() => string);
  signTransaction?: (...args: any[]) => any;
  sign?: (...args: any[]) => any;
  [key: string]: any;
}

/**
 * Stellar keypair for blockchain operations
 */
export interface StellarKeypair {
  publicKey: string | (() => string);
  secret?: () => string;
  sign?: (...args: any[]) => any;
  [key: string]: any;
}

/**
 * Strictly typed Syncro SDK configuration
 */
export interface SyncroSDKConfig {
  /** API key for authentication (required) */
  apiKey: string;
  /** Base URL for the Syncro backend API (default: "http://localhost:3001/api") */
  baseURL?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Retry configuration for failed requests (default: enabled with sensible defaults) */
  retryOptions?: RetryOptions;
  /** Maximum concurrent batch operations (default: 5) */
  batchConcurrency?: number;
  /** Enable SDK logging to console (default: false) */
  enableLogging?: boolean;
  /** Stellar wallet for blockchain operations */
  wallet?: StellarWallet;
  /** Stellar keypair for blockchain operations */
  keypair?: StellarKeypair;
}

/**
 * Configuration for SDK initialization (extends SyncroSDKConfig for backwards compatibility)
 */
export interface SyncroSDKInitConfig {
  /** API key for authentication (required) */
  apiKey: string;
  /** Base URL for the Syncro backend API */
  baseURL?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Retry configuration for failed requests */
  retryOptions?: RetryOptions;
  /** Maximum concurrent batch operations */
  batchConcurrency?: number;
  /** Enable SDK logging to console */
  enableLogging?: boolean;
  /** Stellar wallet for blockchain operations */
  wallet?: StellarWallet;
  /** Stellar keypair for blockchain operations */
  keypair?: StellarKeypair;
  /** Backend API base URL (optional, can use baseURL instead for backwards compatibility) */
  backendApiBaseUrl?: string;
}

export type GiftCardEventType = 'attached' | 'failed';

export interface GiftCardEvent {
  type: GiftCardEventType;
  subscriptionId: string;
  giftCardHash?: string;
  provider?: string;
  data?: Record<string, unknown>;
  error?: string;
}
