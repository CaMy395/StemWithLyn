self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { /* Show a fallback alert. */ }
  event.waitUntil(self.registration.showNotification(data.title || 'STEM with Lyn visitor alert', {
    body: data.body || 'Someone arrived on your site.', icon: '/stem-logo-512.png',
    tag: data.tag || 'visitor-alert', data: { url: '/admin' },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL('/admin', self.location.origin).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) { await client.navigate(url); return client.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
