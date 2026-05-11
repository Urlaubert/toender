import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/toender/',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  },
  server: {
    host: true,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        // skipWaiting + clientsClaim: neue SW-Version uebernimmt sofort,
        // alle offenen Tabs werden gesteuert — verhindert den S-087-Cache-
        // Pain (alter SW haengt, neue Version wird nie sichtbar).
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Cache-Strategie:
        // - index.html / JS: NetworkFirst (immer aktuell, Offline-Fallback)
        // - Assets / Bilder: CacheFirst
        // - APIs: NetworkOnly (keine Auth-Antworten cachen!)
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'document',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'toender-html',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: ({ request }) => ['script', 'style', 'worker'].includes(request.destination),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'toender-js',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            urlPattern: ({ request }) => ['image', 'font'].includes(request.destination),
            handler: 'CacheFirst',
            options: {
              cacheName: 'toender-assets',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /\/strudel_corpus\.json$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'toender-corpus',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          // Externe APIs: nicht cachen
          {
            urlPattern: /^https:\/\/(freesound|xeno-canto|archive)\.(org|net)\//,
            handler: 'NetworkOnly',
          },
        ],
        // Limit pro Cache-Entry — JS-Bundles unter ~2MB
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: 'Toender — Sample-Audition',
        short_name: 'Toender',
        description: 'Wisch-basiertes Audition-Tool fuer Samples',
        theme_color: '#1a1a1a',
        background_color: '#0d0d0d',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/toender/',
        start_url: '/toender/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: {
        enabled: false, // SW im Dev-Modus aus — sonst klemmt HMR
      },
    }),
  ],
});
