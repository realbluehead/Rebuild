import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

/** Id of this build: the commit on CI, the time locally. The web build also writes it to version.json, which an open
 *  game polls to know when a newer build is out (platform/update.ts). The dev server uses 'dev' (no checks). */
const BUILD = (process.env.GITHUB_SHA ?? '').slice(0, 7) || new Date().toISOString().replace(/\D/g, '').slice(0, 14);

// BASE_PATH is set by the CI for GitHub Pages (/<repo>/). Locally and on Android it is './'.
export default defineConfig(({ command }) => ({
  base: process.env.BASE_PATH ?? './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __APP_BUILD__: JSON.stringify(command === 'build' ? BUILD : 'dev') },
  plugins: [
    {
      name: 'version-json',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: pkg.version, build: BUILD }) });
      },
    },
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
}));
