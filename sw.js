/* =========================================================
   STMDESKLY v2 — Service Worker
   Push notifications + inline reply.
   ========================================================= */

const DB_NAME = 'stmdeskly-sw';
const STORE = 'pending-replies';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

/* ---------- IndexedDB helpers ---------- */

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueReply(threadId, body) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      threadId,
      body,
      createdAt: Date.now()
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function threadIdFromUrl(url) {
  try {
    const u = new URL(url, self.location.origin);
    return u.searchParams.get('id');
  } catch (e) {
    return null;
  }
}

async function focusOrOpen(targetUrl) {
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
}

/* ---------- Push ---------- */

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

  const threadId = threadIdFromUrl(data.url);

  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/badge-96.png',
    tag: data.tag,
    renotify: !!data.tag,
    data: { url: data.url, threadId },
    vibrate: [80, 40, 80]
  };

  /* Inline reply button — only shows on Android Chrome */
  if (threadId) {
    options.actions = [
      {
        action: 'reply',
        type: 'text',
        title: 'Reply',
        placeholder: 'Message…'
      }
    ];
  }

  event.waitUntil(self.registration.showNotification(data.title, options));
});

/* ---------- Notification click ---------- */

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const targetUrl = data.url || '/chats.html';
  const threadId = data.threadId;

  /* Inline reply */
  if (event.action === 'reply' && event.reply && threadId) {
    const body = String(event.reply).trim();
    if (!body) return;

    event.waitUntil((async () => {
      await queueReply(threadId, body);
      await focusOrOpen('/chat.html?id=' + encodeURIComponent(threadId));
    })());
    return;
  }

  /* Regular tap */
  event.waitUntil(focusOrOpen(targetUrl));
});
