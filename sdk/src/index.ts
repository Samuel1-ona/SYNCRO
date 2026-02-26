import axios, { AxiosInstance } from "axios";
import { EventEmitter } from "events";

export interface Subscription {
    id: string;
    name: string;
    price: number;
    billing_cycle: string;
    status: string;
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

export interface RetryConfig {
    retries?: number;
    retryDelay?: (retryCount: number) => number;
    retryCondition?: (error: any) => boolean;
}

export class SyncroSDK extends EventEmitter {
    public client: AxiosInstance;
    private apiKey: string;
    private retryConfig: Required<RetryConfig>;

    constructor(config: {
        apiKey: string;
        baseUrl?: string;
        retryConfig?: RetryConfig;
    }) {
        super();
        this.apiKey = config.apiKey;
        this.retryConfig = {
            retries: config.retryConfig?.retries ?? 3,
            retryDelay:
                config.retryConfig?.retryDelay ??
                ((retryCount: number) => Math.pow(2, retryCount) * 1000),
            retryCondition:
                config.retryConfig?.retryCondition ??
                ((error: any) => {
                    const status = error.response?.status;
                    return (
                        !error.response ||
                        status === 429 ||
                        (status >= 500 && status <= 599)
                    );
                }),
        };

        this.client = axios.create({
            baseURL: config.baseUrl || "http://localhost:3001/api",
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
            },
        });

        this.setupInterceptors(this.client);
    }

    private setupInterceptors(client: AxiosInstance) {
        client.interceptors.response.use(
            (response) => response,
            async (error) => {
                const { config } = error;

                if (
                    !config ||
                    !this.retryConfig.retries ||
                    (config.__retryCount || 0) >= this.retryConfig.retries ||
                    !this.retryConfig.retryCondition(error)
                ) {
                    return Promise.reject(error);
                }

                config.__retryCount = (config.__retryCount || 0) + 1;

                const delay = this.retryConfig.retryDelay(config.__retryCount);
                await new Promise((resolve) => setTimeout(resolve, delay));

                // IMPORTANT: Must call client(config) to trigger interceptors again
                return client.request(config);
            },
        );
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
            this.emit("cancelling", { subscriptionId });

            const response = await this.client.request({
                method: "POST",
                url: `/subscriptions/${subscriptionId}/cancel`,
            });
            const { data, blockchain } = response?.data || {};

            const result: CancellationResult = {
                success: true,
                status: "cancelled",
                subscription: data,
                redirectUrl: data.cancellation_url || data.renewal_url,
                blockchain: blockchain,
            };

            this.emit("success", result);
            return result;
        } catch (error: any) {
            const errorMessage =
                error.response?.data?.error || error.message || "Unknown error";

            this.emit("failure", { subscriptionId, error: errorMessage });
            throw new Error(`Cancellation failed: ${errorMessage}`);
        }
    }

    /**
     * Get subscription details
     */
    async getSubscription(subscriptionId: string): Promise<Subscription> {
        const response = await this.client.request({
            method: "GET",
            url: `/subscriptions/${subscriptionId}`,
        });
        return response?.data?.data;
    }
}

export default SyncroSDK;
