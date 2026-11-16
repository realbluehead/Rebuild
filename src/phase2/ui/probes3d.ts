// The probe hangar in 3D at its level (`Probes`, core/probes.ts): a hangar at the back of the plot (an open steel
// frame, then an arched roof and walls, then big sliding doors) with up to three bays where probes stand on cradles
// being built under a gantry crane, and a track out of its doors to the launcher in front: a tilting launch rail at
// first, then a launch tower with swing arms, then a concrete pad with a flame trench. The probe shows its upgrades
// (solar wings, radio dish, ion engine, instrument booms, a nuclear battery) and rides a booster at the top levels.
// Every upgrade moves something (see the map above `buildProbes`); the centrepiece is the launch cycle.
import {
  BoxGeometry, BufferAttribute, CircleGeometry, Color, ConeGeometry, CylinderGeometry, Euler, Group, InstancedMesh, Matrix4,
  Mesh, MeshLambertMaterial, PointLight, Quaternion, SphereGeometry, TorusGeometry, Vector3, type BufferGeometry,
  type EulerOrder, type Material,
} from 'three';
import type { Probes } from '../core/probes';
import {
  animated, at, barrel, bright, cable, crate, cycle, glow, groundPipe, hazard, heap, ladder, lamp, lambert, railing, rod,
  shadow, steel, v3, CONCRETE, LAMP, RED,
} from './kit3d';
import { mergeByMaterial } from './merge3d';
import { concreteTexture, grateTexture, metalTexture, repeated, shared, textured } from './textures';

// The hangar (centre, half width, half depth, eave height, the arch's rise) and its bays.
const HX = -3, HZ = -10, HW = 8, HD = 6, EAVE = 6, RISE = 3.2, FRONT = HZ + HD;
const BAYS = [[HX, -13.5], [HX - 5, -13.5], [HX + 5, -13.5]];
const STAND = 1.5; // (a bay probe's base above the sand)
// The launcher: the track's line, where a probe's tail stops (the pivot), the pivot's height, where it starts from.
const LX = HX, LZ = 6, PY = 1.3, ZIN = -10.5;
/** The launch rail's gap from the probe's axis. */
const GAP = 0.95;

// The launch cycle, in seconds from its start (the rest pose: the probe up on the launcher, waiting):
//   0    waiting, up on the launcher (the booster vents)        10.5 the launcher tilts back down; the next probe is put together
//   3.5  the tower's arms swing back                            11.5 the doors slide open
//   4.5  ignition (the flame grows, steam from the trench)      13   it rolls out on its cart to the launcher
//   5.5  lift-off (one every 0.6 s with the fleet), up and away 17.8 the launcher tilts it up; the cart rolls back in
//                                                               20.5 the arms swing in; 21.5 the doors close
const PERIOD = 24;
const sm = (s: number, a: number, b: number): number => { const u = Math.min(1, Math.max(0, (s - a) / (b - a))); return u * u * (3 - 2 * u); };
const erect = (s: number): number => (s < 10.5 ? 1 : s < 17.8 ? 1 - sm(s, 10.5, 12.5) : sm(s, 17.8, 20.5));
const cartOut = (s: number): number => sm(s, 13, 17.5) - sm(s, 18.5, 21.5);
const doorsOpen = (s: number): number => sm(s, 11.5, 13) - sm(s, 21.5, 23);
const armsBack = (s: number): number => sm(s, 3.5, 4.5) - sm(s, 20.5, 22);
/** A steady number in 0..1 from `n` (the same every time: sparks flicker without `Math.random`). */
const hash = (n: number): number => { const v = Math.sin(n * 127.1) * 43758.5453; return v - Math.floor(v); };

// The probes are painted by vertex colour on one material, so a whole probe on its rocket is one mesh (one draw call).
const PAINT = () => shared('probe-paint', () => new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
const COLOUR = new Color();
function tint<T extends BufferGeometry>(geometry: T, c: string): T {
  COLOUR.set(c);
  const n = geometry.attributes.position.count, a = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) { a[k * 3] = COLOUR.r; a[k * 3 + 1] = COLOUR.g; a[k * 3 + 2] = COLOUR.b; }
  geometry.setAttribute('color', new BufferAttribute(a, 3));
  return geometry;
}
const paint = (geometry: BufferGeometry, c: string) => new Mesh(tint(geometry, c), PAINT());
const prod = (a: Vector3, b: Vector3, r: number, c: string, sides = 5) => { const m = rod(a, b, r, PAINT(), sides); tint(m.geometry, c); return m; };
/** The one geometry of a painted group (freeing its pieces). */
const fuse = (part: Group): BufferGeometry => (mergeByMaterial(part).children[0] as Mesh).geometry as BufferGeometry;

const GOLD = '#d0a030', RUSTY = '#9a5a3a', WHITE = '#e0e4ec', DARK = '#33353f', PANEL = '#3050b8', GREY = '#8a909c', YELLOW = '#d8b028';

// Many copies moving each on its own: one InstancedMesh (one draw call), its matrices set every frame.
const M = new Matrix4(), P = new Vector3(), Q = new Quaternion(), S = new Vector3(), E = new Euler();
/** Sets copy `i` of `m` at (x, y, z), turned by the angles `r` (in `order`), scaled (0 hides it). */
function put(m: InstancedMesh, i: number, x: number, y: number, z: number, r: [number, number, number] | null = null,
  sx = 1, sy = sx, sz = sx, order: EulerOrder = 'XYZ'): void {
  if (r) E.set(r[0], r[1], r[2], order); else E.set(0, 0, 0);
  m.setMatrixAt(i, M.compose(P.set(x, y, z), Q.setFromEuler(E), S.set(sx, sy, sz)));
}
/** `n` copies of a shape, as one animated part of the building: `move(mesh, t)` places them (with `put`) every frame. */
function copies(g: Group, geometry: BufferGeometry, material: Material, n: number, move: (m: InstancedMesh, t: number) => void): void {
  if (!n) { geometry.dispose(); return; }
  const m = new InstancedMesh(geometry, material, n);
  m.frustumCulled = false; // (its copies move: the bounds worked out at first would go stale)
  g.add(animated(new Group().add(m), 0, 0, 0, (_, time) => { move(m, time); m.instanceMatrix.needsUpdate = true; }));
}

/** Where the instrument booms leave the probe: [angle round it, height up it]. */
const BOOMS = [[Math.PI / 2, 0.35], [-Math.PI / 2, 0.35], [Math.PI / 3, 0.72], [Math.PI / 3 + Math.PI, 0.72]];
const RTG_AT = (3 * Math.PI) / 4;

/** A solar wing, from its hinge out along +x. */
function wingShape(): BufferGeometry {
  const w = new Group();
  w.add(at(paint(new BoxGeometry(1.8, 0.05, 0.7), PANEL), 1, 0, 0));
  for (const x of [0.4, 1, 1.6]) w.add(at(paint(new BoxGeometry(0.05, 0.07, 0.72), WHITE), x, 0, 0));
  w.add(at(paint(new BoxGeometry(0.12, 0.08, 0.3), GREY), 0.05, 0, 0));
  return fuse(w);
}
/** The radio dish, from its mount up. */
function dishShape(): BufferGeometry {
  const d = new Group();
  d.add(at(paint(new CylinderGeometry(0.62, 0.12, 0.26, 10), WHITE), 0, 0.2, 0));
  d.add(at(paint(new CylinderGeometry(0.03, 0.03, 0.4, 4), GREY), 0, 0.5, 0), at(paint(new BoxGeometry(0.14, 0.1, 0.14), DARK), 0, 0.7, 0));
  d.add(at(paint(new CylinderGeometry(0.08, 0.08, 0.14, 6), GREY), 0, 0.03, 0));
  return fuse(d);
}
/** An instrument boom along +x, 1 long, its instrument at the end. */
function boomShape(): BufferGeometry {
  const b = new Group();
  b.add(prod(v3(0, 0, 0), v3(1, 0, 0), 0.04, GREY, 4), at(paint(new BoxGeometry(0.24, 0.22, 0.2), WHITE), 1.05, 0, 0));
  b.add(at(paint(new BoxGeometry(0.06, 0.12, 0.12), DARK), 1.2, 0, 0));
  return fuse(b);
}

/** A probe at its level, its base at the origin: `stowed` for the flight (wings folded, booms in, all of it drawn), or
 *  in a bay, where only what does not move is drawn (wings, dish and booms are the bays' animated copies). */
function probe(p: Probes, stowed: boolean): Group {
  const g = new Group();
  if (p.solar) {
    g.add(at(paint(new CylinderGeometry(0.5, 0.5, 1, 8), GOLD), 0, 0.5, 0));
    g.add(at(paint(new CylinderGeometry(0.53, 0.53, 0.08, 8), DARK), 0, 0.96, 0), at(paint(new CylinderGeometry(0.53, 0.53, 0.08, 8), DARK), 0, 0.04, 0));
    g.add(at(paint(new BoxGeometry(0.3, 0.3, 0.06), WHITE), 0.15, 0.5, 0.48));
  } else { // (the scrap probe: a can with a whip aerial)
    g.add(at(paint(new CylinderGeometry(0.45, 0.45, 1, 8), RUSTY), 0, 0.5, 0));
    g.add(at(paint(new CylinderGeometry(0.48, 0.48, 0.1, 8), GREY), 0, 0.95, 0), at(paint(new CylinderGeometry(0.48, 0.48, 0.1, 8), GREY), 0, 0.3, 0));
  }
  if (!p.radio) g.add(prod(v3(0.2, 1, 0), v3(0.35, 1.7, 0), 0.03, GREY, 3));
  else if (stowed) g.add(new Mesh(dishShape(), PAINT()).translateY(1));
  if (p.solar && stowed) for (const side of [0, Math.PI]) {
    const w = new Mesh(wingShape(), PAINT());
    w.rotation.set(0, side, -Math.PI / 2);
    g.add(at(w, side ? -0.56 : 0.56, 0.9, 0));
  }
  if (p.ionEngine) {
    if (stowed) g.add(at(paint(new CylinderGeometry(0.56, 0.56, 0.1, 8), '#4aa8ff'), 0, 0.16, 0));
    else g.add(at(paint(new CylinderGeometry(0.2, 0.34, 0.26, 8), '#5a6a8a'), 0, -0.13, 0));
  }
  if (stowed) for (let k = 0; k < p.instruments; k++) {
    const b = new Mesh(boomShape(), PAINT());
    b.rotation.y = -BOOMS[k][0];
    g.add(at(b, -0.45 * Math.cos(BOOMS[k][0]), BOOMS[k][1], -0.45 * Math.sin(BOOMS[k][0])));
  }
  if (p.rtg) { // (the nuclear battery: a finned can out on a boom; kept short and on the upper side for the flight)
    const a = stowed ? -Math.PI / 2 : RTG_AT, out = stowed ? 0.75 : 1.2, cx = Math.cos(a), cz = Math.sin(a);
    g.add(prod(v3(cx * 0.4, 0.6, cz * 0.4), v3(cx * out, 0.5, cz * out), 0.04, GREY, 4));
    g.add(prod(v3(cx * out, 0.5, cz * out), v3(cx * (out + 0.5), 0.46, cz * (out + 0.5)), 0.12, DARK, 6));
    for (const d of [0.08, 0.25, 0.42]) g.add(prod(v3(cx * (out + d), 0.5, cz * (out + d)), v3(cx * (out + d + 0.04), 0.5, cz * (out + d + 0.04)), 0.24, '#4a4c58', 6));
  }
  return g;
}

/** How tall the probe on its rocket stands, and how far up it the probe starts. */
const stageHeight = (p: Probes): number => (p.booster ? 3.5 : 1.2);
const rocketHeight = (p: Probes): number => stageHeight(p) + 1 + (p.radio ? 0.75 : 0.7);

/** The probe on its rocket (a kick motor, or the booster), stowed for the flight, standing on the origin: one shape. */
function rocketShape(p: Probes): BufferGeometry {
  const g = new Group();
  if (p.booster) {
    g.add(at(paint(new CylinderGeometry(0.26, 0.44, 0.4, 8), DARK), 0, 0.2, 0));
    g.add(at(paint(new CylinderGeometry(0.55, 0.55, 2.8, 10), WHITE), 0, 1.8, 0));
    for (const y of [0.5, 2.3]) g.add(at(paint(new CylinderGeometry(0.57, 0.57, 0.16, 10), DARK), 0, y, 0));
    g.add(at(paint(new CylinderGeometry(0.57, 0.57, 0.3, 10), '#d83a3a'), 0, 2.75, 0));
    g.add(at(paint(new CylinderGeometry(0.5, 0.55, 0.3, 10), DARK), 0, 3.35, 0));
    for (let k = 0; k < 4; k++) {
      const fin = paint(new BoxGeometry(0.55, 0.9, 0.07), '#d83a3a');
      fin.rotation.y = Math.PI / 4 + (k * Math.PI) / 2;
      g.add(at(fin, Math.cos(Math.PI / 4 + (k * Math.PI) / 2) * 0.72, 0.85, -Math.sin(Math.PI / 4 + (k * Math.PI) / 2) * 0.72));
    }
  } else {
    g.add(at(paint(new CylinderGeometry(0.18, 0.32, 0.3, 8), DARK), 0, 0.15, 0));
    g.add(at(paint(new CylinderGeometry(0.38, 0.38, 0.9, 8), p.solar ? GREY : '#7a5a48'), 0, 0.75, 0));
    g.add(at(paint(new CylinderGeometry(0.4, 0.4, 0.12, 8), DARK), 0, 1.1, 0));
    for (let k = 0; k < 3; k++) {
      const a = Math.PI / 2 + (k * Math.PI * 2) / 3, fin = paint(new BoxGeometry(0.4, 0.5, 0.06), DARK);
      fin.rotation.y = a;
      g.add(at(fin, Math.cos(a) * 0.5, 0.55, -Math.sin(a) * 0.5));
    }
  }
  g.add(at(probe(p, true), 0, stageHeight(p), 0));
  return fuse(g);
}

// What moves, by upgrade (level):
//  1 Scrap probe      the launch cycle: the probe is put together, rolls out on its cart along the track, the launch
//                     rail tilts it up, it lights (a flame growing under it), climbs away out of sight, and the rail
//                     comes down for the next one
//  2 Workshop frame   welding sparks flicker round the probe in each bay
//  3 Solar wings      the bay probes' wings fold down and unfold again
//  4 Launch tower     its two swing arms hold the rocket and swing back before lift-off; its beacon blinks
//  5 Hangar roof      the ridge ventilators spin; the roof's lights blink
//  6 Radio dish       the bay probes' dishes turn, tilted, scanning
//  7 Ion engine       the engine's blue plume under each bay probe pulses (a test firing)
//  8 Gantry crane     the bridge travels up and down the hangar, its trolley and hook across it
//  9 Second bay       (its probe adds its own sparks, wings, dish, plume and booms: as 2, 3, 6, 7, 10)
// 10 Camera & spectr. the instrument booms slide out of the bay probes and back in
// 11 Launch pad       steam rises from the flame trench, and billows out of it at every launch
// 12 Sliding doors    the two leaves slide open before the roll-out and shut after the cart is back; their lights flash
// 13 Nuclear battery  the battery's core glows and pulses between its fins (and two more booms slide, as 10)
// 14 Booster stage    the probe rides the booster: a longer flame, and vapour venting off it while it waits
// 15 Probe fleet      three rockets roll out side by side and lift off one after another (and a third bay, as 9)
export function buildProbes(p: Probes): Group {
  const g = new Group();
  const lights: number[][] = []; // (x, y, z, size, 1 when it flashes with the doors)
  // The grid's cabinet (the cable over the sand ends at it), at every level.
  g.add(at(new Mesh(new BoxGeometry(1.2, 1.9, 0.9), bright()), 6.1, 0.95, -7));
  g.add(at(new Mesh(new BoxGeometry(0.3, 0.3, 0.1), glow('#40ff80')), 6.1, 1.5, -6.52));
  g.add(at(new Mesh(new BoxGeometry(0.7, 0.2, 0.1), hazard()), 6.1, 0.5, -6.52));
  heap(g, 6.4, -7.6, 1.1);
  if (p.level < 1) { // (the site, marked out)
    shadow(g, 3, LX, 0, 0.35);
    for (const [x, z] of [[-9, -14], [3, -14], [-9, 9], [3, 9]]) g.add(rod(v3(x, 0, z), v3(x, 1.2, z), 0.06, lambert('#c8282a'), 3));
    crate(g, -2, -2, 1.4, 0.4); crate(g, -4, -1, 1, 1.1);
    return g;
  }
  const n = p.perLaunch, H = rocketHeight(p), spread = (n - 1) * 0.75, period = PERIOD;
  const tilt = p.launcher === 'rail' ? (70 * Math.PI) / 180 : Math.PI / 2, up = Math.sin(tilt), fore = Math.cos(tilt);
  const framed = p.level >= 2, roofed = p.hangar !== 'frame', doors = p.hangar === 'doors', pad = p.launcher === 'pad';
  const xOf = (i: number) => LX + (i - (n - 1) / 2) * 1.5;
  const sAt = (time: number) => cycle(time, period) * period;

  // ---- The hangar ----
  if (framed) {
    shadow(g, 12.5, HX, HZ, 0.5);
    const mat = steel();
    for (let f = 0; f < 4; f++) {
      const z = HZ - HD + f * 4;
      for (const side of [-1, 1]) {
        g.add(at(new Mesh(new BoxGeometry(0.4, EAVE, 0.4), mat), HX + side * HW, EAVE / 2, z));
        g.add(at(new Mesh(new BoxGeometry(0.8, 0.25, 0.8), lambert('#3a3a48')), HX + side * HW, 0.12, z));
      }
      for (let j = 0; j < 8; j++) { // (the arch)
        const a = (Math.PI * j) / 8, b = (Math.PI * (j + 1)) / 8;
        g.add(rod(v3(HX - HW * Math.cos(a), EAVE + RISE * Math.sin(a), z), v3(HX - HW * Math.cos(b), EAVE + RISE * Math.sin(b), z), 0.14, mat, 4));
      }
      if (f < 3) g.add(rod(v3(HX - HW, EAVE, z), v3(HX - HW, 0.3, z + 4), 0.06, mat, 3), rod(v3(HX - HW, 0.3, z), v3(HX - HW, EAVE, z + 4), 0.06, mat, 3));
    }
    for (let j = 0; j <= 8; j += roofed ? 4 : 1) { // (purlins)
      const a = (Math.PI * j) / 8;
      g.add(rod(v3(HX - HW * Math.cos(a), EAVE + RISE * Math.sin(a), HZ - HD), v3(HX - HW * Math.cos(a), EAVE + RISE * Math.sin(a), FRONT), 0.09, mat, 4));
    }
    g.add(rod(v3(HX - HW, EAVE, HZ - HD), v3(HX + HW, 0.3, HZ - HD), 0.06, mat, 3), rod(v3(HX - HW, 0.3, HZ - HD), v3(HX + HW, EAVE, HZ - HD), 0.06, mat, 3));
    heap(g, HX - HW - 0.6, HZ - HD, 1.8); heap(g, HX + HW + 0.5, HZ - HD + 1, 1.5); heap(g, HX - HW - 0.5, FRONT - 1, 1.6); heap(g, HX - HW - 0.8, HZ, 1.3);
    ladder(g, HX - HW - 0.3, 0, HZ + 2, EAVE, Math.PI / 2);
    g.add(rod(v3(6.1, 1.9, -7), v3(HX + HW, 2.6, -7.6), 0.07, lambert('#1e1e26'), 4)); // (the cabinet's feed up the frame)
  }
  if (roofed) {
    const wall = textured('#7a7e88', repeated(metalTexture(0.5), 4, 2), true), low = textured(CONCRETE, repeated(concreteTexture(), 4, 0.5));
    g.add(at(new Mesh(new CylinderGeometry(HW + 0.2, HW + 0.2, HD * 2 + 0.6, 12, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(1, RISE / HW, 1),
      textured('#8a8e98', repeated(metalTexture(0.3), 6, 3), true)), HX, EAVE, HZ));
    g.add(at(new Mesh(new BoxGeometry(HW * 2, 0.1, HD * 2), textured(CONCRETE, repeated(concreteTexture(), 4, 3))), HX, 0.05, HZ)); // (a floor: no sand inside)
    g.add(at(new Mesh(new BoxGeometry(HW * 2, EAVE, 0.2), wall), HX, EAVE / 2, HZ - HD));
    g.add(at(new Mesh(new BoxGeometry(0.2, EAVE, HD * 2), wall), HX - HW, EAVE / 2, HZ));
    // The side towards the view stays open above a low wall, to see the bays.
    g.add(at(new Mesh(new BoxGeometry(0.3, 1.3, HD * 2), low), HX + HW, 0.65, HZ), at(new Mesh(new BoxGeometry(0.34, 0.2, HD * 2), hazard()), HX + HW, 1.4, HZ));
    for (const z of [HZ - HD, FRONT]) g.add(at(new Mesh(new CircleGeometry(HW, 8, 0, Math.PI).scale(1, RISE / HW, 1), wall), HX, EAVE, z));
    for (const side of [-1, 1]) g.add(at(new Mesh(new BoxGeometry(4.5, EAVE, 0.2), wall), HX + side * 5.75, EAVE / 2, FRONT));
    g.add(at(new Mesh(new BoxGeometry(7, 0.5, 0.2), wall), HX, EAVE - 0.25, FRONT));
    g.add(at(new Mesh(new BoxGeometry(3, 0.9, 0.1), glow('#ffd890')), HX + 5.6, 4.2, FRONT + 0.12)); // (a lit window band)
    g.add(at(new PointLight(LAMP, 200, 22, 1.4), HX, 5, HZ + 1));
    // Ridge ventilators, their caps spinning.
    const vents = [-13, -10, -7], cap = new Group();
    for (const z of vents) g.add(at(new Mesh(new CylinderGeometry(0.3, 0.4, 0.5, 8), steel()), HX, EAVE + RISE + 0.3, z));
    cap.add(paint(new CylinderGeometry(0.5, 0.5, 0.12, 8), GREY));
    for (let k = 0; k < 4; k++) cap.add(paint(new BoxGeometry(1.3, 0.3, 0.08), WHITE).rotateY((k * Math.PI) / 4));
    copies(g, fuse(cap), PAINT(), vents.length, (m, time) => vents.forEach((z, i) =>
      put(m, i, HX, EAVE + RISE + 0.7, z, [0, time * (2.2 + i * 0.5) + i, 0])));
    lights.push([HX, EAVE + RISE + 0.35, HZ - HD + 0.4, 0.3, 0], [HX, EAVE + RISE + 0.35, FRONT - 0.4, 0.3, 0]);
  }
  if (doors) {
    g.add(at(new Mesh(new BoxGeometry(HW * 2, 0.25, 0.4), steel()), HX, 5.75, FRONT + 0.3)); // (the doors' top track)
    g.add(at(new Mesh(new BoxGeometry(7, 0.06, 0.6), hazard()), HX, 0.2, FRONT + 0.3));
    copies(g, new BoxGeometry(3.5, 5.5, 0.18), textured('#c8a840', repeated(metalTexture(0.3), 2, 3)), 2, (m, time) => {
      const open = doorsOpen(sAt(time)) * 3.4;
      put(m, 0, HX - 1.75 - open, 2.85, FRONT + 0.3);
      put(m, 1, HX + 1.75 + open, 2.85, FRONT + 0.3);
    });
    lights.push([HX - 3.9, 6.1, FRONT + 0.4, 0.32, 1], [HX + 3.9, 6.1, FRONT + 0.4, 0.32, 1]);
  }

  // The gantry crane: rails along the eaves, a bridge travelling along them, a trolley and its hook across the bridge.
  if (p.crane) {
    const yellow = lambert('#c8a028'), span = HW - 0.5;
    for (const side of [-1, 1]) {
      g.add(rod(v3(HX + side * span, 5.05, HZ - HD), v3(HX + side * span, 5.05, FRONT), 0.1, steel(), 4));
      for (let f = 0; f < 4; f++) g.add(at(new Mesh(new BoxGeometry(0.5, 0.2, 0.3), steel()), HX + side * (span + 0.25), 4.9, HZ - HD + f * 4));
    }
    const bridge = new Group(), trolley = new Group();
    bridge.add(new Mesh(new BoxGeometry(span * 2, 0.5, 0.7), yellow));
    for (const side of [-1, 1]) bridge.add(at(new Mesh(new BoxGeometry(0.6, 0.4, 1.5), yellow), side * span, -0.15, 0));
    trolley.add(new Mesh(new BoxGeometry(1, 0.35, 1), yellow), at(new Mesh(new BoxGeometry(0.4, 0.35, 0.3), yellow), 0, -1.35, 0));
    trolley.add(rod(v3(0, 0, 0), v3(0, -1.3, 0), 0.04, lambert('#1e1e26'), 3));
    bridge.add(animated(trolley, 0, -0.4, 0, (o, time) => { o.position.x = 5.5 * Math.sin(time * 0.35 + 0.6); }));
    g.add(animated(bridge, HX, 5.5, HZ, (o, time) => { o.position.z = HZ - 0.4 + 4 * Math.sin(time * 0.22); }));
  }

  // ---- The bays: a probe standing on its cradle in each, a work platform and a ladder beside it ----
  const bays = BAYS.slice(0, p.bays);
  for (const [k, [x, z]] of bays.entries()) {
    const ring = new Mesh(new TorusGeometry(0.5, 0.07, 4, 10), steel());
    ring.rotation.x = Math.PI / 2;
    g.add(at(ring, x, STAND - 0.05, z));
    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) g.add(rod(v3(x + dx * 0.36, STAND - 0.05, z + dz * 0.36), v3(x + dx * 0.8, 0, z + dz * 0.8), 0.06, steel(), 4));
    g.add(at(probe(p, false), x, STAND, z));
    g.add(at(new Mesh(new BoxGeometry(1.6, 0.08, 0.7), textured('#6a707c', grateTexture())), x, 1.1, z + 1.25));
    for (const dx of [-0.7, 0.7]) g.add(rod(v3(x + dx, 0, z + 1.55), v3(x + dx, 1.1, z + 1.55), 0.05, steel(), 3));
    ladder(g, x - 1.1, 0, z + 1.3, 1.1, Math.PI / 2);
    crate(g, x + 1.7, z - 1.2, 0.8, 0.3 + k);
    if (!framed) heap(g, x, z, 1.5);
  }
  const each = <T>(per: number, f: (bay: number, j: number, x: number, z: number) => T): void =>
    bays.forEach(([x, z], b) => { for (let j = 0; j < per; j++) f(b, j, x, z); });
  if (framed) {
    copies(g, new BoxGeometry(0.16, 0.16, 0.16), glow('#fff6c0'), bays.length * 4, (m, time) => each(4, (b, j, x, z) => {
      const tick = Math.floor(time * 11), weld = Math.floor(time * 0.6 + b * 0.37), a = hash(weld + b * 17) * 6.28;
      const on = hash(weld * 3 + b * 5) > 0.3 && hash(tick * 7 + j * 13 + b * 31) > 0.45;
      const r = 0.6 + hash(tick + j * 3) * 0.5;
      put(m, b * 4 + j, x + Math.cos(a) * r, STAND + 0.7 - hash(tick * 5 + j) * 0.8, z + Math.sin(a) * r, null, on ? 0.7 + hash(tick + j) : 0);
    }));
  }
  if (p.solar) {
    copies(g, wingShape(), PAINT(), bays.length * 2, (m, time) => each(2, (b, j, x, z) => {
      const fold = (Math.PI / 2) * sm(Math.sin(time * 0.45 + b * 2.1), 0.2, 0.9);
      put(m, b * 2 + j, x + (j ? -0.56 : 0.56), STAND + 0.9, z, [0, j * Math.PI, -fold]);
    }));
  }
  if (p.radio) {
    copies(g, dishShape(), PAINT(), bays.length, (m, time) => each(1, (b, _, x, z) =>
      put(m, b, x, STAND + 1, z, [0.45, time * 0.7 + b * 2, 0], 1, 1, 1, 'YXZ')));
  }
  if (p.ionEngine) {
    copies(g, new ConeGeometry(0.26, 1, 6).rotateX(Math.PI).translate(0, -0.5, 0), glow('#7ad0ff'), bays.length, (m, time) => each(1, (b, _, x, z) => {
      const glowing = 0.55 + 0.3 * Math.sin(time * 2.3 + b * 1.9) + 0.08 * Math.sin(time * 17 + b);
      put(m, b, x, STAND - 0.26, z, null, 0.8 + glowing * 0.3, glowing, 0.8 + glowing * 0.3);
    }));
  }
  if (p.instruments) {
    copies(g, boomShape(), PAINT(), bays.length * p.instruments, (m, time) => each(p.instruments, (b, j, x, z) => {
      const out = -0.45 + 0.9 * (0.5 + 0.5 * Math.cos(time * 0.5 + b * 1.1 + j * 0.5)), a = BOOMS[j][0];
      put(m, b * p.instruments + j, x + out * Math.cos(a), STAND + BOOMS[j][1], z + out * Math.sin(a), [0, -a, 0]);
    }));
  }
  if (p.rtg) {
    copies(g, new BoxGeometry(0.36, 0.36, 0.36), glow('#ff7a30'), bays.length, (m, time) => each(1, (b, _, x, z) =>
      put(m, b, x + Math.cos(RTG_AT) * 1.45, STAND + 0.48, z + Math.sin(RTG_AT) * 1.45, [0, -RTG_AT, 0], 1 + 0.22 * Math.sin(time * 1.6 + b * 2))));
  }

  // ---- The track from the hangar to the launcher, and the cart on it ----
  const zEnd = LZ + H + 0.8;
  for (const side of [-1.1, 1.1]) g.add(rod(v3(LX + side, 0.24, -11.5), v3(LX + side, 0.24, zEnd), 0.07, bright(), 4));
  for (let z = -11; z < zEnd; z += 1.3) g.add(at(new Mesh(new BoxGeometry(2.9, 0.12, 0.3), lambert('#3a3030')), LX, 0.07, z));
  g.add(at(new Mesh(new BoxGeometry(2.6, 0.5, 0.25), hazard()), LX, 0.25, zEnd + 0.2)); // (the buffer)
  const long = Math.max(3, H * 0.9), cart = new Group();
  for (const side of [-0.8, 0.8]) cart.add(at(paint(new BoxGeometry(0.3, 0.3, long), YELLOW), side, 0.48, 0));
  for (const side of [-1.1, 1.1]) for (const end of [-1, 1]) cart.add(at(paint(new CylinderGeometry(0.25, 0.25, 0.16, 8).rotateZ(Math.PI / 2), DARK), side, 0.5, end * (long / 2 - 0.5)));
  for (const end of [-0.3, 0.3]) {
    for (let i = 0; i < n; i++) for (const side of [-0.5, 0.5]) cart.add(at(paint(new BoxGeometry(0.3, 0.22, 0.3), DARK), xOf(i) - LX + side, 0.7, end * long));
    if (n > 1) cart.add(at(paint(new BoxGeometry(4.3, 0.12, 0.3), YELLOW), 0, 0.55, end * long));
  }
  g.add(animated(cart, LX, 0, ZIN + long / 2, (o, time) => { o.position.z = ZIN + (LZ - ZIN) * cartOut(sAt(time)) + long / 2; }));

  // ---- The launcher: the rail (or the tower's strongback) that tilts the probe up, on its trunnions ----
  shadow(g, 5.5, LX, LZ + 1, 0.45);
  const railLong = p.launcher === 'rail' ? Math.max(H + 0.5, 4.2) : H + 0.3, railColour = p.launcher === 'rail' ? '#a06a48' : GREY, back = new Group();
  for (let i = 0; i < n; i++) {
    const x = xOf(i) - LX;
    back.add(at(paint(new BoxGeometry(0.26, railLong, 0.18), railColour), x, railLong / 2 - 0.3, GAP));
    for (const y of [0.22, 0.68]) back.add(at(paint(new BoxGeometry(0.5, 0.12, GAP - 0.3), DARK), x, H * y, GAP / 2 + 0.2));
    back.add(at(paint(new BoxGeometry(0.6, 0.12, GAP + 0.3), YELLOW), x, -0.06, GAP / 2 - 0.05));
    for (let y = 0.6; y < railLong - 0.4; y += 0.7) back.add(at(paint(new BoxGeometry(0.34, 0.08, 0.22), DARK), x, y, GAP));
  }
  g.add(animated(back, LX, PY, LZ, (o, time) => { o.rotation.set(Math.PI / 2 - tilt * erect(sAt(time)), 0, 0); }));
  const post = 1.7 + spread; // (the trunnion posts' distance from the track's line)
  for (const side of [-1, 1]) {
    const x = LX + side * post;
    if (p.launcher === 'rail') { // (trestles)
      for (const dz of [-0.6, 0.6]) g.add(rod(v3(x, 0, LZ + dz), v3(x, PY, LZ), 0.08, steel(), 4));
      g.add(rod(v3(x + side * 0.7, 0, LZ), v3(x, PY, LZ), 0.06, steel(), 4));
      heap(g, x + side * 0.4, LZ, 0.9);
    } else {
      g.add(at(new Mesh(new BoxGeometry(0.5, PY + 0.2, 0.9), textured(CONCRETE, concreteTexture())), x, (PY + 0.2) / 2, LZ));
      g.add(at(new Mesh(new BoxGeometry(0.54, 0.25, 0.94), hazard()), x, 0.5, LZ));
    }
    g.add(rod(v3(x, PY, LZ), v3(x - side * 0.3, PY, LZ), 0.1, bright(), 5));
  }

  // The probes on their rockets, and their flames. Each: up on the launcher, then away along its line; or (the next
  // one) growing in the hangar, rolling out lying on the cart, and tilted up with the rail.
  const flying = (s: number, i: number) => s - (5.5 + 0.6 * i); // (seconds since its lift-off; only before 10.5)
  copies(g, rocketShape(p), PAINT(), n, (m, time) => {
    const s = sAt(time);
    for (let i = 0; i < n; i++) {
      if (s < 10.5) {
        const tau = flying(s, i), d = tau > 0 ? 13 * tau * tau : 0;
        put(m, i, xOf(i), PY + up * d, LZ + fore * d, [Math.PI / 2 - tilt, 0, 0], d > 165 ? 0 : 1);
      } else {
        put(m, i, xOf(i), PY, ZIN + (LZ - ZIN) * sm(s, 13, 17.5), [Math.PI / 2 - tilt * erect(s), 0, 0], sm(s, 10.5, 12));
      }
    }
  });
  const wide = p.booster ? 1.25 : 0.75, longest = p.booster ? 4.6 : 2;
  copies(g, new ConeGeometry(0.42, 1, 6).rotateX(Math.PI).translate(0, -0.5, 0), glow('#ffc860'), n, (m, time) => {
    const s = sAt(time);
    for (let i = 0; i < n; i++) {
      const tau = flying(s, i), d = tau > 0 ? 13 * tau * tau : 0;
      const lit = s < 10.5 && tau > -1 && d <= 165 ? (tau < 0 ? (tau + 1) * 0.35 : 0.35 + 0.65 * Math.min(1, tau * 2)) : 0;
      const flick = 0.85 + 0.15 * Math.sin(time * 37 + i * 2);
      put(m, i, xOf(i), PY + up * d, LZ + fore * d, [Math.PI / 2 - tilt, 0, 0], lit ? wide * (0.7 + 0.3 * lit) : 0, longest * lit * flick, wide * (0.7 + 0.3 * lit));
    }
  });

  // The launch tower: a lattice beside the launcher with a railed top, a ladder, a beacon, and two swing arms.
  if (p.launcher !== 'rail') {
    const x = LX - post - 1.6, z = LZ - 0.9, top = 9, mat = steel();
    for (const [dx, dz] of [[-0.7, -0.7], [0.7, -0.7], [0.7, 0.7], [-0.7, 0.7]]) g.add(rod(v3(x + dx, 0, z + dz), v3(x + dx, top, z + dz), 0.1, mat, 4));
    for (let y = 1.5; y <= top; y += 1.5) {
      for (const [a, b] of [[-0.7, -0.7, 0.7, -0.7], [0.7, -0.7, 0.7, 0.7], [0.7, 0.7, -0.7, 0.7], [-0.7, 0.7, -0.7, -0.7]].map((c) => [v3(x + c[0], y, z + c[1]), v3(x + c[2], y, z + c[3])])) {
        g.add(rod(a, b, 0.05, mat, 3), rod(a.clone().setY(y - 1.5), b, 0.04, mat, 3));
      }
    }
    g.add(at(new Mesh(new BoxGeometry(2.2, 0.12, 2.2), textured('#6a707c', grateTexture())), x, top + 0.06, z));
    railing(g, x, top + 0.1, z, 1);
    g.add(rod(v3(x, top, z), v3(x, top + 3, z), 0.06, mat, 3));
    g.add(at(new Mesh(new BoxGeometry(1.6, 0.3, 1.6), hazard()), x, 0.5, z));
    ladder(g, x - 0.75, 0, z, top, Math.PI / 2);
    heap(g, x - 0.8, z - 0.8, 1.2);
    lights.push([x, top + 3.1, z, 0.36, 0]);
    const arms = new Group(), reach = xOf(n - 1) + 0.3 - (x + 0.7);
    for (const y of [PY + H * 0.25, PY + H * 0.5]) {
      arms.add(at(paint(new BoxGeometry(reach, 0.2, 0.2), YELLOW), reach / 2, y, 0));
      arms.add(prod(v3(0, y - 0.9, 0), v3(reach * 0.6, y - 0.1, 0), 0.05, DARK, 3));
      for (let i = 0; i < n; i++) arms.add(at(paint(new BoxGeometry(0.2, 0.26, 0.4), DARK), xOf(i) - (x + 0.7), y, 0.25));
    }
    arms.add(prod(v3(0, PY, 0), v3(0, PY + H * 0.5 + 0.3, 0), 0.09, DARK, 5));
    g.add(animated(arms, x + 0.7, 0, z, (o, time) => { o.rotation.y = 1.35 * armsBack(sAt(time)); }));
  }

  // The launch pad: a concrete slab and apron, and a flame trench off to the side of the launcher.
  const trench = LX + post + 0.9, trenchEnd = 8.5;
  if (pad) {
    const slab = textured(CONCRETE, repeated(concreteTexture(), 4, 3));
    g.add(at(new Mesh(new BoxGeometry(19, 0.16, 11.5), slab), 0, 0.08, LZ + 1.25));
    g.add(at(new Mesh(new BoxGeometry(5, 0.16, LZ - 4.5 - FRONT), slab), LX, 0.08, (FRONT + LZ - 4.5) / 2));
    for (const z of [LZ - 4.35, LZ + 6.85]) g.add(at(new Mesh(new BoxGeometry(19, 0.05, 0.3), hazard()), 0, 0.17, z));
    g.add(at(new Mesh(new BoxGeometry(2 + spread * 2, 0.04, 2.6), glow('#101016')), LX, 0.18, LZ)); // (scorched under the rocket)
    const len = trenchEnd - trench, mid = (trench + trenchEnd) / 2;
    g.add(at(new Mesh(new BoxGeometry(len, 0.04, 2), glow('#101016')), mid, 0.18, LZ));
    for (const side of [-1.15, 1.15]) {
      g.add(at(new Mesh(new BoxGeometry(len, 0.9, 0.3), slab), mid, 0.45, LZ + side));
      g.add(at(new Mesh(new BoxGeometry(len, 0.08, 0.34), hazard()), mid, 0.94, LZ + side));
    }
    g.add(at(new Mesh(new BoxGeometry(0.3, 1.3, 2.6).rotateZ(-0.5), slab), trench - 0.2, 0.55, LZ)); // (the deflector)
    heap(g, 9.8, LZ + 6.5, 1.6); heap(g, -9.8, LZ - 3, 1.5);
  } else heap(g, LX + 2.2, LZ + H + 1, 1.2);
  if (p.booster) { // (the booster's fuel: a sphere on legs, piped to the tower)
    const x = -12.5, z = 9.5;
    g.add(at(new Mesh(new SphereGeometry(1.4, 12, 8), textured('#c8ccd4', repeated(metalTexture(0.1), 3, 2))), x, 2.4, z));
    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) g.add(rod(v3(x + dx, 0, z + dz), v3(x + dx * 0.9, 2.4, z + dz * 0.9), 0.09, steel(), 4));
    g.add(at(new Mesh(new CylinderGeometry(1.42, 1.42, 0.3, 12, 1, true), hazard()), x, 2.4, z));
    groundPipe(g, [[x + 1, z], [LX - post - 1.6, z], [LX - post - 1.6, LZ]], 0.5, '#9aa0b0', 0.16);
    heap(g, x - 0.8, z + 0.6, 1.5);
  }
  // Steam from the trench (wisps, and billows at a launch) and vapour venting off the waiting booster.
  if (pad) {
    const PUFFS = 6;
    copies(g, new BoxGeometry(1, 1, 1), glow('#c8d0e0', 0.45), PUFFS + (p.booster ? n : 0), (m, time) => {
      const s = sAt(time), burst = sm(s, 4.5, 5.2) * (1 - sm(s, 9, 10.5));
      for (let k = 0; k < PUFFS; k++) {
        const u = cycle(time, 1.7, k / PUFFS), w = cycle(time, 5.5, k * 0.37);
        const big = (0.8 + 2.4 * u) * Math.min(1, (1 - u) * 3) * burst;
        if (big > 0.05) put(m, k, trench + 1.5 + u * (trenchEnd - trench), 0.7 + u * u * 5, LZ + (k % 3 - 1) * 0.5, [0, k + u, 0], big);
        else put(m, k, trench + 1 + (k * 1.9) % (trenchEnd - trench - 1), 0.5 + w * 2, LZ + (k % 3 - 1) * 0.4, [0, k, 0], k < 4 ? (0.3 + 0.5 * w) * Math.min(1, w * 6, (1 - w) * 3) : 0);
      }
      for (let i = 0; p.booster && i < n; i++) {
        const u = cycle(time, 2.3, i * 0.31), waiting = s < 4.5 ? 1 - sm(s, 4, 4.5) : sm(s, 20.5, 21.5);
        put(m, PUFFS + i, xOf(i) + 0.3, PY + 2.4 + u * 1.1, LZ + 0.7 + u * 0.5, null, waiting * (0.25 + 0.45 * u) * Math.min(1, (1 - u) * 3));
      }
    });
  }

  // Beacons blinking each in its turn (all lit at rest); the doors' lights flash while the doors move.
  copies(g, new BoxGeometry(1, 1, 1), glow(RED), lights.length, (m, time) => {
    const s = sAt(time), moving = (s > 11.5 && s < 13) || (s > 21.5 && s < 23);
    lights.forEach(([x, y, z, size, door], i) =>
      put(m, i, x, y, z, null, (door ? !moving || cycle(time, 0.5, i * 0.5) < 0.5 : cycle(time, 2.8, (i * 0.37) % 1) < 0.65) ? size : 0));
  });

  // Settled in: power from the cabinet to the launcher and the lamp, crates and barrels of parts, a work lamp.
  cable(g, [[6.4, -6.3], [5.8, -2], [2.5, 2.2], [LX + post + 0.4, LZ - 1.2]], 0.16);
  cable(g, [[6.9, -6.4], [10.6, 0], [10.8, 8], [9.2, 13.4]], 0.14);
  crate(g, 12.5, -1, 1.3, 0.3); crate(g, 13.8, 0.6, 1, 0.9); crate(g, 12.2, 0.9, 0.9, 1.4);
  barrel(g, -13, -1.5); barrel(g, -14.2, -0.8, false, '#3a5a7a'); barrel(g, -13.2, 0.4, true);
  crate(g, -8, 1.5, 1.1, 0.5);
  lamp(g, 9, 14, 9);
  return g;
}
