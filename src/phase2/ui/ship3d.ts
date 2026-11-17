// The Black siphon in the dry dock, as far as it is built: the dock starts empty, and each ship module (core/ship.ts,
// in this order) adds what it is:
//   frame      four legs, the bell's ribs and hoops, the rim with its red lights, a mast with a blinking beacon
//   hull       obsidian plating closes the bell, red windows
//   tanks      four tall frosted cryogenic tanks hung outside the rim, between the legs
//   life       a green-lit greenhouse dome on top (breathes)
//   engines    four big plasma nozzles hanging under the bell, their blue plumes flickering
//   nav        a taller mast with a dish that turns and a ring of sensors
//   cryo       a band of cyan windows round the bell (the sleepers)
//   shield     a faint violet ring round the bell, turning slowly
//   core       the bluetreri core glowing (pulsing) under the bell; the rim lights and the beacon turn blue
//   tentacles  seven tentacles from the rim out over the sand, red probe tips, swaying slightly
// (what hangs under the bell sits low enough to show between the legs from the game's camera). Moving parts are
// `animated` (kit3d), so the desert runs them like the buildings'. Built round the origin with the sand at y = 0;
// `ground(x, z)` is the sand's height there (relative). The beacon is `userData.live` and `userData.beacon` (it blinks).
import { BoxGeometry, CatmullRomCurve3, CylinderGeometry, Group, Mesh, SphereGeometry, TorusGeometry, TubeGeometry, Vector3 } from 'three';
import { animated, glow, lambert, OBSIDIAN, RED, STEEL } from './kit3d';
import { metalTexture, repeated, textured } from './textures';

/** Bell radius and how high its rim stands. */
const R = 8;
const BASE = 8;
/** Tentacles: how many, and how far they sway (radians) and how slowly (seconds a sway). */
const TENTACLES = 7;
const SWAY = 0.035;
const SWAY_SEC = 6;

const group = (...meshes: Mesh[]) => { const g = new Group(); g.add(...meshes); return g; };

export function buildShip(modules: readonly string[], ground: (x: number, z: number) => number = () => 0): Group {
  const ship = new Group();
  if (modules.length === 0) return ship; // (an empty dock)
  const has = (id: string) => modules.includes(id);
  const bell = new Group();
  bell.position.y = BASE;
  ship.add(bell);
  const steel = textured(STEEL, metalTexture(0.6));
  for (const [x, z] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) {
    const leg = new Mesh(new CylinderGeometry(0.35, 0.35, BASE + 2, 5), textured(STEEL, metalTexture(0.7)));
    leg.position.set(x, BASE / 2 - 1, z);
    ship.add(leg);
  }
  // Angles round the bell as three.js's sphere does (phi: (-cos, 0, sin)).
  const at = (phi: number, r: number, y: number) => new Vector3(-Math.cos(phi) * r, y, Math.sin(phi) * r);
  if (has('hull')) {
    bell.add(new Mesh(new SphereGeometry(R, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), textured(OBSIDIAN, repeated(metalTexture(0.25), 6, 3), true)));
  } else {
    for (let k = 0; k < 12; k++) { // meridian ribs
      const rib = new Mesh(new TorusGeometry(R, 0.18, 4, 12, Math.PI / 2), steel);
      rib.rotation.y = (k / 12) * Math.PI * 2;
      bell.add(rib);
    }
    for (const lat of [0.35, 0.75, 1.15]) { // hoops
      const hoop = new Mesh(new TorusGeometry(R * Math.cos(lat), 0.15, 4, 24), steel);
      hoop.rotation.x = Math.PI / 2;
      hoop.position.y = R * Math.sin(lat);
      bell.add(hoop);
    }
  }
  const rim = new Mesh(new TorusGeometry(R + 0.6, 0.6, 5, 32), textured('#3a3e48', repeated(metalTexture(0.5), 1, 10)));
  rim.rotation.x = Math.PI / 2;
  bell.add(rim);
  const red = glow(RED);
  const rimLight = has('core') ? glow('#6ab8ff') : red;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const light = new Mesh(new BoxGeometry(0.6, 0.5, 0.6), rimLight);
    light.position.set(Math.cos(a) * (R + 1.2), 0, Math.sin(a) * (R + 1.2));
    bell.add(light);
  }
  if (has('hull')) {
    for (let k = 0; k < 10; k++) {
      const y = 2.2;
      const win = new Mesh(new BoxGeometry(0.7, 0.5, 0.7), red);
      win.position.copy(at((k / 10) * Math.PI * 2, Math.sqrt(R * R - y * y) + 0.05, y));
      bell.add(win);
    }
  }
  if (has('tanks')) {
    const frost = textured('#cfe0ea', metalTexture(0.1));
    for (let k = 0; k < 4; k++) { // between the legs, outside the rim, hung from it
      const a = (k / 4) * Math.PI * 2;
      const x = Math.cos(a) * (R + 0.4), z = Math.sin(a) * (R + 0.4);
      const tank = new Mesh(new CylinderGeometry(1.3, 1.3, 5, 10), frost);
      tank.position.set(x, -3, z);
      bell.add(tank);
      for (const y of [-1.2, -4.8]) {
        const band = new Mesh(new TorusGeometry(1.35, 0.12, 4, 10), steel);
        band.rotation.x = Math.PI / 2;
        band.position.set(x, y, z);
        bell.add(band);
      }
    }
  }
  if (has('life')) {
    const ring = new Mesh(new TorusGeometry(3, 0.25, 4, 16), steel);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = R - 0.4;
    bell.add(ring);
    const dome = new Mesh(new SphereGeometry(3, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), glow('#7affa0', 0.55));
    bell.add(animated(group(dome), 0, R - 0.4, 0, (o, t) => { const k = 1 + Math.sin(t * 1.3) * 0.04; o.scale.set(k, k, k); }));
  }
  if (has('engines')) {
    const blue = glow('#6ab8ff');
    const plume = glow('#6ab8ff', 0.4);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const x = Math.cos(a) * 3, z = Math.sin(a) * 3;
      const nozzle = new Mesh(new CylinderGeometry(0.8, 1.6, 3.6, 10, 1, true), lambert('#2a2c34'));
      nozzle.position.set(x, -2.2, z);
      bell.add(nozzle);
      const mouth = new Mesh(new CylinderGeometry(1.5, 1.5, 0.25, 10), blue);
      mouth.position.set(x, -4.1, z);
      bell.add(mouth);
      const cone = new Mesh(new CylinderGeometry(1.4, 0.3, 2, 8), plume);
      cone.position.y = -1; // (hangs from its top, so it stretches downwards)
      bell.add(animated(group(cone), x, -4.2, z, (o, t) => { o.scale.y = 0.8 + 0.25 * Math.abs(Math.sin(t * 7 + k * 1.7)); }));
    }
  }
  const mastHigh = has('nav') ? 7 : 4;
  const mast = new Mesh(new CylinderGeometry(0.15, 0.15, mastHigh, 4), steel);
  mast.position.y = R + mastHigh / 2;
  bell.add(mast);
  if (has('nav')) {
    const dish = new Mesh(new SphereGeometry(1.6, 8, 4, 0, Math.PI * 2, 0, Math.PI / 3), textured('#8a8e98', metalTexture(0.2), true));
    dish.rotation.x = Math.PI * 0.75;
    dish.position.set(0.9, 0, 0);
    bell.add(animated(group(dish), 0, R + 4.5, 0, (o, t) => { o.rotation.y = t * 0.4; }));
    const sensors = new Mesh(new TorusGeometry(1.1, 0.12, 4, 12), glow('#ffd23a'));
    sensors.rotation.x = Math.PI / 2;
    sensors.position.y = R + 2.5;
    bell.add(sensors);
  }
  if (has('cryo')) {
    const cyan = glow('#7ae8ff');
    for (let k = 0; k < 14; k++) {
      const y = 4.6;
      const pod = new Mesh(new BoxGeometry(0.9, 0.4, 0.9), cyan);
      pod.position.copy(at((k / 14) * Math.PI * 2 + 0.2, Math.sqrt(R * R - y * y) + 0.05, y));
      bell.add(pod);
    }
  }
  if (has('shield')) {
    const shield = new Mesh(new TorusGeometry(R + 2.2, 0.35, 5, 40), glow('#b88aff', 0.45));
    shield.rotation.x = Math.PI / 2 + 0.06; // (a little tilted, so its turning shows)
    bell.add(animated(group(shield), 0, 2.5, 0, (o, t) => {
      o.rotation.y = t * 0.25;
      o.position.y = (o.userData.at as Vector3).y + Math.sin(t * 0.8) * 0.3;
    }));
  }
  if (has('core')) {
    const core = new Mesh(new SphereGeometry(2, 10, 6), glow('#3a7cff'));
    const halo = new Mesh(new SphereGeometry(3, 10, 6), glow('#3a7cff', 0.3));
    bell.add(animated(group(core, halo), 0, -6.6, 0, (o, t) => { const k = 1 + Math.sin(t * 2.2) * 0.08; o.scale.set(k, k, k); }));
  }
  const beacon = new Mesh(new SphereGeometry(0.5, 6, 4), glow(has('core') ? '#6ab8ff' : RED));
  beacon.position.y = R + mastHigh + 0.3;
  beacon.userData.live = true; // (it blinks)
  beacon.userData.beacon = true;
  bell.add(beacon);
  if (has('tentacles')) {
    // From under the rim down to the sand and out over it, each turning a little about the ship's axis.
    const skin = textured('#2c2f37', repeated(metalTexture(0.4), 10, 1), false, false); // (segment plates along it)
    for (let k = 0; k < TENTACLES; k++) {
      const a = (k / TENTACLES) * Math.PI * 2 + 0.3;
      const pts: Vector3[] = [];
      for (let t = 0; t <= 15; t++) {
        const r = R + t, w = Math.sin(t / 2.5 + k) * 1.6;
        const x = Math.cos(a) * r - Math.sin(a) * w, z = Math.sin(a) * r + Math.cos(a) * w;
        if (Math.abs(x) > 18 || Math.abs(z) > 18) break; // (they stay inside the dock's plot)
        const sand = ground(x, z) + 0.25; // (half sunk)
        pts.push(new Vector3(x, t < 4 ? BASE + (sand - BASE) * (t / 4) : sand, z));
      }
      if (pts.length < 3) continue;
      const arm = new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), pts.length * 3, 0.45, 5), skin);
      const tip = new Mesh(new SphereGeometry(0.6, 6, 4), red);
      tip.position.copy(pts[pts.length - 1]);
      ship.add(animated(group(arm, tip), 0, 0, 0, (o, t) => { o.rotation.y = Math.sin((t / SWAY_SEC) * Math.PI * 2 + k * 1.3) * SWAY; }));
    }
  }
  return ship;
}
