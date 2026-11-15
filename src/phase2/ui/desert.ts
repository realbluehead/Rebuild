// Phase II's scene: the Black siphon being built on a night desert, rendered in real 3D (three.js) with an isometric
// (orthographic) camera, at a low resolution scaled up with crisp pixels. Dunes, the obsidian bell half plated (the rest
// still ribs) on four legs, its tentacles laid out on the sand, and floodlights casting warm pools. The camera sways
// gently (a slow bob up and down and ±1° of turn) so the scene never looks frozen.
import {
  AmbientLight, BoxGeometry, BufferAttribute, CatmullRomCurve3, Color, CylinderGeometry, DirectionalLight, DoubleSide, Fog,
  Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, OrthographicCamera, PlaneGeometry, PointLight, Scene, SphereGeometry,
  TorusGeometry, TubeGeometry, Vector3, WebGLRenderer, type Material,
} from 'three';

/** Size of the ground, in world units (one unit ~ one voxel of the mock-up). */
const SIZE = 48;
/** Screen pixels per rendered pixel (the pixel-art look). */
const PX = 3;
/** World units across the view (the diorama's corners may leave the screen). */
const VIEW = 44;
/** The sway: seconds per bob and per turn, and how far. */
const BOB_SEC = 7;
const BOB_UNITS = 0.9;
const TURN_SEC = 11;
const TURN_DEG = 1;

const SAND = '#5a5a82';
const OBSIDIAN = '#3a3c48';
const STEEL = '#4a4e58';
const RED = '#ff2a3a';
const LAMP = '#fff2b0';

/** Dune height at (x, z) (world units, 0 = the slab's top at the edges). */
function duneHeight(x: number, z: number): number {
  const edge = Math.min(SIZE / 2 - Math.abs(x), SIZE / 2 - Math.abs(z));
  const fade = Math.max(0, Math.min(1, edge / 6)); // flat towards the edges, so the slab's sides meet the sand
  const h = 1.2 + Math.sin((x * 0.8 + z * 0.35) / 3.2) * 0.9 + Math.sin(x / 7.3 + 1.7) * Math.cos(z / 6.1) * 1.3;
  return 0.8 + Math.max(0, h) * fade;
}

const lambert = (c: string, flat = true) => new MeshLambertMaterial({ color: c, flatShading: flat });
const glow = (c: string) => new MeshBasicMaterial({ color: c });

function buildScene(): { scene: Scene; beacon: Mesh; lamps: PointLight[] } {
  const scene = new Scene();
  scene.fog = new Fog('#141a34', 105, 165);

  // Ground: a slab with displaced dunes on top.
  const ground = new PlaneGeometry(SIZE, SIZE, SIZE, SIZE);
  ground.rotateX(-Math.PI / 2);
  const pos = ground.getAttribute('position') as BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, duneHeight(pos.getX(i), pos.getZ(i)));
  ground.computeVertexNormals();
  scene.add(new Mesh(ground, lambert(SAND)));
  const slab = new Mesh(new BoxGeometry(SIZE, 5, SIZE), lambert('#2e2e48'));
  slab.position.y = 0.75 - 2.5; // (just under the flattest sand, so they never fight for the same pixels)
  scene.add(slab);

  // The bell on its four legs: half plated in obsidian, the rest still ribs and hoops.
  const ship = new Group();
  const base = 8;
  ship.position.y = duneHeight(0, 0) + base;
  for (const [x, z] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) {
    const leg = new Mesh(new CylinderGeometry(0.35, 0.35, base + 2, 5), lambert(STEEL));
    leg.position.set(x, -base / 2 - 1, z);
    ship.add(leg);
  }
  const R = 8;
  // Angles go round the bell as three.js's sphere does (phi: (-cos, 0, sin)). The camera looks from phi ~ 3π/4, so the
  // open sector (still ribs) faces it and the plated one is behind.
  const at = (phi: number, r: number, y: number) => new Vector3(-Math.cos(phi) * r, y, Math.sin(phi) * r);
  const plateFrom = Math.PI, plated = Math.PI * 1.25; // the sector already plated
  const openFrom = plateFrom + plated - Math.PI * 2, open = Math.PI * 2 - plated;
  const shell = new Mesh(new SphereGeometry(R, 20, 8, plateFrom, plated, 0, Math.PI / 2), lambert(OBSIDIAN));
  (shell.material as Material).side = DoubleSide;
  ship.add(shell);
  const steel = lambert(STEEL);
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
  const rim = new Mesh(new TorusGeometry(R + 0.6, 0.6, 5, 32), lambert('#3a3e48'));
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
  ship.add(beacon);
  scene.add(ship);

  // Tentacles laid out on the sand, each ending in a glowing probe.
  const tentacle = lambert('#2c2f37', false);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.3;
    const pts: Vector3[] = [];
    for (let t = 0; t <= 15; t++) {
      const r = 8 + t, w = Math.sin(t / 2.5 + k) * 1.6;
      const x = Math.cos(a) * r - Math.sin(a) * w, z = Math.sin(a) * r + Math.cos(a) * w;
      if (Math.abs(x) > SIZE / 2 - 1 || Math.abs(z) > SIZE / 2 - 1) break;
      pts.push(new Vector3(x, duneHeight(x, z) + 0.45, z));
    }
    if (pts.length < 3) continue;
    scene.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), pts.length * 3, 0.45, 5), tentacle));
    const tip = new Mesh(new SphereGeometry(0.6, 6, 4), red);
    tip.position.copy(pts[pts.length - 1]);
    scene.add(tip);
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
    scene.add(pole, lamp, light);
    lamps.push(light);
  }

  scene.add(new AmbientLight('#6a7aaa', 1.2));
  const moon = new DirectionalLight('#b8c8f8', 1.4);
  moon.position.set(-30, 40, -10);
  scene.add(moon);
  return { scene, beacon, lamps };
}

/** A night sky of pixel stars and a crescent moon, drawn once (the 3D view is transparent over it). */
function skyBackground(): string {
  const w = 120, h = 160;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#05060e'); grad.addColorStop(0.6, '#141a34'); grad.addColorStop(1, '#2a2a4a');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.75})`; g.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h * 0.7), 1, 1); }
  g.fillStyle = '#e8e8f0'; g.beginPath(); g.arc(22, 20, 6, 0, 7); g.fill();
  g.fillStyle = '#05060e'; g.beginPath(); g.arc(25, 18, 5, 0, 7); g.fill();
  return c.toDataURL();
}

export interface Desert {
  el: HTMLElement;
  stop(): void;
}

/** The 3D desert, filling its parent (call `stop` to end the animation). */
export function createDesert(): Desert {
  const el = document.createElement('div');
  el.className = 'p2-desert';
  el.style.backgroundImage = `url(${skyBackground()})`;
  const renderer = new WebGLRenderer({ antialias: false, alpha: true });
  renderer.setPixelRatio(1);
  renderer.setClearColor(new Color('#000000'), 0);
  el.append(renderer.domElement);

  const { scene, beacon, lamps } = buildScene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  const target = new Vector3(0, 6, 0);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const resize = () => {
    const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
    renderer.setSize(Math.ceil(w / PX), Math.ceil(h / PX), false);
    const half = VIEW / 2, aspect = h / w;
    camera.left = -half; camera.right = half; camera.top = half * aspect; camera.bottom = -half * aspect;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();

  let on = true;
  const frame = (ms: number) => {
    if (!on) return;
    const t = reduced ? 0 : ms / 1000;
    // Isometric: 45° around, ~35° down; plus the sway.
    const yaw = Math.PI / 4 + (Math.sin((t / TURN_SEC) * Math.PI * 2) * TURN_DEG * Math.PI) / 180;
    const bob = Math.sin((t / BOB_SEC) * Math.PI * 2) * BOB_UNITS;
    const d = 100;
    camera.position.set(Math.sin(yaw) * d * 0.8165, d * 0.5774 + bob, Math.cos(yaw) * d * 0.8165);
    camera.lookAt(target.x, target.y + bob, target.z);
    beacon.visible = Math.floor(ms / 800) % 2 === 0;
    for (const [k, l] of lamps.entries()) l.intensity = 260 + Math.sin(ms / 900 + k * 2) * 15;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return { el, stop: () => { on = false; ro.disconnect(); renderer.dispose(); } };
}
