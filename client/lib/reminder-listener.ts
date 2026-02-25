export interface ReminderEvent {
  subscriptionId: string;
  renewalDate: string;
  reminderType: 'renewal' | 'trial_expiry' | 'cancellation';
  url?: string;
}

export type ReminderCallback = (event: ReminderEvent) => void;

const REMINDER_MESSAGE_TYPE = 'SYNCRO_REMINDER';

/**
 * Register the Synchro reminder service worker.
 *
 * This should typically be called once during app startup, e.g. in a
 * top-level layout or root component on the client.
 */
export async function registerReminderServiceWorker(
  path: string = '/reminder-sw.js'
): Promise<ServiceWorkerRegistration> {
  if (typeof window === 'undefined') {
    throw new Error('registerReminderServiceWorker must be called in a browser environment');
  }

  if (!('serviceWorker' in navigator)) {
    throw new Error('Service workers are not supported in this browser');
  }

  const registration = await navigator.serviceWorker.register(path);
  return registration;
}

/**
 * Subscribe to renewal reminder events.
 *
 * Under the hood, this listens for messages from the reminder service worker.
 * When the backend sends a Web Push notification for a renewal reminder, the
 * service worker forwards a structured event to all open windows, and this
 * function invokes the provided callback with the parsed payload.
 *
 * Returns an unsubscribe function to remove the listener.
 */
export function onReminder(callback: ReminderCallback): () => void {
  if (typeof window === 'undefined') {
    // No-op on server
    return () => {};
  }

  if (!('serviceWorker' in navigator)) {
    console.warn('[Synchro] Service workers are not supported in this browser');
    return () => {};
  }

  const handler = (event: MessageEvent) => {
    const data = event.data;
    if (!data || data.type !== REMINDER_MESSAGE_TYPE || !data.payload) {
      return;
    }

    const payload = data.payload as ReminderEvent;

    // Only forward renewal reminders as per the current protocol
    if (!payload.subscriptionId || !payload.renewalDate || payload.reminderType !== 'renewal') {
      return;
    }

    callback(payload);
  };

  navigator.serviceWorker.addEventListener('message', handler);

  return () => {
    navigator.serviceWorker.removeEventListener('message', handler);
  };
}

