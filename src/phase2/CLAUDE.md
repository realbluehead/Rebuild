# Rebuild · phase II (the voyage)

Phase II: build the ship that carries the expedition to a new planet. Its **core rules are in** (`core/`, below: the
base's economy, the star map, attributes, research, the ship, exact time); **the screens for them are not yet**: the
screen still steps the buildings' levels freely as a simulation (telescope, power, fuel, fuel storage: 20 levels each;
antenna and probes: 15 each), while the economy runs underneath. Paths below are relative to `src/phase2/` unless they
start with `src/`.

## Decided with the user (2026-11-16)
- **Approach: the base is the economy, probes explore a star map.** The base's buildings (power → fuel → storage,
  telescope, antenna, probes, the dry dock) feed each other; probes visit star systems on a small **star map, its own
  screen** (not in the 3D desert), and **come back on their own** with what they found.
- **Length: about three times phase I** (phase I ends at ~19 h of play, so ~55–60 h).
- **It ends when the ship is complete and launched into space**; a **phase III** follows (on the new planet).
- **It runs while the player is away** (offline progress, like phase I): the simulation must be exact for any time
  step from the start (events: probe arrivals, storage full, builds done).
- **Phase I's works are points the player spends** (every finished phase I has all 45: 15 books, 15 records, 15
  discoveries): like levelling a character, each player chooses which of the base's attributes they raise with them.
  Not all at once: an **expedition level** (XP from building upgrades, probes back, systems studied, ship modules,
  research; each level ×1.1 dearer, the last of 45 points around 50 h) gives **one point per level**: the player picks
  which work to use (of those left) and which attribute it raises. Locked works show greyed with a padlock.
  **Six attributes**, each fed by one kind of work: books → **Intelligence** (research speed) or **Perception**
  (telescope and antenna range); records → **Strength** (production: power, refinery, scrap) or **Endurance** (tank
  capacity, probe endurance and reach); discoveries → **Speed** (probe travel, builds) or **Ingenuity** (metal costs).
  Diminishing returns per point (so spreading pays); every path must end in a similar time (check with the sim).
  **Points are never redistributed** (a choice is for good).
- Then implemented as below (the numbers are a first pass from the simulator, to tune once it can be played).

## The economy (`core/`, pure; `economy.ts` holds the rules)
- **Buildings** start at level 1. What each level is worth is a smooth curve per building (`curves.ts`: every level
  counts; the facility files' upgrades are only what the level looks like, and their tab stats show these numbers):
  tower MW, refinery L/min, tanks L, telescope sight ly, antenna hearing ly and data factor, probe reach ly, launches an
  hour, speed ly/h, fuel a launch. An upgrade costs metal (`upgradeMetal`, ×`COST_GROWTH` 1.6 a level) and **crew**
  time (`upgradeSeconds`: 30 s for Lv 2, ×1.45 a level, so the first quarter hour is a build a minute and the late
  levels take hours); **one crew** builds one thing at a time (building levels and ship modules). **Hurry**
  (`hurry`, `hurryCost`) finishes the crew's job now for `HURRY_RATE` (2) seconds of the base's metal per second
  saved: always dearer than waiting, a way to trade metal for time while the crew is busy. Every building
  but the tower draws power (`demandMW`, a share of the tower's curve): short of power, metal, fuel and launches slow
  down by the share covered (`rates().power`).
- **Resources**: metal (the currency; the rovers brought over salvage it, ×research, ×Strength, +4% per study of a
  system, +2% per building level, ×power); **bluetreri** in the siphon's sump (all phase I brought up: the larger of
  `bluetreri`/`totalBluetreri`; a game burns ~8.5M, and a phase I played without the Miner brought too little: once it
  runs low, **metal buys more**, `buyBluetreri`, `BLUETRERI_METAL` 2 a bluetreri, a tank farm's worth at a time), refined 1:1 into **fuel**, held in the tanks (up to their capacity; they start full, so the first probes fly at once); **data** from
  the probes; **samples** (5 kinds) from the probes; the **items** brought over (pages, notes, photos) for research.
- **Star map** (`starmap.ts`, from the legacy's seed, never saved): 16 systems in 4 rings (4–7, 10–20, 25–45, 50–90
  ly), each with a star, a sample kind (all five within the first three rings) and one habitable far system (ring 4):
  the destination. A system can be targeted if the telescope sees it (or it was studied) and probes reach it.
- **Probes**: the player sets a target (a new expedition, or one that never aimed, is aimed at the nearest system on
  boot: `aimFirst`, so the first probe leaves at once and is back in ~8 min); the hangar launches by itself every `launchEvery` while the tanks have the
  launch fuel; each probe flies out and back (`tripSeconds`) and brings back data (by ring, ×antenna, ×research,
  ×Endurance, and only the part the antenna hears if it is farther than its range), a study (1: star and kind; 2 and on:
  samples, ×Endurance, fractional; 3: whether it can be lived on) and XP.
- **Research** (`research.ts`): 20 techs in 5 tiers (4 done open the next tier), one at a time in the lab: data
  (`TIER_DATA`) plus a share of the items of one kind brought over (`TIER_ITEM_SHARE`, so it never locks a player who
  kept few), lab time (`TIER_SECONDS`, ×Intelligence, ×research). Each multiplies one rate (`Effect`).
- **The ship** (`ship.ts`): 10 modules (metal, data, samples, crew time), listed in the order the dock shows them: Frame
  first (cheap, no samples), Tentacles last; once all are built, the destination is
  studied 3 times and the tanks hold `LAUNCH_FUEL`, `launchShip` ends phase II (`launchedAt`).
- **Attributes** (`attributes.ts`): XP from levels built, research, probes back, studies and modules
  (`XP` in economy.ts) gives expedition levels (`xpToNext`, `XP_BASE` ×1.1 a level); each level a point, spent on an
  attribute with a work of its kind (`spendPoint`, `worksLeft`), for good. `attrFactor(points, a)`: each point keeps
  `POINT_KEEP` of the one before, the first worth `POINT_GAIN[a]` (weighed per attribute so paths end close).
- **Time** (`advance.ts`, `advance(s, dt)`): exact for any step. Between events every rate is constant, so it jumps
  from one event to the next (crew or lab done, a probe back, a launch, the tanks full, the fuel for a launch, the sump
  empty); one long step ends where many short ones do (tested). The frame loop and the time away on boot both call it.
- **Balance** (`npm run sim2 -- <hours>`, tools/sim2.ts): a greedy bot plays from the sample legacy. `STRAT=all`
  prints one SUMMARY per strategy (balanced, or all points it can into one attribute). Balanced launches at ~63 h
  with its 45 points at ~47 h; one attribute pushed to 15 (its pair at 0) takes 63–77 h (spreading pays; Frame and
  Tentacles added ~4.5 h). The start is
  tuned so something happens every minute or two (builds, the first probes, the first research at ~22 min: tier 1 is
  6 data); the bot never hurries.

## Starting point: the legacy
- Phase II starts **only** from `Legacy` (`core/legacy.ts`): what phase I achieved, frozen when the player enters phase
  II. Seed, version, `at` (ms), phase I `playTime`/`doneAt`; `bluetreri` (unspent) and `totalBluetreri` (text Decimals);
  `metal` (scraps the detector picked up); `items` at hand and `collected` (page/note/photo); `works` (book/cd/album);
  `sheets` printed; `lore` found; `cells` explored; `rovers` built.
- Phase I builds it (`legacyOf` in src/phase1/legacy.ts, tested there). **Never import src/phase1/** from here (ESLint
  fails): if phase II needs something more from phase I, add a field to `Legacy` and fill it in `legacyOf` (a phase II
  save made before has it missing: give it a default in a migration).
- `P2State` (`core/state.ts`): `legacy` (never changed), `metal` (phase II's currency, a Decimal), `bluetreri` (the
  sump), `items` (brought over, to spend), `playTime`, and the economy: `levels`, `crew`, `lab`, `researched`,
  `modules`, `fuel`, `data`, `samples`, `studies` (per system), `target`, `launchWait`, `probes` out, `xp`, `attrs`,
  `launchedAt`. Times are countdowns in seconds. `newPhase2(legacy)` starts with phase I's resources at hand.

## Save
- `save.ts`: own key `rebuild:p2` (+ backup), own `P2_SAVE_VERSION` and `MIGRATIONS` (independent of phase I's), JSON with
  `phase: 2` so exported texts tell the phases apart (`isPhase2Save`). Reading one back checks every field (`cleanLegacy`,
  `cleanItems` in core/legacy.ts, `amount` in src/shared/decimal.ts): a broken field gets a harmless default, only a
  save with no version or no legacy seed is refused. Writes and wipes go through one queue, in the order asked (an
  overlapping save could undo a wipe). v2 added the economy (v1 → v2: every building at level 1, the sump filled). The menu's Import locks saving before it writes (and unlocks if it fails). **If `P2State` changes: bump the version, add the
  migration and a test** (`save.test.ts`).
- Once this save exists, src/main.ts boots straight into phase II (`boot` here; if it cannot be read, phase I boots):
  none of phase I's code, save or map is loaded (check the network list when touching boot or imports), and phase I's
  built map in IndexedDB (`WORLD_CACHE_DB`, tens of MB) is deleted on entering and on each boot (`dropPhase1Map`).
  Phase I's save is kept untouched. Menu: Export (this save), Import (either phase's text, via src/saves.ts), Restart
  (wipes both phases).

## Flow
- Entering: phase I's end shows "The voyage" splash (`ui/voyage.ts`, `showVoyage`, shown by src/phase1/boot.ts): an SVG
  robot jellyfish ship, the Black siphon (obsidian plated bell with seams, rivets, red windows, a beacon mast and engine
  ports on a ribbed rim; 12 jointed tentacles redrawn every frame so each joint follows the one above, with glowing probe
  tips) over stars, dressed like the title screen and phase I's "The arrival" (`dressSplash`, src/shared/ui/splash.ts, sized in the
  title canvas's pixel, `--px`): "THE
  VOYAGE" in neon Monoton (red) where the title's name sits, "PHASE II" in cyan, the night-violet sky, CRT scanlines
  and a blinking green "TAP TO ENTER" in the title's dark box (taps ignored for the first second); its ≡ is phase I's menu
  (`.voyage ~ .modal` above it). The tap fades the ship to black (the splash's black stays) while `startPhase2(root, legacy, true)` (phase
  II's chunk, with three.js, loads meanwhile) saves the new phase II and fades its screen in over the black; only then
  does the splash go, so nothing of phase I shows in between. Phase I's loop and saving stop. (`?phase2` covers phase
  I's view in black, `.p2-cover`, for the same reason.)
- `boot.ts`: `run` mounts the screen, runs the frame loop (`advance` by each frame's time; on boot, by the time away since the save), autosaves every
  30 s and on going to the background, and owns the ≡ menu. New versions (`offerUpdates`): booted straight into phase II
  (and in the `/phase2` preview), it checks after the title tap and each time the game comes back to the foreground;
  entered from phase I, phase I's boot keeps doing it (a build is offered once a session, whichever phase asks).
  version.json is fetched from the app's base (`BASE_URL`), so `/phase2/` finds it too. `?phase2` in the address (on a phase I game) is a
  **preview**: phase II from the current game's legacy, nothing saved, no Import/Restart. `/phase2` at the end of the
  address (any origin, also on GitHub Pages: the build copies index.html to 404.html) boots straight into the same
  preview from a **sample legacy** (`dev/sample-legacy.json`, the end of a whole simulated game: regenerate it with
  `LEGACY=src/phase2/dev/sample-legacy.json npm run sim -- 24`), without phase I's code or any save read or written
  (`bootSample`).

## Screen (`ui/phase2.ts`, `showPhase2(root, state, openMenu, changed)` → `render(state)`)
- Phase I's layout (top bar, the 3D desert in the middle with the selected area's plate, the tab panel below, its list
  scrolling) re-themed by overriding the colour variables on `.p2` (`ui/phase2.css`, on top of src/shared/ui/style.css):
  obsidian plates, steel rivets, red for lights, bars and the active tab, yellow for buttons you can press and the
  currency. The top bar: metal and what it makes an hour; fuel/capacity, data, power (red when short); the expedition's
  level, points to spend, what the crew is doing; the XP bar.
- **Ten tabs** in two rows of five (`Tab` in `ui/panel.ts`: label, list, `update(s)`, optional plot, scene, `shown`).
  `render` writes the metal every frame and refreshes every tab every `REFRESH_MS` (250 ms; helpers in panel.ts write
  only what changed). Actions call core/economy.ts and then `ctx.changed()` (boot saves, the screen refreshes). The Team
  and Lab tabs blink when something waits (a point to spend; research affordable with the lab free). **News** on the
  scene (top left, `report` compares a `snapshot` each refresh): a probe back (system, data, study), a level built,
  research or a module done, an expedition level; up to `NEWS_MAX` lines, each fading after `NEWS_MS`. Launching the
  ship shows a message once. In dev, the `/phase2` preview's state is `window.__p2` (to poke in the console). A **Speed ×N** button on the scene (src/shared/ui/speed.ts, the same one and setting as
  phase I's) multiplies the time `advance` gets, for testing.
  - **Buildings** (`ui/buildings.ts`, `BUILDINGS`: id, tab, plate name, plot, facility, 3D builder, optional card
    picture): a card (the telescope adds what it sees, `drawView`) with the numbers (`stats`) and a bar (`gauge`) at the
    level reached; the crew's button (next level: metal, crew time), a note (crew busy, short of metal, top level) and, while the crew
    is busy, Hurry (`hurryButton`, also on the Ship tab); the Fuel tab adds the sump (`sumpRow`: what is left, red when
    empty, and Buy once it holds under two tank farms; the Fuel tab blinks, the top bar's fuel turns red and a news
    line says so when it runs dry);
    the Probes tab adds the launches (`launchRow`: where they go, and Stop launches / Resume launches at the last
    target; stopped, no probe leaves and the hangar's 3D stands still in its rest pose, `desert.still`);
    only two upgrade rows: the level reached (Now) and the next (Next / Building); the full list was long and said little. A new level rebuilds the building on its plot.
  - **Map** (`ui/starmap.ts`): shows the star map in the scene in place of the desert (which stops rendering while
    hidden): home, the rings (by the square root of the distance), dashed yellow what the telescope sees, red how far
    probes reach, dotted blue what the antenna hears; the systems seen (grey until studied, then their star's colour;
    the habitable one boxed in green once known), the target, probes out (yellow going, green coming back), and with
    `HINT_SHEETS` (10) sheets of the planet's history a faint mark where the habitable system is. A tap picks a system:
    its card (`describe`: first its samples, in capitals with how many you have and whether probes bring them yet
    (`SAMPLES_FROM`), then its star and, fully studied, whether it is habitable; a probe's trip and data, why it cannot
    be targeted) and "Send probes here"; the hangar line (target, probes out, next launch or the fuel it waits for) with
    "Stop launches"; the systems seen as rows (distance and sample kind, ? until studied). The speed button sits top
    right of the scene (the legend is bottom left).
  - **Lab** (`ui/lab.ts`): research under way (bar, time left), then all research by tier (locked tiers greyed, with
    how many are needed), each with its effect, cost and time. The list always scrolls to what is next to research
    (on opening the tab and whenever it changes; its tier heading above when it starts a tier).
  - **Team** (`ui/team.ts`): level and XP, points to spend, the six attributes (points, effect, factor, works left,
    a pip per work of its kind: used, used by its pair, ready, locked) with "+1". Once every work brought over is used
    (`pointsUseful` false) levels give nothing: the Team tab no longer blinks, the level and XP bar stop ("all works
    used", bar full) and level-up news stops.
  - **Ship** (`ui/ship.ts`, the dock's plot): what the launch still needs (a checklist) and the button (asks first),
    the crew, the modules with each cost part shown met or not.
- Tapping a building's plot (or the dock) opens its tab; opening such a tab glides the view to it.

## Facilities (`core/facility.ts`)
- A building is a `Facility<S>`: `upgrades` (one per level: 20, or 15 for the antenna and probes; `maxLevel(f)`; part, name, note, `apply`), `base()`, `stats`,
  `gauge` (0..1 of its best); `specAt(f, level)` folds the upgrades; their numbers, costs (`powerCost`…) and build
  times come from `curves.ts`. Tested for all of them in `facility.test.ts` (upgrade counts agree with `TOP_LEVEL`,
  clamping, gauge never drops and ends full).
- `core/power.ts` (`POWER`, the mirror tower: mirrors, reflectivity, tower height, receiver heat, tracking, salt
  tanks, exchanger, power line, crown; output MW, night store MWh), `core/refinery.ts` (`REFINERY`, the bluetreri
  refinery: hoppers, conveyor, crusher, vats, big vats, burners, purity, centrifuge, columns, pipe rack, pressure core;
  L/min), `core/tanks.ts` (`TANKS`, the tank farm: barrels, upright tanks, spheres, gauges, bund wall, pipe rack,
  hydrants, pump house, filling arms, dock pipeline, cladding, beacon; capacity kL), `core/antenna.ts` (`ANTENNA`, the
  telecommunications antenna, 15 levels: dishes 2 → 12 → 25 m, guy wires, feed horn, lattice mast 15/30 m, relay drums,
  transmitter hut, tracking, aircraft lights, phased array, laser link; hearing ly, data factor), `core/probes.ts` (`PROBES`,
  the probe hangar, 15 levels: hangar frame → roof → sliding doors, bays 1–3, crane; the probe's solar wings, radio, ion
  engine, instruments, nuclear battery; launcher rail → tower → pad, booster, 3 probes a launch; reach ly, launches an
  hour), and the telescope below.

## Buildings in 3D (`ui/kit3d.ts`, `ui/*3d.ts`)
- Each builder takes the building at its level and returns a `Group` round its plot's centre on the flat sand
  (`desert.setBuilding(plot, group)` places it and frees the old one with `disposeGroup`). `kit3d.ts` holds the shared
  pieces: materials (`steel`, `bright`, `obsidian`, `hazard`, `glow`), `rod`, and the details that settle a building in
  the desert: `shadow`, `heap` (sand drifted against it), `crate`, `barrel`, `ladder`, `railing`, `cable`, `warning`
  lights, work `lamp`, `pipeRack` on H-frames. Keep new buildings textured and detailed the same way.
- **Performance** (keep it): materials are **shared** (`shared(key, make)` in textures.ts; `lambert`, `glow`,
  `steel`…, `textured` and `repeated` all return the same object for the same arguments; never change one after
  making it, make another key instead; `disposeGroup` frees only geometries and unshared materials). The desert draws
  each building, the grid and the dock **merged by material** (`mergeByMaterial`, ui/merge3d.ts: one mesh per material;
  lights and anything with `userData.live`, changed after building like the ship's beacon, are kept apart). Point
  lights: each building plot has a fixed pool of `LIGHTS_PER_BUILDING` (2) lights that take its builder's brightest
  ones (unused ones unlit), so the scene's light count never changes (that recompiles every shader). They are dimmed
  to `LIGHT_SHARE` and reach `LIGHT_REACH` with soft `LIGHT_DECAY` (the dock's floodlights too, `LAMP_POWER`), so light
  washes over the whole ground with the ambient and the moon instead of pooling per plot. About 70 draw calls
  with everything at Lv 20 (it was ~1,700); in dev, `__renderer.info.render` in the console.
- **Every upgrade animates** (each builder maps its 20 upgrades to what moves, in a comment above it): moving parts
  are `animated(part, x, y, z, anim)` (kit3d: `part` built round its pivot, merged by material, kept apart from the
  building's merge as `userData.live`; `o.userData.at` is its rest position; `cycle(t, period, phase)`). The desert
  calls each `anim(o, t)` every frame (t in seconds), and once with t = 0 under reduced motion, so t = 0 is the rest
  pose. Anims change only transforms, `visible` or InstancedMesh matrices, never materials (shared). Many copies
  moving each on its own (mirror panels, bubbles, ore lumps, gauges, pulses along pipes) are one InstancedMesh. About
  15 extra draw calls per building at Lv 20: ~110 in a building's view, ~180 zoomed out, 60 fps. After merging, an anim
  turning a part more than 90° must set all three angles (`rotation.set`).
- **Always connected, at every level**: the fuel line runs refinery → tank farm at every level (on sleepers over the
  sand, `groundPipe`, then on the pipe rack once built; both plots' lines meet at local x = 17 on the lane between
  them), reaching the vats on one side and, on the other, a junction feeding the barrels / the upright tanks' header /
  the spheres / the filling arms / the pump house. The **power grid** (`ui/grid3d.ts`, `buildGrid`, added by the
  desert in world units) is there for every plot whatever the levels: poles between the crossings along the inner
  lanes with two wires (one direction higher so wires never meet), and on each plot a transformer by an inner lane
  (orange light on the mirror tower's plot, the source; green elsewhere) with a drop wire from the nearest pole and a
  cable over the sand into its building (`sites` in desert.ts; empty plots get a cabinet). When a building moves or
  grows, keep its hookup path clear of it.
- `power3d.ts`: mirrors on posts in rings round a tower (`mirrorSpots(n)`: exactly `mirrors` of them, tested) (steel lattice under 10 m, then concrete with bands, a lit door
  and a ladder), a railed grating deck, the receiver glowing by its heat (red → white) with a light, a mast; once
  tracking, each mirror aims between the receiver and the sun (otherwise all face up), and from 900 °C beams show; salt
  tanks with hazard bands, gauges and a hot pipe; an exchanger with fins; pylons with wires; a control shed; spare
  mirrors, crates, a cable, a lamp. Mirrors seen from the camera show their backs (they face the tower and sun).
- `refinery3d.ts`: sacks of ore, then hoppers (hazard rims, glowing ore) over crushers, conveyors with ore on them,
  open vats of blue fuel (rims, bubbles, ladders, spills; on legs over burner rings later), a centrifuge, columns with
  railed platforms, sight glasses and a pilot flame, a pressure core caged in rings, a pipe rack out at x = 17 towards
  the tank farm.
- `antenna3d.ts`: a salvaged dish on a pole, then a lattice mast (15/30 m) with guy wires, relay drums, a service
  lift and red aircraft lights; up to three dishes (the main one 2 → 12 → 25 m, ~14 units across) on motorised mounts,
  a feed horn sending signal rings, a transmitter hut with a generator, phased-array panels scanning, a laser link to
  the sky with data pulses; grid cabinet at (7, 7), hut at (3.5, 10.5).
- `probes3d.ts`: a hangar at the back (open frame → arched roof → sliding doors on +z) with probe bays (probes on
  cradles: solar wings, radio dish, ion engine, instruments, nuclear battery), a gantry crane, a track out to the
  launcher (rail → tower with swing arms → pad with a flame trench) at (−3, 6). A 24 s launch cycle: doors open, the
  probe (on a booster later; three with the fleet) rolls out, is raised, lifts off on a flame and climbs out of sight.
  Grid cabinet at (6.1, −7).
- `tanks3d.ts`: a pallet of barrels, upright tanks (cone roofs, ladders, railings, hazard bands, gauges) inside a bund
  wall, spheres on legs with a girder and a valve, the pipe rack in at x = 17 and a header, hydrants and a foam monitor,
  a pump house, filling arms with hoses, a pipeline off towards the dock, a beacon mast; white cladding at the top.

## The telescope (`core/telescope.ts`, `ui/telescope3d.ts`)
- 20 levels, one upgrade each (`UPGRADES`: part Size / Lenses / Sharpness / Mount / Dome / Mirror / Laser);
  `telescopeAt(level)` folds them into a `Telescope` (aperture, lenses, sharpness, mount tripod → pier → fork, tube
  refractor → reflector → truss, finder, platform, wall, dome, mirror segments 0/7/19, lasers 0/1/3);
  `telescopeRange` (ly, `curves.ts`: what it sees on the star map) and `upgradeCost` (metal) for the tab. Tested in
  `telescope.test.ts`.
- `buildTelescope(t)` draws it at its level round its plot's centre: the tube tilted 40° up, sideways to the starting
  view (so its length shows), on its mount; lens rings glow brighter with sharpness; platform with red lights, wind wall,
  a half dome behind (open towards the view), hexagonal mirror segments, laser beams; a work lamp. Settled in the sand:
  a soft shadow at its foot, a bank of sand against the platform (or heaps at the feet), crates and the lamp's cable.
  (`disposeGroup` in kit3d frees a replaced building and its texture copies, not the shared textures.)
- **Textures** (`ui/textures.ts`): small pixel canvases drawn once, nearest filtered, mostly greys tinted by the
  material colour (`textured`, also here, brightens it to make up): sand (grain, wind ripples, pebbles; `SAND_TILE` units per
  tile), metal plating (seams, rivets, scratches, rust streaks; more rust on the steel), cracked concrete, hazard
  stripes, mirror glass, walkway grating, sacking, and a round shadow alpha map. `repeated(map, x, y)` copies one with its own repeat for a face.

## The desert (`ui/desert.ts`, `createDesert(onPlot, start)` → `{ el, setBuilding, select, stop }`)
- three.js, only in phase II's chunk (phase I imports `../phase2/boot` dynamically, never statically). A real 3D scene
  with an orthographic isometric camera (45° round, ~35° down), rendered at 1/`PX` (2) of the screen and scaled up with
  crisp pixels over a pixel night sky (a canvas drawn once, CSS background). Multisampled (`antialias`, 4×) so
  edges get in-between colours and do not crawl as the view sways, and pixel-snapped: each frame the camera slides
  across its view to whole low-res pixels (bob, glide and zoom move in pixel steps; only the turn is unsnapped).
- **Plots** (work areas): the ground is `GRID`×`GRID` (3×3) plots of `PLOT` (40) units, numbered row by row (AREA k+1).
  The buildings' plots (`TELESCOPE_PLOT` 0 = AREA 1, where the view starts; `ANTENNA_PLOT` 1 = AREA 2; `POWER_PLOT`
  2 = AREA 3; `REFINERY_PLOT` 5 = AREA 6; `PROBES_PLOT` 7 = AREA 8, by the tanks and the dock; `TANKS_PLOT` 8 = AREA 9) have their sand cleared flat within `CLEARED`;
  the middle one (`DOCK_PLOT`) is the Black siphon's dry dock; AREA 4 and AREA 7 are empty for now. The dunes
  (`duneHeight`) run on across the whole ground, with no lanes or edges between plots (the user wanted one desert, not
  visible areas): they only ease flat (smoothstep over `CLEAR_EASE`) round each building's `CLEARED` site, the centre
  and the slab's rim. The sand is textured and tinted per vertex (`SAND_LOW` in
  the hollows to `SAND_HIGH` on the crests, in broad patches with a little speckle), with
  ~700 rocks half sunk in it (only small ones on the telescope's site, none on the dock's); the slab top sits just under the flattest sand to avoid z-fighting. A tap (a short still
  press) picks the plot under it (raycast onto the ground plane), zooms back in and the view glides to it (`focus`);
  `onPlot` reports it and the plate shows its name. Zooming out drifts the view to the ground's centre (all of it fits
  at `ZOOM_MAX`) and outlines the selected plot in yellow. Selection is view state, not saved.
- In the dock plot: the Black siphon (`ui/ship3d.ts`, `buildShip(modules)`, set by `setShip` whenever a module
  is built): the dock starts empty and each module adds its part (the comment at the top of ship3d.ts lists them: frame
  with its scaffolding, plating, tanks, greenhouse, engines, dish, cryo windows, shield ring, core, tentacles). The
  Frame's scaffolding (four lattice towers on the diagonals, `TOWER_AT`, with arms to the rim) holds the bell high
  (`BASE` 20) so what hangs under it shows from the game's camera, and the last module's tentacles hang from under it
  nearly to the sand like the cover's (`TENTACLES` 12 of `JOINTS` 13, each joint turning a little from the one above
  in a wave running down: `HANG`, `WAVE`, `WAVE_SPEED`; instanced segments, joints and red tips, posed every frame).
  Its moving parts are kit3d `animated` and run with the buildings' (`moving`, keyed by `DOCK_PLOT`): the dome
  breathes, the plumes flicker, the dish turns, the shield turns and bobs, the core pulses, the tentacles wave. Around
  it, always: four floodlights (point lights, gently flickering), the sand darkened under the bell (baked into the
  ground's vertex colours), heaps against the towers' feet,
  crates and a stack of spare plates.
- The camera sways: a bob of `BOB_UNITS` every `BOB_SEC` and ±`TURN_DEG` (1°) of turn every `TURN_SEC` (none with
  reduced motion). Dragging sideways turns it round (`turn`; `DRAG_TURN` per width, only yaw), and it glides on a little
  after a flick (`spin`, `GLIDE_KEEP`). Two fingers (pinch) or the mouse wheel zoom out up to `ZOOM_MAX` (4) times
  `VIEW` (the closest, and the start); the view eases to it (`shown`, `ZOOM_EASE`). Not saved.

## Testing
- Unit tests next to the code (`*.test.ts`). In the browser, use a test origin (`fresh.localhost`, `copy.localhost`),
  never the player's localhost save: put a phase II export there with the menu's Import, or enter from a finished phase
  I copy; `?phase2` previews without saving.
