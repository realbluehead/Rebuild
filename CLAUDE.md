# Rebuild

Idle (incremental) game that runs on the web (PWA on GitHub Pages) and on Android (Capacitor), from **a single codebase**.
Name: **Rebuild** (repo realbluehead/Rebuild, web at https://realbluehead.github.io/Rebuild/). Renaming it means touching `package.json`, `capacitor.config.ts` (appId/appName), `vite.config.ts` (manifest),
`android/` (namespace/applicationId, better to regenerate it) and `GITHUB_REPO` in `src/platform/update.ts`. Do it **before** the first release.

## The game
Exploration idle with a **retro pixel** look, set in a **post-apocalyptic city** (street grid, ruined blocks, towers, rubble,
toxic dumps, toxic water and urban jungle). Top-down view of a 2D map (1024×1024 cells) that starts completely dark;
rovers reveal it on their own, little by little, over time. 4 zoom levels (Street 16 → District 64 → City 256 → Metropolis 1024
cells per side); you start at the closest and the next unlocks when 80% of the current zoom's square is revealed.
- Stats (`content/upgrades.ts`, effect in `core/game.ts` `stats()`): Engine (speed), Radar (range in rings), Hold (cargo capacity),
  Rovers. Steps/s = speed × rovers. Bluetreri comes from every cell (terrain × distance) and from deposits.
- **Independent rovers** (`state.bots[]`, each with `trip`, `prog` along its arc, `cargo`, travel): when a ring starts it is
  split into arcs (`arcStarts`/`arcOf`) and each rover explores its own. Hold full (or arc done with cargo) → back to camp
  (`trip` home → out → explore, distance = ring + 1, at `TRAVEL_MULT`× the speed) and only then is the bluetreri the player's.
  The next ring starts when every arc is done. `tick` advances event by event (the point where the hold fills is found by
  bisection), so it is exact for any dt (there is a test) and rovers leave and return at different times.
- **Roughness** (`TERRAINS[].rough`): exploring a cell costs `distance × rough` steps (streets 1, jungle 1.8, towers 2.6…).
  `cost` only decides the exploration order.
- Items (`content/collection.ts`): pages, notes and photos hidden in ~1/90 cells (`world.item`, `itemRanks`). Collected on
  arrival; the Works tab turns them into books (speed), records (bluetreri) and albums (hold): ×1.1 bonus per work, cost ×1.9 each time.
- Radar: items up to `radar` rings further out are fetched by an exploring rover (`trip` 'detour', `target`, at exploring speed).
  `radarNext` is the index of the first item the radar has not gone through. The detour starts from the rover's cell (`Bot.from`)
  and the straight path to the item (`pathCells`) is revealed as it walks; finished paths are kept in `state.scouted`
  (triples [fromRank, toRank, maxRank], no bluetreri) and dropped in `nextRing` once exploring has passed them.
  On the map: submarine radar (rotating needle, radius = range) around each rover; detected items light up when the
  needle passes and the detour target gets a frame.
- If the rover leaves the view, an arrow at the edge (away from the buttons) points to it; tapping it flies there. The map never moves on its own.
- Terrain (`content/world.ts` `T`): height picks water/rubble/city; in the city, streets every 7 cells (`BLOCK`, camp on a crossing)
  and blocks of buildings; humidity makes urban jungle; separate noise makes dump patches. Tiles in `ui/sprites.ts` (8 variants).
- The currency is **bluetreri** (an invented blue mineral; still `gold` in the code). Legend in the field notes; tapping the map shows the terrain and its value.
- UI style: rusted metal (riveted plates, copper buttons) with yellow-and-black hazard details (`--stripes`):
  under the top bar, hold full, notices, restart and the ? button when there are new notes.
- Help = "Field notes" (`helpEntries` in `ui/view.ts`): each entry appears once the player has found what it explains
  (first deposit, first upgrade of each kind, items, works, terrain seen…); the rest shows as "??? to discover".
- The cell a rover explores gains colour (second half of the step; in the first it walks there). Notes: ? button and menu; shown by itself on the first game.
- Rover rules: they leave camp (starting cell); **they only reveal the adjacent cell** and a cell counts as revealed when
  they reach it. If the next cell in the order is not adjacent they walk there (steps that reveal nothing).
  With N rovers each ring is split into N arcs; rovers bought mid-ring join on the next ring (`ringRobots`).
- The map **is not saved**: it is regenerated from the `seed` (`core/world.ts`). The exploration order is a Dijkstra expansion from camp
  (cost per terrain + noise) walked by rings and angle: the explored area is always one connected patch (there is a test).
  Offline progress is exact. If generation changes, saves will see a different map.
- Format: **always a portrait phone**. On mobile it fills the screen; on desktop it is a centred 9:19.5 phone frame (`#app` in `style.css`).
  Top bar (bluetreri, rate, ≡ menu with export/import/restart), map in the middle, upgrades in a 2×2 grid at the bottom. Dialogs open inside the phone.
- Rendering (`ui/map.ts`): low-resolution canvas (~256 logical px on the short side) scaled with crisp pixels; 16×16 tiles generated by
  code (`ui/sprites.ts`, own palette) up close, flat colour further out and a 4×4 mipmap at zoom 4. Bundled pixel fonts (work offline): `Press Start 2P` for numbers and titles (class/var `--font-num`), `VT323` for text (clear digits; Pixelify Sans was dropped because its 5 looked like an S).
- Current balance (sim, `BASE_SPEED` 0.18 steps/s): zoom 2 ~30 min, zoom 3 ~2 h 30, zoom 4 ~7 h, full map ~24 h (the sim does not buy Radar).
  `BASE_SPEED` scales the whole pace linearly (bluetreri also comes from exploring). For testing: the "Speed ×N" button on the map (×1 to ×100).
- **Everything is in English**: game text (UI, notes, names of terrain/upgrades/items/zooms, manifest), code comments, test names and this file.

## Commands
- `npm run dev`: local server (Vite). Also as `idle-joc` in `../.claude/launch.json`.
- `npm test`, `npm run lint`, `npm run typecheck`.
- `npm run sim -- <hours>`: balance simulator (greedy player), prints when each milestone is reached. Run it whenever numbers in `src/content/` change.
- `npm run android:apk`: debug APK in `android/app/build/outputs/apk/debug/`. Needs `JAVA_HOME` from Android Studio's JDK:
  `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"` (the system Java does not work with Gradle).
- `npm run release -- patch|minor|major`: bumps the version, tags `vX.Y.Z` and pushes → CI publishes the APK to Releases.

## Architecture
- `src/core/`: **pure** simulation (no DOM, clock or storage). All new logic goes here, with tests.
  Big numbers always with `Decimal` from `core/decimal.ts`. Fixed-step loop (`TICK_RATE`).
- `src/content/`: game data (upgrades, terrain, collections…). Adding content should not touch the core.
- `src/save/`: `save.ts` versioned format + migrations; `offline.ts` progress while away (in chunks, capped); `persist.ts` saving with a backup.
  **If `GameState` changes: bump `SAVE_VERSION`, add the migration and a test.** Players' saves must never break.
  Saves from v3 or earlier carry `legacyWalked` (total steps) and `fromLegacy()` turns it into a ring + rovers once the world exists (in `main.ts`).
- `src/platform/`: everything that differs between web and Android (storage, background, local notifications, APK updates).
- `src/ui/`: plain DOM; built once, `render()` only updates texts.

## Deployment
- Web: push to `main` → `.github/workflows/web.yml` (lint, test, build with `BASE_PATH=/<repo>/`) → GitHub Pages.
- Android: tag `v*` → `.github/workflows/android.yml` → signed APK on GitHub Releases. The installed app checks
  the latest release and offers to download it. `versionCode` is derived from the `package.json` version (1.2.3 → 10203).
- Signing key: `tools/new-keystore.sh` (once). Kept outside the repo; secrets `ANDROID_KEYSTORE_BASE64`,
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. If it is lost, phones will not be able to update.
- After changing web code, to try it on Android: `npm run android:sync` (build + `cap sync`).
