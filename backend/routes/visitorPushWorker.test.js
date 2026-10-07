import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('notification tap opens the highlighted visitor on this site, with a safe fallback', async () => {
  const handlers = {};
  let displayed;
  let destination;
  const self = {
    location: { origin: 'https://stemwithlyn.onrender.com' },
    addEventListener: (name, handler) => { handlers[name] = handler; },
    registration: { showNotification: async (_title, options) => { displayed = options; } },
    clients: { matchAll: async () => [], openWindow: async url => { destination = url; } },
  };
  vm.runInNewContext(fs.readFileSync(new URL('../../frontend/public/visitor-push-sw.js', import.meta.url), 'utf8'), { self, URL });
  let pending;
  const url = '/admin/visitors?visitor=00000000-0000-4000-8000-000000000001';
  handlers.push({ data: { json: () => ({ url }) }, waitUntil: promise => { pending = promise; } });
  await pending;
  handlers.notificationclick({ notification: { data: displayed.data, close() {} }, waitUntil: promise => { pending = promise; } });
  await pending;
  assert.equal(destination, `${self.location.origin}${url}`);
  handlers.notificationclick({ notification: { data: { url: 'https://untrusted.example' }, close() {} }, waitUntil: promise => { pending = promise; } });
  await pending;
  assert.equal(destination, `${self.location.origin}/admin/visitors`);
});
