// The tank farm in 3D at its level (`Tanks`, core/tanks.ts): a pallet of rusty barrels at first, then upright tanks
// (conical roofs, ladders, railings, hazard bands and glowing level gauges) inside a concrete bund wall, spheres on
// legs with stairs, a pipe rack from the refinery and a header to the tanks, foam hydrants, a pump house, filling
// arms with hanging hoses for the ships, a pipeline to the dry dock and a beacon mast. White cladding at the top.
// Every upgrade moves something (see the map in `buildTanks`).
import {
  BoxGeometry, ConeGeometry, CylinderGeometry, Euler, Group, InstancedMesh, Matrix4, Mesh, Quaternion, SphereGeometry,
  TorusGeometry, Vector3, type BufferGeometry, type Material,
} from 'three';
import type { Tanks } from '../core/tanks';
import {
  animated, at, barrel, bright, cable, crate, cycle, glow, groundPipe, hazard, heap, ladder, lamp, lambert, pipeRack, railing,
  rod, shadow, steel, v3, warning, CONCRETE, FUEL_PIPE, RED,
} from './kit3d';
import { concreteTexture, metalTexture, repeated, textured } from './textures';

const FUEL = '#ffb030';
const UPRIGHTS = [[-11, -11], [-5.5, -11], [0, -11], [-11, -5.5], [-5.5, -5.5], [0, -5.5]];
const SPHERES = [[11, -11], [11, -2.5], [11, 6], [3.5, 6]];

// Many copies moving each on its own: one InstancedMesh (one draw call), its matrices set every frame.
const M = new Matrix4(), P = new Vector3(), Q = new Quaternion(), S = new Vector3(), E = new Euler();
/** Sets copy `i` of `m` at (x, y, z), turned `ry` round y, scaled (0 hides it). */
function put(m: InstancedMesh, i: number, x: number, y: number, z: number, ry = 0, sx = 1, sy = sx, sz = sx): void {
  m.setMatrixAt(i, M.compose(P.set(x, y, z), Q.setFromEuler(E.set(0, ry, 0)), S.set(sx, sy, sz)));
}
/** `n` copies of a shape, as one animated part of the building: `move(mesh, t)` places them (with `put`) every frame. */
function copies(g: Group, geometry: BufferGeometry, material: Material, n: number, move: (m: InstancedMesh, t: number) => void): void {
  if (!n) return;
  const m = new InstancedMesh(geometry, material, n);
  m.frustumCulled = false; // (its copies move: the bounds worked out at first would go stale)
  g.add(animated(new Group().add(m), 0, 0, 0, (_, time) => { move(m, time); m.instanceMatrix.needsUpdate = true; }));
}

// What moves, by upgrade (level):
//  1 Barrel stack    the lying barrel rocks to and fro on the sand
//  2 Upright tank    its roof light blinks and its roof vent turns (each tank, also 4, 8, 11, 14, adds its own)
//  3 Level gauges    the fuel column on every upright tank's gauge rises and falls
//  4 Second tank     (as 2)
//  5 Bund wall       the sump pump's beam by the south wall nods, draining the bund
//  6 Sphere          its top light blinks and its valve's handle turns (each sphere, also 10, 16, 18, adds its own)
//  7 Pipe rack       fuel pulses run along the three pipes from x = 17 on the lane to the junction's downpipe
//  8 Third tank      (as 2)
//  9 Foam hydrants   the foam monitor on its post sweeps from side to side
// 10 Second sphere   (as 6)
// 11 Fourth tank     (as 2)
// 12 Pump house      the flywheel on its wall spins
// 13 Big spheres     the relief valves puff vapour that rises off the top of each sphere
// 14 Tank row        (as 2)
// 15 Filling arm     the boom swings slowly round its post, hose and nozzle with it
// 16 Third sphere    (as 6)
// 17 Dock pipeline   fuel pulses run along the pipeline towards the dock
// 18 Fourth sphere   (as 6)
// 19 Cryo cladding   frost glints twinkle on the white tanks and spheres
// 20 Fuel station    the second arm swings out of step with the first; the beacon's lantern turns on its mast
export function buildTanks(t: Tanks): Group {
  const g = new Group();
  const lights: number[][] = [], turners: number[][] = [], gauges: number[][] = [], frost: number[][] = [];
  const skin = (u: number, v: number) => textured(t.cladding ? '#c8ccd4' : '#8a8e98', repeated(metalTexture(t.cladding ? 0.1 : 0.5), u, v));

  if (t.barrels) {
    g.add(at(new Mesh(new BoxGeometry(3.4, 0.25, 2.4), textured('#6a5a40', metalTexture(1))), -6, 0.12, 6));
    for (let k = 0; k < 6; k++) barrel(g, -7.2 + (k % 3) * 1.2, 5.4 + Math.floor(k / 3) * 1.2);
    barrel(g, -2.6, 5.4, true, '#3a5a7a');
    const loose = new Group();
    barrel(loose, 0, 0, true);
    loose.children[0].position.y = 0; // (round its axis, which lies along x: it rolls without slipping)
    g.add(animated(loose, -3, 0.55, 7.5, (o, time) => {
      const a = 0.4 * Math.sin(time * 0.7);
      o.rotation.x = a;
      o.position.z = (o.userData.at as Vector3).z + 0.55 * a;
    }));
    heap(g, -6, 6, 2.6);
  }

  // The bund: a low concrete wall round the upright tanks.
  if (t.bund) {
    const wall = textured(CONCRETE, repeated(concreteTexture(), 4, 0.4));
    for (const [x, z, w, d] of [[-5.5, -14.5, 19, 0.6], [-5.5, -2.2, 19, 0.6], [-14.7, -8.35, 0.6, 12.9], [3.7, -8.35, 0.6, 12.9]]) {
      g.add(at(new Mesh(new BoxGeometry(w, 1.1, d), wall), x, 0.55, z));
    }
    g.add(at(new Mesh(new BoxGeometry(2, 0.2, 0.66), hazard()), 1.5, 1.15, -2.2));
    // The sump pump: a drain through the wall to a wellhead, and a beam nodding on its post.
    const yellow = lambert('#c8a028');
    g.add(rod(v3(-7.8, 0.3, -2.2), v3(-7.8, 0.3, -1.2), 0.14, steel(), 5));
    g.add(at(new Mesh(new BoxGeometry(0.6, 0.6, 0.6), steel()), -7.8, 0.3, -1.2));
    g.add(rod(v3(-9, 0, -1.2), v3(-9, 1.5, -1.2), 0.12, steel(), 4));
    const beam = new Group();
    beam.add(new Mesh(new BoxGeometry(2.4, 0.18, 0.18), yellow));
    beam.add(at(new Mesh(new BoxGeometry(0.3, 0.6, 0.3), yellow), 1.2, -0.2, 0));
    beam.add(at(new Mesh(new BoxGeometry(0.5, 0.4, 0.4), yellow), -1.1, 0, 0));
    g.add(animated(beam, -9, 1.5, -1.2, (o, time) => { o.rotation.z = 0.22 * Math.sin(time * 1.1); }));
  }

  // Upright tanks.
  for (let k = 0; k < t.uprights; k++) {
    const [x, z] = UPRIGHTS[k], R = 2.2, H = 6;
    shadow(g, 3.4, x, z, 0.5);
    g.add(at(new Mesh(new CylinderGeometry(R, R, H, 16), skin(3, 2)), x, H / 2, z));
    g.add(at(new Mesh(new ConeGeometry(R + 0.1, 0.9, 16), steel()), x, H + 0.45, z));
    g.add(at(new Mesh(new CylinderGeometry(R + 0.02, R + 0.02, 0.45, 16, 1, true), hazard()), x, 0.5, z));
    ladder(g, x + R * 0.72, 0, z + R * 0.72, H, -Math.PI / 4);
    railing(g, x, H, z, R - 0.2);
    if (t.gauges) {
      g.add(at(new Mesh(new BoxGeometry(0.35, H * 0.8, 0.1), glow('#14141c')), x - R * 0.72, H / 2, z + R * 0.72).rotateY(-Math.PI / 4));
      gauges.push([x - R * 0.72, H * 0.1, z + R * 0.72, H * 0.8, 0.35 + ((k * 37) % 6) / 10]);
    }
    lights.push([x, H + 1, z, 0.3]);
    turners.push([x, H + 0.72, z, 0.5]);
    if (t.cladding) for (let a = 0; a < 3; a++) {
      const th = k * 1.3 + a * 2.1;
      frost.push([x + Math.cos(th) * (R + 0.05), 1.4 + ((k * 3 + a * 5) % 7) * 0.65, z + Math.sin(th) * (R + 0.05)]);
    }
    if (!t.bund) heap(g, x, z, R + 0.8);
  }

  // Spheres on legs, with a ring girder, stairs up the side and a valve on top.
  for (let k = 0; k < t.spheres; k++) {
    const [x, z] = SPHERES[k], R = t.bigSpheres ? 3.5 : 2.8, y = R + 1.6;
    shadow(g, R + 1.8, x, z, 0.55);
    g.add(at(new Mesh(new SphereGeometry(R, 18, 12), skin(4, 2)), x, y, z));
    const girder = new Mesh(new TorusGeometry(R, 0.2, 4, 20), steel());
    girder.rotation.x = Math.PI / 2;
    g.add(at(girder, x, y, z));
    for (let a = 0; a < 8; a++) {
      const th = (a / 8) * Math.PI * 2;
      g.add(rod(v3(x + Math.cos(th) * R, 0, z + Math.sin(th) * R), v3(x + Math.cos(th) * R, y, z + Math.sin(th) * R), 0.14, steel(), 4));
      if (a % 2 === 0) heap(g, x + Math.cos(th) * R, z + Math.sin(th) * R, 0.6);
    }
    ladder(g, x - R - 0.3, 0, z, y + R * 0.6, Math.PI / 2);
    g.add(at(new Mesh(new CylinderGeometry(0.4, 0.4, 0.8, 8), bright()), x, y + R + 0.3, z));
    lights.push([x, y + R + 0.9, z, 0.35]);
    turners.push([x, y + R + 0.55, z, -0.3]);
    if (t.cladding) for (let a = 0; a < 4; a++) {
      const th = k * 0.9 + a * 1.57 + 0.5, up = ((k + a) % 3 - 0.6) * 0.5, r = (R + 0.05) * Math.cos(up);
      frost.push([x + Math.cos(th) * r, y + (R + 0.05) * Math.sin(up), z + Math.sin(th) * r]);
    }
    if (t.gauges) g.add(at(new Mesh(new BoxGeometry(0.8, 0.5, 0.1), glow(FUEL)), x + R * 0.75, y - 0.4, z + R * 0.66).rotateY(Math.PI / 4));
  }

  // Roof and top lights blinking each in its turn (all lit at rest), vents and valve handles turning, gauge columns
  // rising and falling, vapour off the big spheres' relief valves, frost glinting on the cladding.
  copies(g, new BoxGeometry(1, 1, 1), glow(RED), lights.length, (m, time) => lights.forEach(([x, y, z, s], i) =>
    put(m, i, x, y, z, 0, cycle(time, 3.2, ((i * 0.37) % 1) * 0.6) < 0.65 ? s : 0)));
  copies(g, new BoxGeometry(1.6, 0.14, 0.24), bright(), turners.length, (m, time) => turners.forEach(([x, y, z, speed], i) =>
    put(m, i, x, y, z, i * 1.1 + time * speed)));
  copies(g, new BoxGeometry(0.36, 1, 0.12), glow(FUEL), gauges.length, (m, time) => gauges.forEach(([x, y, z, h, fill], i) => {
    const level = h * Math.min(0.96, Math.max(0.08, fill + 0.14 * Math.sin(time * 0.3 + i * 1.7)));
    put(m, i, x, y + level / 2, z, -Math.PI / 4, 1, level, 1);
  }));
  if (t.bigSpheres) {
    copies(g, new BoxGeometry(0.6, 0.6, 0.6), glow('#c8d0e0', 0.45), t.spheres, (m, time) => {
      for (let k = 0; k < t.spheres; k++) {
        const u = cycle(time, 7, k * 0.31 + 0.1) / 0.5; // (a puff for half the time, then a rest)
        const s = u > 1 ? 0 : (0.5 + u) * Math.min(1, (1 - u) * 4);
        put(m, k, SPHERES[k][0] + 0.7 + Math.min(u, 1) * 0.6, 3.5 * 2 + 1.6 + 0.8 + Math.min(u, 1) * 2.6, SPHERES[k][1], 0, s);
      }
    });
  }
  copies(g, new BoxGeometry(0.3, 0.3, 0.3), glow('#f0f8ff'), frost.length, (m, time) => frost.forEach(([x, y, z], i) =>
    put(m, i, x, y, z, 0, cycle(time, 5 + (i % 3), (i * 0.618) % 1) < 0.18 ? 1 : 0)));

  // The fuel line in from the refinery (always there; it meets the refinery's at x = 17 on the lane): on sleepers over
  // the sand, or on the pipe rack once there is one, to a junction by the tanks; from there a header to the upright
  // tanks, a trunk past the spheres to the filling arms, or (before any tank) a line to the barrels.
  if (t.pipes) {
    pipeRack(g, 17, -20, 17, -7, 2.4, 3, FUEL_PIPE);
    g.add(rod(v3(17, 2.4, -7), v3(17, 0.5, -7), 0.22, steel(), 6));
    // Fuel on its way in: glowing pulses along the three pipes, two a pipe, from the lane to the downpipe.
    copies(g, new CylinderGeometry(0.27, 0.27, 0.9, 6).rotateX(Math.PI / 2), glow(FUEL), 6, (m, time) => {
      for (let i = 0; i < 6; i++) {
        const c = cycle(time, 6, (i * 0.37) % 1);
        put(m, i, 17 + ((i % 3) - 1) * 0.6, 2.4, -20 + 0.45 + c * 12.1, 0, 1, 1, Math.min(1, c * 8, (1 - c) * 8));
      }
    });
  } else groundPipe(g, [[17, -20], [17, -7]]);
  const J: [number, number] = [6.6, -7];
  groundPipe(g, [[17, -7], J]);
  g.add(at(new Mesh(new BoxGeometry(0.8, 1, 0.8), bright()), J[0], 0.5, J[1])); // (the junction's valve box)
  if (t.uprights) {
    const left = Math.min(...UPRIGHTS.slice(0, t.uprights).map(([x]) => x));
    groundPipe(g, [J, [J[0], -8.25], [left, -8.25]], 1.4);
    g.add(rod(v3(J[0], 0.5, J[1]), v3(J[0], 1.4, J[1]), 0.22, steel(), 6));
  }
  if (t.barrels) groundPipe(g, [J, [J[0], 4], [-4.2, 5.5]]);
  const south = Math.max(t.spheres ? SPHERES[Math.min(t.spheres, 3) - 1][1] : J[1], t.arms ? 14.5 : J[1], t.spheres > 3 ? 2 : J[1], t.pumpHouse ? 10 : J[1]);
  if (south > J[1]) groundPipe(g, [J, [J[0], south]]);
  for (let k = 0; k < Math.min(3, t.spheres); k++) groundPipe(g, [[J[0], SPHERES[k][1]], [SPHERES[k][0] - (t.bigSpheres ? 3.5 : 2.8), SPHERES[k][1]]]);
  if (t.spheres > 3) groundPipe(g, [[J[0], 2], [SPHERES[3][0], 2], [SPHERES[3][0], 6 - (t.bigSpheres ? 3.5 : 2.8)]]);
  if (t.arms) groundPipe(g, [[J[0], 14.5], [5 + (t.arms - 1) * 7, 14.5]]);
  if (t.safety) {
    for (const [x, z] of [[-14, 1], [6, -15], [16, 12], [-2, 2]]) {
      g.add(at(new Mesh(new CylinderGeometry(0.25, 0.3, 1, 8), lambert('#c8282a')), x, 0.5, z));
      g.add(at(new Mesh(new SphereGeometry(0.28, 6, 4), lambert('#e83a3a')), x, 1.05, z));
    }
    g.add(rod(v3(6, 0, 1), v3(6, 4, 1), 0.12, steel(), 4));
    const monitor = new Group(); // (it sweeps round its post)
    monitor.add(new Mesh(new BoxGeometry(0.5, 0.4, 1.4), lambert('#c8282a')));
    monitor.add(at(new Mesh(new BoxGeometry(0.25, 0.25, 0.7), lambert('#c8282a')), 0, 0.05, 1));
    g.add(animated(monitor, 6, 4.2, 1, (o, time) => { o.rotation.y = 0.8 * Math.sin(time * 0.35); }));
  }
  if (t.pumpHouse) {
    const x = -11, z = 11;
    g.add(at(new Mesh(new BoxGeometry(5, 3, 4), textured(CONCRETE, repeated(concreteTexture(), 2, 1))), x, 1.5, z));
    g.add(at(new Mesh(new BoxGeometry(5.4, 0.3, 4.4), steel()), x, 3.15, z));
    g.add(at(new Mesh(new BoxGeometry(1.2, 2, 0.1), glow('#ffd890')), x + 1, 1, z + 2.02));
    for (let k = 0; k < 3; k++) g.add(at(new Mesh(new BoxGeometry(0.8, 0.15, 0.1), lambert('#1a1a20')), x - 1.2, 1.6 + k * 0.3, z + 2.02));
    g.add(rod(v3(x + 1.5, 3.3, z - 1), v3(x + 1.5, 5, z - 1), 0.25, steel(), 6));
    // A flywheel on the wall, turning on its axle.
    g.add(rod(v3(x + 2.5, 1.8, z + 0.8), v3(x + 2.8, 1.8, z + 0.8), 0.1, steel(), 5));
    const wheel = new Group(), rim = new Mesh(new TorusGeometry(0.75, 0.1, 4, 12), bright());
    rim.rotation.y = Math.PI / 2;
    wheel.add(rim, new Mesh(new BoxGeometry(0.1, 1.5, 0.14), bright()), new Mesh(new BoxGeometry(0.1, 0.14, 1.5), bright()));
    g.add(animated(wheel, x + 2.7, 1.8, z + 0.8, (o, time) => { o.rotation.x = time * 1.3; }));
    heap(g, x, z, 3.4);
    groundPipe(g, [[x + 2.5, z - 1], [6.6, z - 1]]); // (to the trunk from the tanks)
  }

  // Filling arms for the ships: a post with hazard stripes, a boom on a swivel swinging slowly round it, a hose with
  // its nozzle hanging from the boom's end, a spare hose on the sand.
  for (let k = 0; k < t.arms; k++) {
    const x = 5 + k * 7, z = 15.5;
    g.add(at(new Mesh(new CylinderGeometry(0.45, 0.6, 7, 8), hazard()), x, 3.5, z));
    const boom = new Group();
    boom.add(at(new Mesh(new CylinderGeometry(0.62, 0.62, 0.7, 8), bright()), 0, 6.6, 0));
    boom.add(rod(v3(0, 7, 0), v3(-5, 7.5, 0.5), 0.25, bright(), 6));
    boom.add(rod(v3(0, 6.4, 0), v3(-3.5, 7.3, 0.35), 0.08, bright(), 3));
    boom.add(rod(v3(-5, 7.4, 0.5), v3(-5, 1.5, 0.5), 0.15, lambert('#26262e'), 4));
    boom.add(at(new Mesh(new BoxGeometry(0.45, 0.6, 0.45), bright()), -5, 1.3, 0.5));
    g.add(animated(boom, x, 0, z, (o, time) => { o.rotation.y = 0.2 * Math.sin(time * 0.3 + k * 2); }));
    cable(g, [[x - 0.6, z + 0.4], [x - 2.6, z + 1.7], [x - 4, z + 2.4]], 0.18, '#26262e');
    warning(g, x, 7.4, z, 0.35);
    heap(g, x, z, 1.4);
  }
  if (t.pipeline) {
    const pipe = textured('#7a7e88', repeated(metalTexture(0.5), 1, 4));
    g.add(rod(v3(-13.5, 0.7, 9.5), v3(-20, 0.7, 9.5), 0.3, pipe, 6));
    for (const x of [-15, -18]) g.add(at(new Mesh(new BoxGeometry(0.4, 0.6, 1.2), lambert('#3a3030')), x, 0.3, 9.5));
    // Fuel on its way to the dock.
    copies(g, new CylinderGeometry(0.36, 0.36, 0.8, 6).rotateZ(Math.PI / 2), glow(FUEL), 2, (m, time) => {
      for (let i = 0; i < 2; i++) {
        const c = cycle(time, 4.5, i * 0.5 + 0.2);
        put(m, i, -13.9 - c * 5.7, 0.7, 9.5, 0, Math.min(1, c * 8, (1 - c) * 8), 1, 1);
      }
    });
  }
  if (t.beacon) {
    const x = -16, z = -16, mat = steel();
    for (const [dx, dz] of [[-0.7, -0.7], [0.7, -0.7], [0.7, 0.7], [-0.7, 0.7]]) g.add(rod(v3(x + dx, 0, z + dz), v3(x + dx * 0.2, 13, z + dz * 0.2), 0.08, mat, 3));
    const lantern = new Group(); // (the lamp and its two beams, turning)
    lantern.add(new Mesh(new SphereGeometry(0.6, 6, 4), glow(RED)), new Mesh(new BoxGeometry(2.2, 0.3, 0.3), glow(RED)));
    g.add(animated(lantern, x, 13.5, z, (o, time) => { o.rotation.y = time * 1.2; }));
    heap(g, x, z, 1.6);
  }

  crate(g, 15, 15, 1.3, 0.3); crate(g, 16.4, 13.8, 1, 0.9);
  lamp(g, -17, 3);
  return g;
}
