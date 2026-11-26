/*
 * Service worker: shows push notifications and opens the right page when one is tapped.
 * It deliberately caches nothing, so pages and private media are always fresh from the server
 * (and a logged-out phone never shows someone's photos from a cache).
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = { body: event.data ? event.data.text() : '' };
    }

    event.waitUntil(
        self.registration.showNotification(data.title || 'Only in Mongolia', {
            body: data.body || '',
            icon: '/icons/icon-192.png',
            badge: '/icons/badge-96.png',
            // Same tag replaces the older one (a chat shows its latest message, not a pile).
            tag: data.tag || undefined,
            renotify: Boolean(data.tag),
            data: { url: data.url || '/notifications' },
        }),
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = new URL(event.notification.data?.url || '/', self.location.origin).href;

    event.waitUntil(
        (async () => {
            const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
            // Reuse an open tab of the app if there is one.
            for (const client of windows) {
                if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
                    await client.focus();
                    return client.navigate ? client.navigate(url) : undefined;
                }
            }
            return self.clients.openWindow(url);
        })(),
    );
});

// The browser rotated the subscription: tell the server about the new one.
self.addEventListener('pushsubscriptionchange', (event) => {
    event.waitUntil(
        self.clients.matchAll({ type: 'window' }).then((windows) => windows.forEach((w) => w.postMessage({ type: 'push:resubscribe' }))),
    );
});
