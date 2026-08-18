// Web Push subscribe/unsubscribe flow. Talks to the service worker at
// /sw.js (registered here) and the backend's /api/push endpoints.
import { api } from '../api/client';

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function getNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

// Push subscription keys arrive base64url-encoded; PushManager.subscribe
// needs a Uint8Array — this is the standard conversion snippet.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function registerServiceWorker() {
  return navigator.serviceWorker.register('/sw.js');
}

/**
 * Full opt-in flow: registers the service worker, requests notification
 * permission if not already decided, subscribes with the server's VAPID
 * public key, and saves the subscription server-side.
 * Returns { success: true } or { success: false, reason }.
 */
export async function enablePushNotifications() {
  if (!isPushSupported()) return { success: false, reason: 'not_supported' };

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') return { success: false, reason: 'permission_denied' };

  const { publicKey } = await api.getVapidPublicKey();

  const registration = await registerServiceWorker();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const raw = subscription.toJSON();
  await api.subscribePush({ endpoint: raw.endpoint, keys: raw.keys });
  return { success: true };
}

export async function disablePushNotifications() {
  if (!isPushSupported()) return { success: false, reason: 'not_supported' };
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = registration ? await registration.pushManager.getSubscription() : null;
  if (subscription) {
    await api.unsubscribePush(subscription.endpoint).catch(() => {});
    await subscription.unsubscribe();
  }
  return { success: true };
}

export async function isPushSubscribed() {
  if (!isPushSupported()) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return false;
  const subscription = await registration.pushManager.getSubscription();
  return !!subscription;
}
