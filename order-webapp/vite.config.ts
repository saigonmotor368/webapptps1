import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Webapp đặt hàng RIÊNG cho khách hàng (mục 14 kế hoạch webapp bán hàng TPS1,
// 14/09/2026). Tách hẳn khỏi sale-webapp (app nội bộ nhân viên) — deploy
// project Vercel riêng, domain riêng (vd dat-hang.thucphamsomot.vn). Không
// dùng Supabase client trực tiếp: mọi dữ liệu đi qua các route
// /api/customer/** đã có sẵn trên web chính (Next.js), xác thực bằng
// Authorization: Bearer <orderSessionToken> — cùng cơ chế Zalo Mini App đang
// dùng, đã có CORS "*" sẵn cho hầu hết route (xem README.md mục "Backend").
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Service worker tự viết ở public/sw-push.js (nhận + hiện push
      // notification) — inject vào bản build của Workbox thay vì để
      // vite-plugin-pwa tự sinh sw rỗng, xem generate-sw hook bên dưới.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
      },
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        id: '/order/',
        name: 'Đặt hàng TPS1',
        short_name: 'TPS1 Đặt hàng',
        description: 'Cổng đặt hàng dành cho khách hàng VIP của Thực Phẩm Số Một',
        theme_color: '#0a3d29',
        background_color: '#07160f',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    port: 5174,
    proxy: {
      // Dev: trỏ thẳng sang Next.js app chạy ở cổng 3001 (giống sale-webapp).
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})

