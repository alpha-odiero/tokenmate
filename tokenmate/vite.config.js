import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    injectRegister: false,
    includeAssets: ['tokenmate.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
    manifest: {
      id: '/',
      name: 'TokenMate — Shared KPLC Token Tracker',
      short_name: 'TokenMate',
      description: 'Track and share apartment KPLC token contributions.',
      theme_color: '#0b4fa8',
      background_color: '#f4f7fc',
      display: 'standalone',
      orientation: 'portrait',
      scope: '/',
      start_url: '/',
      categories: ['finance', 'utilities'],
      icons: [
        { src: '/tokenmate.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      navigateFallback: 'index.html',
      cleanupOutdatedCaches: true
    }
  })]
});
