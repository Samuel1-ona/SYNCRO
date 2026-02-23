"use client";

import { useState, useCallback, useEffect } from "react";
import { apiGet } from "../lib/api";
import { useUndoManager } from "@/hooks/use-undo-manager";
import type { Subscription as DBSubscription } from "@/lib/supabase/subscriptions";
import {
  createSubscription,
  updateSubscription,
  deleteSubscription,
  bulkDeleteSubscriptions,
} from "@/lib/supabase/subscriptions";
import { retryWithBackoff, getErrorMessage } from "@/lib/network-utils";
import { validateSubscriptionData } from "@/lib/validation";
import { checkDuplicate } from "@/lib/subscription-utils";

interface UseSubscriptionsProps {
  initialSubscriptions: DBSubscription[];
  maxSubscriptions: number;
  emailAccounts: any[];
  onToast: (toast: any) => void;
  onUpgradePlan: () => void;
  onShowDialog?: (dialog: any) => void;
}

export function useSubscriptions({
  initialSubscriptions,
  maxSubscriptions,
  emailAccounts,
  onToast,
  onUpgradePlan,
  onShowDialog,
}: UseSubscriptionsProps) {
  const {
    currentState: subscriptions,
    addToHistory,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useUndoManager(initialSubscriptions);

  // On mount, attempt to fetch live subscriptions from backend API and replace initial state
  useEffect(() => {
    let mounted = true;
    const fetchSubscriptions = async () => {
      try {
        const data = await apiGet("/api/subscriptions");
        if (!mounted) return;

        const items = (data?.subscriptions || []).map((dbSub: any) => ({
          id: dbSub.id,
          name: dbSub.name,
          category: dbSub.category,
          price: dbSub.price,
          icon: dbSub.icon || "🔗",
          renewsIn: dbSub.renews_in || dbSub.renewsIn || 30,
          status: dbSub.status,
          color: dbSub.color || "#000000",
          renewalUrl: dbSub.renewal_url || dbSub.renewalUrl,
          tags: dbSub.tags || [],
          dateAdded: dbSub.date_added || dbSub.dateAdded,
          emailAccountId: dbSub.email_account_id || dbSub.emailAccountId,
          lastUsedAt: dbSub.last_used_at || dbSub.lastUsedAt,
          hasApiKey: dbSub.has_api_key || dbSub.hasApiKey || false,
          isTrial: dbSub.is_trial || dbSub.isTrial || false,
          trialEndsAt: dbSub.trial_ends_at || dbSub.trialEndsAt,
          priceAfterTrial: dbSub.price_after_trial || dbSub.priceAfterTrial,
          source: dbSub.source || "manual",
          manuallyEdited:
            dbSub.manually_edited || dbSub.manuallyEdited || false,
          editedFields: dbSub.edited_fields || dbSub.editedFields || [],
          pricingType: dbSub.pricing_type || dbSub.pricingType || "fixed",
          billingCycle: dbSub.billing_cycle || dbSub.billingCycle || "monthly",
          expiredAt: dbSub.expired_at || dbSub.expiredAt,
        }));

        if (items.length > 0) {
          // Replace current state with fetched items
          addToHistory(items);
        }
      } catch (error) {
        // ignore - keep initial subscriptions
        // console.debug("Failed to fetch subscriptions from API:", error)
      }
    };

    fetchSubscriptions();

    return () => {
      mounted = false;
    };
  }, [addToHistory]);

  const [loading, setLoading] = useState(false);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [selectedSubscriptions, setSelectedSubscriptions] = useState<
    Set<number>
  >(new Set());
  const [selectedSubscription, setSelectedSubscription] = useState<any>(null);

  const updateSubscriptions = useCallback(
    (newSubs: any[]) => {
      addToHistory(newSubs);
    },
    [addToHistory]
  );

  const handleAddSubscription = useCallback(
    async (newSub: any) => {
      const validation = validateSubscriptionData(newSub);
      if (!validation.isValid) {
        const firstError = Object.values(validation.errors)[0];
        onToast({
          title: "Validation error",
          description: firstError,
          variant: "error",
        });
        return;
      }

      if (checkDuplicate(subscriptions, newSub.name)) {
        onToast({
          title: "Duplicate subscription",
          description: `${newSub.name} already exists in your subscriptions`,
          variant: "error",
        });
        return;
      }

      if (subscriptions.length >= maxSubscriptions) {
        onUpgradePlan();
        return;
      }

      setLoading(true);

      try {
        const dbSubscription = await retryWithBackoff(async () => {
          return await createSubscription({
            name: newSub.name,
            category: newSub.category,
            price: newSub.price,
            icon: newSub.icon || "🔗",
            renews_in: newSub.renewsIn || 30,
            status: newSub.status || "active",
            color: newSub.color || "#000000",
            renewal_url: newSub.renewalUrl || null,
            tags: newSub.tags || [],
            date_added: new Date().toISOString(),
            email_account_id:
              emailAccounts.find((acc) => acc.isPrimary)?.id || 1,
            last_used_at: undefined,
            has_api_key: false,
            is_trial: (newSub as any).isTrial || false,
            trial_ends_at: (newSub as any).trialEndsAt || null,
            price_after_trial: (newSub as any).priceAfterTrial || null,
            source: "manual",
            manually_edited: false,
            edited_fields: [],
            pricing_type: "fixed",
            billing_cycle: "monthly",
          });
        });

        const formattedSub = {
          id: dbSubscription.id,
          name: dbSubscription.name,
          category: dbSubscription.category,
          price: dbSubscription.price,
          icon: dbSubscription.icon,
          renewsIn: dbSubscription.renews_in,
          status: dbSubscription.status,
          color: dbSubscription.color,
          renewalUrl: dbSubscription.renewal_url,
          tags: dbSubscription.tags,
          dateAdded: dbSubscription.date_added,
          emailAccountId: dbSubscription.email_account_id,
          lastUsedAt: dbSubscription.last_used_at,
          hasApiKey: dbSubscription.has_api_key,
          isTrial: dbSubscription.is_trial,
          trialEndsAt: dbSubscription.trial_ends_at,
          priceAfterTrial: dbSubscription.price_after_trial,
          source: dbSubscription.source,
          manuallyEdited: dbSubscription.manually_edited,
          editedFields: dbSubscription.edited_fields,
          pricingType: dbSubscription.pricing_type,
          billingCycle: dbSubscription.billing_cycle,
        };

        const updatedSubs = [...subscriptions, formattedSub];
        updateSubscriptions(updatedSubs);

        onToast({
          title: "Subscription added",
          description: `${newSub.name} has been added to your subscriptions`,
          variant: "success",
          action: {
            label: "Undo",
            onClick: async () => {
              try {
                await deleteSubscription(dbSubscription.id);
                undo();
                onToast({
                  title: "Undone",
                  description: "Subscription addition has been undone",
                  variant: "default",
                });
              } catch (error) {
                onToast({
                  title: "Error",
                  description: "Failed to undo subscription addition",
                  variant: "error",
                });
              }
            },
          },
        });
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        onToast({
          title: "Error",
          description: errorMessage,
          variant: "error",
          action: {
            label: "Retry",
            onClick: () => handleAddSubscription(newSub),
          },
        });
      } finally {
        setLoading(false);
      }
    },
    [
      subscriptions,
      maxSubscriptions,
      emailAccounts,
      updateSubscriptions,
      undo,
      onToast,
      onUpgradePlan,
    ]
  );

  const handleDeleteSubscription = useCallback(
    async (id: number) => {
      const sub = subscriptions.find((s) => s.id === id);
      if (!sub) return;

      try {
        await deleteSubscription(id);
        const updatedSubs = subscriptions.filter((s) => s.id !== id);
        updateSubscriptions(updatedSubs);

        onToast({
          title: "Subscription deleted",
          description: `${sub.name} has been removed`,
          variant: "success",
        });
      } catch (error) {
        onToast({
          title: "Error",
          description: "Failed to delete subscription",
          variant: "error",
        });
      }
    },
    [subscriptions, updateSubscriptions, onToast]
  );

  const handleEditSubscription = useCallback(
    async (id: number, updates: any) => {
      try {
        const dbUpdates = {
          name: updates.name,
          category: updates.category,
          price: updates.price,
          icon: updates.icon,
          renews_in: updates.renewsIn,
          status: updates.status,
          color: updates.color,
          renewal_url: updates.renewalUrl,
          tags: updates.tags,
          billing_cycle: updates.billingCycle,
          pricing_type: updates.pricingType,
          manually_edited: true,
        };

        await updateSubscription(id, dbUpdates);

        const updatedSubs = subscriptions.map((sub: any) => {
          if (sub.id !== id) return sub;

          const editedFields = Object.keys(updates).filter(
            (key: string) =>
              updates[key as keyof typeof updates] !== (sub as any)[key]
          );

          return {
            ...sub,
            ...updates,
            manually_edited: true,
            edited_fields: [
              ...new Set([
                ...(sub.edited_fields || sub.editedFields || []),
                ...editedFields,
              ]),
            ],
            source: sub.source === "auto_detected" ? "manual" : sub.source,
          };
        });

        updateSubscriptions(updatedSubs);
        addToHistory(updatedSubs);

        onToast({
          title: "Subscription updated",
          description: "Your changes have been saved",
          variant: "success",
        });
      } catch (error) {
        onToast({
          title: "Error",
          description: "Failed to update subscription",
          variant: "error",
        });
      }
    },
    [subscriptions, updateSubscriptions, addToHistory, onToast]
  );

  const handleCancelSubscription = useCallback(
    async (id: number) => {
      const sub = subscriptions.find((s) => s.id === id);
      if (!sub) return;

      const daysUntilRenewal = (sub as any).renewsIn || sub.renews_in || 0;
      const activeUntil = new Date(
        Date.now() + daysUntilRenewal * 24 * 60 * 60 * 1000
      );

      try {
        await updateSubscription(id, {
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          active_until: activeUntil.toISOString(),
        });

        const updatedSubs = subscriptions.map((s) =>
          s.id === id
            ? {
                ...s,
                status: "cancelled",
                cancelledAt: new Date().toISOString(),
                activeUntil: activeUntil.toISOString(),
              }
            : s
        );

        updateSubscriptions(updatedSubs);
        addToHistory(updatedSubs);

        onToast({
          title: "Subscription cancelled",
          description: "The subscription has been cancelled",
          variant: "success",
        });
      } catch (error) {
        onToast({
          title: "Error",
          description: "Failed to cancel subscription",
          variant: "error",
        });
      }
    },
    [subscriptions, updateSubscriptions, addToHistory, onToast]
  );

  const handlePauseSubscription = useCallback(
    async (id: number, resumeDate?: Date) => {
      const sub = subscriptions.find((s) => s.id === id);
      if (!sub) return;

      try {
        const resumesAt = resumeDate
          ? resumeDate.toISOString()
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        await updateSubscription(id, {
          status: "paused",
          paused_at: new Date().toISOString(),
          resumes_at: resumesAt,
        });

        const updatedSubs = subscriptions.map((s) =>
          s.id === id
            ? {
                ...s,
                status: "paused",
                pausedAt: new Date().toISOString(),
                resumesAt: resumesAt,
              }
            : s
        );

        updateSubscriptions(updatedSubs);
        addToHistory(updatedSubs);

        onToast({
          title: "Subscription paused",
          description: "The subscription has been paused",
          variant: "success",
        });
      } catch (error) {
        onToast({
          title: "Error",
          description: "Failed to pause subscription",
          variant: "error",
        });
      }
    },
    [subscriptions, updateSubscriptions, addToHistory, onToast]
  );

  const handleResumeSubscription = useCallback(
    async (id: number) => {
      try {
        await updateSubscription(id, {
          status: "active",
          paused_at: undefined,
          resumes_at: undefined,
        });

        const updatedSubs = subscriptions.map((s) =>
          s.id === id
            ? {
                ...s,
                status: "active",
                pausedAt: undefined,
                resumesAt: undefined,
              }
            : s
        );

        updateSubscriptions(updatedSubs);
        addToHistory(updatedSubs);

        onToast({
          title: "Subscription resumed",
          description: "The subscription has been resumed",
          variant: "success",
        });
      } catch (error) {
        onToast({
          title: "Error",
          description: "Failed to resume subscription",
          variant: "error",
        });
      }
    },
    [subscriptions, updateSubscriptions, addToHistory, onToast]
  );

  const handleToggleSubscriptionSelect = useCallback((id: number) => {
    setSelectedSubscriptions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  return {
    subscriptions,
    loading,
    bulkActionLoading,
    selectedSubscriptions,
    selectedSubscription,
    canUndo,
    canRedo,
    setSelectedSubscription,
    setBulkActionLoading,
    setSelectedSubscriptions,
    updateSubscriptions,
    addToHistory,
    undo,
    redo,
    handleAddSubscription,
    handleDeleteSubscription,
    handleEditSubscription,
    handleCancelSubscription,
    handlePauseSubscription,
    handleResumeSubscription,
    handleToggleSubscriptionSelect,
  };
}
