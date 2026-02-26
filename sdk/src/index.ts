import axios, { type AxiosInstance } from "axios";
import { EventEmitter } from "node:events";
import type {
  GiftCardEvent,
  GiftCardEventType,
  SyncroSDKConfig,
  SyncroSDKInitConfig,
  StellarWallet,
  StellarKeypair,
  RetryOptions,
} from "./types.js";

export interface Subscription {
  id: string;
  name: string;
  price: number;
  billing_cycle: string;
  status: string;
  state: string; // Normalized
  nextRenewal?: string; // Normalized
  paymentMethod?: string; // Normalized
  renewal_url?: string;
  cancellation_url?: string;
  [key: string]: any;
}

export interface CancellationResult {
  success: boolean;
  status: "cancelled" | "failed" | "partial";
  subscription: Subscription;
  redirectUrl?: string;
  blockchain?: {
    synced: boolean;
    transactionHash?: string;
    error?: string;
  };
}

<<<<<<< fix/issue-99
export interface StellarWallet {
  publicKey?: string | (() => string);
  signTransaction?: (...args: any[]) => any;
  sign?: (...args: any[]) => any;
  [key: string]: any;
}

export interface StellarKeypair {
  publicKey: string | (() => string);
  secret?: () => string;
  sign?: (...args: any[]) => any;
  [key: string]: any;
}

export interface SyncroSDKConfig {
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  wallet?: StellarWallet | undefined;
  keypair?: StellarKeypair | undefined;
}

export interface SyncroSDKInitConfig {
  wallet?: StellarWallet | undefined;
  keypair?: StellarKeypair | undefined;
  backendApiBaseUrl: string;
  apiKey?: string | undefined;
}

export interface RetryConfig {
    retries?: number;
    retryDelay?: (retryCount: number) => number;
    retryCondition?: (error: any) => boolean;
}

=======
>>>>>>> main
export class SyncroSDK extends EventEmitter {
  private client: AxiosInstance;
  private apiKey: string;
  private baseURL: string;
  private timeout: number;
  private retryOptions: Required<RetryOptions>;
  private batchConcurrency: number;
  private enableLogging: boolean;
  private wallet: StellarWallet | null;
  private keypair: StellarKeypair | null;

  constructor(config: SyncroSDKConfig) {
    super();

    // Validate required config
    this.validateConfig(config);

    // Set api key (required)
    this.apiKey = config.apiKey;

    // Set base URL with default
    this.baseURL = config.baseURL || "http://localhost:3001/api";

    // Set timeout with default (30 seconds)
    this.timeout = config.timeout ?? 30000;

    // Set retry options with defaults
    this.retryOptions = {
      maxRetries: config.retryOptions?.maxRetries ?? 3,
      initialDelayMs: config.retryOptions?.initialDelayMs ?? 1000,
      maxDelayMs: config.retryOptions?.maxDelayMs ?? 30000,
      retryableStatusCodes:
        config.retryOptions?.retryableStatusCodes ?? [408, 429, 500, 502, 503, 504],
    };

    // Set batch concurrency with default (5)
    this.batchConcurrency = config.batchConcurrency ?? 5;

    // Set logging with default (false)
    this.enableLogging = config.enableLogging ?? false;

    // Set optional wallet and keypair
    this.wallet = config.wallet ?? null;
    this.keypair = config.keypair ?? null;

    // Log initialization
    if (this.enableLogging) {
      console.log("[SyncroSDK] Initializing with config:", {
        baseURL: this.baseURL,
        timeout: this.timeout,
        batchConcurrency: this.batchConcurrency,
        retryOptions: this.retryOptions,
      });
    }

    // Create axios client
    this.client = this.createAxiosClient();
  }

  /**
   * Validate SDK configuration
   */
  private validateConfig(config: SyncroSDKConfig): void {
    const errors: string[] = [];

    // Validate apiKey is provided and is a string
    if (!config.apiKey || typeof config.apiKey !== "string") {
      errors.push("apiKey is required and must be a non-empty string");
    }

    // Validate baseURL if provided
    if (config.baseURL !== undefined) {
      if (typeof config.baseURL !== "string") {
        errors.push("baseURL must be a string");
      } else {
        try {
          new URL(config.baseURL);
        } catch {
          errors.push("baseURL must be a valid URL");
        }
      }
    }

    // Validate timeout if provided
    if (config.timeout !== undefined) {
      if (typeof config.timeout !== "number" || config.timeout < 0) {
        errors.push("timeout must be a positive number");
      }
    }

    // Validate retryOptions if provided
    if (config.retryOptions) {
      if (typeof config.retryOptions !== "object" || config.retryOptions === null) {
        errors.push("retryOptions must be an object");
      } else {
        const { maxRetries, initialDelayMs, maxDelayMs, retryableStatusCodes } =
          config.retryOptions;

        if (maxRetries !== undefined && (typeof maxRetries !== "number" || maxRetries < 0)) {
          errors.push("retryOptions.maxRetries must be a non-negative number");
        }

        if (
          initialDelayMs !== undefined &&
          (typeof initialDelayMs !== "number" || initialDelayMs < 0)
        ) {
          errors.push("retryOptions.initialDelayMs must be a non-negative number");
        }

        if (maxDelayMs !== undefined && (typeof maxDelayMs !== "number" || maxDelayMs < 0)) {
          errors.push("retryOptions.maxDelayMs must be a non-negative number");
        }

        if (retryableStatusCodes !== undefined) {
          if (!Array.isArray(retryableStatusCodes)) {
            errors.push("retryOptions.retryableStatusCodes must be an array");
          } else if (!retryableStatusCodes.every((code) => typeof code === "number")) {
            errors.push("retryOptions.retryableStatusCodes must contain only numbers");
          }
        }
      }
    }

    // Validate batchConcurrency if provided
    if (config.batchConcurrency !== undefined) {
      if (typeof config.batchConcurrency !== "number" || config.batchConcurrency < 1) {
        errors.push("batchConcurrency must be a positive number");
      }
    }

    // Validate enableLogging if provided
    if (config.enableLogging !== undefined && typeof config.enableLogging !== "boolean") {
      errors.push("enableLogging must be a boolean");
    }

    if (errors.length > 0) {
      throw new Error(`Invalid SDK configuration: ${errors.join("; ")}`);
    }
  }

  /**
   * Create axios client with configured options
   */
  private createAxiosClient(): AxiosInstance {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };

    const client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers,
    });

    // Add response interceptor for retry logic
    client.interceptors.response.use(
      (response: any) => response,
      async (error: any) => {
        const config = error.config;

        // Initialize retry count
        if (!config._retryCount) {
          config._retryCount = 0;
        }

        // Check if should retry
        const shouldRetry =
          config._retryCount < this.retryOptions.maxRetries &&
          error.response &&
          this.retryOptions.retryableStatusCodes.includes(error.response.status);

        if (shouldRetry) {
          config._retryCount++;

          // Calculate exponential backoff delay
          const delay = Math.min(
            this.retryOptions.initialDelayMs * Math.pow(2, config._retryCount - 1),
            this.retryOptions.maxDelayMs,
          );

          if (this.enableLogging) {
            console.log(
              `[SyncroSDK] Retrying request (attempt ${config._retryCount}/${this.retryOptions.maxRetries}) after ${delay}ms`,
            );
          }

          await new Promise((resolve) => setTimeout(resolve, delay));
          return client(config);
        }

        return Promise.reject(error);
      },
    );

    return client;
  }

  /**
   * Get batch concurrency limit
   */
  getBatchConcurrency(): number {
    return this.batchConcurrency;
  }

  /**
   * Log message if logging is enabled
   */
  protected log(...args: any[]): void {
    if (this.enableLogging) {
      console.log("[SyncroSDK]", ...args);
    }
  }


  /**
   * Cancel a subscription programmatically
   * @param subscriptionId The ID of the subscription to cancel
   * @returns Cancellation result including status and optional redirect link
   */
  async cancelSubscription(
    subscriptionId: string,
  ): Promise<CancellationResult> {
    try {
      this.log("Cancelling subscription:", subscriptionId);
      this.emit("cancelling", { subscriptionId });

      const response = await this.client.post(
        `/subscriptions/${subscriptionId}/cancel`,
      );
      const { data, blockchain } = response.data;

      const result: CancellationResult = {
        success: true,
        status: "cancelled",
        subscription: data,
        redirectUrl: data.cancellation_url || data.renewal_url,
        blockchain: blockchain,
      };

      this.log("Subscription cancelled successfully:", subscriptionId);
      this.emit("success", result);
      return result;
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message;
      this.log("Error cancelling subscription:", subscriptionId, errorMessage);

      const failedResult: any = {
        success: false,
        status: "failed",
        error: errorMessage,
      };

      this.emit("failure", { subscriptionId, error: errorMessage });
      this.emit("error", new Error(errorMessage));
      throw new Error(`Cancellation failed: ${errorMessage}`);
    }
  }

  /**
   * Get subcription details
   */
  async getSubscription(subscriptionId: string): Promise<Subscription> {
    this.log("Fetching subscription:", subscriptionId);
    const response = await this.client.get(`/subscriptions/${subscriptionId}`);
    return this.normalizeSubscription(response.data.data);
  }

  /**
   * Fetch all user subscriptions with normalization and offline support
   */
  async getUserSubscriptions(): Promise<Subscription[]> {
    if (!this.apiKey) {
      throw new Error("API Key is required to fetch subscriptions");
    }

    this.log("Fetching all user subscriptions");
    const cacheKey = `syncro_subs_${this.apiKey}`;

    try {
      let allSubscriptions: any[] = [];
      let offset = 0;
      const limit = 50;
      let hasMore = true;

      while (hasMore) {
        const response = await this.client.get("/subscriptions", {
          params: { limit, offset },
        });

        const { data, pagination } = response.data;
        allSubscriptions = [...allSubscriptions, ...data];

        if (
          pagination &&
          data.length > 0 &&
          allSubscriptions.length < pagination.total
        ) {
          offset += limit;
        } else {
          hasMore = false;
        }
      }

      const normalized = allSubscriptions.map((sub) =>
        this.normalizeSubscription(sub),
      );

      // Update cache
      this.updateCache(cacheKey, normalized);
      this.log(`Fetched ${normalized.length} subscriptions`);

      return normalized;
    } catch (error) {
      // Offline/Error support: Check cache
      const cached = this.getCache(cacheKey);
      if (cached) {
        this.log(
          "Network error, returning cached subscriptions.",
        );
        return cached;
      }
      throw error;
    }
  }

  private normalizeSubscription(sub: any): Subscription {
    return {
      ...sub,
      state: sub.status,
      nextRenewal: sub.next_billing_date,
      paymentMethod: sub.payment_method || "Credit Card", // Default if not present
    };
  }

  private updateCache(key: string, data: Subscription[]): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem(
          key,
          JSON.stringify({
            data,
            timestamp: Date.now(),
          }),
        );
        this.log("Cache updated for key:", key);
      }
    } catch (e) {
      // Silently fail if storage is full or unavailable
      this.log("Cache update failed:", e);
    }
  }

  private getCache(key: string): Subscription[] | null {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const cached = localStorage.getItem(key);
        if (cached) {
          this.log("Cache hit for key:", key);
          return JSON.parse(cached).data;
        }
      }
    } catch (e) {
      this.log("Cache read failed:", e);
      return null;
    }
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasFunctionOrStringPublicKey(
  value: unknown,
): value is string | (() => string) {
  return typeof value === "string" || typeof value === "function";
}

function validateInitConfig(config: SyncroSDKInitConfig): void {
  const errors: string[] = [];

  if (!isObject(config)) {
    throw new Error(
      "Invalid SDK initialization config: config must be an object.",
    );
  }

  // Validate apiKey is provided
  if (!config.apiKey || typeof config.apiKey !== "string") {
    errors.push("apiKey is required and must be a non-empty string");
  }

  // Handle both baseURL and backendApiBaseUrl for backwards compatibility
  const baseUrl = config.baseURL || config.backendApiBaseUrl;

  if (baseUrl) {
    if (typeof baseUrl !== "string" || baseUrl.trim().length === 0) {
      errors.push("baseURL must be a non-empty string");
    } else {
      try {
        new URL(baseUrl);
      } catch {
        errors.push("baseURL must be a valid URL");
      }
    }
  }

  if (!config.wallet && !config.keypair) {
    errors.push("Provide either a wallet object or a keypair");
  }

  if (config.wallet && !isObject(config.wallet)) {
    errors.push("wallet must be an object");
  }

  if (config.keypair) {
    if (!isObject(config.keypair)) {
      errors.push("keypair must be an object");
    } else if (!hasFunctionOrStringPublicKey(config.keypair.publicKey)) {
      errors.push(
        "keypair.publicKey must be a string or a function returning a string",
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid SDK initialization config: ${errors.join("; ")}`);
  }
}

function getSignerPublicKey(
  wallet?: StellarWallet,
  keypair?: StellarKeypair,
): string | undefined {
  if (wallet?.publicKey) {
    return typeof wallet.publicKey === "function"
      ? wallet.publicKey()
      : wallet.publicKey;
  }

  if (keypair?.publicKey) {
    return typeof keypair.publicKey === "function"
      ? keypair.publicKey()
      : keypair.publicKey;
  }

  return undefined;
}

/**
 * Create and initialize a Syncro SDK instance
 * @param config SDK configuration
 * @returns Initialized SyncroSDK instance
 * @throws Error if configuration is invalid
 * @example
 * ```typescript
 * const sdk = init({
 *   apiKey: "your-api-key",
 *   baseURL: "https://api.syncro.example.com",
 *   timeout: 30000,
 *   enableLogging: true,
 *   retryOptions: {
 *     maxRetries: 3,
 *     initialDelayMs: 1000,
 *   },
 *   wallet: yourWallet,
 * });
 * ```
 */
export function init(config: SyncroSDKInitConfig): SyncroSDK {
  validateInitConfig(config);

  // Use baseURL if provided, otherwise fall back to backendApiBaseUrl for backwards compatibility
  const finalConfig: SyncroSDKConfig = {
    apiKey: config.apiKey,
    ...(config.baseURL !== undefined && { baseURL: config.baseURL }),
    ...(config.baseURL === undefined && config.backendApiBaseUrl !== undefined && {
      baseURL: config.backendApiBaseUrl,
    }),
    ...(config.timeout !== undefined && { timeout: config.timeout }),
    ...(config.retryOptions !== undefined && { retryOptions: config.retryOptions }),
    ...(config.batchConcurrency !== undefined && {
      batchConcurrency: config.batchConcurrency,
    }),
    ...(config.enableLogging !== undefined && { enableLogging: config.enableLogging }),
    ...(config.wallet !== undefined && { wallet: config.wallet }),
    ...(config.keypair !== undefined && { keypair: config.keypair }),
  };

  const sdk = new SyncroSDK(finalConfig);

  const readyPayload = {
    baseURL: finalConfig.baseURL,
    publicKey: getSignerPublicKey(config.wallet, config.keypair),
  };

  queueMicrotask(() => {
    sdk.emit("ready", readyPayload);
  });

  return sdk;
}

export default SyncroSDK;
export type {
  GiftCardEvent,
  GiftCardEventType,
  SyncroSDKConfig,
  SyncroSDKInitConfig,
  RetryOptions,
  StellarWallet,
  StellarKeypair,
} from "./types.js";
