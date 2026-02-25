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
    apiKey?: string;
    baseUrl?: string;
    wallet?: StellarWallet;
    keypair?: StellarKeypair;
}

export interface SyncroSDKInitConfig {
    wallet?: StellarWallet;
    keypair?: StellarKeypair;
    backendApiBaseUrl: string;
    apiKey?: string;
}

export class SyncroSDK extends EventEmitter {
    private client: AxiosInstance;
    private apiKey?: string;
    private wallet?: StellarWallet;
    private keypair?: StellarKeypair;

    constructor(config: SyncroSDKConfig) {
        super();
        this.apiKey = config.apiKey;
        this.wallet = config.wallet;
        this.keypair = config.keypair;

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };

        if (this.apiKey) {
            headers.Authorization = `Bearer ${this.apiKey}`;
        }

        this.client = axios.create({
            baseURL: config.baseUrl || "http://localhost:3001/api",
            headers,
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
            this.emit("error", new Error(errorMessage));
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

    if (
        typeof config.backendApiBaseUrl !== "string" ||
        config.backendApiBaseUrl.trim().length === 0
    ) {
        errors.push("backendApiBaseUrl is required and must be a non-empty string.");
    } else {
        try {
            new URL(config.backendApiBaseUrl);
        } catch {
            errors.push("backendApiBaseUrl must be a valid URL.");
        }
    }

    if (!config.wallet && !config.keypair) {
        errors.push("Provide either a wallet object or a keypair.");
    }

    if (config.wallet && !isObject(config.wallet)) {
        errors.push("wallet must be an object.");
    }

    if (config.keypair) {
        if (!isObject(config.keypair)) {
            errors.push("keypair must be an object.");
        } else if (!hasFunctionOrStringPublicKey(config.keypair.publicKey)) {
            errors.push(
                "keypair.publicKey must be a string or a function returning a string.",
            );
        }
    }

    if (errors.length > 0) {
        throw new Error(`Invalid SDK initialization config: ${errors.join(" ")}`);
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

export function init(config: SyncroSDKInitConfig): SyncroSDK {
    validateInitConfig(config);

    const sdk = new SyncroSDK({
        apiKey: config.apiKey,
        baseUrl: config.backendApiBaseUrl,
        wallet: config.wallet,
        keypair: config.keypair,
    });

    const readyPayload = {
        backendApiBaseUrl: config.backendApiBaseUrl,
        publicKey: getSignerPublicKey(config.wallet, config.keypair),
    };

    queueMicrotask(() => {
        sdk.emit("ready", readyPayload);
    });

    return sdk;
}

export default SyncroSDK;
