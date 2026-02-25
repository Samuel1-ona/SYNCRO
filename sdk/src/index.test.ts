import axios from "axios";
import { init, SyncroSDK } from "./index";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("SyncroSDK", () => {
  let sdk: SyncroSDK;
  const apiKey = "test-api-key";

  beforeEach(() => {
    mockedAxios.create.mockReturnValue(mockedAxios as any);
    sdk = new SyncroSDK({ apiKey });
    jest.clearAllMocks();
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

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

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

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `/subscriptions/${subId}/cancel`,
      );
    });

    it("should handle cancellation error and emit failure event", async () => {
      const subId = "sub-456";
      const errorMessage = "Subscription not found";

      mockedAxios.post.mockRejectedValueOnce({
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
});

describe("SDK initialization", () => {
  beforeEach(() => {
    mockedAxios.create.mockReturnValue(mockedAxios as any);
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
