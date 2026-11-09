import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    injectRegister: false,
    includeAssets: ['favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
    manifest: {
      id: '/',
      name: 'TokenMate — Shared KPLC Token Tracker',
      short_name: 'TokenMate',
      description: 'Track and share apartment KPLC token contributions.',
      theme_color: '#0b4fa8',
      background_color: '#f4f7fc',
      display: 'standalone',
      orientation: 'portrait',
      lang: 'en',
      dir: 'ltr',
      prefer_related_applications: false,
      scope: '/',
      start_url: '/',
      share_target: {
        action: '/share-target',
        method: 'GET',
        params: { title: 'title', text: 'text', url: 'url' }
      },
      categories: ['finance', 'utilities'],
      related_applications: [{ platform: 'webapp', url: '/manifest.webmanifest', id: '/' }],
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    workbox: {
      skipWaiting: true,
      clientsClaim: true,
      globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      navigateFallback: 'index.html',
      navigateFallbackDenylist: [/^\/downloads\//, /^\/\.well-known\//],
      cleanupOutdatedCaches: true
    }
  })]
});
