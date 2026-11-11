import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// BASE_PATH el posa la CI per a GitHub Pages (/<repo>/). En local i a Android és './'.
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      // La font de píxels també ha de funcionar sense connexió.
      workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2}'] },
      manifest: {
        name: 'Rebuild',
        short_name: 'Rebuild',
        description: 'Un joc idle d\'exploració: descobreix un mapa pixelat a mesura que passa el temps.',
        theme_color: '#0c0a12',
        background_color: '#0c0a12',
        display: 'standalone',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
    }),
  ],
  test: { include: ['src/**/*.test.ts'] },
});
