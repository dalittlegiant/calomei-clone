import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the site at /calomei-clone/ (repo name = subpath).
  base: '/calomei-clone/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'CaLoMei Clone',
        short_name: 'CaLoMei',
        description: '影相識別食物、計卡路里、廣東話評語',
        lang: 'zh-Hant',
        theme_color: '#FFA500',
        background_color: '#FFF8F0',
        display: 'standalone',
        start_url: '/calomei-clone/',
        scope: '/calomei-clone/',
        icons: [
          {
            src: '/calomei-clone/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/calomei-clone/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        // Cache the app shell + offline food databases so the app works offline.
        // Vision API calls are never cached (NetworkOnly by default).
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
      },
    }),
  ],
})
