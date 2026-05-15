import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'icon-512.svg'],
        manifest: {
          name: 'Spotheon',
          short_name: 'Spotheon',
          description: 'The ultimate location-based AR experience',
          theme_color: '#3B82F6',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          categories: ['navigation', 'social', 'travel'],
          launch_handler: {
            client_mode: ['navigate-existing', 'auto']
          },
          icons: [
            {
              src: 'icon-512.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any'
            },
            {
              src: 'icon-512.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'maskable'
            }
          ],
          shortcuts: [
            {
              name: 'AR View',
              short_name: 'AR',
              url: '/?view=ar',
              description: 'Open map in Augmented Reality view'
            },
            {
              name: 'New Note',
              short_name: 'New',
              url: '/?action=new',
              description: 'Drop a new sticky note'
            }
          ],
          screenshots: [
            {
              src: 'icon-512.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              form_factor: 'narrow'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/maps\.googleapis\.com/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-maps-api',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                }
              }
            },
            {
              urlPattern: /^https:\/\/firestore\.googleapis\.com/,
              handler: 'NetworkOnly',
            }
          ]
        }
      })
    ],
    define: {
      'process.env.GOOGLE_MAPS_PLATFORM_KEY': JSON.stringify(env.GOOGLE_MAPS_PLATFORM_KEY || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
            'google-maps-vendor': ['@vis.gl/react-google-maps'],
            'ui-vendor': ['lucide-react', 'motion/react'],
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
