// Phase II's scene: the Black siphon being built on a night desert, rendered in real 3D (three.js) with an isometric
// (orthographic) camera, at a low resolution scaled up with crisp pixels. Dunes, the obsidian bell half plated (the rest
// still ribs) on four legs, its tentacles laid out on the sand, and floodlights casting warm pools. The camera sways
// gently (a slow bob up and down and ±1° of turn) so the scene never looks frozen, and a finger dragged sideways turns
// it round (only round: the height of the view never changes), with a little glide after letting go. Two fingers (or
// the mouse wheel) zoom out, up to ZOOM_MAX times as much ground, and back in to the starting view.
// The ground is a GRID × GRID of plots (work areas), each about one closest view; the middle one is the Black siphon's
// dry dock. Zoomed out, the whole ground shows; a tap on a plot selects it and the view glides in to it.
import {
  AmbientLight, BoxGeometry, BufferAttribute, CatmullRomCurve3, Color, CylinderGeometry, DirectionalLight, Fog,
  Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, OrthographicCamera, PlaneGeometry, PointLight, Scene, SphereGeometry,
  TorusGeometry, TubeGeometry, Vector3, WebGLRenderer, InstancedMesh, Object3D, LineLoop, LineBasicMaterial,
  BufferGeometry, Raycaster, Plane, Vector2, DodecahedronGeometry, Float32BufferAttribute,
} from 'three';
import { disposeGroup, type Anim } from './kit3d';
import { buildGrid } from './grid3d';
import { mergeByMaterial } from './merge3d';
import { metalTexture, repeated, SAND_HIGH, SAND_LANE, SAND_LOW, SAND_TILE, sandTexture, shared, textured } from './textures';

/** A plot's side, plots per side of the ground and the ground's side, in world units (one unit ~ one voxel of the
 *  mock-up). Plots are numbered row by row (0..GRID²-1); the middle one is the dry dock. */
export const PLOT = 40;
export const GRID = 3;
const SIZE = PLOT * GRID;
export const DOCK_PLOT = (GRID * GRID - 1) / 2;
/** The base's buildings' plots: the giant telescope (AREA 1), the mirror tower (power, AREA 3), the bluetreri
 *  refinery (fuel, AREA 6) and the tank farm (fuel storage, AREA 9). */
export const TELESCOPE_PLOT = 0;
export const POWER_PLOT = 2;
export const REFINERY_PLOT = 5;
export const TANKS_PLOT = 8;
/** The telecommunications antenna (AREA 2) and the probe hangar with its launcher (AREA 8, by the tanks and the dock). */
export const ANTENNA_PLOT = 1;
export const PROBES_PLOT = 7;
const BUILDING_PLOTS = [TELESCOPE_PLOT, POWER_PLOT, REFINERY_PLOT, TANKS_PLOT, ANTENNA_PLOT, PROBES_PLOT];
/** Radius of the sand cleared (flat) round a building's plot centre. */
const CLEARED = 17;
/** Centre of plot `k`, and the plot under (x, z) (clamped to the ground). */
const CENTRES = Array.from({ length: GRID * GRID }, (_, k) =>
  new Vector3(((k % GRID) - (GRID - 1) / 2) * PLOT, 0, (Math.floor(k / GRID) - (GRID - 1) / 2) * PLOT));
/** (Shared: read it, never change it.) */
const plotCentre = (k: number): Vector3 => CENTRES[k];
/** Point lights a building may have (its brightest; the rest are dropped). Every building plot always holds this many,
 *  unlit when unused, so the scene's light count never changes (a change recompiles every shader: a hitch). */
const LIGHTS_PER_BUILDING = 2;
const plotAt = (x: number, z: number) => {
  const c = (v: number) => Math.max(0, Math.min(GRID - 1, Math.floor((v + SIZE / 2) / PLOT)));
  return c(z) * GRID + c(x);
};
/** Screen pixels per rendered pixel (the pixel-art look). */
const PX = 2;
/** World units across the view (the diorama's corners may leave the screen). */
const VIEW = 44;
/** The sway: seconds per bob and per turn, and how far. */
const BOB_SEC = 7;
const BOB_UNITS = 0.9;
const TURN_SEC = 11;
const TURN_DEG = 1;
/** Turn for a drag across the whole view (radians), and how fast the glide after a drag dies away (share kept per second). */
const DRAG_TURN = Math.PI;
const GLIDE_KEEP = 0.04;
/** Furthest zoom out (times `VIEW`; 1 = the closest), wheel step, and how fast the view eases to the zoom picked (per second). */
const ZOOM_MAX = 4;
const WHEEL_ZOOM = 0.0015;
const ZOOM_EASE = 12;

const OBSIDIAN = '#3a3c48';
const STEEL = '#4a4e58';
const RED = '#ff2a3a';
const LAMP = '#fff2b0';

/** Dune height at (x, z) (world units, 0.8 = the flat sand of the lanes between plots and round the slab's edge). */
function duneHeight(x: number, z: number): number {
  const local = (v: number) => ((((v + SIZE / 2) % PLOT) + PLOT) % PLOT) - PLOT / 2;
  const edge = PLOT / 2 - Math.max(Math.abs(local(x)), Math.abs(local(z)));
  const near = Math.min(...BUILDING_PLOTS.map((k) => { const c = plotCentre(k); return Math.hypot(x - c.x, z - c.z); }));
  const clear = Math.max(0, Math.min(1, (near - CLEARED) / 4));
  const fade = Math.max(0, Math.min(1, (edge - 1.5) / 5)) * clear;
  const h = 1.2 + Math.sin((x * 0.8 + z * 0.35) / 3.2) * 0.9 + Math.sin(x / 7.3 + 1.7) * Math.cos(z / 6.1) * 1.3;
  return 0.8 + Math.max(0, h) * fade;
}

const lambert = (c: string, flat = true) => shared(`dl|${c}|${flat}`, () => new MeshLambertMaterial({ color: c, flatShading: flat }));
const glow = (c: string) => shared(`dg|${c}`, () => new MeshBasicMaterial({ color: c }));

function buildScene(): { scene: Scene; beacon: Mesh; lamps: PointLight[]; outline: LineLoop } {
  const scene = new Scene();
  scene.fog = new Fog('#141a34', 230, 380);

  // Ground: a slab with displaced dunes on top, textured sand (grain, ripples) tinted per vertex: darker in the hollows,
  // lighter on the crests, in broad patches, and trodden darker along the lanes between plots.
  const ground = new PlaneGeometry(SIZE, SIZE, SIZE, SIZE);
  ground.rotateX(-Math.PI / 2);
  const pos = ground.getAttribute('position') as BufferAttribute;
  const uv = ground.getAttribute('uv') as BufferAttribute;
  const colours: number[] = [];
  const low = new Color(SAND_LOW), high = new Color(SAND_HIGH), laneC = new Color(SAND_LANE), c = new Color();
  const local = (v: number) => Math.abs(((((v + SIZE / 2) % PLOT) + PLOT) % PLOT) - PLOT / 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = duneHeight(x, z);
    pos.setY(i, y);
    uv.setXY(i, x / SAND_TILE, z / SAND_TILE); // (the texture repeats in world units)
    const grain = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; // (a hash: a little speckle per vertex)
    const patch = Math.sin(x / 9.7 + 0.6) * Math.cos(z / 12.3 - 1.1) * 0.7 + Math.sin((x - z) / 5.3) * 0.25 + (grain - Math.floor(grain) - 0.5) * 0.25;
    c.copy(low).lerp(high, Math.max(0, Math.min(1, (y - 0.8) / 3 + patch * 0.35)));
    const onLane = Math.max(0, Math.min(1, (Math.max(local(x), local(z)) - (PLOT / 2 - 1.6)) / 1.2));
    c.lerp(laneC, onLane * 0.8);
    // The ship's shade on the sand under its bell (darkest at the middle).
    c.multiplyScalar(0.5 + 0.5 * Math.max(0, Math.min(1, (Math.hypot(x, z) - 5) / 8)));
    colours.push(c.r, c.g, c.b);
  }
  ground.setAttribute('color', new Float32BufferAttribute(colours, 3));
  ground.computeVertexNormals();
  scene.add(new Mesh(ground, new MeshLambertMaterial({ map: sandTexture(), vertexColors: true, flatShading: true })));
  const slab = new Mesh(new BoxGeometry(SIZE, 5, SIZE), new MeshLambertMaterial({ color: '#3a3a5a', map: repeated(sandTexture(), SIZE / SAND_TILE, 0.6) }));
  slab.position.y = 0.75 - 2.5; // (just under the flattest sand, so they never fight for the same pixels)
  scene.add(slab);

  // The bell on its four legs: half plated in obsidian, the rest still ribs and hoops.
  const ship = new Group();
  const base = 8;
  ship.position.y = duneHeight(0, 0) + base;
  for (const [x, z] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) {
    const leg = new Mesh(new CylinderGeometry(0.35, 0.35, base + 2, 5), textured(STEEL, metalTexture(0.7)));
    leg.position.set(x, -base / 2 - 1, z);
    ship.add(leg);
  }
  const R = 8;
  // Angles go round the bell as three.js's sphere does (phi: (-cos, 0, sin)). The camera looks from phi ~ 3π/4, so the
  // open sector (still ribs) faces it and the plated one is behind.
  const at = (phi: number, r: number, y: number) => new Vector3(-Math.cos(phi) * r, y, Math.sin(phi) * r);
  const plateFrom = Math.PI, plated = Math.PI * 1.25; // the sector already plated
  const openFrom = plateFrom + plated - Math.PI * 2, open = Math.PI * 2 - plated;
  const shell = new Mesh(new SphereGeometry(R, 20, 8, plateFrom, plated, 0, Math.PI / 2), textured(OBSIDIAN, repeated(metalTexture(0.25), 6, 3), true));
  ship.add(shell);
  const steel = textured(STEEL, metalTexture(0.6));
  for (let k = 0; k <= 6; k++) { // meridian ribs over the open sector
    const rib = new Mesh(new TorusGeometry(R, 0.18, 4, 12, Math.PI / 2), steel);
    rib.rotation.y = openFrom + (k / 6) * open + Math.PI; // (the torus arc starts at +x and rises to +y)
    ship.add(rib);
  }
  for (const lat of [0.35, 0.75, 1.15]) { // hoops
    const hoop = new Mesh(new TorusGeometry(R * Math.cos(lat), 0.15, 4, 24, open), steel);
    hoop.rotation.x = Math.PI / 2; // lying flat: its arc runs (cos t, 0, sin t), t = π − phi
    const turn = new Group();
    turn.rotation.y = -(Math.PI - (openFrom + open)); // start the arc at the open sector's far end
    turn.position.y = R * Math.sin(lat);
    turn.add(hoop);
    ship.add(turn);
  }
  const rim = new Mesh(new TorusGeometry(R + 0.6, 0.6, 5, 32), textured('#3a3e48', repeated(metalTexture(0.5), 1, 10)));
  rim.rotation.x = Math.PI / 2;
  ship.add(rim);
  const red = glow(RED);
  for (let k = 0; k < 16; k++) { // lights on the rim, and windows on the plated side
    const a = (k / 16) * Math.PI * 2;
    const light = new Mesh(new BoxGeometry(0.6, 0.5, 0.6), red);
    light.position.set(Math.cos(a) * (R + 1.2), 0, Math.sin(a) * (R + 1.2));
    ship.add(light);
  }
  for (let k = 0; k < 7; k++) {
    const y = 2.2;
    const win = new Mesh(new BoxGeometry(0.7, 0.5, 0.7), red);
    win.position.copy(at(plateFrom + ((k + 0.5) / 7) * plated, Math.sqrt(R * R - y * y) + 0.05, y));
    ship.add(win);
  }
  const mast = new Mesh(new CylinderGeometry(0.15, 0.15, 4, 4), steel);
  mast.position.y = R + 2;
  ship.add(mast);
  const beacon = new Mesh(new SphereGeometry(0.5, 6, 4), glow(RED));
  beacon.position.y = R + 4.3;
  beacon.userData.live = true; // (it blinks)
  ship.add(beacon);
  // The dock (ship, tentacles, clutter, floodlights) is drawn merged by material (merge3d.ts).
  const dock = new Group();
  dock.add(ship);

  // Tentacles laid out on the sand, each ending in a glowing probe.
  const tentacle = textured('#2c2f37', repeated(metalTexture(0.4), 10, 1), false, false); // (segment plates along it)
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.3;
    const pts: Vector3[] = [];
    for (let t = 0; t <= 15; t++) {
      const r = 8 + t, w = Math.sin(t / 2.5 + k) * 1.6;
      const x = Math.cos(a) * r - Math.sin(a) * w, z = Math.sin(a) * r + Math.cos(a) * w;
      if (Math.abs(x) > PLOT / 2 - 2 || Math.abs(z) > PLOT / 2 - 2) break; // (they stay inside the dock's plot)
      pts.push(new Vector3(x, duneHeight(x, z) + 0.25, z)); // (half sunk in the sand)
    }
    if (pts.length < 3) continue;
    dock.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), pts.length * 3, 0.45, 5), tentacle));
    const tip = new Mesh(new SphereGeometry(0.6, 6, 4), red);
    tip.position.copy(pts[pts.length - 1]);
    dock.add(tip);
  }

  // Settled in the sand: heaps drifted against its feet, crates of parts and a stack of spare plates by the dock.
  const sandHeap = textured(SAND_LOW, repeated(sandTexture(), 0.4, 0.4));
  for (const [x, z] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) {
    const heap = new Mesh(new SphereGeometry(1.2, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), sandHeap);
    heap.scale.y = 0.4;
    heap.position.set(x, duneHeight(x, z) - 0.1, z);
    dock.add(heap);
  }
  const crate = textured('#5a4e40', metalTexture(1));
  for (const [x, z, s, a] of [[-15, 1, 1.6, 0.3], [-16.5, 2.6, 1.1, 1.1], [-14.4, 3, 0.9, 0.7], [3, 15, 1.4, 0.2], [4.6, 16, 1, 0.9]]) {
    const box = new Mesh(new BoxGeometry(s, s * 0.8, s), crate);
    box.position.set(x, duneHeight(x, z) + s * 0.3, z);
    box.rotation.y = a;
    dock.add(box);
  }
  const plates = textured(OBSIDIAN, metalTexture(0.25));
  for (let k = 0; k < 5; k++) {
    const plate = new Mesh(new BoxGeometry(3.2, 0.22, 2.2), plates);
    plate.position.set(15 + k * 0.12, duneHeight(15, 2) + 0.15 + k * 0.24, 2 + k * 0.1);
    plate.rotation.y = 0.4 + k * 0.08;
    dock.add(plate);
  }

  // Floodlights: a pole, a lamp and the warm pool it casts.
  const lamps: PointLight[] = [];
  for (const [x, z] of [[-14, 8], [12, -14], [14, 12], [-10, -12]]) {
    const y0 = duneHeight(x, z);
    const pole = new Mesh(new CylinderGeometry(0.25, 0.25, 12, 4), steel);
    pole.position.set(x, y0 + 6, z);
    const lamp = new Mesh(new BoxGeometry(1.6, 0.8, 0.8), glow(LAMP));
    lamp.position.set(x, y0 + 12.2, z);
    const light = new PointLight(LAMP, 260, 20, 1.5);
    light.position.set(x, y0 + 11, z);
    dock.add(pole, lamp, light);
    lamps.push(light);
  }
  scene.add(mergeByMaterial(dock));

  // The plots' borders: the lanes are trodden darker sand (the ground's colours), with a red light where lanes cross.
  // (Posts along the lanes looked like rain at the closest zoom; flat strips over the sand looked stuck on.)
  const crossings: [number, number][] = [];
  for (let i = 0; i <= GRID; i++) {
    const a = -SIZE / 2 + i * PLOT;
    for (let j = 0; j <= GRID; j++) crossings.push([a, -SIZE / 2 + j * PLOT]);
  }
  const place = (mesh: InstancedMesh, at: [number, number][], y: number) => {
    const o = new Object3D();
    at.forEach(([x, z], k) => { o.position.set(x, y, z); o.updateMatrix(); mesh.setMatrixAt(k, o.matrix); });
    scene.add(mesh);
  };
  place(new InstancedMesh(new BoxGeometry(0.7, 0.7, 0.7), red, crossings.length), crossings, 1.5);

  // Rocks half sunk in the sand, scattered (none on the dock's site, only small ones on the buildings' sites).
  let seed = 23;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rocks = new InstancedMesh(new DodecahedronGeometry(1, 0), lambert('#4a4862'), 700);
  const o = new Object3D();
  let n = 0;
  while (n < rocks.count) {
    const x = (rnd() - 0.5) * (SIZE - 2), z = (rnd() - 0.5) * (SIZE - 2), s = 0.25 + Math.pow(rnd(), 3) * 1.1;
    const rx = rnd(), ry = rnd(), sy = 0.5 + rnd() * 0.4;
    const fromSite = Math.min(...BUILDING_PLOTS.map((k) => { const c = plotCentre(k); return Math.hypot(x - c.x, z - c.z); }));
    if (Math.hypot(x, z) < 14 || fromSite < 4 || (fromSite < CLEARED + 2 && s > 0.45)) continue; // (small ones on the sites: under platforms, among mirrors)
    o.position.set(x, duneHeight(x, z) - s * 0.25, z);
    o.rotation.set(rx * 3, ry * 6, 0);
    o.scale.set(s, s * sy, s * (0.7 + rx * 0.5));
    o.updateMatrix();
    rocks.setMatrixAt(n++, o.matrix);
  }
  scene.add(rocks);

  // The power grid: poles along the lanes, a transformer on every plot and a cable into its building.
  scene.add(mergeByMaterial(buildGrid({
    plots: GRID, side: PLOT, centre: plotCentre, height: duneHeight, source: POWER_PLOT,
    sites: {
      [TELESCOPE_PLOT]: { path: [[18, 18], [13, 12], [6, 5], [0, 0]] },
      [POWER_PLOT]: { path: [[-18, 18], [-12, 9], [-6, 1], [-3, -3]] },
      [REFINERY_PLOT]: { path: [[-18, -18], [-6, -17], [-2, -8], [-2, -2]] },
      [TANKS_PLOT]: { path: [[-18.5, -12], [-17.5, 0], [-15, 7]], cabinet: true },
      [DOCK_PLOT]: { path: [[18, -18], [12, -12], [6, -6]] },
      [ANTENNA_PLOT]: { path: [[18, 18], [13, 13], [7, 7]] },
      [PROBES_PLOT]: { path: [[18, -18], [13, -13], [7, -7]] },
    },
  })));

  // The selected plot's outline (shown while zoomed out).
  const e = PLOT / 2 - 0.8;
  const outline = new LineLoop(
    new BufferGeometry().setFromPoints([new Vector3(-e, 0.9, -e), new Vector3(e, 0.9, -e), new Vector3(e, 0.9, e), new Vector3(-e, 0.9, e)]),
    new LineBasicMaterial({ color: '#ffd23a', transparent: true }));
  scene.add(outline);

  scene.add(new AmbientLight('#6a7aaa', 1.2));
  const moon = new DirectionalLight('#b8c8f8', 1.4);
  moon.position.set(-30, 40, -10);
  scene.add(moon);
  return { scene, beacon, lamps, outline };
}

/** A night sky of pixel stars and a crescent moon, drawn once (the 3D view is transparent over it). */
function skyBackground(): string {
  const w = 180, h = 240; // (about PX screen pixels per sky pixel on a phone, like the scene)
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#05060e'); grad.addColorStop(0.6, '#141a34'); grad.addColorStop(1, '#2a2a4a');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.75})`; g.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h * 0.7), 1, 1); }
  g.fillStyle = '#e8e8f0'; g.beginPath(); g.arc(33, 30, 9, 0, 7); g.fill();
  g.fillStyle = '#05060e'; g.beginPath(); g.arc(37, 27, 7.5, 0, 7); g.fill();
  return c.toDataURL();
}

export interface Desert {
  el: HTMLElement;
  /** Puts `building` (built round the origin) on plot `k`, replacing what stood there. */
  setBuilding(k: number, building: Group): void;
  /** Selects plot `k` (the view glides in to it; `onPlot` is not called). */
  select(k: number): void;
  stop(): void;
}

/** The 3D desert, filling its parent (call `stop` to end the animation). `onPlot` hears which plot the player taps;
 *  the view starts on plot `start`. */
export function createDesert(onPlot: (k: number) => void = () => {}, start = DOCK_PLOT): Desert {
  const el = document.createElement('div');
  el.className = 'p2-desert';
  el.style.backgroundImage = `url(${skyBackground()})`;
  // Multisampled: edges get in-between colours at the low resolution, so they no longer crawl as the view sways.
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  if (import.meta.env.DEV) (window as unknown as { __renderer: WebGLRenderer }).__renderer = renderer; // (draw calls, in the console)
  renderer.setPixelRatio(1);
  renderer.setClearColor(new Color('#000000'), 0);
  el.append(renderer.domElement);

  const { scene, beacon, lamps, outline } = buildScene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 600);
  /** The plot selected, and the point the view centres on (easing to it; it drifts to the ground's centre as the view
   *  zooms out, so the whole ground fits). */
  let plot = start;
  const focus = plotCentre(plot).clone();
  const target = new Vector3();
  const right = new Vector3(), up = new Vector3();
  const buildings = new Map<number, Group>();
  /** Each building's animated parts. */
  const moving = new Map<number, Group[]>();
  const pools = new Map(BUILDING_PLOTS.map((k) => [k, Array.from({ length: LIGHTS_PER_BUILDING }, () => {
    const l = new PointLight('#ffffff', 0);
    scene.add(l);
    return l;
  })]));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Zoom picked (1..ZOOM_MAX) and the one shown, easing towards it. */
  let zoom = 1, shown = 1;
  const frustum = () => {
    const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
    const half = (VIEW * shown) / 2, aspect = h / w;
    camera.left = -half; camera.right = half; camera.top = half * aspect; camera.bottom = -half * aspect;
    camera.updateProjectionMatrix();
  };
  const resize = () => {
    renderer.setSize(Math.ceil(Math.max(1, el.clientWidth) / PX), Math.ceil(Math.max(1, el.clientHeight) / PX), false);
    frustum();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();

  // One finger dragged sideways turns the scene round its centre; two fingers pinch the zoom (no turning meanwhile).
  let turn = 0, spin = 0, dragX: number | null = null, lastMove = 0, lastFrame = performance.now();
  const fingers = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; zoom: number } | null = null;
  /** Where and when the last single finger went down, and how far it has moved: a short still press is a tap. */
  let press: { x: number; y: number; at: number; moved: number } | null = null;
  const ray = new Raycaster(), ground = new Plane(new Vector3(0, 1, 0), -0.8), hit = new Vector3();
  const tapPlot = (cx: number, cy: number) => {
    const r = el.getBoundingClientRect();
    ray.setFromCamera(new Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
    if (!ray.ray.intersectPlane(ground, hit) || Math.abs(hit.x) > SIZE / 2 || Math.abs(hit.z) > SIZE / 2) return;
    plot = plotAt(hit.x, hit.z);
    zoom = 1;
    spin = 0;
    onPlot(plot);
  };
  const spread = () => { const [a, b] = [...fingers.values()]; return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)); };
  const setZoom = (z: number) => { zoom = Math.min(ZOOM_MAX, Math.max(1, z)); };
  el.addEventListener('pointerdown', (e) => {
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { el.setPointerCapture(e.pointerId); } catch { /* (a pointer the browser no longer tracks) */ }
    spin = 0;
    if (fingers.size === 2) { pinch = { dist: spread(), zoom }; dragX = null; press = null; return; }
    if (fingers.size === 1) { dragX = e.clientX; lastMove = performance.now(); press = { x: e.clientX, y: e.clientY, at: lastMove, moved: 0 }; }
  });
  el.addEventListener('pointermove', (e) => {
    if (!fingers.has(e.pointerId)) return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (press) press.moved = Math.max(press.moved, Math.hypot(e.clientX - press.x, e.clientY - press.y));
    if (pinch && fingers.size >= 2) { setZoom(pinch.zoom * (pinch.dist / spread())); return; }
    if (dragX === null) return;
    const now = performance.now(), d = ((e.clientX - dragX) / Math.max(1, el.clientWidth)) * DRAG_TURN;
    turn -= d;
    spin = -d / Math.max(0.008, (now - lastMove) / 1000); // radians per second, for the glide
    dragX = e.clientX; lastMove = now;
  });
  const release = (e: PointerEvent) => {
    fingers.delete(e.pointerId);
    if (press && e.type === 'pointerup' && fingers.size === 0 && press.moved < 6 && performance.now() - press.at < 400) {
      press = null; dragX = null;
      tapPlot(e.clientX, e.clientY);
      return;
    }
    press = null;
    if (fingers.size < 2) pinch = null;
    if (fingers.size === 1) { dragX = [...fingers.values()][0].x; lastMove = performance.now(); spin = 0; return; } // (a pinch ends: no glide)
    if (dragX === null) return;
    dragX = null;
    if (performance.now() - lastMove > 80) spin = 0;
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(zoom * Math.exp(e.deltaY * WHEEL_ZOOM)); }, { passive: false });

  let on = true;
  const frame = (ms: number) => {
    if (!on) return;
    const t = reduced ? 0 : ms / 1000;
    // Isometric: 45° around, ~35° down; plus the sway.
    const dt = Math.min(0.1, (ms - lastFrame) / 1000);
    lastFrame = ms;
    if (Math.abs(shown - zoom) > 0.001) { shown += (zoom - shown) * Math.min(1, ZOOM_EASE * dt); frustum(); }
    if (dragX === null && spin !== 0) { turn += spin * dt; spin *= Math.pow(GLIDE_KEEP, dt); if (Math.abs(spin) < 0.02) spin = 0; }
    const yaw = Math.PI / 4 + turn + (Math.sin((t / TURN_SEC) * Math.PI * 2) * TURN_DEG * Math.PI) / 180;
    const bob = Math.sin((t / BOB_SEC) * Math.PI * 2) * BOB_UNITS;
    focus.lerp(plotCentre(plot), Math.min(1, ZOOM_EASE * 0.5 * dt));
    const out = (shown - 1) / (ZOOM_MAX - 1); // 0 closest, 1 furthest
    target.set(focus.x * (1 - out), 6 * (1 - out) + 2 * out, focus.z * (1 - out));
    outline.position.copy(plotCentre(plot));
    (outline.material as LineBasicMaterial).opacity = Math.min(1, out * 3);
    outline.visible = out > 0.02;
    const d = 200;
    camera.position.set(target.x + Math.sin(yaw) * d * 0.8165, target.y + d * 0.5774 + bob, target.z + Math.cos(yaw) * d * 0.8165);
    camera.lookAt(target.x, target.y + bob, target.z);
    // Pixel snap: slide the camera across its view so the scene moves by whole low-res pixels (a moving view at a
    // fraction of a pixel makes every edge shimmer). Only turning (yaw) is left unsnapped.
    camera.updateMatrixWorld();
    const unit = (camera.right - camera.left) / Math.max(1, renderer.domElement.width);
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    const snap = (v: number) => Math.round(v / unit) * unit - v;
    const p = camera.position;
    p.addScaledVector(right, snap(p.dot(right))).addScaledVector(up, snap(p.dot(up)));
    camera.updateMatrixWorld();
    beacon.visible = Math.floor(ms / 800) % 2 === 0;
    // The buildings' moving parts (`animated` in kit3d); with reduced motion they were posed once, at t = 0.
    if (!reduced) for (const parts of moving.values()) for (const o of parts) (o.userData.anim as Anim)(o, ms / 1000);
    for (const [k, l] of lamps.entries()) l.intensity = 260 + (reduced ? 0 : Math.sin(ms / 900 + k * 2) * 15);
    if (el.offsetParent !== null) renderer.render(scene, camera); // (not while hidden: the star map is shown)
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return {
    el,
    setBuilding(k, building) {
      const old = buildings.get(k);
      if (old) { scene.remove(old); disposeGroup(old); }
      const merged = mergeByMaterial(building);
      merged.position.copy(plotCentre(k)).setY(0.8);
      // Its lights go to the plot's pool (brightest first); the builder's own are dropped.
      const own: PointLight[] = [];
      merged.traverse((o) => { if (o instanceof PointLight) own.push(o); });
      own.sort((a, b) => b.intensity - a.intensity);
      own.forEach((l) => l.removeFromParent());
      (pools.get(k) ?? []).forEach((p, i) => {
        const l = own[i];
        p.intensity = l ? l.intensity : 0;
        if (!l) return;
        p.color.copy(l.color);
        p.distance = l.distance;
        p.decay = l.decay;
        p.position.copy(l.position).add(merged.position);
      });
      scene.add(merged);
      buildings.set(k, merged);
      const parts: Group[] = [];
      merged.traverse((o) => { if (o.userData.anim) parts.push(o as Group); });
      parts.forEach((o) => (o.userData.anim as Anim)(o, 0));
      moving.set(k, parts);
    },
    select(k) { plot = k; zoom = 1; spin = 0; },
    stop: () => { on = false; ro.disconnect(); renderer.dispose(); },
  };
}
