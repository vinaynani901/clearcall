// ClearCall service worker — handles incoming Web Push notifications and
// click-through navigation. Registered from src/utils/push.js. Deliberately
// minimal: no offline caching/asset precaching, since ClearCall doesn't
// need an offline mode — this worker exists purely for push delivery.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// An incoming ClearCall Verified Call (tag: 'incoming-call') needs to reach
// the person as the actual full-screen verified call UI — company, caller,
// designation, job role, "you applied X days ago" — not just a passive OS
// notification, and it needs to work the same way whether the app is open,
// backgrounded, or not running at all:
//   - App open (foreground tab exists): post the full payload straight to
//     it so it can navigate to /call/incoming-verified immediately, in
//     addition to the OS notification (some browsers/OSes suppress the
//     notification for a focused tab anyway).
//   - App backgrounded / not running: the OS notification is the only way
//     to reach the person, so its click target carries every field as URL
//     query params (not route state, which can't survive a fresh
//     window.open from here) so the call screen can render fully once
//     opened cold.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'ClearCall', body: event.data ? event.data.text() : '' };
  }

  const isIncomingCall = data.tag === 'incoming-call';
  const targetUrl = isIncomingCall ? buildIncomingCallUrl(data.data || {}) : (data.url || '/');

  const title = data.title || 'ClearCall';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: targetUrl, isIncomingCall, callData: data.data || null },
    tag: data.tag || undefined,
    requireInteraction: isIncomingCall,
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      // Also tell any already-open ClearCall tab right away — this is what
      // lets a foregrounded app jump straight to the full call screen
      // instead of waiting on a notification click.
      isIncomingCall
        ? self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
            for (const client of clients) client.postMessage({ type: 'incoming-verified-call', metadata: data.data || {} });
          })
        : Promise.resolve(),
    ]),
  );
});

function buildIncomingCallUrl(callData) {
  const params = new URLSearchParams();
  if (callData.companyName) params.set('companyName', callData.companyName);
  if (callData.callerName) params.set('callerName', callData.callerName);
  if (callData.designation) params.set('designation', callData.designation);
  if (callData.jobRole) params.set('jobRole', callData.jobRole);
  if (callData.companyLogoUrl) params.set('companyLogoUrl', callData.companyLogoUrl);
  if (callData.appliedDaysAgo !== null && callData.appliedDaysAgo !== undefined) params.set('appliedDaysAgo', String(callData.appliedDaysAgo));
  return `/call/incoming-verified?${params.toString()}`;
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          if (event.notification.data?.isIncomingCall) client.postMessage({ type: 'incoming-verified-call', metadata: event.notification.data.callData || {} });
          if (client.navigate) client.navigate(targetUrl);
          return client;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return null;
    }),
  );
});
