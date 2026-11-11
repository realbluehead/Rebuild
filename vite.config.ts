import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// BASE_PATH is set by the CI for GitHub Pages (/<repo>/). Locally and on Android it is './'.
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      // The pixel fonts must work offline too.
      workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2}'] },
      manifest: {
        name: 'Rebuild',
        short_name: 'Rebuild',
        description: 'An idle exploration game: rovers roam a ruined city hunting for bluetreri.',
        theme_color: '#0c0a12',
        background_color: '#0c0a12',
        display: 'standalone',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
    }),
  ],
  test: { include: ['src/**/*.test.ts'] },
});
