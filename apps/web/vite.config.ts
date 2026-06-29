import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // We drive registration + the update prompt from `useRegisterSW`
      // (see pwa-prompts.tsx), so don't also inject an auto-register script.
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Hame',
        short_name: 'Hame',
        description: 'Your household — shopping, meals, chores, calendar and home, in one place.',
        lang: 'en-GB',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f4ede1',
        theme_color: '#f4ede1',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the built shell so an installed Hame opens offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        cleanupOutdatedCaches: true,
        // SPA deep links resolve to the cached shell — but never shadow the
        // API / CalDAV surfaces, which must always hit the network.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/caldav/, /^\/\.well-known/],
        // Google Fonts are the only runtime-cached origin, so the shell still
        // renders its typefaces offline. App data is never cached (no /api rule).
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      // Keep the service worker out of `pnpm dev` so it can't cache the Vite
      // API/CalDAV proxy responses while iterating.
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true, // bind 0.0.0.0 so a phone on the LAN can reach the dev server
    proxy: {
      // Proxy API + CalDAV to the Express server during development, so the browser
      // origin (localhost:5173) is the single address for everything — mirroring how
      // the production reverse proxy fronts the web app, /api and /caldav.
      '/api': {
        target: process.env.VITE_API_URL ?? 'http://localhost:4000',
        changeOrigin: true,
      },
      '/caldav': {
        target: process.env.VITE_API_URL ?? 'http://localhost:4000',
        changeOrigin: true,
      },
      '/.well-known/caldav': {
        target: process.env.VITE_API_URL ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
