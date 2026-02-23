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

export class SyncroSDK extends EventEmitter {
    private client: AxiosInstance;
    private apiKey: string;

    constructor(config: { apiKey: string; baseUrl?: string }) {
        super();
        this.apiKey = config.apiKey;
        this.client = axios.create({
            baseURL: config.baseUrl || "http://localhost:3001/api",
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
            },
        });
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

            this.emit("success", result);
            return result;
        } catch (error: any) {
            const errorMessage = error.response?.data?.error || error.message;

            const failedResult: any = {
                success: false,
                status: "failed",
                error: errorMessage,
            };

            this.emit("failure", { subscriptionId, error: errorMessage });
            throw new Error(`Cancellation failed: ${errorMessage}`);
        }
    }

    /**
     * Get subscription details
     */
    async getSubscription(subscriptionId: string): Promise<Subscription> {
        const response = await this.client.get(
            `/subscriptions/${subscriptionId}`,
        );
        return response.data.data;
    }
}

export default SyncroSDK;
