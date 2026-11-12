# Rebuild

Idle (incremental) game that runs on the web (PWA on GitHub Pages) and on Android (Capacitor), from **a single codebase**.
Name: **Rebuild** (repo realbluehead/Rebuild, web at https://realbluehead.github.io/Rebuild/). Renaming it means touching `package.json`, `capacitor.config.ts` (appId/appName), `vite.config.ts` (manifest),
`android/` (namespace/applicationId, better to regenerate it) and `GITHUB_REPO` in `src/platform/update.ts`. Do it **before** the first release.

## The game
Exploration idle with a **retro pixel** look, set in a **post-apocalyptic city** (street grid, ruined blocks, towers, rubble,
toxic dumps, toxic water and urban jungle). Top-down view of a 2D map (1024×1024 cells) that starts completely dark;
rovers reveal it on their own, little by little, over time. 4 zoom levels (Street 16 → District 64 → City 256 → Metropolis 1024
cells per side); you start at the closest and the next unlocks when 80% of the current zoom's square is revealed.
- Bottom panel tabs: Rover, Routes, Works.
- Stats (`content/upgrades.ts`, effect in `core/game.ts` `stats()`), all on the **Rover** tab (3×2 grid): Engine (speed),
  Tyres (`grip`: share of terrain roughness still felt), Body (`armour`: share of storm slowdown still felt), Hold (cargo),
  Radar (range in cells around each rover), Rovers (count). Steps/s = speed × rovers. Bluetreri comes from every cell
  (terrain × distance) and from deposits. Buying or crafting announces the effect (before→after) in a toast.
- **Independent rovers** (`state.bots[]`, each with `trip`, `prog` along its arc, `cargo`, travel): when a ring starts it is
  split into arcs (`arcStarts`/`arcOf`) and each rover explores its own. Hold full (or arc done with cargo) → back to camp
  (`trip` home → out → explore, distance = ring + 1, at `TRAVEL_MULT`× the speed; the drive home is slower the fuller the hold,
  `homeSpeed`, `LOAD_DRAG`) and only then is the bluetreri the player's.
  The next ring starts when every arc is done. `tick` advances event by event (the point where the hold fills is found by
  bisection; a look-ahead finds the next cell where the weather changes or the radar would spot something; sky changes are
  events too), so it is exact for any dt (there is a test) and rovers leave and return at different times.
- **Roughness** (`TERRAINS[].rough`): exploring a cell costs `distance × (1 + grip × (rough − 1))` steps (streets 1, jungle 1.8,
  towers 2.6…). The world keeps `stepBase` and `stepRough` prefix sums; always use `stepsAt(w, grip, r)`. Buying Tyres rescales each
  rover's `prog` so it stays on the same cell (`buy` needs the world). `cost` only decides the exploration order.
- **Weather** (`content/weather.ts`, `core/weather.ts`): every `WEATHER_EPOCH` (12) s of play is a weather step, an event in
  `tick`: `evolveWeather` moves each storm with the shared wind (slowly turning) plus its own drift, grows it when it forms
  and fades it before it dies; at most one new storm forms per step (near the frontier, none before ring 6), ~20% severe
  (`SEVERE_MULT`). Storms are irregular blobs (`stormReach`: seeded lobes by storm id) that slow exploring and detours
  (`weatherFactor`, softened by Body); home/out trips are not affected. `s.weather` is saved (storms + `nextId`). The map
  glides each storm towards its simulated position and draws it as a translucent textured layer.
- **Routes** (`content/routes.ts`, Routes tab): circular (default), north, east, south, west, random. Unlocked with bluetreri +
  items (`unlockRoute`), picked with `chooseRoute`; the pick takes over at the next ring start (`switchRoute` in `nextRing`):
  `reorder` re-sorts the unexplored cells by the route's distance field from camp (`routeField`: anisotropic Dijkstra for the
  four directions, noisy costs for random; any camp-rooted positive field keeps the explored area connected) and renumbers
  the remaining rings. The world is never saved, so `s.plan` ([ring, route] pairs) is replayed with `applyPlan` after
  `createWorld` on load. Ranks and item indices change on a switch: `fetched`, bot targets and `scouted` are carried over by
  cell, and `TickEvents` report map cells, not ranks. Home distance comes from `w.road` (the circular field) at the rover's
  cell. A switch costs one ~0.5 s hitch on the full map (the field's Dijkstra; fields are cached in `w.fields`).
- Items (`content/collection.ts`): pages, notes and photos hidden in ~1/90 cells (`world.item`, `itemRanks`). Collected on
  arrival; the Works tab turns them into books (speed), records (bluetreri) and albums (hold): ×1.1 bonus per work, cost ×1.9 each time.
- Radar: each exploring rover spots items within `radar` cells of its own cell (`nearestItem`, item buckets in the world) and that
  rover fetches it (`trip` 'detour', `target`, at exploring speed × weather). `s.fetched` lists claimed items so exploring does
  not collect them again (pruned in `nextRing`). The detour starts from the rover's cell (`Bot.from`)
  and the straight path to the item (`pathCells`) is revealed as it walks; finished paths are kept in `state.scouted`
  (triples [fromRank, toRank, maxRank], no bluetreri) and dropped in `nextRing` once exploring has passed them.
  On the map: submarine radar (rotating needle, radius = range) around each rover; detected items light up when the
  needle passes and the detour target gets a frame.
- If the rover leaves the view, an arrow at the edge (away from the buttons) points to it; tapping it flies there. The map never moves on its own.
- Terrain (`content/world.ts` `T`): height picks water/rubble/city; in the city, streets every 7 cells (`BLOCK`, camp on a crossing)
  and blocks of buildings; humidity makes urban jungle; separate noise makes dump patches. Tiles in `ui/sprites.ts` (8 variants).
- The currency is **bluetreri** (an invented blue mineral; still `gold` in the code). Legend in the field notes.
- Bottom-left box (`showCell` in `ui/view.ts`): a tapped cell's terrain, bluetreri (or "mined out"), item taken, storm; with nothing
  tapped, the rovers' haul (cargo + `Bot.found` items since leaving camp) and the sky. Tapping the box clears the selection.
- Mined-out cells are drawn drained (desaturated) and lose their deposit crystals; unexplored deposits glint through the fog.
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
  Top bar (bluetreri, rate, ≡ menu with export/import/restart), map in the middle, Rover/Works tabs at the bottom. Dialogs open inside the phone.
- Rendering (`ui/map.ts`): low-resolution canvas (~256 logical px on the short side) scaled with crisp pixels; 16×16 tiles generated by
  code (`ui/sprites.ts`, own palette) up close, flat colour further out and a 4×4 mipmap at zoom 4. Bundled pixel fonts (work offline): `Press Start 2P` for numbers and titles (class/var `--font-num`), `VT323` for text (clear digits; Pixelify Sans was dropped because its 5 looked like an S).
- Current balance (sim, `BASE_SPEED` 0.18 steps/s): zoom 2 ~45 min, zoom 3 ~3 h 15, zoom 4 ~7 h 20, full map ~17 h 30 (the sim does not buy Radar).
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
