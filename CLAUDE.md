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
  hopping between cells (`RICH_HOP` 1.05 × their steps; at 1.4 it was ~2.5 h slower over a game, now about even); it waits for the ring under way to end (ring done is already an event).
  The Miner digs one ring at a time (`DigPath`: `digPath`/`richPath`, cached per world version and ring, with running sums
  of value and steps); in 'rich', `s.dug` is the position along the ring's sequence, so use `isDug`/`dugCells`/`digCell`,
  never `r < s.dug`. A new pick (`s.digPick`) takes over when the Miner starts a ring. **Hauler** (8000, Lv 26, after the Miner): ×0.5 speed (slow, so its trips show on the map), ×12 hold, no drill; parked at
  camp (`trip` 'idle') until a working rover is `s.haulAt` full (0.5; `setHaul` still takes 0.3/0.5/0.8, `HAUL_LEVELS`, and a
  `s.haulPick`, but the I+D Pick-ups sub-tab was removed: neither made a measurable difference) —
  the fullest one, or `s.haulPick` (Scout/Miner) first when it is over the threshold — then drives out (`target` = rover index, `from` = the
  rank where they meet), takes its load and items, and drives them home. A full rover the Hauler is driving to waits instead
  of going home only if the Hauler gets there sooner than its own round trip to camp (`worthWaiting`, decided when the
  hold fills); otherwise it drives home and the Hauler turns back. Reaching the threshold while the Hauler waits is an event too, so `tick` stays exact. `build`/`canBuild` (level via
  `roverLevelNeeded`, price, order) give the new rover the Scout's levels of the parts they share; the Rovers tab picker
  (Scout/Miner/Hauler) shows a Build card for a kind not built yet. Map: Miner orange, Hauler green (`robotFrames(kind)`);
  revealed cells keep their colour (and deposits) until dug out, then drain (`dugTo` in `MapView.render`).
- **Upgrades are per rover** (save v14): `Bot.up` holds each rover's own levels; `GameState.upgrades` holds a fleet base
  level (levels bought before v14) added to every rover. Each kind only has its own parts (`parts`; `hasPart`): Scout Engine,
  Tires, Body, Hold, Radar; Miner Engine, Drill, Tires, Hold; Hauler Engine, Hold. The Hauler takes one rover's load per trip, so its Hold is only offered (`partOffered`: row and tab blink) once some rover's hold is bigger than it; with ×12 base that is rare, and before, it showed a +0.0% gain. `stats(s, b)` (default: the Scout) applies
  the kind's multipliers (`share`, `drill`, radar only on the Scout). `upgradeGain` returns null for the Radar (its Gain column shows the items one more level would put in reach now,
  `itemsInReach`).
  `goldPerSec` estimates Scout + Miner (capped by what the Scout reveals once caught up). The Hauler takes over a share of
  their trips home: each fill of a hold costs it a round trip at its own speed, so it covers `min(1, 1 / busy)` of them and
  the rovers drive the rest (`rateParts`). Before, the estimate assumed nobody drove home once there was a Hauler, which
  made Hold look worthless (the Scout then drove home ~50% of the time). It now tracks what arrives within ~5%.
  The sim buys the best (upgrade, rover) pair (Hauler parts included), builds each rover as soon as it can and saves up for it and the next route; it keeps the Decoder on.
- **Decoder sheets** (save v25): it prints `PAGES_MAX` 20 sheets (`s.pages`), each needing more scraps of lore
  **found** than the last (`pageNeed(w, k)`: cumulative steps growing by `PAGE_COST_GROWTH` 1.15, the last =
  `LORE_PAGE_SHARE` 0.9 of the map's scraps, steps ~3 → ~43 on a full map; scraps are never used up) and taking longer
  (`decodeTime(n)`: 60 s → 30 min, ~3 h in all); `canPrintNext`. Left on it waits for scraps and starts each sheet when
  enough are found; off after the last. Hopper count shows `found/needed` (dim `.short` when short; the heap fills
  between the last sheet's mark and the next), hidden once no sheet is left to start. Texts: `pageText(k)` (placeholder
  until written). Historian goal tiers are sheets: 1/3/8/14/20. v24 saves (one sheet per scrap): as many sheets as
  their scraps printed would open (`legacyPrinted`, `fromLegacyPrinted` in load.ts). Sim: all 20 by ~11 h 43.
- **Library sections** (save v24, `content/library.ts`, `s.library`: -1 locked, >0 seconds left, 0 built): the Library
  tab shows from explorer Lv `LIBRARY_LEVEL` 16 (`libraryOpen`; it stays once a section is started). Bookshelf (Lv 17,
  10 pages, 300, 2 min), Spiral of ages (Lv 20, 10 photos, 800, 4 min), Jukebox (Lv 21, 6 notes, 1.5k, 6 min), Decoder
  (Lv 23, 3 lore scraps found, 3k, 8 min): level + items collected (not spent) + bluetreri (`canBuildSection`,
  `buildSection`), then game time (`buildSections` in `tick`, and in boot's finished-game branch; `ev.built` toasts).
  `canCraft` needs the work's section (`sectionOfWork`), `setDecoder` the Decoder. v23 saves: sections with works made
  (Decoder: printed/on/decoding) stand built. UI: a locked plate (`.lib-lock`, padlock, needs line, Build button, then a
  time bar) in each section's place (`locks`, `drawLocks` every frame while open); the Decoder plate replaces the
  machine and binder. A header (`.lib-head`: THE LIBRARY + magnifying glass `.lib-help`) opens `openLibraryHelp`:
  intro + each built section's `help`. Works rows show `needs the X` / `Library` until built. Sim builds them as soon
  as possible: done 19 h 01 → 19 h 39 (works start later). 375×667 still fits (binder min 84 px).
- **Metal scraps** (save v22; upgrades v23): `world.metalCells` (own draw `rand2(x, y, seed + 7013) < METAL_CHANCE` 1/50, ~10k a map; was 1/150 on solid
  ground away from camp with no deposit, item or lore). I+D › Detector sells the **Metal detector** from explorer Lv
  `DETECTOR_LEVEL` 35 for `DETECTOR_GOLD` 400k (`canBuyDetector`, `buyDetector`). Then the Scout picks up the scraps it
  reveals (ranks ≥ `s.detectFrom`, the end of the ring under way at purchase) and the Miner the ones in ground revealed
  before, as it digs them; `metalCollected` counts them (derived, cached; `s.metalBase` = those already revealed and dug
  at purchase, not counted). Picked up on the spot (no hold, no trip). Upgrades once fitted (`DETECTOR_UPS`, `s.detUps`, `buyDetectorUp`, price `gold` × `growth`^lv): **Coil** (3 levels,
  600k ×3) multiplies every find (`COIL_MULT` ×1–×4); **Sifter** (3 levels, 800k ×3) adds one scrap per `SIFT_EVERY`
  200/100/50 cells dug since the detector (`s.detectDug`; v22 saves get 0, i.e. everything dug, and `metalBase` ×3 for
  the denser map); **Deep scan** (one-off, 1.5M) drops `metalBase` (the ground dug before the detector counts too).
  All derived and retroactive (a level re-values everything collected). I+D › Detector is a thin table (`.det-table`:
  Detector + the three, Part/Lv/Effect/Cost) with the count in `.det-info` under it; the locked Detector shows `Lv 35`. Sim buys them with 2× spare: done
  18 h 27 → 19 h 01, ~35k scraps (was ~2.5k). No use yet: only counted.
- **Goals** (`content/goals.ts`, Goals tab, save v17 `s.goals`): Cartographer (cells explored), Tycoon (bluetreri earned),
  Collector (items found; hold ×1.2), Excavator (cells dug out; drill ×1.25), Engineer (part levels fitted; travel ×1.2), Archivist (lore found), Historian (sheets printed by the Decoder; rover speed ×1.08), 5 tiers each (multipliers raised in v0.36: at ×1.08/1.1/1.1/1.03 those four barely changed a game) (`per` cells/items: shares of
  the map, so small test maps scale). A reached tier is **claimed** by the player (`claimGoal`; never automatic, so stats only
  change on a tap and `tick` stays exact) and multiplies one stat for good (`goalBonus` in `stats()`: speed, loot, cargo,
  drill, travel). The sim claims each tier at once.
- Stats (`content/upgrades.ts`, effect in `core/game.ts` `stats()`), on the **Rovers** tab: Engine (speed),
  Tires (id `tyres`) (`grip`: share of terrain roughness still felt), Body (`armour`: share of storm slowdown, and of a full hold's drag on the drive home (`homeSpeed`), still felt), Hold (cargo),
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
  (`ALGOS` in `core/world.ts`: cost noise, angle jitter, `stray` = chance to leave the patch it sweeps; × `decay` per level). Only Random has jitter:
  on the other routes it made the rovers zig-zag along each ring and cost far more than the route gained (with it, a whole
  game on Circular alone ended in 7 h 35 and with every route in 17 h 50; v0.41 set it to 0).
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
  in `stats` from `activeSector(s, 0)`, i.e. the ring under way; the Hauler is not affected): Circular 1.03, Trail 1.5,
  Scavenger 1.3, Prospector 2.1, Survey 3.2 (v0.41; before, 1.12/1.06/1.24/1.5, a whole game was faster on Circular
  alone). Set so that over a whole game every route pays for itself: skipping any one makes the game longer (see the
  balance notes). Without pace, routes past Circular barely beat it (the Miner digs 60% of every cell whatever the
  order).
  Routes steer only the Scout. The Scavenger (`scavenge`) is the item route: cost pulled by `itemPull` (items within
  `ITEM_REACH` cells, a summed-area table): about +40% items for -8% bluetreri vs Circular; the sim unlocks it but keeps
  its route.
- **Explorer level** (`explorerLevel(xp, total)` in `core/game.ts`, `levelOf(s, w)`): XP = `explorerXp(s, w)`, in cells:
  the mean of the share of the map explored and the share of its bluetreri extracted (`extracted`: the Scout's
  `SCOUT_SHARE` of every revealed cell plus the Miner's share of every dug one), × the map's cells (v0.43; before, cells
  explored alone). Level 1 at `LEVEL_FIRST` (10) cells and each level ×`LEVEL_GROWTH` (1.3) more; the top level (45 on
  1024²) needs the whole map explored **and** dug out. Shown
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
  arrival into the rover's `bag` and added to `s.items` only when it unloads at camp (like the bluetreri; save v13); the Goals tab (work cards after the goals, a pip per work) turns them into books (speed), records (bluetreri) and discoveries (hold; id `album`: photos pieced together into the old world's great inventions in historical order, from Fire to The Space Station): ×1.1 bonus per work, `WORKS_MAX`
  (15) per collection; the tab shows each collection's and the whole library's % complete. **Prices are per map**
  (`workCost(w, id, k)` in `core/game.ts`): each work ×`costGrowth`, a whole collection = `LIBRARY_SHARE` (0.8) of that kind
  on the map (`itemsOnMap`) minus what every route and level asks for (`routeItems`, now extra slack), so the library can always be finished.
  Needed because large seeds (all new games) hide far fewer pages than small ones (~3k vs ~5.2k: item kinds come from the
  low end of `rand2`). Route unlocks and levels **do not spend** items (save v19): they ask for items **collected** in total
  (`itemsCollected`; `routeNeeds(def, lv)` = the unlock's items + `levelItems × k` for each level k), and only the
  bluetreri is paid. Route cards show collected/needed (red while short). Saves v8/v9 and v18 are recounted once on load
  (`s.recount` → `recountItems`: items = collected − spent on works at today's prices, never fewer than before).
- **Lore** (`LORE` in `content/collection.ts`: receipts, concert tickets, propaganda leaflets): scraps of the old world in
  ~1/1500 empty solid cells (`w.lore`, `w.loreCells` ascending = each scrap's number; their own draw, seed + 4001, so the map and
  items do not change). A scrap is found when its cell is revealed (`loreFound`, derived, nothing saved, no detour), floats
  up as an icon, and is read once it has gone through the Library's **Decoder** (sheets: see **Decoder sheets** above; v21 `decodeOn`, `decoding`, `decodeLeft`). It runs in game time (`decode` in core, called from `tick` and, once the map is done, from the frame loop; it also works offline). An amber counter on the printer shows the time left (dim: what the next will take). View: `drawDecoder` each frame derives the stage (drop, flow, print) from the time left. Tap the printer's tray to read the sheets in turn. There is no Archive list. Texts are still to be written:
  `loreText` gives lorem ipsum (`LORE_PLACEHOLDER`, paragraphs split by a blank line) until `LORE_TEXTS` has one. Goal **Archivist** (per: 'lore', bluetreri ×1.03 per tier; a goal
  missing from an older save loads as 0, so no migration). Found items and scraps float up as their icon, not a word.
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
  a full hold blinks brass, notices have a brass frame, restart is red and the ≡ menu button blinks brass on new notes.
- Help = "Field notes" (`helpEntries` in `ui/view.ts`): each entry appears once the player has found what it explains
  (first deposit, first upgrade of each kind, items, works, terrain seen…); the rest shows as "??? to discover".
- The cell a rover explores gains colour (second half of the step; in the first it walks there). Notes: in the ≡ menu (no ? button, to keep the top bar thin); shown by itself on the first game.
- Rover rules: they leave camp (starting cell); **they only reveal the adjacent cell** and a cell counts as revealed when
  they reach it. If the next cell in the order is not adjacent they walk there (steps that reveal nothing).
  Only the Scout reveals; v16 turned old fleets into one Scout (the other rovers, their parts, the Rovers upgrade and their
  load refunded; a ring split between several rovers restarts for the Scout; `toKinds` sets `dug` to the ring start).
- The map **is not saved**: it is regenerated from the `seed` (`core/world.ts`). The exploration order is a Dijkstra expansion from camp
  (cost per terrain + noise) walked by rings and angle: the explored area is always one connected patch (there is a test).
  Offline progress is exact. If generation changes, saves will see a different map.
- Format: **always a portrait phone**. On mobile it fills the screen; on desktop it is a centred 9:19.5 phone frame (`#app` in `style.css`).
  Top bar (bluetreri, rate, metal scraps once the detector is bought (`.metal`, a steel nut and the count), ≡ menu with field notes/export/import/restart), map in the middle, Rovers/I+D/Goals/Library tabs at the bottom. I+D has sub-tabs (Routes, Dig, Detector: `fillRD`; Dig is greyed until the Miner is built). Rover parts, routes, goals and works are thin tables (`table()` in view.ts, `.part-table`/`.part-row`, columns in `--cols` per table; details in tooltips). The panel keeps one height for every tab and rover (`sizePanel`: the tallest, measured in one frame when rovers, routes or width change), so the map never jumps. The Library tab swaps the map for a shelf view (`library-view` over `map-wrap`, `drawShelves`: a shelf per collection, a spine per work, tap for its title; the map is not drawn meanwhile). The library is lit by soft candlelight (`.lib-dark`, CSS only): dim and warm, darker at the edges, with a few warm pools that flicker gently on their own beats (still with reduced motion). Books are old velvet bindings (`VELVET`: blue, black, brown, purple, picked by title) with gilt bands and lettering. Layout: the books shelf across the top; below it (`.lib-lower`) the jukebox across the whole width; then the Decoder; then the archive binder (`ui/binder.ts`, `createBinder`: SVG, black crushed velvet with silver rings, clasp and faded silver title; shut at first (no label while empty), it opens on a tap once there are printed sheets, on sheet 1 on the right; pages go two to a spread like a book (1 | 2-3 | 4-5 …, the last spread n-1 | n when the count is odd, n | blank when even; `at` = the right-hand sheet, always even); the silver arrows beside the book turn the pages: forward turns a leaf over the rings to the left (`bd-out-r` folds up its front, `bd-in-l` brings its back down); the page it covers stays drawn underneath while the leaf turns, so nothing goes blank; arrows (`arrow`): back on the left once past the first spread, forward on the right while there is a next one; a tap on a page opens the reader (`read`, `.lore-reader`: that sheet over the whole phone with margins, yellowed paper, title, full `loreText` in paragraphs scrolling, `n / total`; a tap outside or × closes); a tap on the cover's inside or a blank page shuts it), back turns (`bd-out-l`, `bd-in-r`); under each open page a stack of the sheets on that side (`stack`: up to `STACK_LAYERS` layers in proportion, edges showing outwards), so the left grows and the right shrinks as you read; each page is a yellowed sheet with the scrap's name and number, its `loreText` and `n / total`; open/page are view state only, not saved; redrawn only when that changes so the page turn plays once) (`.machine`, built once in view.ts so its animation survives shelf redraws; stage in `data-stage`: idle, drop, flow, print; `.powered` while on or working). Records live in a wide, square jukebox (`jukebox()`: walnut with brushed-metal face and chrome trim and rivets, a running amber light bar, the record under a chrome window with a tone arm, spinning the picked one, cream title cards A1–E3 in three columns striped in the velvet colours, a speaker grille). Discoveries (the photo collection, id `album`: the old world's inventions, `WorkDef.years` gives each its year) are not on a shelf (`SHOWN`) but on the **spiral of ages** under the books (`ui/timeline.ts`, `createTimeline`: SVG, a wide flat spiral from a flickering fire at its heart outwards, the open end towards a few stars; a gold medallion with a line icon per invention made, dark ? ones after; the curve lit as far as the last made; a tap picks one for the caption, name (year)). The label sits over its top-left corner. The library never scrolls: `.shelves` is `display: contents` so its rows are the library view's own flex items; the spiral row and the binder shrink (keeping their shape; down to 40 px and 100 px) when the phone is short, the plank is 66 px (52 px under 700 px of height), and the binder maps taps through `getScreenCTM` since a shrunk SVG is centred with margins. Checked at 375×667, 375×812 and 412×915. The caption sits above the dark and the panel folds down to the tabs, so the library takes the whole screen (no summary panel). The fold and unfold slide the panel height over 0.32 s (`fold`, `endFold`; the old tab stays in view while folding; instant with reduced motion). Goals has sub-tabs Milestones / Works (`fillGoalTab`); a work's cost is an items bar (`.work-cost`, no icon); its X/Y shows in a bubble over it (`showTip`, `.tip-bubble`) on hover or on a tap that cannot make it. The panel height is capped at `PANEL_MAX` (42%) of the phone; a longer tab scrolls (`.list` overflow). Goals get their own height, enough for every row up to `GOALS_MAX` (75%), and the panel slides up to it and back down (`fold` on every tab change where the height differs). Tabs and the rover picker blink on something new: the Rovers tab (and that kind in the picker) whenever a part can be bought or a rover built. Route rows: the route in use is a radio square, the next step (unlock or level) a bluetreri button, and items still short a thin `.needs` line under the row. Sub-tabs (`.rover-pick`) are smaller than the panel tabs. Dialogs open inside the phone.
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
  above the line and neon below it. The game loop starts only on the tap (and on a new game, on the tap that closes "The arrival"); until then the simulation waits, as do help, offline report and end message (the time away is simulated while loading).
- Phase I splash: a new game opens, after the title tap, with "The arrival" (`ui/arrival.ts`, `showArrival`; then the
  field notes). Pixel art like the title (canvas 96 px wide, height from the screen, redrawn every 100 ms): the ruined
  planet from space, the "Smog giant" (ochre ground from fbm noise turning slowly, bands of yellow smog turning faster,
  4×4 Bayer dither into four light steps, a hazy rim thicker on the lit side) over twinkling stars; "THE ARRIVAL ·
  PHASE I" in Press Start 2P over it (sizes in container units). A tap closes it (ignored for the first second).
- `title.ready()` returns one shared promise (boot waits on it twice: messages and the web update check).
- Phase II: phase I is exploring the planet (bluetreri, items, metal scraps); it ends at the top explorer level (the whole map explored and dug out).
  Reaching it shows the congratulations message (`showComplete`, once per device: what was achieved — cells, bluetreri,
  items, works, printed pages, metal scraps, rovers, time — and that phase II will build a fleet of ships to carry the
  resources to a new planet); its Continue (or loading a game already over whose message was seen, `view.showVoyage`) puts up "The voyage" splash for good (`ui/voyage.ts`, `showVoyage`; it
  fades in; nothing saved; "TAP TO ENTER": a tap after the first second fades it out while the phase II screen
  (`showPhase2`, the mock-up below) fades in over it, both 0.6 s): an SVG robot jellyfish ship, the Black siphon (obsidian plated bell with seams, rivets, red
  windows, a beacon mast and engine ports on a ribbed rim; 12 jointed tentacles redrawn every frame so each joint follows the
  one above, with glowing probe tips) over stars, "THE VOYAGE · PHASE II", "TAP TO ENTER". A ≡ button on it opens the game menu (export, import, restart);
  dialogs opened after it (`.voyage ~ .modal`) sit above it.
  Nothing of phase II is playable yet. **Phase II shell** (mock-up, `ui/phase2.ts`, `showPhase2`, entered from the voyage
  splash, or shown over the game with `?phase2` in the address, `view.showPhase2`; fades in): phase I's layout (top bar with metal scraps as the currency and ≡ menu,
  the Black siphon in dock in the middle via `shipScene` from voyage.ts, tabs Shipyard / Fleet / Cargo / Launch with
  placeholder tables) re-themed by overriding the colour variables on `.p2`: obsidian plates, steel rivets, red for
  lights, bars and the active tab, yellow for buttons you can press and the currency. One panel height for every tab.
- Rendering (`ui/map.ts`): low-resolution canvas (~256 logical px on the short side) scaled with crisp pixels; 16×16 tiles generated by
  code (`ui/sprites.ts`, own palette) up close, flat colour further out and a 4×4 mipmap at zoom 4. Bundled pixel fonts (work offline): `Press Start 2P` for numbers and titles (class/var `--font-num`), `VT323` for text (clear digits; Pixelify Sans was dropped because its 5 looked like an S).
- Current balance (sim, `BASE_SPEED` 0.18 steps/s × the kind's speed; greedy stats, unlocks each route as soon as it can and
  levels the one in use, no Radar): the goal is visible progress at first and then a **big advance every so often, a bit
  further apart each time**. Seed 12345 (with goals claimed, v0.41): Circular ~8 min, zoom 2 ~15 min, Miner ~1 h, zoom 3
  ~2 h, Trail ~3 h 15, Hauler ~3 h 45, Prospector ~6 h 30, Survey ~9 h 50, library ~12 h, full map ~16 h, everything dug
  out ~18 h 50. Engine's `costGrowth` (3.8) is the length knob (with the v0.41 routes: 2.25 → ~6 h 30, 3.0 → ~13 h 30,
  3.5 → ~16 h 30). Routes all pay over a whole game: skipping Trail ends at ~19 h 15, Prospector and Survey ~23 h 45,
  Survey alone ~30 h 50 (the sim then levels the Prospector instead), Circular only ~24 h. Check this (`SKIP=...`) after
  changing route paces, prices or `ALGOS`; `PACE=trail:1.5,...`, `RGOLD=<x>` (route prices ×x, 0 = free) and `ENG=<x>`
  (Engine cost growth) try values without editing content.
  (The sim skips the Scavenger on its path and buys it with spare bluetreri.)
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
  Ablations (what each option is worth): `SKIP=<ids>` never uses those parts, rovers, routes, `routelv`, works, goals;
  `RADAR=<share>` / `HOLD=<share>` buy Radar / Hold whenever a level costs under that share of the bluetreri at hand;
  `DIG=rich`, `HAUL=0.3|0.5|0.8`, `HAULPICK=scout|miner`. `DUMP=<file>` writes the final state as a save: to try that point of the game in the UI, set it as `localStorage['rebuild:save']` on a test origin (fresh.localhost), never the real game. The last line, `SUMMARY`, gives the times of map 50%/100%, the
  library and the end, bluetreri earned at 2/6/12 h and where it was spent. Run the whole list (one line per option) after balance changes and look for options whose `done` barely moves.
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
- `src/ui/`: plain DOM; built once, `render()` only updates texts. Each frame it draws the map and the top bar; the panel (tabs, cards, prices, alerts) is refreshed `PANEL_MS` (100 ms) apart, or on the next frame after any tap (`pointerup` on the root), as it calls many core checks. Derived counts that walk the whole map are cached on what they depend on (`itemsCollected`, `loreFound`, `metalCollected`: per world version and state key); keep new ones the same way if the panel asks for them.

## Deployment
- Web: push to `main` → `.github/workflows/web.yml` (lint, test, build with `BASE_PATH=/<repo>/`) → GitHub Pages.
- Android: tag `v*` → `.github/workflows/android.yml` → signed APK on GitHub Releases. The installed app checks
  the latest release and offers to download it. `versionCode` is derived from the `package.json` version (1.2.3 → 10203).
- Signing key: `tools/new-keystore.sh` (once). Kept outside the repo; secrets `ANDROID_KEYSTORE_BASE64`,
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. If it is lost, phones will not be able to update.
- After changing web code, to try it on Android: `npm run android:sync` (build + `cap sync`).
