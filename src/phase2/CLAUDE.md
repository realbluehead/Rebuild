# Rebuild · phase II (the voyage)

Phase II: build a fleet of ships to carry what phase I gathered to a new planet. **Its rules are still to be designed**
(decide them with the user); for now the screen is a mock-up with real resources. Paths below are relative to
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
- Phase I's layout (top bar with metal scraps as the currency and ≡ menu, the 3D desert in the middle with a "DRY DOCK 1"
  plate, tabs Shipyard / Fleet / Cargo / Launch) re-themed by overriding the colour variables on
  `.p2` (`ui/phase2.css`, on top of src/shared/ui/style.css): obsidian plates, steel rivets, red for lights, bars and the
  active tab, yellow for buttons you can press and the currency. One panel height for every tab.
- **The desert** (`ui/desert.ts`, `createDesert`, three.js, only in phase II's chunk: phase I imports `../phase2/boot` dynamically, never statically): a real 3D scene with an
  orthographic isometric camera (45° round, ~35° down), rendered at 1/`PX` (2) of the screen and scaled up with crisp
  pixels over a pixel night sky (a canvas drawn once, CSS background). **Plots** (work areas): the ground is `GRID`×`GRID`
  (3×3) plots of `PLOT` (40) units, numbered row by row (AREA k+1); the middle one (`DOCK_PLOT`) is the dry dock, the
  rest are empty for now. Each plot has its own dunes (`duneHeight`, flat towards its edges), with flat lanes between
  (darker strips, red lights at crossings; posts along them looked like rain); the slab top sits just under the
  flattest sand to avoid z-fighting. A tap (a short still press) picks the plot under it (raycast onto the ground
  plane), zooms back in and the view glides to it (`focus`); `createDesert(onPlot)` reports it and the dock plate shows
  its name. Zooming out drifts the view to the ground's centre (all of it fits at `ZOOM_MAX`) and outlines the selected
  plot in yellow. Selection is view state, not saved. In the dock plot: the Black siphon's bell on four
  legs: obsidian plating over `plated` of it, the open sector (ribs and hoops) facing the camera (angles as three's sphere
  `phi`: (−cos, 0, sin)), rim lights, windows, a mast with a blinking beacon; seven tentacles (tubes) on the sand with red
  probe tips; four floodlights (point lights, gently flickering). The camera sways: a bob of `BOB_UNITS` every `BOB_SEC`
  and ±`TURN_DEG` (1°) of turn every `TURN_SEC` (none with reduced motion). Dragging sideways turns it round (`turn`; `DRAG_TURN` per width, only yaw), and it glides
  on a little after a flick (`spin`, `GLIDE_KEEP`). Two fingers (pinch) or the mouse wheel zoom out up to `ZOOM_MAX`
  (4) times `VIEW` (the closest, and the start); the view eases to it (`shown`, `ZOOM_EASE`). Not saved.
- Real so far: the metal count at the top and the Cargo tab's "Have" column (bluetreri, pages, notes, photos). Everything
  else is placeholder rows.

## Testing
- Unit tests next to the code (`*.test.ts`). In the browser, use a test origin (`fresh.localhost`, `copy.localhost`),
  never the player's localhost save: put a phase II export there with the menu's Import, or enter from a finished phase
  I copy; `?phase2` previews without saving.
