// The telecommunications antenna in 3D at its level (`Antenna`, core/antenna.ts): a salvaged dish on a post and an
// aerial pole at first; then guy wires, a feed horn, a painted lattice mast (with a ladder inside, relay drums, a
// platform, a lift, aircraft lights and a laser terminal on top), more dishes on motorised mounts, a transmitter hut
// with its generator, the main dish growing on a concrete pedestal, and a row of phased-array panels. The grid's
// cable comes in along the diagonal from (18, 18) to the cabinet at (7, 7): that corridor is kept clear.
// Every upgrade moves something (see the map above `buildAntenna`).
import {
  BoxGeometry, CylinderGeometry, Euler, Group, InstancedMesh, LatheGeometry, Matrix4, Mesh, PointLight, Quaternion,
  SphereGeometry, TorusGeometry, Vector2, Vector3, type BufferGeometry, type Material,
} from 'three';
import type { Antenna } from '../core/antenna';
import {
  animated, at, barrel, bright, cable, crate, cycle, glow, hazard, heap, ladder, lamp, lambert, railing, rod, shadow, steel, v3,
  CONCRETE, RED,
} from './kit3d';
import { concreteTexture, metalTexture, repeated, textured } from './textures';

const SIGNAL = '#7affd0';
const GREEN = '#5aff7a';
/** Where things stand (local units): the main dish, the mast, the hut, the other dishes, the array panels. */
const DISH: [number, number] = [-6, -1];
const MAST: [number, number] = [8, -8];
const HUT: [number, number] = [3.5, 10.5];
const SMALL: [number, number][] = [[-10.5, 11], [-4, 13.5]];
const PANELS: [number, number][] = [[13.4, 6], [14.8, 2.5], [15.2, -1], [14.8, -4.5]];
/** Dishes lean this far off the zenith, turned towards the starting view (the camera looks from +x, +z). */
const TILT = 0.6, FACING = 0.55;

// Many copies moving each on its own: one InstancedMesh (one draw call), its matrices set every frame.
const M = new Matrix4(), P = new Vector3(), Q = new Quaternion(), S = new Vector3(), E = new Euler(), D = new Vector3();
const UP = new Vector3(0, 1, 0);
/** Sets copy `i` of `m` at (x, y, z), turned `ry` round y, scaled (0 hides it). */
function put(m: InstancedMesh, i: number, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, ry = 0): void {
  m.setMatrixAt(i, M.compose(P.set(x, y, z), Q.setFromEuler(E.set(0, ry, 0)), S.set(sx, sy, sz)));
}
/** Sets copy `i` of `m` (a unit-high cylinder) as a link from a to b. */
function link(m: InstancedMesh, i: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
  D.set(bx - ax, by - ay, bz - az);
  const len = D.length();
  m.setMatrixAt(i, M.compose(P.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), Q.setFromUnitVectors(UP, D.divideScalar(len)), S.set(1, len, 1)));
}
function instanced(geometry: BufferGeometry, material: Material, n: number): InstancedMesh {
  const m = new InstancedMesh(geometry, material, n);
  m.frustumCulled = false; // (its copies move: the bounds worked out at first would go stale)
  return m;
}
/** `n` copies of a shape, as one animated part of the building: `move(mesh, t)` places them every frame. */
function copies(g: Group, geometry: BufferGeometry, material: Material, n: number, move: (m: InstancedMesh, t: number) => void): void {
  if (!n) return;
  const m = instanced(geometry, material, n);
  g.add(animated(new Group().add(m), 0, 0, 0, (_, time) => { move(m, time); m.instanceMatrix.needsUpdate = true; }));
}

interface Head { feedHorn?: boolean; rimLights?: boolean; tracking: boolean; nods?: boolean; phase: number }

/** A dish's head, built round its pivot with its axis up, then leant and turned by its anim: the bowl, its rim, the
 *  ribs behind, the feed on its struts (a horn sending out signal rings, a sub-reflector on the biggest), rim lights.
 *  `frame` is the ribs' material (the skin's own for the small dishes: one draw call each). */
function dishHead(g: Group, x: number, y: number, z: number, R: number, skin: Material, frame: Material, h: Head): void {
  const part = new Group(), f = 0.7 * R, v0 = 0.12 * R + 0.2, big = R > 3, sides = big ? 24 : 14;
  const dip = (r: number) => v0 + (r * r) / (4 * f);
  const profile = Array.from({ length: 7 }, (_, k) => new Vector2((k / 6) * R, dip((k / 6) * R)));
  part.add(new Mesh(new LatheGeometry(profile, sides), skin));
  const rim = new Mesh(new TorusGeometry(R, 0.05 + R * 0.012, 4, sides), frame);
  rim.rotation.x = Math.PI / 2;
  part.add(at(rim, 0, dip(R), 0));
  part.add(at(new Mesh(new CylinderGeometry(0.2 * R, 0.24 * R, v0 + 0.1, 8), frame), 0, v0 / 2 - 0.05, 0));
  const ribs = big ? 12 : 6;
  for (let k = 0; k < ribs; k++) {
    const a = (k / ribs) * Math.PI * 2, r = R * 0.88;
    part.add(rod(v3(Math.cos(a) * 0.2 * R, 0, Math.sin(a) * 0.2 * R), v3(Math.cos(a) * r, dip(r) - 0.06, Math.sin(a) * r), 0.035 + R * 0.008, frame, 3));
  }
  if (big) {
    const hoop = new Mesh(new TorusGeometry(R * 0.55, 0.03 + R * 0.01, 3, sides), frame);
    hoop.rotation.x = Math.PI / 2;
    part.add(at(hoop, 0, dip(R * 0.55) - 0.12 - R * 0.03, 0));
    part.add(at(new Mesh(new BoxGeometry(0.5 * R, 0.16 * R, 0.14 * R), frame), 0, -0.02 * R, -0.3 * R)); // (counterweight)
  }
  const struts = big ? 4 : 3;
  for (let k = 0; k < struts; k++) {
    const a = (k / struts) * Math.PI * 2 + 0.6, r = R * 0.78;
    part.add(rod(v3(Math.cos(a) * r, dip(r), Math.sin(a) * r), v3(Math.cos(a) * 0.06 * R, v0 + f, Math.sin(a) * 0.06 * R), 0.03 + R * 0.006, frame, 3));
  }
  part.add(at(new Mesh(new BoxGeometry(0.1 * R + 0.14, 0.1 * R + 0.14, 0.1 * R + 0.14), frame), 0, v0 + f, 0));
  if (R > 6) part.add(at(new Mesh(new CylinderGeometry(0.13 * R, 0.1 * R, 0.12, 10), frame), 0, v0 + f - 0.3, 0));
  let rings: InstancedMesh | undefined, lights: InstancedMesh | undefined;
  if (h.feedHorn) {
    part.add(at(new Mesh(new CylinderGeometry(0.04 * R + 0.06, 0.09 * R + 0.14, 0.16 * R + 0.2, 8), frame), 0, v0 + f - 0.12 * R - 0.15, 0));
    rings = instanced(new TorusGeometry(1, 0.07, 4, 16).rotateX(Math.PI / 2), glow(SIGNAL, 0.7), 3);
    part.add(rings);
  }
  if (h.rimLights) {
    lights = instanced(new BoxGeometry(0.34, 0.34, 0.34), glow(RED), 12);
    part.add(lights);
  }
  const head = animated(part, x, y, z, (o, time) => {
    const p = h.phase;
    // Rocking in the wind on a loose mount, or (motorised) slewing slowly across the sky; the big dishes also nod.
    const turn = h.tracking ? 0.5 * Math.sin(time * 0.13 + p) - 0.5 * Math.sin(p) : 0.05 * Math.sin(time * 1.3 + p) * Math.sin(time * 0.37);
    const lean = h.tracking ? (h.nods ? 0.15 * Math.sin(time * 0.21 + p) - 0.15 * Math.sin(p) : 0) : 0.035 * Math.sin(time * 1.9 + p) * Math.sin(time * 0.37);
    o.rotation.set(TILT + lean, FACING + p * 0.25 + turn, 0);
    if (rings) {
      for (let i = 0; i < 3; i++) {
        const c = cycle(time, 2.4, i / 3);
        put(rings, i, 0, v0 + f + 0.2 + c * (R * 0.9 + 1.6), (0.12 * R + 0.2 + c * (0.45 * R + 0.5)) * Math.min(1, (1 - c) * 5));
      }
      rings.instanceMatrix.needsUpdate = true;
    }
    if (lights) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        put(lights, i, Math.cos(a) * R, dip(R) + 0.2, Math.sin(a) * R, cycle(time, 3, -i / 12) < 0.4 ? 1 : 0);
      }
      lights.instanceMatrix.needsUpdate = true;
    }
  });
  head.rotation.order = 'YXZ'; // (leant first, then turned round the mount's upright axis)
  g.add(head);
}

// What moves, by upgrade (level):
//  1 Scrap dish        the dish rocks in the wind on its post; the receiver's and the cabinet's lamps blink
//  2 Guy wires         the wires thrum (each bows sideways and back, in gusts)
//  3 Feed horn         signal rings pulse out of the horn along the main dish's axis
//  4 Lattice mast      the anemometer on its arm at the mast's top spins
//  5 Microwave relays  each relay drum's status lamp blinks, out of step (also the two more drums of 11)
//  6 Second dish       it rocks (then slews) on its own, out of step with the first
//  7 Transmitter hut   the generator's flywheel spins and its exhaust puffs; the hut's panel lamps blink
//  8 Motorised mount   every dish stops rocking and slews slowly from side to side, following the sky
//  9 Tall mast         the service lift rides its rail up to the platform and back down
// 10 Big dish          the main dish also nods up and down on its elevation drive
// 11 Aircraft lights   the red lights blink in turn up the mast
// 12 Third dish        it slews on its own, out of step with the others
// 13 Phased array      a wave of lit tiles scans across each panel
// 14 Deep-space dish   red lights chase round the great dish's rim
// 15 Laser link        the beam to the sky pulses; data pulses climb the mast and fly up the beam
export function buildAntenna(a: Antenna): Group {
  const g = new Group();
  const greens: number[][] = []; // (x, y, z, size, period, phase)
  const dark = lambert('#1e2028'), concrete = textured(CONCRETE, repeated(concreteTexture(), 1, 1));

  // The grid's cabinet where the cable arrives (always there), and the cables from it over the sand.
  const cabinet = new Mesh(new BoxGeometry(1, 1.6, 0.6), bright());
  cabinet.rotation.y = -Math.PI / 4;
  g.add(at(cabinet, 7, 0.8, 7));
  const strip = new Mesh(new BoxGeometry(1.04, 0.25, 0.64), hazard());
  strip.rotation.y = -Math.PI / 4;
  g.add(at(strip, 7, 1.2, 7));
  g.add(at(new Mesh(new BoxGeometry(1.5, 0.12, 1.5), concrete), 7, 0.06, 7));
  greens.push([7, 1.72, 7, 0.22, 2.6, 0.1]);
  cable(g, [[6.6, 6.6], [3, 4.5], [-1, 1.6], [DISH[0] + 2.4, DISH[1] + 0.9]]);
  cable(g, [[7.3, 6.5], [10, 1], [9.8, -5], [MAST[0] + 0.6, MAST[1] + 0.9]], 0.1);

  // ── The main dish on its mount ──
  const R = a.dishSize <= 2 ? 1.2 : a.dishSize <= 12 ? 4 : 7;
  const [dx, dz] = DISH;
  let pivot: number;
  shadow(g, R + 2, dx, dz, 0.55);
  if (R < 2) {
    pivot = 2.8;
    g.add(rod(v3(dx, 0, dz), v3(dx, pivot, dz), 0.14, steel(), 5));
    g.add(at(new Mesh(new BoxGeometry(1.1, 0.14, 1.1), steel()), dx, 0.07, dz));
    for (const [sx, sz] of [[1, 0.3], [-0.6, 0.9], [-0.4, -1]]) g.add(rod(v3(dx + sx, 0, dz + sz), v3(dx, 1.5, dz), 0.05, steel(), 3));
    heap(g, dx, dz, 1.3);
  } else if (R < 6) {
    pivot = 5.2;
    g.add(at(new Mesh(new BoxGeometry(3.4, 0.9, 3.4), concrete), dx, 0.45, dz));
    g.add(at(new Mesh(new CylinderGeometry(0.6, 0.85, 3.6, 8), textured('#8a8e98', repeated(metalTexture(0.5), 2, 2))), dx, 2.7, dz));
    g.add(at(new Mesh(new CylinderGeometry(1, 1, 0.5, 10), steel()), dx, 4.7, dz));
    ladder(g, dx + 0.9, 0.9, dz + 0.9, 3.6, Math.PI / 4);
    heap(g, dx - 1.5, dz + 1.6, 2);
  } else {
    pivot = 9.6;
    g.add(at(new Mesh(new CylinderGeometry(3.4, 3.6, 1.2, 8), textured(CONCRETE, repeated(concreteTexture(), 4, 0.5))), dx, 0.6, dz));
    g.add(at(new Mesh(new CylinderGeometry(1.3, 2.1, 5.8, 10), textured('#b4b8c0', repeated(metalTexture(0.2), 3, 2))), dx, 4.1, dz));
    g.add(at(new Mesh(new CylinderGeometry(1.32, 1.32, 0.4, 10, 1, true), hazard()), dx, 6.6, dz));
    g.add(at(new Mesh(new CylinderGeometry(2.7, 2.5, 0.2, 12), steel()), dx, 7.1, dz));
    railing(g, dx, 7.2, dz, 2.6);
    g.add(at(new Mesh(new CylinderGeometry(1.1, 1.3, 1.9, 10), steel()), dx, 8.15, dz));
    ladder(g, dx + 1.75, 1.2, dz + 1.75, 6, Math.PI / 4);
    g.add(at(new Mesh(new BoxGeometry(0.1, 1.8, 0.9), glow('#ffd890')), dx + 1.9, 2.1, dz - 0.6).rotateY(-0.3)); // (a lit door)
    heap(g, dx - 3, dz + 2.4, 2.6); heap(g, dx + 2.6, dz - 2.6, 2.2);
  }
  if (a.tracking) { // (the motor and its gearbox on the mount)
    g.add(at(new Mesh(new BoxGeometry(0.5 + R * 0.1, 0.4 + R * 0.08, 0.5 + R * 0.1), bright()), dx - (R < 2 ? 0.3 : R * 0.2 + 0.3), pivot - 0.5 - R * 0.08, dz));
  }
  g.add(at(new Mesh(new SphereGeometry(0.16 + R * 0.06, 8, 6), steel()), dx, pivot, dz));
  const skin = R < 2 ? textured('#8a7460', repeated(metalTexture(1), 3, 1), true)
    : R < 6 ? textured('#9a9ea8', repeated(metalTexture(0.5), 6, 2), true) : textured('#d0d4dc', repeated(metalTexture(0.1), 8, 3), true);
  dishHead(g, dx, pivot, dz, R, skin, steel(), { feedHorn: a.feedHorn, rimLights: a.dishSize >= 25, tracking: a.tracking, nods: a.dishSize >= 12, phase: 0 });
  // The receiver by the dish's foot: a set on a crate, its lamp blinking.
  const rx = dx + R * 0.5 + 2.2, rz = dz + 1.2;
  crate(g, rx, rz, 1.1, 0.4);
  g.add(at(new Mesh(new BoxGeometry(0.7, 0.45, 0.5), dark), rx, 1.1, rz).rotateY(0.4));
  greens.push([rx + 0.2, 1.42, rz + 0.1, 0.16, 1.4, 0.3]);

  // ── The other dishes, each on a post ──
  const small = textured('#9a9ea8', repeated(metalTexture(0.5), 4, 1), true);
  for (let k = 0; k < a.dishes - 1 && k < SMALL.length; k++) {
    const [x, z] = SMALL[k];
    shadow(g, 2.6, x, z, 0.45);
    g.add(at(new Mesh(new BoxGeometry(1.4, 0.4, 1.4), concrete), x, 0.2, z));
    g.add(rod(v3(x, 0.4, z), v3(x, 3.2, z), 0.18, steel(), 6));
    if (a.tracking) g.add(at(new Mesh(new BoxGeometry(0.55, 0.5, 0.55), bright()), x - 0.3, 2.7, z));
    dishHead(g, x, 3.3, z, 1.7, small, small, { tracking: a.tracking, phase: 1.9 + k * 2.3 });
    heap(g, x - 0.6, z + 0.5, 1.2);
    cable(g, a.hut ? [[HUT[0] - 2.5, HUT[1] + 0.5], [x + 2.5, z - 1], [x + 0.6, z + 0.2]] : [[6.4, 7.2], [1, 9.5], [x + 3, z - 0.6], [x + 0.6, z + 0.2]], 0.09);
  }

  // ── The mast: an aerial pole, then a painted lattice ──
  const [mx, mz] = MAST, H = a.mast <= 6 ? 5 : a.mast <= 15 ? 11 : 19;
  const half = (y: number) => 0.9 - 0.6 * (y / H); // (the lattice's half width at a height)
  shadow(g, a.lattice ? 3.4 : 2, mx, mz, 0.5);
  if (!a.lattice) {
    g.add(at(new Mesh(new BoxGeometry(0.9, 0.2, 0.9), steel()), mx, 0.1, mz));
    g.add(rod(v3(mx, 0, mz), v3(mx, H, mz), 0.13, steel(), 5));
    g.add(rod(v3(mx, H, mz), v3(mx, H + 1.8, mz), 0.04, bright(), 3));
    for (let k = 0; k < 3; k++) g.add(rod(v3(mx - 0.7 + k * 0.15, H - 0.5 - k * 0.45, mz), v3(mx + 0.7 - k * 0.15, H - 0.5 - k * 0.45, mz), 0.04, bright(), 3));
    heap(g, mx, mz, 1.1);
  } else {
    g.add(at(new Mesh(new BoxGeometry(2.8, 0.5, 2.8), concrete), mx, 0.25, mz));
    const paint = [textured('#b03a34', metalTexture(0.3)), textured('#c4c6cc', metalTexture(0.3))];
    const n = Math.round(H / 1.6), corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let k = 0; k < n; k++) {
      const y0 = (k / n) * H, y1 = ((k + 1) / n) * H, w0 = half(y0), w1 = half(y1);
      const band = paint[Math.floor((k * 4) / n) % 2 === 0 ? 0 : 1];
      for (let c = 0; c < 4; c++) {
        const [cx, cz] = corners[c], [nx, nz] = corners[(c + 1) % 4];
        g.add(rod(v3(mx + cx * w0, y0, mz + cz * w0), v3(mx + cx * w1, y1, mz + cz * w1), 0.07, band, 4));
        g.add(rod(v3(mx + cx * w1, y1, mz + cz * w1), v3(mx + nx * w1, y1, mz + nz * w1), 0.04, steel(), 3));
        const [fx, fz, tx, tz] = k % 2 ? [cx, cz, nx, nz] : [nx, nz, cx, cz];
        g.add(rod(v3(mx + fx * w0, y0, mz + fz * w0), v3(mx + tx * w1, y1, mz + tz * w1), 0.035, steel(), 3));
      }
    }
    ladder(g, mx, 0.5, mz, H - 0.6, Math.PI / 4);
    g.add(at(new Mesh(new BoxGeometry(0.8, 0.2, 0.8), steel()), mx, H + 0.1, mz));
    if (!a.laser) g.add(rod(v3(mx, H, mz), v3(mx, H + 1.8, mz), 0.04, bright(), 3));
    heap(g, mx - 1.4, mz + 1.4, 1.5); heap(g, mx + 1.5, mz - 1.2, 1.2);
    // The anemometer on an arm at the top.
    g.add(rod(v3(mx, H - 0.4, mz), v3(mx - 1.3, H - 0.4, mz + 1.3), 0.04, steel(), 3));
    g.add(rod(v3(mx - 1.3, H - 0.4, mz + 1.3), v3(mx - 1.3, H + 0.1, mz + 1.3), 0.04, steel(), 3));
    const cups = new Group();
    for (let k = 0; k < 3; k++) {
      const th = (k / 3) * Math.PI * 2;
      cups.add(rod(v3(0, 0, 0), v3(Math.cos(th) * 0.6, 0, Math.sin(th) * 0.6), 0.035, bright(), 3));
      cups.add(at(new Mesh(new SphereGeometry(0.17, 6, 4), bright()), Math.cos(th) * 0.6, 0, Math.sin(th) * 0.6));
    }
    g.add(animated(cups, mx - 1.3, H + 0.15, mz + 1.3, (o, time) => { o.rotation.set(0, time * 3.1, 0); }));
  }
  if (H > 12) { // (the tall mast: a railed platform half way up, and a lift on a rail to it)
    const py = 11;
    g.add(at(new Mesh(new CylinderGeometry(1.6, 1.6, 0.12, 12), steel()), mx, py, mz));
    railing(g, mx, py + 0.06, mz, 1.5);
    g.add(rod(v3(mx + 1.25, 0, mz + 1.25), v3(mx + 1.25, py, mz + 1.25), 0.06, bright(), 4));
    const cage = new Group();
    cage.add(new Mesh(new BoxGeometry(0.8, 1.1, 0.8), hazard()), at(new Mesh(new BoxGeometry(0.95, 0.1, 0.95), hazard()), 0, 0.6, 0));
    g.add(animated(cage, mx + 1.25, 0.6, mz + 1.25, (o, time) => {
      const c = cycle(time, 22); // (up, a wait at the top, down, a wait at the bottom)
      const u = c < 0.4 ? c / 0.4 : c < 0.5 ? 1 : c < 0.9 ? (0.9 - c) / 0.4 : 0;
      o.position.y = (o.userData.at as Vector3).y + 9.6 * u * u * (3 - 2 * u);
    }));
  }

  // Guy wires to anchor blocks in the sand: each a pair of links meeting at a middle that bows as the wire thrums.
  if (a.guyWires) {
    const reach = a.lattice ? 5 : 3.2, tiers = H > 12 ? [0.5 * H, 0.92 * H] : [0.9 * H];
    const wires: number[][] = [];
    for (let k = 0; k < 3; k++) {
      const th = Math.PI / 2 + (k / 3) * Math.PI * 2, ax = mx + Math.cos(th) * reach, az = mz + Math.sin(th) * reach;
      g.add(at(new Mesh(new BoxGeometry(0.7, 0.5, 0.7), concrete), ax, 0.2, az));
      heap(g, ax, az, 0.8);
      for (const y of tiers) wires.push([ax, az, y, -Math.sin(th), Math.cos(th)]);
    }
    copies(g, new CylinderGeometry(0.045, 0.045, 1, 4), lambert('#a0a4ae'), wires.length * 2, (m, time) => wires.forEach(([ax, az, y, sx, sz], i) => {
      const bow = 0.2 * Math.sin(time * (8 + i * 1.3)) * (0.55 + 0.45 * Math.sin(time * 0.5 + i * 2));
      const cx = (ax + mx) / 2 + sx * bow, cy = (0.45 + y) / 2 - 0.15, cz = (az + mz) / 2 + sz * bow;
      link(m, i * 2, ax, 0.45, az, cx, cy, cz);
      link(m, i * 2 + 1, cx, cy, cz, mx, y, mz);
    }));
  }

  // Microwave relay drums on the mast, each with a status lamp.
  for (let k = 0; k < a.relays; k++) {
    const y = H * (k < 2 ? 0.74 : 0.42), [ux, uz] = [[1, 0], [0, 1], [0, 1], [1, 0]][k % 4];
    const off = (a.lattice ? half(y) : 0.1) + 0.55, x = mx + ux * off, z = mz + uz * off;
    const turn = (m: Mesh) => { if (ux) m.rotation.z = Math.PI / 2; else m.rotation.x = Math.PI / 2; return m; };
    g.add(at(turn(new Mesh(new CylinderGeometry(0.7, 0.7, 0.4, 12), steel())), x, y, z));
    g.add(at(turn(new Mesh(new CylinderGeometry(0.6, 0.6, 0.44, 12), lambert('#d4d8e0'))), x + ux * 0.02, y, z + uz * 0.02));
    g.add(rod(v3(mx, y, mz), v3(x, y, z), 0.06, steel(), 3));
    greens.push([x, y + 0.82, z, 0.2, 1.1 + k * 0.23, 0.15 + k * 0.1]);
  }

  // Aircraft lights: pairs up the mast, blinking in turn from the bottom up (all lit at rest).
  if (a.beacons) {
    const reds: number[][] = [];
    for (let lev = 0; lev < 4; lev++) {
      const y = lev === 3 ? H + 0.35 : H * (0.25 + lev * 0.25), w = lev === 3 ? (a.laser ? 0.55 : 0) : half(y) + 0.1;
      reds.push([mx + w, y, mz - w, lev], [mx - w, y, mz + w, lev]);
    }
    copies(g, new BoxGeometry(0.36, 0.36, 0.36), glow(RED), reds.length, (m, time) => reds.forEach(([x, y, z, lev], i) =>
      put(m, i, x, y, z, cycle(time, 2.4, 0.45 - lev * 0.15) < 0.7 ? 1 : 0)));
  }

  // The laser terminal on the mast's top: its beam to the sky, and data climbing the mast and flying up the beam.
  if (a.laser) {
    g.add(at(new Mesh(new BoxGeometry(0.9, 0.7, 0.9), bright()), mx, H + 0.55, mz));
    g.add(at(new Mesh(new SphereGeometry(0.36, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), dark), mx, H + 0.9, mz));
    const beam = new Group().add(new Mesh(new CylinderGeometry(0.1, 0.1, 44, 6).translate(0, 22, 0), glow(SIGNAL, 0.7)));
    g.add(animated(beam, mx, H + 1, mz, (o, time) => {
      const s = 1 + 0.45 * Math.sin(time * 7) * Math.sin(time * 1.3);
      o.scale.set(s, 1, s);
    }));
    copies(g, new BoxGeometry(0.3, 0.3, 0.3), glow('#d8fff0'), 8, (m, time) => {
      for (let i = 0; i < 5; i++) put(m, i, mx, 0.8 + cycle(time, 3, i / 5) * (H - 0.4), mz, 1, 1.6, 1);
      for (let i = 0; i < 3; i++) put(m, 5 + i, mx, H + 1.2 + cycle(time, 1.5, i / 3) * 42, mz, 0.8, 6, 0.8);
    });
  }

  // ── The transmitter hut and its generator ──
  if (a.hut) {
    const [x, z] = HUT;
    shadow(g, 4.6, x, z, 0.5);
    g.add(at(new Mesh(new BoxGeometry(5, 3, 4), textured('#6a7080', repeated(metalTexture(0.5), 3, 1))), x, 1.5, z));
    g.add(at(new Mesh(new BoxGeometry(5.4, 0.25, 4.4), steel()), x, 3.12, z));
    g.add(at(new Mesh(new BoxGeometry(0.1, 2, 1.1), glow('#ffd890')), x + 2.52, 1, z + 0.9));
    g.add(at(new Mesh(new BoxGeometry(1.5, 0.8, 0.1), glow('#9ad8ff')), x - 0.9, 1.9, z + 2.02));
    for (let k = 0; k < 3; k++) {
      g.add(at(new Mesh(new BoxGeometry(0.1, 0.12, 0.9), dark), x + 2.52, 2.2 + k * 0.25, z - 1));
      greens.push([x + 2.56, 1.5 - k * 0.3, z - 0.3, 0.16, 0.9 + k * 0.4, 0.2 + k * 0.13]);
    }
    g.add(at(new Mesh(new BoxGeometry(1.1, 0.6, 0.9), bright()), x - 1.4, 3.55, z - 0.8));
    g.add(rod(v3(x + 1.8, 3.2, z - 1.4), v3(x + 1.8, 5.4, z - 1.4), 0.05, bright(), 3));
    g.add(at(new PointLight('#ffd890', 70, 12, 1.4), x + 4, 1.6, z + 1.2));
    heap(g, x - 2.2, z - 1.6, 2.2); heap(g, x + 1, z - 2.2, 1.8);
    cable(g, [[7, 7.5], [6.9, 8.6], [x + 2.6, z - 0.9]], 0.14);
    // The generator: on skids, a flywheel on its side, an exhaust stack puffing.
    const gx = x - 0.5, gz = z + 3.6;
    g.add(at(new Mesh(new BoxGeometry(2.4, 1.2, 1.3), textured('#4a6a52', metalTexture(0.7))), gx, 0.85, gz));
    for (const s of [-0.5, 0.5]) g.add(at(new Mesh(new BoxGeometry(2.8, 0.25, 0.25), steel()), gx, 0.12, gz + s));
    g.add(at(new Mesh(new BoxGeometry(0.1, 0.8, 0.9), dark), gx + 1.22, 0.9, gz)); // (the radiator grille)
    g.add(rod(v3(gx - 0.8, 1.4, gz), v3(gx - 0.8, 2.7, gz), 0.1, steel(), 5));
    g.add(rod(v3(gx + 0.4, 0.95, gz + 0.65), v3(gx + 0.4, 0.95, gz + 0.9), 0.08, steel(), 4));
    const wheel = new Group();
    wheel.add(new Mesh(new TorusGeometry(0.5, 0.09, 4, 12), bright()), new Mesh(new BoxGeometry(1, 0.12, 0.1), bright()), new Mesh(new BoxGeometry(0.12, 1, 0.1), bright()));
    g.add(animated(wheel, gx + 0.4, 0.95, gz + 0.85, (o, time) => { o.rotation.set(0, 0, time * 4.2); }));
    copies(g, new BoxGeometry(0.6, 0.6, 0.6), glow('#c8d0e0', 0.45), 4, (m, time) => {
      for (let i = 0; i < 4; i++) {
        const c = cycle(time, 2.6, i / 4);
        put(m, i, gx - 0.8 - c * 0.9, 2.85 + c * 2.6, gz - c * 0.3, (0.3 + c * 0.7) * Math.min(1, (1 - c) * 3));
      }
    });
    cable(g, [[gx + 0.9, gz - 0.7], [gx + 1.6, gz - 1.2], [x + 0.6, z + 2.1]], 0.1);
    barrel(g, gx + 2.3, gz + 0.3);
    barrel(g, gx - 2.2, gz + 0.1, true, '#3a5a7a');
  }

  // ── Phased-array panels: a dark face of tiles on a post, leant back, a wave of lit tiles scanning across ──
  const tiles: Matrix4[] = [];
  for (let k = 0; k < a.panels && k < PANELS.length; k++) {
    const [x, z] = PANELS[k], panel = new Group();
    panel.rotation.order = 'YXZ';
    panel.rotation.set(-0.5, Math.PI / 4 + 0.1 + k * 0.17, 0);
    panel.position.set(x, 2.3, z);
    panel.add(new Mesh(new BoxGeometry(3.3, 2.5, 0.16), dark));
    panel.add(at(new Mesh(new BoxGeometry(3.5, 0.14, 0.24), bright()), 0, 1.3, 0), at(new Mesh(new BoxGeometry(3.5, 0.14, 0.24), bright()), 0, -1.3, 0));
    panel.add(at(new Mesh(new BoxGeometry(0.5, 0.5, 0.5), steel()), 0, -0.2, -0.3));
    g.add(panel);
    panel.updateMatrix();
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) tiles.push(panel.matrix.clone().multiply(M.makeTranslation((c - 1.5) * 0.76, (r - 1) * 0.76, 0.1)));
    g.add(rod(v3(x, 0, z), v3(x, 2.2, z), 0.16, steel(), 5));
    g.add(at(new Mesh(new BoxGeometry(1.2, 0.3, 1.2), concrete), x, 0.15, z));
    shadow(g, 2.4, x, z, 0.4);
    heap(g, x - 0.7, z - 0.5, 1.1);
  }
  if (a.panels) cable(g, [...PANELS.slice(0, a.panels).map(([x, z]): [number, number] => [x - 0.9, z - 0.3]), [11.5, -6.5], [MAST[0] + 1.2, MAST[1] + 0.4]], 0.09);
  copies(g, new BoxGeometry(0.62, 0.62, 0.08), glow(SIGNAL), tiles.length, (m, time) => tiles.forEach((base, i) => {
    const k = Math.floor(i / 12), r = Math.floor((i % 12) / 4), c = i % 4;
    const lit = cycle(time, 2.8, k * 0.23 - (c + r * 0.5) / 5) < 0.3;
    m.setMatrixAt(i, lit ? base : M.copy(base).scale(S.set(0, 0, 0)));
  }));

  // Status lamps blinking, each at its own pace (all lit at rest).
  copies(g, new BoxGeometry(1, 1, 1), glow(GREEN), greens.length, (m, time) => greens.forEach(([x, y, z, s, period, phase], i) =>
    put(m, i, x, y, z, cycle(time, period, phase) < 0.6 ? s : 0)));

  // The clutter of a work site: crates, a cable reel, a spare dish panel on the sand, a lamp.
  crate(g, -13.5, 4, 1.3, 0.3); crate(g, -14.6, 5.5, 1, 0.9);
  if (a.level >= 4) {
    const reel = new Mesh(new CylinderGeometry(0.8, 0.8, 0.7, 10), textured('#6a5a40', metalTexture(1)));
    reel.rotation.set(Math.PI / 2, 0, 0.5);
    g.add(at(reel, 1.5, 0.8, -12));
    heap(g, 2.2, -12.6, 1.4);
  }
  lamp(g, -1.5, -14.5, 9);
  return g;
}
