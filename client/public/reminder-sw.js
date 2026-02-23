// Synchro Reminder Service Worker
// Listens for Web Push notifications from the backend reminder engine
// and forwards renewal reminder events to open client windows.

/* global self, clients */

const REMINDER_MESSAGE_TYPE = 'SYNCRO_REMINDER';

self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch (error) {
    // Invalid JSON payload; nothing we can safely do.
    console.error('[Synchro] Invalid push payload', error);
    return;
  }

  const notificationData = payload && payload.data ? payload.data : {};
  const {
    subscriptionId,
    renewalDate,
    reminderType,
    url,
  } = notificationData;

  // Only forward renewal reminders
  if (!subscriptionId || !renewalDate || reminderType !== 'renewal') {
    return;
  }

  const title = payload.title || 'Subscription Renewal Reminder';
  const options = {
    body: payload.body || 'You have an upcoming subscription renewal.',
    icon: payload.icon || '/icon.svg',
    badge: payload.badge || '/icon.svg',
    data: {
      url: url || '/dashboard',
    },
    requireInteraction: payload.requireInteraction === true,
  };

  event.waitUntil(
    (async () => {
      // Show a standard browser notification
      await self.registration.showNotification(title, options);

      // Forward a structured event to all open windows so apps
      // can handle reminders in an event-driven way.
      const clientList = await clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      const message = {
        type: REMINDER_MESSAGE_TYPE,
        payload: {
          subscriptionId,
          renewalDate,
          reminderType,
          url: url || '/dashboard',
        },
      };

      for (const client of clientList) {
        client.postMessage(message);
      }
    })()
  );
});

