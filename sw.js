/* =========================================================
   STMDESKLY v2 — Service Worker
   Handles push notifications + notification clicks.
   ========================================================= */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {
    title: 'STMDeskly',
    body: 'New message',
    url: '/chats.html',
    tag: 'stmdeskly'
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        data = Object.assign(data, parsed);
      }
    }
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  const options = {
    body: data.body,
    icon: data.icon || '/assets/brand/icon-192.png',
    badge: data.badge || '/assets/brand/badge-96.png',
    tag: data.tag,
    renotify: !!data.tag,
    data: { url: data.url },
    vibrate: [80, 40, 80]
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/chats.html';

  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    for (const client of list) {
      try {
        const clientUrl = new URL(client.url);
        const target = new URL(targetUrl, self.location.origin);
        if (clientUrl.origin === target.origin) {
          await client.focus();
          if ('navigate' in client) {
            try { await client.navigate(target.href); } catch (e) {}
          }
          return;
        }
      } catch (e) {}
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});
