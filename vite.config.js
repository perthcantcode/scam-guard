import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  worker: { format: 'es' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Scam Guard',
        short_name: 'Scam Guard',
        description: 'Check suspicious messages privately on your device.',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        share_target: {
          action: '/share',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' }
        }
      },
      workbox: {
        // OCR is available after this precache finishes, before the first image check.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,traineddata}'],
        globIgnores: ['ort/**', 'assets/ort-*.wasm'],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // ONNX is optional and large: cache the backend actually used on first load.
            urlPattern: ({ url }) => url.origin === self.location.origin && (url.pathname.startsWith('/ort/') || /\/assets\/ort-.*\.wasm$/.test(url.pathname)),
            handler: 'CacheFirst',
            options: {
              cacheName: 'scam-guard-onnx-runtime-v1',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ],
        // Transformers.js owns the model cache; never duplicate Hugging Face files here.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/ort\//, /^\/tesseract\//, /^\/icons\//]
      }
    })
  ],
  build: {
    target: 'esnext',
    outDir: 'dist'
  }
});

