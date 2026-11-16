# Rebuild · phase II (the voyage)

Phase II: build a fleet of ships to carry what phase I gathered to a new planet. **Its rules are still to be designed**
(decide them with the user); for now the screen simulates the base's buildings (telescope, power, fuel, fuel storage), 20 levels each. Paths below are relative to
`src/phase2/` unless they start with `src/`.

## Starting point: the legacy
- Phase II starts **only** from `Legacy` (`core/legacy.ts`): what phase I achieved, frozen when the player enters phase
  II. Seed, version, `at` (ms), phase I `playTime`/`doneAt`; `bluetreri` (unspent) and `totalBluetreri` (text Decimals);
  `metal` (scraps the detector picked up); `items` at hand and `collected` (page/note/photo); `works` (book/cd/album);
  `sheets` printed; `lore` found; `cells` explored; `rovers` built.
- Phase I builds it (`legacyOf` in src/phase1/legacy.ts, tested there). **Never import src/phase1/** from here (ESLint
  fails): if phase II needs something more from phase I, add a field to `Legacy` and fill it in `legacyOf` (a phase II
  save made before has it missing: give it a default in a migration).
- `P2State` (`core/state.ts`): `legacy` (never changed), `metal` (phase II's currency, a Decimal), `bluetreri`, `items`
  (brought over, to spend), `playTime`. `newPhase2(legacy)` starts with phase I's resources at hand.

## Save
- `save.ts`: own key `rebuild:p2` (+ backup), own `P2_SAVE_VERSION` and `MIGRATIONS` (independent of phase I's), JSON with
  `phase: 2` so exported texts tell the phases apart (`isPhase2Save`). **If `P2State` changes: bump the version, add the
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
  tips) over stars, "THE VOYAGE · PHASE II", "TAP TO ENTER" (taps ignored for the first second); its ≡ is phase I's menu
  (`.voyage ~ .modal` above it). The tap fades it out while `startPhase2(root, legacy, true)` saves the new phase II
  and fades its screen in (0.6 s); phase I's loop and saving stop.
- `boot.ts`: `run` mounts the screen, runs the frame loop (play time; frames over 5 s are not counted), autosaves every
  30 s and on going to the background, and owns the ≡ menu. New versions (`offerUpdates`): booted straight into phase II,
  it checks after the title tap and each time the game comes back to the foreground; entered from phase I, phase I's
  boot keeps doing it. `?phase2` in the address (on a phase I game) is a
  **preview**: phase II from the current game's legacy, nothing saved, no Import/Restart.

## Screen (`ui/phase2.ts`, `showPhase2` → `render(state)`)
- Phase I's layout (top bar with metal scraps as the currency, the telescope's level and bar, and the ≡ menu; the 3D
  desert in the middle with the selected area's plate; the tab panel below, about 3/7 of the height, its list scrolling)
  re-themed by overriding the colour variables on `.p2` (`ui/phase2.css`, on top of src/shared/ui/style.css): obsidian
  plates, steel rivets, red for lights, bars and the active tab, yellow for buttons you can press and the currency.
- **One tab per building: Telescope / Power / Fuel / Tanks** (`BUILDINGS` in ui/phase2.ts: tab, plate name, plot,
  facility, cost, 3D builder, optional card picture). Each tab: a card (the telescope adds what it sees, a small canvas:
  a ringed planet among stars, sharper with the level, `drawView`) with the building's numbers (`stats`) and a bar
  (`gauge`); **a simulation**: "Lv −"/"Lv +" and the next row's button step its level freely (nothing spent or saved,
  costs shown are suggestions); its 20 upgrades as rows (Built / next / cost). Changing a level rebuilds that building
  on its plot and glides the view there; opening a tab glides to its plot; tapping a building's plot opens its tab. The
  top bar shows the open tab's level.

## Facilities (`core/facility.ts`)
- A building is a `Facility<S>`: `upgrades` (20, one per level: part, name, note, `apply`), `base()`, `stats`,
  `gauge` (0..1 of its best); `specAt(f, level)` folds the upgrades; `facilityCost(level, scale)` suggests costs.
  Tested for all of them in `facility.test.ts` (20 upgrades, clamping, gauge never drops and ends full). **Their rules
  (real costs, saving levels, what each gives the base) are still to be decided with the user**; saving levels means a
  `P2State` field (version bump, migration, test).
- `core/power.ts` (`POWER`, the mirror tower: mirrors, reflectivity, tower height, receiver heat, tracking, salt
  tanks, exchanger, power line, crown; output MW, night store MWh), `core/refinery.ts` (`REFINERY`, the bluetreri
  refinery: hoppers, conveyor, crusher, vats, big vats, burners, purity, centrifuge, columns, pipe rack, pressure core;
  L/min), `core/tanks.ts` (`TANKS`, the tank farm: barrels, upright tanks, spheres, gauges, bund wall, pipe rack,
  hydrants, pump house, filling arms, dock pipeline, cladding, beacon; capacity kL), and the telescope below.

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
  ones (unused ones unlit), so the scene's light count never changes (that recompiles every shader). About 70 draw calls
  with everything at Lv 20 (it was ~1,700); in dev, `__renderer.info.render` in the console.
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
- `tanks3d.ts`: a pallet of barrels, upright tanks (cone roofs, ladders, railings, hazard bands, gauges) inside a bund
  wall, spheres on legs with a girder and a valve, the pipe rack in at x = 17 and a header, hydrants and a foam monitor,
  a pump house, filling arms with hoses, a pipeline off towards the dock, a beacon mast; white cladding at the top.

## The telescope (`core/telescope.ts`, `ui/telescope3d.ts`)
- 20 levels, one upgrade each (`UPGRADES`: part Size / Lenses / Sharpness / Mount / Dome / Mirror / Laser);
  `telescopeAt(level)` folds them into a `Telescope` (aperture, lenses, sharpness, mount tripod → pier → fork, tube
  refractor → reflector → truss, finder, platform, wall, dome, mirror segments 0/7/19, lasers 0/1/3);
  `telescopeRange` (ly) and `upgradeCost` (metal, a suggestion) for the tab. Tested in `telescope.test.ts`. **Its rules
  (real costs, saving the level, what it is for) are still to be decided with the user**; saving the level means a
  `P2State` field (version bump, migration, test).
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
  crisp pixels over a pixel night sky (a canvas drawn once, CSS background).
- **Plots** (work areas): the ground is `GRID`×`GRID` (3×3) plots of `PLOT` (40) units, numbered row by row (AREA k+1).
  The buildings' plots (`TELESCOPE_PLOT` 0 = AREA 1, where the view starts; `POWER_PLOT` 2 = AREA 3; `REFINERY_PLOT`
  5 = AREA 6; `TANKS_PLOT` 8 = AREA 9, by the dock) have their sand cleared flat within `CLEARED`;
  the middle one (`DOCK_PLOT`) is the Black siphon's dry dock; the rest are empty for now. Each plot has its own dunes
  (`duneHeight`, flat towards its edges), with flat lanes between (trodden darker sand, red lights at crossings; posts
  along them looked like rain, flat strips looked stuck on). The sand is textured and tinted per vertex (`SAND_LOW` in
  the hollows to `SAND_HIGH` on the crests, in broad patches with a little speckle, `SAND_LANE` on the lanes), with
  ~700 rocks half sunk in it (only small ones on the telescope's site, none on the dock's); the slab top sits just under the flattest sand to avoid z-fighting. A tap (a short still
  press) picks the plot under it (raycast onto the ground plane), zooms back in and the view glides to it (`focus`);
  `onPlot` reports it and the plate shows its name. Zooming out drifts the view to the ground's centre (all of it fits
  at `ZOOM_MAX`) and outlines the selected plot in yellow. Selection is view state, not saved.
- In the dock plot: the Black siphon's bell on four legs: obsidian plating over `plated` of it, the open sector (ribs
  and hoops) facing the camera (angles as three's sphere `phi`: (−cos, 0, sin)), rim lights, windows, a mast with a
  blinking beacon; seven tentacles (tubes, half sunk in the sand) with red probe tips; four floodlights (point lights,
  gently flickering). Textured like the telescope (plating with rivets and rust, plated segments along the tentacles)
  and settled in: the sand darkened under the bell (baked into the ground's vertex colours), heaps at its feet, crates
  and a stack of spare plates.
- The camera sways: a bob of `BOB_UNITS` every `BOB_SEC` and ±`TURN_DEG` (1°) of turn every `TURN_SEC` (none with
  reduced motion). Dragging sideways turns it round (`turn`; `DRAG_TURN` per width, only yaw), and it glides on a little
  after a flick (`spin`, `GLIDE_KEEP`). Two fingers (pinch) or the mouse wheel zoom out up to `ZOOM_MAX` (4) times
  `VIEW` (the closest, and the start); the view eases to it (`shown`, `ZOOM_EASE`). Not saved.

## Testing
- Unit tests next to the code (`*.test.ts`). In the browser, use a test origin (`fresh.localhost`, `copy.localhost`),
  never the player's localhost save: put a phase II export there with the menu's Import, or enter from a finished phase
  I copy; `?phase2` previews without saving.
