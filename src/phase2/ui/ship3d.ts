// The Black siphon in the dry dock, as far as it is built: a bell on four legs, its frame of ribs and hoops, the rim
// lights and a mast with a blinking beacon from the start; each ship module (core/ship.ts) adds what it is:
//   hull       obsidian plating closes the whole bell (before it, only a few plates on the frame), red windows
//   tanks      four tall frosted cryogenic tanks hung outside the rim, between the legs
//   life       a green-lit greenhouse dome on top
//   engines    four big plasma nozzles hanging under the bell, glowing blue at their mouths
//   nav        a taller mast with a dish and a ring of sensors
//   cryo       a band of cyan windows round the bell (the sleepers)
//   shield     a faint violet ring round the bell
//   core       the bluetreri core glowing under the bell; the rim lights and the beacon turn blue
// (what hangs under the bell sits low enough to show between the legs from the game's camera)
// Built round the origin with the sand at y = 0; the beacon is `userData.live` (it blinks) and `userData.beacon`.
import { BoxGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import { glow, lambert, OBSIDIAN, RED, STEEL } from './kit3d';
import { metalTexture, repeated, textured } from './textures';

/** Bell radius and how high its rim stands. */
const R = 8;
const BASE = 8;

export function buildShip(modules: readonly string[]): Group {
  const has = (id: string) => modules.includes(id);
  const ship = new Group();
  const bell = new Group();
  bell.position.y = BASE;
  ship.add(bell);
  const steel = textured(STEEL, metalTexture(0.6));
  for (const [x, z] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) {
    const leg = new Mesh(new CylinderGeometry(0.35, 0.35, BASE + 2, 5), textured(STEEL, metalTexture(0.7)));
    leg.position.set(x, BASE / 2 - 1, z);
    ship.add(leg);
  }
  // Angles round the bell as three.js's sphere does (phi: (-cos, 0, sin)); the camera looks from phi ~ 3π/4, so the
  // part still open faces it.
  const at = (phi: number, r: number, y: number) => new Vector3(-Math.cos(phi) * r, y, Math.sin(phi) * r);
  const plateFrom = Math.PI;
  const plated = has('hull') ? Math.PI * 2 : Math.PI * 0.7;
  bell.add(new Mesh(new SphereGeometry(R, 20, 8, plateFrom, plated, 0, Math.PI / 2), textured(OBSIDIAN, repeated(metalTexture(0.25), 6, 3), true)));
  if (!has('hull')) {
    const openFrom = plateFrom + plated, open = Math.PI * 2 - plated;
    for (let k = 0; k <= 8; k++) { // meridian ribs over the open part
      const rib = new Mesh(new TorusGeometry(R, 0.18, 4, 12, Math.PI / 2), steel);
      rib.rotation.y = openFrom + (k / 8) * open + Math.PI; // (the torus arc starts at +x and rises to +y)
      bell.add(rib);
    }
    for (const lat of [0.35, 0.75, 1.15]) { // hoops
      const hoop = new Mesh(new TorusGeometry(R * Math.cos(lat), 0.15, 4, 24, open), steel);
      hoop.rotation.x = Math.PI / 2;
      const turn = new Group();
      turn.rotation.y = -(Math.PI - (openFrom + open));
      turn.position.y = R * Math.sin(lat);
      turn.add(hoop);
      bell.add(turn);
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
    const dome = new Mesh(new SphereGeometry(3, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), glow('#7affa0', 0.55));
    dome.position.y = R - 0.4;
    bell.add(dome);
    const ring = new Mesh(new TorusGeometry(3, 0.25, 4, 16), steel);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = R - 0.4;
    bell.add(ring);
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
      const glowCone = new Mesh(new CylinderGeometry(1.4, 0.3, 2, 8), plume);
      glowCone.position.set(x, -5.2, z);
      bell.add(glowCone);
    }
  }
  const mastHigh = has('nav') ? 7 : 4;
  const mast = new Mesh(new CylinderGeometry(0.15, 0.15, mastHigh, 4), steel);
  mast.position.y = R + mastHigh / 2;
  bell.add(mast);
  if (has('nav')) {
    const dish = new Mesh(new SphereGeometry(1.6, 8, 4, 0, Math.PI * 2, 0, Math.PI / 3), textured('#8a8e98', metalTexture(0.2), true));
    dish.rotation.x = Math.PI * 0.75;
    dish.position.set(0.9, R + 4.5, -0.9);
    bell.add(dish);
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
    shield.rotation.x = Math.PI / 2;
    shield.position.y = 2.5;
    bell.add(shield);
  }
  if (has('core')) {
    const core = new Mesh(new SphereGeometry(2, 10, 6), glow('#3a7cff'));
    core.position.y = -6.6;
    bell.add(core);
    const halo = new Mesh(new SphereGeometry(3, 10, 6), glow('#3a7cff', 0.3));
    halo.position.y = -6.6;
    bell.add(halo);
  }
  const beacon = new Mesh(new SphereGeometry(0.5, 6, 4), glow(has('core') ? '#6ab8ff' : RED));
  beacon.position.y = R + mastHigh + 0.3;
  beacon.userData.live = true; // (it blinks)
  beacon.userData.beacon = true;
  bell.add(beacon);
  return ship;
}
