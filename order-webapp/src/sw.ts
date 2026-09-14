/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

// vite-plugin-pwa (chiến lược injectManifest) sẽ thay __WB_MANIFEST bằng danh
// sách file thật lúc build — bắt buộc phải gọi để có precache cơ bản.
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Nhận Web Push từ server (route /api/admin/orders PATCH gọi lib/push.ts lúc
// đổi trạng thái đơn) và hiện notification kể cả khi app đang đóng — đây là
// lý do chính app này cần cài PWA thay vì chỉ mở tab trình duyệt thường.
self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; url?: string; tag?: string } = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = { title: 'TPS1', body: event.data?.text() || 'Bạn có thông báo mới' };
  }

  const title = data.title || 'Đặt hàng TPS1';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: data.tag,
      data: { url: data.url || '/' },
    })
  );
});

// Bấm vào notification → mở đúng trang đơn hàng (hoặc focus tab đang mở sẵn
// thay vì mở tab mới trùng lặp).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data as { url?: string })?.url || '/';
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = allClients.find((c) => 'focus' in c);
      if (existing) {
        await (existing as WindowClient).focus();
        (existing as WindowClient).navigate(targetUrl);
        return;
      }
      await self.clients.openWindow(targetUrl);
    })()
  );
});
