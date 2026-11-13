# Rebuild

Idle (incremental) game that runs on the web (PWA on GitHub Pages) and on Android (Capacitor), from **a single codebase**.
Name: **Rebuild** (repo realbluehead/Rebuild, web at https://realbluehead.github.io/Rebuild/). Renaming it means touching `package.json`, `capacitor.config.ts` (appId/appName), `vite.config.ts` (manifest),
`android/` (namespace/applicationId, better to regenerate it) and `GITHUB_REPO` in `src/platform/update.ts`. Do it **before** the first release.

## The game
Exploration idle with a **retro pixel** look, set in a **post-apocalyptic city** (street grid, ruined blocks, towers, rubble,
toxic dumps, toxic water and urban jungle). Top-down view of a 2D map (1024×1024 cells) that starts completely dark;
rovers reveal it on their own, little by little, over time. 4 zoom levels (Street 16 → District 64 → City 256 → Metropolis 1024
cells per side); you start at the closest and the next unlocks when 80% of the current zoom's square is revealed.
- Bottom panel tabs: Rovers, I+D, Library, Goals.
- **Three kinds of rover, at most one of each** (save v16; `Bot.kind`, `ROVER_KINDS` in `content/upgrades.ts`; `s.bots` is
  always Scout first, then Miner, then Hauler). **Scout**: fast (×3 base speed), tiny hold (×0.6); the only one that explores
  (reveals cells, drives rings, explorer level, radar detours) and takes only `SCOUT_SHARE` (0.4) of each cell's bluetreri.
  **Miner** (1000 bluetreri, Lv 14): ×2 speed, ×2 hold, no radar; follows the Scout over revealed cells in rank order and digs
  out the other 60% (`s.dug` = rank up to which everything is dug, fractional; `digTime`/`digGold`: crossing the cells plus
  `share × value / drill` steps, `Drill` upgrade, `BASE_DRILL`/`DRILL_MULT`). It never passes `frontier()`; once it catches
  up it waits (`Bot.walked` = 1 for the Miner) until the Scout is `MINER_GAP` cells ahead (hysteresis, so it does not stop at
  every cell; the wake-up is an event). **Dig order** (save v18, I+D tab › Dig, `chooseDig`): `s.digOrder`
  'follow' (above) or 'rich': each ring the Scout has finished (`k < s.ring`) dug richest cell first (ties by rank),
  hopping between cells (`RICH_HOP` × their steps); it waits for the ring under way to end (ring done is already an event).
  The Miner digs one ring at a time (`DigPath`: `digPath`/`richPath`, cached per world version and ring, with running sums
  of value and steps); in 'rich', `s.dug` is the position along the ring's sequence, so use `isDug`/`dugCells`/`digCell`,
  never `r < s.dug`. A new pick (`s.digPick`) takes over when the Miner starts a ring. **Hauler** (20000, Lv 26, after the Miner): ×0.3 speed (slow on purpose, so its trips show on the map), ×12 hold, no drill; parked at
  camp (`trip` 'idle') until a working rover is `s.haulAt` full (0.3/0.5/0.8, `HAUL_LEVELS`; I+D tab › Pick-ups, `setHaul`) —
  the fullest one, or `s.haulPick` (Scout/Miner) first when it is over the threshold — then drives out (`target` = rover index, `from` = the
  rank where they meet), takes its load and items, and drives them home. A full rover the Hauler is driving to waits instead
  of going home only if the Hauler gets there sooner than its own round trip to camp (`worthWaiting`, decided when the
  hold fills); otherwise it drives home and the Hauler turns back. Reaching the threshold while the Hauler waits is an event too, so `tick` stays exact. `build`/`canBuild` (level via
  `roverLevelNeeded`, price, order) give the new rover the Scout's levels of the parts they share; the Rovers tab picker
  (Scout/Miner/Hauler) shows a Build card for a kind not built yet. Map: Miner orange, Hauler green (`robotFrames(kind)`);
  revealed cells keep their colour (and deposits) until dug out, then drain (`dugTo` in `MapView.render`).
- **Upgrades are per rover** (save v14): `Bot.up` holds each rover's own levels; `GameState.upgrades` holds a fleet base
  level (levels bought before v14) added to every rover. Each kind only has its own parts (`parts`; `hasPart`): Scout Engine,
  Tires, Body, Hold, Radar; Miner Engine, Drill, Tires, Hold; Hauler Engine, Hold. `stats(s, b)` (default: the Scout) applies
  the kind's multipliers (`share`, `drill`, radar only on the Scout). `upgradeGain` returns null for the Hauler and Radar.
  `goldPerSec` estimates Scout + Miner (capped by what the Scout reveals once caught up; no trips home with a Hauler).
  The sim buys the best (upgrade, rover) pair, builds each rover as soon as it can and saves up for it and the next route.
- **Goals** (`content/goals.ts`, Goals tab, save v17 `s.goals`): Cartographer (cells explored), Tycoon (bluetreri earned),
  Collector (items found), Excavator (cells dug out), Engineer (part levels fitted), 5 tiers each (`per` cells/items: shares of
  the map, so small test maps scale). A reached tier is **claimed** by the player (`claimGoal`; never automatic, so stats only
  change on a tap and `tick` stays exact) and multiplies one stat for good (`goalBonus` in `stats()`: speed, loot, cargo,
  drill, travel). The sim claims each tier at once.
- Stats (`content/upgrades.ts`, effect in `core/game.ts` `stats()`), on the **Rovers** tab: Engine (speed),
  Tires (id `tyres`) (`grip`: share of terrain roughness still felt), Body (`armour`: share of storm slowdown still felt), Hold (cargo),
  Radar (range in cells around the Scout), Drill (Miner). Bluetreri comes from every cell (terrain × distance) and from
  deposits. Buying or crafting announces the effect (before→after) in a toast.
- **Rovers on their own** (`state.bots[]`, each with `trip`, `cargo`, travel; the Scout's `prog` along the ring, which is a
  single arc now, `ringRobots` 1). Hold full → back to camp (`trip` home → out → explore, at `TRAVEL_MULT`× the speed; the
  drive home is slower the fuller the hold, `homeSpeed`, `LOAD_DRAG`) and only then is the bluetreri the player's.
  `tick` advances event by event (the point where a hold fills, or gets half full for the Hauler, is found by bisection;
  a look-ahead finds the next cell where the weather changes or the radar would spot something; sky changes are events
  too), so it is exact for any dt (there are tests, with all three kinds).
- **Roughness** (`TERRAINS[].rough`): exploring a cell costs `distance × (1 + grip × (rough − 1))` steps (streets 1, jungle 1.8,
  towers 2.6…). The world keeps `stepBase` and `stepRough` prefix sums; always use `stepsAt(w, grip, r)`. Buying Tyres rescales each
  rover's `prog` so it stays on the same cell (`buy` needs the world). `cost` only decides the exploration order.
- **Weather** (`content/weather.ts`, `core/weather.ts`): every `WEATHER_EPOCH` (12) s of play is a weather step, an event in
  `tick`: `evolveWeather` moves each storm with the shared wind (slowly turning) plus its own drift, grows it when it forms
  and fades it before it dies; at most one new storm forms per step (near the frontier, none before ring 6), ~20% severe
  (`SEVERE_MULT`). Storms are irregular blobs (`stormReach`: seeded lobes by storm id) that slow exploring and detours
  (`weatherFactor`, softened by Body); home/out trips are not affected. `s.weather` is saved (storms + `nextId`). The map
  glides each storm towards its simulated position and draws it as a translucent textured layer, cut to the discovered
  ground (a per-frame pixel mask: nothing shows over the dark).
- **Routes** = discovery algorithms (`content/routes.ts`, I+D tab › Routes), from the least to the most efficient: Random
  (free, every new game starts on it and switches to it at ring 1; no levels, `maxLevel` 0), then the upgrades Circular,
  Trail, Scavenger, Prospector, Survey, each dearer (bluetreri, plus items collected as a requirement, `unlockRoute`). The world is still generated in circular order
  (saves from before Random was the default own Circular and keep it). Upgrades have levels 0..`maxLevel` (`upgradeRoute`,
  `routeUpgradeCost`): a level lowers its **entropy**
  (`ALGOS` in `core/world.ts`: cost noise, angle jitter, `stray` = chance to leave the patch it sweeps; × `decay` per level).
  **The route is the Scout's** (`chooseRoute(s, id)`; `Bot.route` and mixed plan entries `[ring, [route, level][]]` come
  from v15, when each of several rovers explored its own slice of the map: `sectorAt`, `w.slices`, `sliceStarts`; they still
  replay for old saves, and the next ring after one goes back to a single entry).
  A pick/a new level take over at the next ring start (`switchRoute` in `nextRing`, `roverSectors` vs `activeSectors`):
  `reorder` grows the algorithm's field (`algoField`: multi-source Dijkstra from every explored cell over the algorithm's
  per-cell costs, normalised to ~1) and re-sorts the unexplored cells by band, then walks each band cell to adjacent cell
  (`chain`: a cell is placed only next to explored/placed ones, so the explored area stays connected; jumps only when stuck
  or straying). The world is never saved: `s.plan` ([ring, route, level]; old v7 entries are [ring, route] and replay the
  legacy fields, incl. the withdrawn north/south/east/west) is replayed by `applyPlan`, which grows each non-final field only
  as far as the next entry needs and derives once at the end. A live switch costs a ~1 s hitch; each replayed entry ~0.17 s
  on load. Ranks and item indices change on a switch: `fetched`, bot targets and `scouted` are carried over by cell, and
  `TickEvents` report map cells. Home distance comes from `w.road` (the circular field). Measure efficiency with
  `npx vite-node tools/routes.ts -- <warmHours> <runHours>` (bluetreri and cells per algorithm at levels 0/1/max from the
  same mid-game state) whenever `ALGOS` or prices change; keep prices rising with efficiency (there is a test for prices).
  **Pace**: each route has `pace` (Scout and Miner speed × `pace × ROUTE_PACE_LEVEL (1.03)^level`, `routePace`, applied
  in `stats` from `activeSector(s, 0)`, i.e. the ring under way; the Hauler is not affected): Circular 1.03, Trail 1.12,
  Scavenger 1.06, Prospector 1.24, Survey 1.5. Without it, routes past Circular barely beat it (the Miner digs 60% of
  every cell whatever the order), so they were a bluetreri sink once items stopped gating them (v19). Bench (6 h warm,
  2 h run, lv0): Trail 107%, Prospector 116%, Survey 122% of Circular's bluetreri; Scavenger 93% but +35% items.
  Routes steer only the Scout. The Scavenger (`scavenge`) is the item route: cost pulled by `itemPull` (items within
  `ITEM_REACH` cells, a summed-area table): about +40% items for -8% bluetreri vs Circular; the sim unlocks it but keeps
  its route.
- **Explorer level** (`explorerLevel(cells, total)` in `core/game.ts`, `levelOf(s, w)`): XP = cells explored, level 1 at
  `LEVEL_FIRST` (10) cells and each level ×`LEVEL_GROWTH` (1.3) more; the whole map is the top level (45 on 1024²). Shown
  under the top bar (`Lv N/max · %` + thin bar, toast on level up) instead of "% explored". **Gates**: a route needs
  `RouteDef.minLevel` (Circular 6, Trail 24, Scavenger 28, Prospector 32, Survey 38) and its level k `minLevel + ROUTE_LEVEL_STEP (2) × k`
  (`routeLevelNeeded`); the k-th work of a collection needs `WORK_LEVEL_FIRST` (18) … `WORK_LEVEL_LAST` (42) evenly
  (`workLevelNeeded`); both are capped at the map's top level (small test maps). `canUnlockRoute`/`unlockRoute`/
  `canUpgradeRoute`/`upgradeRoute` take the world for this. The I+D Routes sub-tab shows only the owned routes and the **next**
  locked one (the rest as "??? N more routes"); a work or level still out of reach shows as ??? with the level needed.
  The gates sit just below where the sim's greedy player gets there (`npm run sim` prints the level at each advance).
- **Fleet** screen (≡ menu, or tapping the haul box with nothing selected): each rover's trip, hold and `Bot.log`
  (`BotLog`: since, cells, steps, gold, best, items, trips, detours, gaveUp; `since` −1 for rovers from before save v12).
  Each Rover card also shows the estimated gain of one more level in bluetreri/s (`upgradeGain`: storms averaged).
- Items (`content/collection.ts`): pages, notes and photos hidden in ~1/90 cells (`world.item`, `itemRanks`). Picked up on
  arrival into the rover's `bag` and added to `s.items` only when it unloads at camp (like the bluetreri; save v13); the Goals tab (work cards after the goals, a pip per work) turns them into books (speed), records (bluetreri) and albums (hold): ×1.1 bonus per work, `WORKS_MAX`
  (15) per collection; the tab shows each collection's and the whole library's % complete. **Prices are per map**
  (`workCost(w, id, k)` in `core/game.ts`): each work ×`costGrowth`, a whole collection = `LIBRARY_SHARE` (0.8) of that kind
  on the map (`itemsOnMap`) minus what every route and level asks for (`routeItems`, now extra slack), so the library can always be finished.
  Needed because large seeds (all new games) hide far fewer pages than small ones (~3k vs ~5.2k: item kinds come from the
  low end of `rand2`). Route unlocks and levels **do not spend** items (save v19): they ask for items **collected** in total
  (`itemsCollected`; `routeNeeds(def, lv)` = the unlock's items + `levelItems × k` for each level k), and only the
  bluetreri is paid. Route cards show collected/needed (red while short). Saves v8/v9 and v18 are recounted once on load
  (`s.recount` → `recountItems`: items = collected − spent on works at today's prices, never fewer than before).
- End of the game: the tick where the map is done and everything is unloaded sets `s.doneAt` (play time) and
  `TickEvents.completed`; `main.ts` shows the congratulations dialog (also after offline catch-up), once per device. From then on `boot.ts` stops ticking (only the view runs) and the rate at the top shows 0; `fmt` shows anything under 0.005 as 0.
- Radar: each exploring rover spots items within `radar` cells of its own cell (`nearestItem`, item buckets in the world) and that
  rover fetches it (`trip` 'detour', `target`). `s.fetched` lists claimed items so exploring does not collect them again
  (pruned in `nextRing`). The detour starts from the rover's cell (`Bot.from`) and follows the straight path (`pathCells`)
  **at exploring pace** (`detourPlan`: each cell entered costs 1 + grip × (rough − 1) steps, out and back the same way;
  speed × weather at `from`). Each cell reached on the way out (`Bot.walked`) is **mined** unless already explored: its
  bluetreri goes into the hold, its deposit and any item are taken, and the cell joins `s.mined` (map cells; exploring
  gets no bluetreri from them: `arcGold` subtracts `minedBelow`; pruned in `nextRing`). If the hold fills on the way, the
  rover gives up: the item is released and it goes home from that cell (what does not fit is lost). Walked paths are kept
  in `state.scouted` (triples [fromRank, toRank, maxRank]) and dropped once exploring has passed them.
  On the map: submarine radar (rotating needle, radius = range) around each rover; detected items light up when the
  needle passes and the detour target gets a frame.
- If the rover leaves the view, an arrow at the edge (away from the buttons) points to it; tapping it flies there. The map never moves on its own.
- Terrain (`content/world.ts` `T`): height picks water/rubble/city; in the city, streets every 7 cells (`BLOCK`, camp on a crossing)
  and blocks of buildings; humidity makes urban jungle; separate noise makes dump patches. Tiles in `ui/sprites.ts` (8 variants).
- The currency is **bluetreri** (an invented blue mineral; still `gold` in the code). Legend in the field notes.
- Bottom-left box (`showCell` in `ui/view.ts`): a tapped cell's terrain, bluetreri (or "mined out"), item taken, storm; with nothing
  tapped, the rovers' haul (cargo + `Bot.found` items since leaving camp) and the sky. Tapping the box clears the selection.
- Mined-out cells are drawn drained (desaturated) and lose their deposit crystals; unexplored deposits glint through the fog.
- UI style: Verdigris palette (corroded copper: teal-green plates, brass rivets and buttons; tokens on `:root` in style.css). No hazard stripes (removed): the top bar ends in a dark edge,
  a full hold blinks brass, notices have a brass frame, restart is red and the ? button blinks brass on new notes.
- Help = "Field notes" (`helpEntries` in `ui/view.ts`): each entry appears once the player has found what it explains
  (first deposit, first upgrade of each kind, items, works, terrain seen…); the rest shows as "??? to discover".
- The cell a rover explores gains colour (second half of the step; in the first it walks there). Notes: ? button and menu; shown by itself on the first game.
- Rover rules: they leave camp (starting cell); **they only reveal the adjacent cell** and a cell counts as revealed when
  they reach it. If the next cell in the order is not adjacent they walk there (steps that reveal nothing).
  Only the Scout reveals; v16 turned old fleets into one Scout (the other rovers, their parts, the Rovers upgrade and their
  load refunded; a ring split between several rovers restarts for the Scout; `toKinds` sets `dug` to the ring start).
- The map **is not saved**: it is regenerated from the `seed` (`core/world.ts`). The exploration order is a Dijkstra expansion from camp
  (cost per terrain + noise) walked by rings and angle: the explored area is always one connected patch (there is a test).
  Offline progress is exact. If generation changes, saves will see a different map.
- Format: **always a portrait phone**. On mobile it fills the screen; on desktop it is a centred 9:19.5 phone frame (`#app` in `style.css`).
  Top bar (bluetreri, rate, ≡ menu with export/import/restart), map in the middle, Rovers/I+D/Library/Goals tabs at the bottom. I+D has sub-tabs (Routes, Dig, Pick-ups: `fillRD`, one per rover, greyed until that rover is built). Rover parts, routes, goals and works are thin tables (`table()` in view.ts, `.part-table`/`.part-row`, columns in `--cols` per table; details in tooltips). The panel keeps one height for every tab and rover (`sizePanel`: the tallest, measured in one frame when rovers, routes or width change), so the map never jumps. The Library tab swaps the map for a shelf view (`library-view` over `map-wrap`, `drawShelves`: a shelf per collection, a spine per work, tap for its title; the map is not drawn meanwhile) and the panel sums up each collection. Goals has sub-tabs Milestones / Works (`fillGoalTab`); a work's cost is an items bar (`.work-cost`, no icon); its X/Y shows in a bubble over it (`showTip`, `.tip-bubble`) on hover or on a tap that cannot make it. The panel height is capped at `PANEL_MAX` (42%) of the phone; a longer tab scrolls (`.list` overflow). Tabs and the rover picker blink on something new: the Rovers tab (and that kind in the picker) whenever a part can be bought or a rover built. Route rows: the route in use is a radio square, the next step (unlock or level) a bluetreri button, and items still short a thin `.needs` line under the row. Sub-tabs (`.rover-pick`) are smaller than the panel tabs. Dialogs open inside the phone.
- Start-up: `main.ts` only puts the title screen up and then imports `boot.ts` (its own chunk). `boot` reads the save and
  runs `loadWorld` (`load.ts`: `createWorld`, `applyPlan` per entry, `fromLegacy`, `recountItems`, `applyOffline`) in
  `load.worker.ts`, which posts progress and hands back the serialised state, the world (buffers transferred) and the
  offline report; if the worker fails it runs inline. **Map cache** (`save/worldCache.ts`): the worker keeps the built
  `World` in IndexedDB (one entry, tens of MB, tagged with `__APP_BUILD__`; none on the dev server). If its seed matches
  and its plan is the start of the game's plan, `loadWorld` takes it and applies only the newer entries (a load with 4
  routes: 2.4 s → ~0.1 s); it stores the map again when its plan grew. This relies on a replayed plan matching live play
  exactly: `reorder` breaks angle ties by cell index (before that, multi-route saves reloaded with a slightly different
  unexplored order). Testing a production build locally: a service worker caches the
  old chunks, so unregister it first.
- Title screen (`ui/title.ts`): full screen over `#app` while that runs (`title.progress`). Pixel-art canvas ~112 px wide: a scan
  line rises from the street turning the wasteland into a neon city (it chases the progress at most `SCAN_SPEED`, so it
  takes ≥ ~3.3 s); above the line the wasteland has acid clouds with faint distant lightning, smoke from the three tallest ruins and ground fog (`drawStorm`), "RECEIVING DATA…" + bar, then "TAP TO START". Title "REBUILD" in Monoton (`@fontsource/monoton`), dull
  above the line and neon below it. The game loop already runs behind it; help, offline report and end message wait for the tap.
- Rendering (`ui/map.ts`): low-resolution canvas (~256 logical px on the short side) scaled with crisp pixels; 16×16 tiles generated by
  code (`ui/sprites.ts`, own palette) up close, flat colour further out and a 4×4 mipmap at zoom 4. Bundled pixel fonts (work offline): `Press Start 2P` for numbers and titles (class/var `--font-num`), `VT323` for text (clear digits; Pixelify Sans was dropped because its 5 looked like an S).
- Current balance (sim, `BASE_SPEED` 0.18 steps/s × the kind's speed; greedy stats, unlocks each route as soon as it can and
  levels the one in use, no Radar): the goal is visible progress at first and then a **big advance every so often, a bit
  further apart each time**. Seed 12345 (with goals claimed): Circular ~7 min, zoom 2 ~11 min, Miner ~38 min, zoom 3 ~1 h 05,
  Trail ~1 h 30, Hauler ~2 h 35, Prospector ~4 h 25, Survey ~10 h 10, library ~15 h 05, full map ~17 h 15, everything dug
  out ~18 h 35 (the slow Hauler since v0.8 added ~1.5 h); goal tiers fall in between. (The sim skips the Scavenger on its path and buys it with spare bluetreri.)
  **Rate at the top** (`core/rate.ts`, `RateMeter`, fed in boot.ts after every tick): measured, not estimated — what
  reaches camp plus what the holds gained, averaged over `RATE_TAU` (120 s of game time); it starts from the offline
  average (≥10 min away) or from `goldPerSec`. `goldPerSec`/`plannedRate` stay as the model behind the upgrade gains; it
  assumes nobody drives home once there is a Hauler, which overestimates up to ~3× mid-game (the Hauler cannot keep up).
  `RATECHECK=1 npm run sim` compares the meter and the estimate with what really arrives every 30 min.
  `npm run sim` prints this timeline ("Big advances") with the gap before each one; run it whenever prices or speeds change.
  `NOROUTES=1` keeps Random all game (much slower).
- **Everything is in English**: game text (UI, notes, names of terrain/upgrades/items/zooms, manifest), code comments, test names and this file.

## Commands
- `npm run dev`: local server (Vite). Also as `idle-joc` in `../.claude/launch.json`.
- `npm test`, `npm run lint`, `npm run typecheck`.
- `npm run sim -- <hours>`: balance simulator (greedy player), prints when each milestone is reached. Run it whenever numbers in `src/content/` change.
- `npm run android:apk`: debug APK in `android/app/build/outputs/apk/debug/`. Needs `JAVA_HOME` from Android Studio's JDK:
  `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"` (the system Java does not work with Gradle).
- **Versioning** (semver, `npm version <part> --no-git-tag-version` in the same commit; no tag, so no APK): a bug fix bumps the patch, any other change that is not a game-rules change bumps the minor. Rule changes are decided with the user.
- `npm run release -- patch|minor|major`: bumps the version, tags `vX.Y.Z` and pushes → CI publishes the APK to Releases.

## Architecture
- `src/core/`: **pure** simulation (no DOM, clock or storage). All new logic goes here, with tests.
  Big numbers always with `Decimal` from `core/decimal.ts`. Fixed-step loop (`TICK_RATE`).
- `src/content/`: game data (upgrades, terrain, collections…). Adding content should not touch the core.
- `src/save/`: `save.ts` versioned format + migrations; `offline.ts` progress while away (in chunks, capped); `persist.ts` saving with a backup.
  **If `GameState` changes: bump `SAVE_VERSION`, add the migration and a test.** Players' saves must never break.
  Saves from v3 or earlier carry `legacyWalked` (total steps) and `fromLegacy()` turns it into a ring + rovers once the world exists (in `main.ts`).
- `src/platform/`: everything that differs between web and Android (storage, background, local notifications, APK updates).
- Web versions: each build has an id (`__APP_BUILD__`: commit on CI, build time locally, 'dev' on the dev server) and
  writes `version.json` (`version-json` plugin in `vite.config.ts`). After the title tap and whenever the game comes back
  to the foreground, `checkWebUpdate` fetches it uncached; a different build shows "New version available" (once per build
  and session), and "Reload now" saves and calls `hardReload` (unregister the service worker, clear caches, reload with
  `?v=` to skip the HTTP cache; `main.ts` strips it). Native apps use the APK check instead.
- `src/ui/`: plain DOM; built once, `render()` only updates texts.

## Deployment
- Web: push to `main` → `.github/workflows/web.yml` (lint, test, build with `BASE_PATH=/<repo>/`) → GitHub Pages.
- Android: tag `v*` → `.github/workflows/android.yml` → signed APK on GitHub Releases. The installed app checks
  the latest release and offers to download it. `versionCode` is derived from the `package.json` version (1.2.3 → 10203).
- Signing key: `tools/new-keystore.sh` (once). Kept outside the repo; secrets `ANDROID_KEYSTORE_BASE64`,
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. If it is lost, phones will not be able to update.
- After changing web code, to try it on Android: `npm run android:sync` (build + `cap sync`).
