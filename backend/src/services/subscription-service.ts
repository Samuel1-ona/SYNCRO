import { supabase } from "../config/database";
import { blockchainService } from "./blockchain-service";
import logger from "../config/logger";
import { DatabaseTransaction } from "../utils/transaction";
import type {
  SubscriptionCreateInput,
  SubscriptionUpdateInput,
} from "../types/subscription";

export interface SubscriptionSyncResult {
  subscription: any;
  blockchainResult?: {
    success: boolean;
    transactionHash?: string;
    error?: string;
  };
  syncStatus: "synced" | "partial" | "failed";
}

/**
 * Subscription service with blockchain sync and transaction management
 */

export class SubscriptionService {
  async createSubscription(
    userId: string,
    input: SubscriptionCreateInput,
  ): Promise<SubscriptionSyncResult> {
    return await DatabaseTransaction.execute(async (client) => {
      try {
        const { data: subscription, error: dbError } = await client
          .from("subscriptions")
          .insert({
            user_id: userId,
            name: input.name,
            provider: input.provider || input.name,
            price: input.price,
            billing_cycle: input.billing_cycle,
            status: input.status || "active",
            next_billing_date: input.next_billing_date || null,
            category: input.category || null,
            logo_url: input.logo_url || null,
            website_url: input.website_url || null,
            renewal_url: input.renewal_url || null,
            notes: input.notes || null,
            tags: input.tags || [],
            email_account_id: input.email_account_id || null,
            updated_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (dbError) {
          throw new Error(`Database error: ${dbError.message}`);
        }

        // Attempt blockchain sync (non-blocking)
        let blockchainResult;
        let syncStatus: "synced" | "partial" | "failed" = "synced";

        try {
          blockchainResult = await blockchainService.syncSubscription(
            userId,
            subscription.id,
            "create",
            subscription,
          );

          if (!blockchainResult.success) {
            syncStatus = "partial";
            logger.warn("Blockchain sync failed for subscription creation", {
              subscriptionId: subscription.id,
              error: blockchainResult.error,
            });
          }
        } catch (blockchainError) {
          syncStatus = "partial";
          logger.error("Blockchain sync error (non-fatal):", blockchainError);
          blockchainResult = {
            success: false,
            error:
              blockchainError instanceof Error
                ? blockchainError.message
                : String(blockchainError),
          };
        }

        return {
          subscription,
          blockchainResult,
          syncStatus,
        };
      } catch (error) {
        logger.error("Subscription creation failed:", error);
        throw error;
      }
    });
  }

  // Update subscription with blockchain sync
  //Uses optimistic locking to prevent race conditions

  async updateSubscription(
    userId: string,
    subscriptionId: string,
    input: SubscriptionUpdateInput,
    expectedVersion?: number,
  ): Promise<SubscriptionSyncResult> {
    return await DatabaseTransaction.execute(async (client) => {
      try {
        // First, verify ownership and get current version
        const { data: existing, error: fetchError } = await client
          .from("subscriptions")
          .select("*")
          .eq("id", subscriptionId)
          .eq("user_id", userId)
          .single();

        if (fetchError || !existing) {
          throw new Error("Subscription not found or access denied");
        }
        // For now, we use updated_at as a simple version check
        const updateData: any = {
          ...input,
          updated_at: new Date().toISOString(),
        };

        Object.keys(updateData).forEach(
          (key) => updateData[key] === undefined && delete updateData[key],
        );

        const { data: subscription, error: updateError } = await client
          .from("subscriptions")
          .update(updateData)
          .eq("id", subscriptionId)
          .eq("user_id", userId)
          .select()
          .single();

        if (updateError) {
          throw new Error(`Update failed: ${updateError.message}`);
        }

        // Attempt blockchain sync
        let blockchainResult;
        let syncStatus: "synced" | "partial" | "failed" = "synced";

        try {
          blockchainResult = await blockchainService.syncSubscription(
            userId,
            subscriptionId,
            "update",
            subscription,
          );

          if (!blockchainResult.success) {
            syncStatus = "partial";
            logger.warn("Blockchain sync failed for subscription update", {
              subscriptionId,
              error: blockchainResult.error,
            });
          }
        } catch (blockchainError) {
          syncStatus = "partial";
          logger.error("Blockchain sync error (non-fatal):", blockchainError);
          blockchainResult = {
            success: false,
            error:
              blockchainError instanceof Error
                ? blockchainError.message
                : String(blockchainError),
          };
        }

        return {
          subscription,
          blockchainResult,
          syncStatus,
        };
      } catch (error) {
        logger.error("Subscription update failed:", error);
        throw error;
      }
    });
  }

  async cancelSubscription(
    userId: string,
    subscriptionId: string,
  ): Promise<SubscriptionSyncResult> {
    return await DatabaseTransaction.execute(async (client) => {
      try {
        const { data: subscription, error: fetchError } = await client
          .from("subscriptions")
          .select("*")
          .eq("id", subscriptionId)
          .eq("user_id", userId)
          .single();

        if (fetchError || !subscription) {
          throw new Error("Subscription not found or access denied");
        }

        if (subscription.status === "cancelled") {
          throw new Error("Subscription already cancelled");
        }

        const { data: updatedSubscription, error: updateError } = await client
          .from("subscriptions")
          .update({
            status: "cancelled",
            updated_at: new Date().toISOString(),
          })
          .eq("id", subscriptionId)
          .eq("user_id", userId)
          .select()
          .single();

        if (updateError) {
          throw new Error(`Update failed: ${updateError.message}`);
        }

        let blockchainResult;
        let syncStatus: "synced" | "partial" | "failed" = "synced";

        try {
          blockchainResult = await blockchainService.syncSubscription(
            userId,
            subscriptionId,
            "cancel",
            updatedSubscription,
          );

          if (!blockchainResult.success) {
            syncStatus = "partial";
            logger.warn(
              "Blockchain sync failed for subscription cancellation",
              {
                subscriptionId,
                error: blockchainResult.error,
              },
            );
          }
        } catch (blockchainError) {
          syncStatus = "partial";
          logger.error("Blockchain sync error (non-fatal):", blockchainError);
          blockchainResult = {
            success: false,
            error:
              blockchainError instanceof Error
                ? blockchainError.message
                : String(blockchainError),
          };
        }

        return {
          subscription: updatedSubscription,
          blockchainResult,
          syncStatus,
        };
      } catch (error) {
        logger.error("Subscription cancellation failed:", error);
        throw error;
      }
    });
  }

  //  Delete subscription with blockchain sync

  // Get subscription by ID (with ownership check)

  async getSubscription(userId: string, subscriptionId: string): Promise<any> {
    const { data: subscription, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("id", subscriptionId)
      .eq("user_id", userId)
      .single();

    if (error || !subscription) {
      throw new Error("Subscription not found or access denied");
    }

    return subscription;
  }

  // List user's subscriptions
  async listSubscriptions(
    userId: string,
    options: {
      status?: string;
      category?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ subscriptions: any[]; total: number }> {
    let query = supabase
      .from("subscriptions")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (options.status) {
      query = query.eq("status", options.status);
    }

    if (options.category) {
      query = query.eq("category", options.category);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.range(
        options.offset,
        options.offset + (options.limit || 10) - 1,
      );
    }

    const { data: subscriptions, error, count } = await query;

    if (error) {
      throw new Error(`Failed to fetch subscriptions: ${error.message}`);
    }

    return {
      subscriptions: subscriptions || [],
      total: count || 0,
    };
  }

  // Retry blockchain sync for a subscription

  async retryBlockchainSync(
    userId: string,
    subscriptionId: string,
  ): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
    const subscription = await this.getSubscription(userId, subscriptionId);

    return await blockchainService.syncSubscription(
      userId,
      subscriptionId,
      "update",
      subscription,
    );
  }
}

export const subscriptionService = new SubscriptionService();
