import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { SyncroSDK } from "./index";

describe("SyncroSDK", () => {
  const apiKey = "test-api-key";

  // Use a single mock adapter instance for the global axios, or the instance.
  // SyncroSDK creates a new instance, so we mock *that* instance after it's created.

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe("cancelSubscription", () => {
    it("should successfully cancel a subscription", async () => {
      const sdk = new SyncroSDK({ apiKey });
      const mock = new MockAdapter(sdk.client);

      const subId = "sub-123";
      const mockResponse = {
        data: {
          success: true,
          data: {
            id: subId,
            name: "Netflix",
            status: "cancelled",
          },
        },
      };

      mock.onPost(`/subscriptions/${subId}/cancel`).reply(200, mockResponse);

      const result = await sdk.cancelSubscription(subId);

      expect(result.success).toBe(true);
      expect(result.status).toBe("cancelled");
      expect(mock.history.post.length).toBe(1);
    });

    it("should retry on 500 error and eventually succeed", async () => {
      const sdk = new SyncroSDK({
        apiKey,
        retryConfig: {
          retries: 2,
          retryDelay: () => 1,
        },
      });
      const mock = new MockAdapter(sdk.client);

      const subId = "sub-retry";
      const mockSuccess = {
        data: {
          success: true,
          data: { id: subId, name: "Netflix", status: "cancelled" },
        },
      };

      // First request fails with 500, second succeeds
      mock.onPost(`/subscriptions/${subId}/cancel`)
        .replyOnce(500, { error: "Internal Server Error" })
        .onPost(`/subscriptions/${subId}/cancel`)
        .replyOnce(200, mockSuccess);

      const result = await sdk.cancelSubscription(subId);

      expect(result.success).toBe(true);
      expect(mock.history.post.length).toBe(2);
    });

    it("should fail after max retries", async () => {
      const sdk = new SyncroSDK({
        apiKey,
        retryConfig: {
          retries: 1,
          retryDelay: () => 1,
        },
      });
      const mock = new MockAdapter(sdk.client);

      const subId = "sub-fail";

      mock.onPost(`/subscriptions/${subId}/cancel`).reply(500, { error: "Fatal Error" });

      await expect(sdk.cancelSubscription(subId)).rejects.toThrow("Cancellation failed: Fatal Error");
      expect(mock.history.post.length).toBe(2); // Initial + 1 retry
    });
  });
});
