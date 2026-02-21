import axios from "axios";
import { SyncroSDK } from "./index";

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
