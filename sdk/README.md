# Syncro Backend SDK

Subscription CRUD wrapper for the Syncro backend. Developers should use these SDK methods instead of calling raw API endpoints or Soroban contracts directly.

## Features

- **createSubscription()** – Create subscriptions with validation and backend + on-chain sync
- **updateSubscription()** – Update subscriptions with validation
- **getSubscription()** – Fetch a single subscription by ID
- **cancelSubscription()** – Soft cancel (set status to `cancelled`)
- **deleteSubscription()** – Permanently delete a subscription
- **attachGiftCard()** – Attach gift card info (manual and gift-card subscriptions)
- **Strictly typed configuration** – Type-safe SDK initialization with sensible defaults
- **Automatic retry logic** – Configurable exponential backoff for resilience
- **Request timeout control** – Prevent hanging requests with timeout configuration
- **Batch concurrency control** – Limit concurrent operations for resource management
- **Optional logging** – Debug SDK operations with structured logging

Validation, lifecycle events, and sync (backend + on-chain) are handled automatically.

## Installation

```bash
npm install @syncro/sdk
```

## Quick Start

```typescript
import { init } from "@syncro/sdk";

const sdk = init({
  apiKey: "your-api-key",
  baseURL: "https://api.syncro.example.com",
  enableLogging: true,
  wallet: yourWallet,
});

// Use the SDK
const subscriptions = await sdk.getUserSubscriptions();
```

## Configuration

### SyncroSDKConfig Interface

The SDK uses a strictly typed configuration object. All configuration options are validated at initialization.

```typescript
interface SyncroSDKConfig {
  // Required
  apiKey: string;

  // Optional with defaults
  baseURL?: string;              // Default: "http://localhost:3001/api"
  timeout?: number;              // Default: 30000 (ms)
  retryOptions?: RetryOptions;   // Default: see below
  batchConcurrency?: number;     // Default: 5
  enableLogging?: boolean;       // Default: false

  // For blockchain operations
  wallet?: StellarWallet;
  keypair?: StellarKeypair;
}

interface RetryOptions {
  maxRetries?: number;                    // Default: 3
  initialDelayMs?: number;                // Default: 1000
  maxDelayMs?: number;                    // Default: 30000
  retryableStatusCodes?: number[];        // Default: [408, 429, 500, 502, 503, 504]
}
```

### Configuration Examples

#### Basic Configuration

```typescript
import { init } from "@syncro/sdk";

const sdk = init({
  apiKey: "sk_live_abc123xyz",
  wallet: yourWallet,
});

// Uses defaults:
// - baseURL: http://localhost:3001/api
// - timeout: 30000ms
// - retryOptions: { maxRetries: 3, ... }
// - batchConcurrency: 5
// - enableLogging: false
```

#### Custom Timeout and Retry Configuration

```typescript
const sdk = init({
  apiKey: "sk_live_abc123xyz",
  baseURL: "https://api.syncro.com",
  timeout: 60000, // 60 seconds
  retryOptions: {
    maxRetries: 5,
    initialDelayMs: 500,
    maxDelayMs: 60000,
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  },
  wallet: yourWallet,
});
```

#### Production Configuration with Logging

```typescript
const sdk = init({
  apiKey: process.env.SYNCRO_API_KEY,
  baseURL: process.env.SYNCRO_API_URL || "https://api.syncro.com",
  timeout: 45000,
  batchConcurrency: 10,
  enableLogging: process.env.NODE_ENV === "development",
  retryOptions: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
  },
  wallet: yourWallet,
  keypair: process.env.KEYPAIR ? parseKeypair(process.env.KEYPAIR) : undefined,
});
```

### Configuration Validation

The SDK validates configuration at initialization time and throws clear error messages if invalid:

```typescript
try {
  const sdk = init({
    apiKey: "", // Error! apiKey is required
    baseURL: "invalid-url", // Error! Invalid URL
    timeout: -1000, // Error! timeout must be positive
  });
} catch (error) {
  console.error(error.message);
  // "Invalid SDK configuration: apiKey is required and must be a non-empty string; baseURL must be a valid URL; timeout must be a positive number"
}
```

## Usage

### Lifecycle Events

```typescript
sdk.on("subscription", (event) => {
  console.log(event.type, event.subscriptionId, event.data);
});

sdk.on("giftCard", (event) => {
  console.log(event.type, event.subscriptionId);
});
```

### Create Subscription

```typescript
const result = await sdk.createSubscription({
  name: "Netflix",
  price: 15.99,
  billing_cycle: "monthly",
  source: "manual", // or 'gift_card'
});
```

### Get Subscription

```typescript
const sub = await sdk.getSubscription(subscriptionId);
```

### Update Subscription

```typescript
await sdk.updateSubscription(subscriptionId, { price: 19.99 });
```

### Cancel Subscription

```typescript
// Soft cancel (sets status to 'cancelled')
await sdk.cancelSubscription(subscriptionId);
```

### Delete Subscription

```typescript
// Hard delete
await sdk.deleteSubscription(subscriptionId);
```

### Attach Gift Card

```typescript
await sdk.attachGiftCard(subscriptionId, giftCardHash, provider);
```

## API Reference

### Methods

| Method                                           | Description                                                    |
| ------------------------------------------------ | -------------------------------------------------------------- |
| `createSubscription(input, options?)`            | Create subscription. Emits `subscription` with type `created`. |
| `getSubscription(id)`                            | Get subscription by ID                                         |
| `updateSubscription(id, input, options?)`        | Update subscription. Emits `subscription` with type `updated`. |
| `cancelSubscription(id)`                         | Soft cancel. Emits `subscription` with type `cancelled`.       |
| `deleteSubscription(id)`                         | Hard delete. Emits `subscription` with type `deleted`.         |
| `attachGiftCard(subscriptionId, hash, provider)` | Attach gift card. Emits `giftCard` events.                     |

### Events

- **subscription** – `{ type, subscriptionId, data?, error?, blockchain? }`  
  Types: `created`, `updated`, `cancelled`, `deleted`, `failed`
- **giftCard** – `{ type, subscriptionId, giftCardHash?, provider?, data?, error? }`  
  Types: `attached`, `failed`

### Validation

- `validateSubscriptionCreateInput(input)` – Returns `{ isValid, errors }`
- `validateSubscriptionUpdateInput(input)` – Returns `{ isValid, errors }`
- `validateGiftCardHash(hash)` – Returns boolean

## Defaults and Behavior

### Default Configuration Values

| Option             | Default Value                              | Description                           |
| ------------------ | ------------------------------------------ | ------------------------------------- |
| `baseURL`          | `http://localhost:3001/api`                | Backend API endpoint                  |
| `timeout`          | `30000` (30 seconds)                       | Request timeout                       |
| `batchConcurrency` | `5`                                        | Max concurrent operations             |
| `enableLogging`    | `false`                                    | Logging disabled by default           |
| **Retry Defaults** |                                            |                                       |
| `maxRetries`       | `3`                                        | Number of retry attempts              |
| `initialDelayMs`   | `1000` (1 second)                          | Initial delay between retries         |
| `maxDelayMs`       | `30000` (30 seconds)                       | Maximum delay between retries         |
| `statusCodes`      | `[408, 429, 500, 502, 503, 504]`          | HTTP codes triggering retries         |

### Retry Logic

The SDK implements automatic exponential backoff retry logic:

- Attempts up to `maxRetries` times
- Waits `initialDelayMs * (2 ^ attemptNumber)` milliseconds between retries
- Caps delay at `maxDelayMs`
- Only retries on specified HTTP status codes

Example: With defaults, retries would occur with delays of: 1s, 2s, 4s

### Logging

When `enableLogging` is enabled, the SDK logs:

```
[SyncroSDK] Initializing with config: { ... }
[SyncroSDK] Fetching subscription: sub_123
[SyncroSDK] Retrying request (attempt 1/3) after 1000ms
[SyncroSDK] Cache hit for key: syncro_subs_sk_live_abc123xyz
```

## Error Handling

```typescript
try {
  const sdk = init({
    apiKey: "invalid-key",
    wallet: null, // Error! wallet or keypair required
  });
} catch (error) {
  // SDK validates and throws:
  // "Invalid SDK configuration: apiKey is required..."
}

try {
  await sdk.getSubscription("invalid-id");
} catch (error) {
  // Network error, SDK automatically retries based on configuration
  // If all retries fail, final error is thrown
  console.error("Failed to fetch subscription:", error.message);
}
```

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import { init } from "@syncro/sdk";
import type {
  SyncroSDKConfig,
  RetryOptions,
  Subscription,
  CancellationResult,
} from "@syncro/sdk";

// All configuration options are type-safe
const config: SyncroSDKConfig = {
  apiKey: process.env.API_KEY!,
  baseURL: "https://api.syncro.com",
  timeout: 30000,
  enableLogging: true,
  retryOptions: {
    maxRetries: 3,
  },
};

const sdk = init(config);
```

