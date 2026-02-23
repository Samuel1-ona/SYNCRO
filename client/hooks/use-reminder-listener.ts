"use client";

import { useEffect, useState } from "react";
import {
  registerReminderServiceWorker,
  onReminder,
  type ReminderEvent,
} from "@/lib/reminder-listener";

interface UseReminderListenerOptions {
  /**
   * Service worker script path, relative to origin.
   * Defaults to "/reminder-sw.js".
   */
  serviceWorkerPath?: string;
}

interface UseReminderListenerResult {
  lastReminder: ReminderEvent | null;
  reminders: ReminderEvent[];
  isSupported: boolean;
  error: string | null;
}

/**
 * React hook wrapper around the Synchro reminder listener SDK.
 *
 * Usage:
 *
 * const { lastReminder, reminders } = useReminderListener();
 */
export function useReminderListener(
  options: UseReminderListenerOptions = {}
): UseReminderListenerResult {
  const { serviceWorkerPath = "/reminder-sw.js" } = options;

  const [lastReminder, setLastReminder] = useState<ReminderEvent | null>(null);
  const [reminders, setReminders] = useState<ReminderEvent[]>([]);
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!("serviceWorker" in navigator)) {
      setIsSupported(false);
      setError("Service workers are not supported in this browser.");
      return;
    }

    let unsub: (() => void) | null = null;

    (async () => {
      try {
        await registerReminderServiceWorker(serviceWorkerPath);
        unsub = onReminder((event) => {
          setLastReminder(event);
          setReminders((prev) => [...prev, event]);
        });
      } catch (err) {
        console.warn("[Synchro] Failed to initialize reminder listener", err);
        setError(
          err instanceof Error ? err.message : "Failed to initialize reminder listener."
        );
      }
    })();

    return () => {
      if (unsub) {
        unsub();
      }
    };
  }, [serviceWorkerPath]);

  return {
    lastReminder,
    reminders,
    isSupported,
    error,
  };
}

