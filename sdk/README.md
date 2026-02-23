# Syncro Backend SDK

Subscription CRUD wrapper for the Syncro backend. Developers should use these SDK methods instead of calling raw API endpoints or Soroban contracts directly.

## Features

- **createSubscription()** – Create subscriptions with validation and backend + on-chain sync
- **updateSubscription()** – Update subscriptions with validation
- **getSubscription()** – Fetch a single subscription by ID
- **cancelSubscription()** – Soft cancel (set status to `cancelled`)
- **deleteSubscription()** – Permanently delete a subscription
- **attachGiftCard()** – Attach gift card info (manual and gift-card subscriptions)

Validation, lifecycle events, and sync (backend + on-chain) are handled automatically.

## Installation

```bash
npm install @syncro/sdk
```

## Usage

```typescript
import { createSyncroSDK } from "@syncro/sdk";

const sdk = createSyncroSDK({
    baseUrl: "https://api.syncro.example.com",
    getAuth: async () => localStorage.getItem("token") ?? null,
    credentials: "include", // or omit for Bearer-only
});

// Lifecycle events
sdk.on("subscription", (event) => {
    console.log(event.type, event.subscriptionId, event.data);
});
sdk.on("giftCard", (event) => {
    console.log(event.type, event.subscriptionId);
});

// Create
const result = await sdk.createSubscription({
    name: "Netflix",
    price: 15.99,
    billing_cycle: "monthly",
    source: "manual", // or 'gift_card'
});

// Get
const sub = await sdk.getSubscription(subscriptionId);

// Update
await sdk.updateSubscription(subscriptionId, { price: 19.99 });

// Cancel (soft)
await sdk.cancelSubscription(subscriptionId);

// Delete (hard)
await sdk.deleteSubscription(subscriptionId);

// Attach gift card
await sdk.attachGiftCard(subscriptionId, giftCardHash, provider);
```

## API Reference

### Options

- `baseUrl` – Backend API base URL
- `getAuth?` – Optional async function returning Bearer token
- `credentials?` – `'include'` | `'omit'` | `'same-origin'` (default: `'include'`)

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
