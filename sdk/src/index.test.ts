import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mAxios = {
  get: jest.fn(),
  post: jest.fn(),
  delete: jest.fn(),
  patch: jest.fn(),
  create: jest.fn().mockReturnThis(),
};

// We must mock axios BEFORE importing the SDK
jest.unstable_mockModule("axios", () => ({
  default: mAxios,
  ...mAxios,
}));

// Dynamic imports are required when using unstable_mockModule
const { SyncroSDK, init } = await import("./index.js");
const axios = (await import("axios")).default as any;

describe("SyncroSDK", () => {
  let sdk: InstanceType<typeof SyncroSDK>;
  const apiKey = "test-api-key";

  beforeEach(() => {
    jest.clearAllMocks();
    sdk = new SyncroSDK({ apiKey });
    // Add a dummy error listener to prevent unhandled error throws from EventEmitter
    sdk.on("error", () => {});
  });

  describe("cancelSubscription", () => {
    it("should successfully cancel a subscription and emit events", async () => {
      const subId = "sub-123";
      const mockResponse = {
        data: {
          success: true,
          data: {
            id: subId,
            name: "Netflix",
            status: "cancelled",
            renewal_url: "https://netflix.com/account",
          },
          blockchain: {
            synced: true,
            transactionHash: "0x123",
          },
        },
      };

      axios.post.mockResolvedValueOnce(mockResponse);

      const successSpy = jest.fn();
      const cancellingSpy = jest.fn();
      sdk.on("success", successSpy);
      sdk.on("cancelling", cancellingSpy);

      const result = await sdk.cancelSubscription(subId);

      expect(result.success).toBe(true);
      expect(result.status).toBe("cancelled");
      expect(result.redirectUrl).toBe("https://netflix.com/account");
      expect(result.blockchain?.synced).toBe(true);

      expect(cancellingSpy).toHaveBeenCalledWith({ subscriptionId: subId });
      expect(successSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          status: "cancelled",
        }),
      );

      expect(axios.post).toHaveBeenCalledWith(`/subscriptions/${subId}/cancel`);
    });

    it("should handle cancellation error and emit failure event", async () => {
      const subId = "sub-456";
      const errorMessage = "Subscription not found";

      axios.post.mockRejectedValueOnce({
        response: {
          data: { error: errorMessage },
        },
      });

      const failureSpy = jest.fn();
      sdk.on("failure", failureSpy);

      await expect(sdk.cancelSubscription(subId)).rejects.toThrow(
        `Cancellation failed: ${errorMessage}`,
      );

      expect(failureSpy).toHaveBeenCalledWith({
        subscriptionId: subId,
        error: errorMessage,
      });
    });
  });

  describe("getUserSubscriptions", () => {
    it("should fetch, merge, and normalize subscriptions from multiple pages", async () => {
      const mockPage1 = {
        data: {
          data: [
            {
              id: "1",
              name: "Netflix",
              status: "active",
              next_billing_date: "2024-03-01",
            },
          ],
          pagination: { total: 2, limit: 1, offset: 0 },
        },
      };
      const mockPage2 = {
        data: {
          data: [
            {
              id: "2",
              name: "Spotify",
              status: "paused",
              next_billing_date: "2024-03-15",
            },
          ],
          pagination: { total: 2, limit: 1, offset: 1 },
        },
      };

      axios.get
        .mockResolvedValueOnce(mockPage1)
        .mockResolvedValueOnce(mockPage2);

      const subs = await sdk.getUserSubscriptions();

      expect(subs).toHaveLength(2);
      expect(subs[0]?.name).toBe("Netflix");
      expect(subs[0]?.state).toBe("active"); // Normalized
      expect(subs[0]?.nextRenewal).toBe("2024-03-01"); // Normalized
      expect(subs[1]?.name).toBe("Spotify");
      expect(subs[1]?.state).toBe("paused"); // Normalized

      expect(axios.get).toHaveBeenCalledTimes(2);
    });

    it("should return cached data when network fails", async () => {
      const cachedData = [
        {
          id: "1",
          name: "Netflix",
          state: "active",
          nextRenewal: "2024-03-01",
        },
      ];

      const localStorageMock = (() => {
        let store: any = {};
        return {
          getItem: (key: string) => store[key] || null,
          setItem: (key: string, value: string) => {
            store[key] = value.toString();
          },
          clear: () => {
            store = {};
          },
        };
      })();
      Object.defineProperty(global, "window", {
        value: { localStorage: localStorageMock },
        writable: true,
        configurable: true,
      });
      Object.defineProperty(global, "localStorage", {
        value: localStorageMock,
        writable: true,
        configurable: true,
      });

      localStorage.setItem(
        `syncro_subs_${apiKey}`,
        JSON.stringify({ data: cachedData }),
      );

      axios.get.mockRejectedValueOnce(new Error("Network Error"));

      const subs = await sdk.getUserSubscriptions();
      expect(subs).toEqual(cachedData);
    });
  });
});

describe("SDK initialization", () => {
  beforeEach(() => {
    axios.create.mockReturnValue(axios as any);
    jest.clearAllMocks();
  });

  it("init(config) should return an SDK instance", () => {
    const sdk = init({
      wallet: { publicKey: "GTESTPUBLICKEY" },
      backendApiBaseUrl: "https://api.syncro.example.com",
    });

    expect(sdk).toBeInstanceOf(SyncroSDK);
  });

  it("should emit ready event after successful init", async () => {
    const sdk = init({
      keypair: { publicKey: () => "GKEYPAIRPUBLICKEY" },
      backendApiBaseUrl: "https://api.syncro.example.com",
    });

    const readySpy = jest.fn();
    sdk.on("ready", readySpy);

    await Promise.resolve();

    expect(readySpy).toHaveBeenCalledWith({
      backendApiBaseUrl: "https://api.syncro.example.com",
      publicKey: "GKEYPAIRPUBLICKEY",
    });
  });

  it("should throw descriptive errors for invalid configuration", () => {
    expect(() =>
      init({
        backendApiBaseUrl: "not-a-url",
      } as any),
    ).toThrow(
      "Invalid SDK initialization config: backendApiBaseUrl must be a valid URL. Provide either a wallet object or a keypair.",
    );
  });
});
