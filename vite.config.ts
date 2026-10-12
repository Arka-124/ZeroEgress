import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'ZeroEgress - Air-Gapped Utility Suite',
        short_name: 'ZeroEgress',
        description: '100% Client-Side Private File Utilities: Image Converter, PDF Tools, and more.',
        theme_color: '#09090b',
        background_color: '#09090b',
        display: 'standalone',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            // Cache-First strategy for WebAssembly binaries and ffmpeg core assets (including CDN)
            urlPattern: ({ url }) =>
              url.pathname.endsWith('.wasm') ||
              url.pathname.includes('/ffmpeg/') ||
              url.origin.includes('unpkg.com'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'zeroegress-wasm-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Cache-First strategy for Web Workers
            urlPattern: ({ request, url }) =>
              request.destination === 'worker' ||
              url.pathname.includes('dataWorker') ||
              url.pathname.includes('worker'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'zeroegress-workers-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Cache-First strategy for typography and fonts
            urlPattern: ({ request, url }) =>
              request.destination === 'font' ||
              /\.(?:woff|woff2|eot|ttf|otf)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'zeroegress-fonts-cache',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Stale-While-Revalidate strategy for core UI script and style bundles
            urlPattern: ({ request, url }) =>
              request.destination === 'script' ||
              request.destination === 'style' ||
              /\.(?:js|css)$/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'zeroegress-bundles-cache',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/pdf-lib')) {
            return 'pdf-engine';
          }
          if (id.includes('node_modules/jszip')) {
            return 'zip-engine';
          }
          if (id.includes('@ffmpeg/ffmpeg') || id.includes('@ffmpeg/util')) {
            return 'ffmpeg-core';
          }
        },
      },
    },
  },
})

