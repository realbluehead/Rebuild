# Rebuild

Idle (incremental) game that runs on the web (PWA on GitHub Pages) and on Android (Capacitor), from **a single codebase**.
Name: **Rebuild** (repo realbluehead/Rebuild, web at https://realbluehead.github.io/Rebuild/). Renaming it means touching `package.json`, `capacitor.config.ts` (appId/appName), `vite.config.ts` (manifest),
`android/` (namespace/applicationId, better to regenerate it) and `GITHUB_REPO` in `src/platform/update.ts`. Do it **before** the first release.

## The game
Exploration idle with a **retro pixel** look, in two phases, each its own code:
- **Phase I** (`src/phase1/`, details in src/phase1/CLAUDE.md): rovers explore a ruined post-apocalyptic city, gathering
  bluetreri, items, lore and metal scraps; it ends when the whole map is explored and dug out.
- **Phase II** (`src/phase2/`, details in src/phase2/CLAUDE.md): a fleet of ships carries the resources to a new planet.
  It starts **only** from what phase I hands over (`Legacy`, src/phase2/core/legacy.ts) and never reads phase I's state,
  world or code.

## Layout
- `src/main.ts`: puts the title screen up, then boots one phase: phase II if its save (`rebuild:p2` or its backup,
  src/shared/keys.ts) exists (phase I's code and world are then never loaded), else phase I (also if phase II fails to
  boot); if nothing loads, the title says so and a tap reloads.
- `src/shared/`: what both phases use and that knows neither: `decimal.ts`, `format.ts`, `codec.ts` (export text),
  `keys.ts` (storage names main.ts or both phases need), `updates.ts` (new version offers), `ui/style.css` (base look; phase II re-themes it in its own css),
  `ui/title.ts`, `ui/dom.ts` (`h`, `modal`, `confirmModal`, `textModal`), `ui/speed.ts` (the Speed ×N test button, one
  setting for both phases).
- `src/platform/`: everything that differs between web and Android (storage, background, local notifications, APK updates).
- `src/saves.ts`: the one module that knows both phases' saves (import of either kind of exported text, restart = wipe both).
- **Boundaries** (enforced by ESLint `no-restricted-imports`): `src/phase2/` never imports `src/phase1/`; `shared/` and
  `platform/` import neither phase. Phase I may import phase II (to hand over and start it).
- Each phase has its own save, versions and migrations. **If a phase's state changes: bump its save version, add the
  migration and a test.** Players' saves must never break.

## Shared screens
- Title screen (`src/shared/ui/title.ts`): full screen over `#app` while that runs (`title.progress`). Pixel-art canvas ~112 px wide: a scan
  line rises from the street turning the wasteland into a neon city (it chases the progress at most `SCAN_SPEED`, so it
  takes ≥ ~3.3 s); above the line the wasteland has acid clouds with faint distant lightning, smoke from the three tallest ruins and ground fog (`drawStorm`), "RECEIVING DATA…" + bar, then "TAP TO START". Title "REBUILD" in Monoton (`@fontsource/monoton`), dull
  above the line and neon below it. The game loop starts only on the tap (and on a new game, on the tap that closes "The arrival"); until then the simulation waits, as do help, offline report and end message (the time away is simulated while loading).
- `title.ready()` returns one shared promise (boot waits on it twice: messages and the web update check).

- **Everything is in English**: game text (UI, notes, names of terrain/upgrades/items/zooms, manifest), code comments, test names and this file.

## Commands
- `npm run dev`: local server (Vite). Also as `idle-joc` in `../.claude/launch.json`.
- `npm test`, `npm run lint` (the whole repo: src, tools, configs), `npm run typecheck`.
- `node tools/icon.mjs` (macOS): draws the app icon (`public/icon.svg`, 32×32 pixel art, full bleed so it is also the
  maskable one) and writes its PNGs (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`) with `sips`.
- `npm run sim -- <hours>`: phase I's balance simulator (see src/phase1/CLAUDE.md); `npm run sim2 -- <hours>`: phase
  II's (see src/phase2/CLAUDE.md).
- `npm run android:apk`: debug APK in `android/app/build/outputs/apk/debug/`. Needs `JAVA_HOME` from Android Studio's JDK:
  `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"` (the system Java does not work with Gradle).
- **Versioning** (semver, `npm version <part> --no-git-tag-version` in the same commit; no tag, so no APK): a bug fix bumps the patch, any other change that is not a game-rules change bumps the minor. Rule changes are decided with the user.
- `npm run release -- patch|minor|major`: bumps the version, tags `vX.Y.Z` and pushes → CI publishes the APK to Releases.

## Architecture
- Each phase: a **pure** `core/` (no DOM, clock or storage; logic and tests go there), plain-DOM `ui/` (built once,
  `render()` only updates texts) and a `boot.ts` with the loop, saving and the menu. Big numbers with `Decimal`.
- Web versions: each build has an id (`__APP_BUILD__`: commit on CI, build time locally, 'dev' on the dev server) and
  writes `version.json` (`version-json` plugin in `vite.config.ts`). After the title tap and whenever the game comes back
  to the foreground, `checkWebUpdate` fetches it uncached; a different build shows "New version available" (once per build
  and session), and "Reload now" saves and calls `hardReload` (unregister the service worker, clear caches, reload with
  `?v=` to skip the HTTP cache; `main.ts` strips it). Native apps use the APK check instead.

## Deployment
- Web: push to `main` → `.github/workflows/web.yml` (lint, typecheck, test, build with `BASE_PATH=/<repo>/`) → GitHub Pages.
  Runs on main queue (one deploy at a time, never cancelled halfway); a newer push to a PR cancels its older run.
- Android: tag `v*` → `.github/workflows/android.yml` (lint, test, Gradle cached) → signed APK on GitHub Releases; run
  by hand it keeps the APK as the run's artifact (14 days) instead (a debug APK while the signing secrets are not set;
  a tag then fails with a clear error). `npm run release` lints, typechecks and tests first. The installed app checks
  the latest release and offers to download it. `versionCode` is derived from the `package.json` version (1.2.3 → 10203).
- Signing key: `tools/new-keystore.sh` (once). Kept outside the repo; secrets `ANDROID_KEYSTORE_BASE64`,
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. If it is lost, phones will not be able to update.
- After changing web code, to try it on Android: `npm run android:sync` (build + `cap sync`).
