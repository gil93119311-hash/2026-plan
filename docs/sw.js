/* 말로 가계부 서비스워커: 오프라인 캐시 + 백그라운드 알림 */
const VERSION = 'malro-v3';
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'parser.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== 'malro-data').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// 네트워크 우선, 실패하면 캐시 (업데이트가 바로 반영되도록)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});

async function checkReminders() {
  const c = await caches.open('malro-data');
  const res = await c.match('./__reminders.json');
  if (!res) return;
  const data = await res.json();
  if (!data.enabled) return;
  const now = Date.now();
  let changed = false;
  for (const r of data.list || []) {
    if (r.at <= now && r.at > now - 2 * 864e5 && !(data.notified || {})[r.key]) {
      data.notified = data.notified || {};
      data.notified[r.key] = now; changed = true;
      await self.registration.showNotification(r.title, { body: r.body, tag: r.key, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: './' } });
    }
  }
  if (changed) await c.put('./__reminders.json', new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }));
}
self.addEventListener('periodicsync', (e) => { if (e.tag === 'malro-reminders') e.waitUntil(checkReminders()); });
self.addEventListener('push', (e) => e.waitUntil(checkReminders()));
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const cl of cs) if ('focus' in cl) return cl.focus();
    return self.clients.openWindow(e.notification.data?.url || './');
  }));
});
