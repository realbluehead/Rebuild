// The bluetreri refinery in 3D at its level (`Refinery`, core/refinery.ts): sacks of ore at first, then hoppers with
// hazard bands over jaw crushers, a conveyor belt carrying glowing ore up to open vats of blue fuel (bubbling, with
// rims, ladders and, later, burners glowing underneath), a centrifuge, distillation columns with platforms and sight
// glasses, and at the top a pressure core in a cage of rings. A pipe rack carries the fuel out towards the tank farm.
// It moves (`animated`, kit3d): see the list of what each upgrade sets going at `buildRefinery`.
import {
  BoxGeometry, ConeGeometry, CylinderGeometry, Euler, Group, InstancedMesh, Matrix4, Mesh, PointLight, Quaternion,
  SphereGeometry, TorusGeometry, Vector3, type BufferGeometry, type Material,
} from 'three';
import type { Refinery } from '../core/refinery';
import {
  animated, at, bright, crate, cycle, glow, groundPipe, hazard, heap, ladder, lamp, lambert, pipeRack, railing, rod, shadow, steel,
  v3, warning, CONCRETE, FUEL_PIPE, OBSIDIAN,
} from './kit3d';
import { concreteTexture, metalTexture, repeated, sackTexture, textured } from './textures';

const BLUE = '#3ac8ff';
const VATS = [[-2, -2], [3.5, -2], [9, -2], [-2, 3.5], [3.5, 3.5]];


// Moving pieces. Many small things move each on its own (lumps, bubbles, flames, needles): they are instances of a
// unit shape, all those of one shape and material in ONE InstancedMesh (one draw call), inside one animated part.
type Shape = 'box' | 'disc' | 'ring' | 'ball';
/** Places instance `i` of a mover: position, size (0 hides it), then its turn (tilt `rx` and roll `rz` first, `ry` round the vertical last). */
type Put = (i: number, x: number, y: number, z: number, sx: number, sy?: number, sz?: number, rx?: number, ry?: number, rz?: number) => void;
interface Mover { shape: Shape; mat: Material; n: number; move: (t: number, put: Put) => void }

const SHAPES: Record<Shape, () => BufferGeometry> = {
  box: () => new BoxGeometry(1, 1, 1),
  disc: () => new CylinderGeometry(1, 1, 1, 14),
  ring: () => new TorusGeometry(1, 0.06, 4, 24), // (in its own XY plane, like three's torus)
  ball: () => new SphereGeometry(1, 14, 10),
};
const M = new Matrix4(), P = new Vector3(), S = new Vector3(), Q = new Quaternion(), E = new Euler(0, 0, 0, 'YXZ');
const frac = (v: number) => v - Math.floor(v);
/** A fixed "random" 0..1 for a pair of whole numbers. */
const hash = (a: number, b: number) => frac(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453);

/** The animated part drawing all the `movers`: one InstancedMesh per shape and material. */
function movingPart(movers: Mover[]): Group {
  const part = new Group(), meshes: InstancedMesh[] = [], runs: ((t: number) => void)[] = [];
  const pools = new Map<string, Mover[]>();
  for (const m of movers) {
    const key = `${m.shape}|${m.mat.uuid}`;
    pools.set(key, [...(pools.get(key) ?? []), m]);
  }
  for (const pool of pools.values()) {
    const mesh = new InstancedMesh(SHAPES[pool[0].shape](), pool[0].mat, pool.reduce((n, m) => n + m.n, 0));
    mesh.frustumCulled = false; // (its instances move: the bounds worked out once would go stale)
    let base = 0;
    for (const m of pool) {
      const from = base;
      const put: Put = (i, x, y, z, sx, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) => {
        M.compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz));
        mesh.setMatrixAt(from + i, M);
      };
      runs.push((t) => m.move(t, put));
      base += m.n;
    }
    meshes.push(mesh);
    part.add(mesh);
  }
  return animated(part, 0, 0, 0, (_o, t) => {
    for (const run of runs) run(t);
    for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
  });
}

/** What moves, by upgrade (level):
 *   1 Scrap still        every vat's fuel surface ripples; the first vat bubbles and drips from its spout into the puddle
 *   2 Ore hopper         ore lumps drop from the hopper's mouth
 *   3 Conveyor belt      ore lumps ride the belt up and fall into the first vat
 *   4 Second vat         its own bubbles rising and popping (and its surface), like each later vat
 *   5 Sand filters       two sieve trays shake over their pans, fuel dripping through
 *   6 Jaw crusher        a jaw chews on top of the crusher; the flywheel's spokes turn (round its axle)
 *   7 Third vat          its bubbles
 *   8 Burners            flames flicker on the burner ring under every vat
 *   9 Centrifuge         the rotor's arms spin round the drum
 *  10 Big vats           an agitator's paddles turn in every vat (and five bubbles each instead of three)
 *  11 Pipe rack          fuel pulses run along the rack's pipes out at x = 17; valve handwheels turn back and forth
 *  12 Fourth vat         its bubbles
 *  13 Distillation col.  puffs vent from its top; the levels in its sight glasses bob
 *  14 Catalyst           the reactor's glowing bed breathes
 *  15 Fifth vat          its bubbles
 *  16 Second ore line    its own drops, belt lumps, jaw and flywheel
 *  17 Second column      its own puffs and sight glass levels
 *  18 Vacuum still       its gauge's needle swings
 *  19 Pressure core      the cage's rings turn round the core, which pulses
 *  20 Core overdrive     a third ring, all faster; the white heart beats through the shell; sparks fly off
 *  Draw calls: one per shape and material among the movers (14 at level 20, with the centrifuge's rotor). */
export function buildRefinery(r: Refinery): Group {
  const g = new Group();
  const ore = glow('#2a8ac8'), fuel = glow(BLUE), foam = glow('#c8f4ff'), red = lambert('#c8282a');
  const movers: Mover[] = [];
  const move = (shape: Shape, mat: Material, n: number, fn: Mover['move']) => { if (n > 0) movers.push({ shape, mat, n, move: fn }); };
  const R = r.bigVats ? 2.2 : 1.6, Hv = r.bigVats ? 3.2 : 2.4, lift = r.burners ? 0.8 : 0, surf = lift + Hv - 0.35;

  // Ore: sacks by hand at first, then hoppers (and crushers) feeding a conveyor.
  if (r.hoppers === 0) {
    const sack = textured('#8a7a5a', sackTexture());
    for (let k = 0; k < 7; k++) {
      const s = new Mesh(new SphereGeometry(0.7, 7, 5), sack);
      s.scale.set(1, 0.6, 0.8);
      s.rotation.y = k;
      g.add(at(s, -8 + (k % 4) * 1.2 + (k > 3 ? 0.6 : 0), 0.4 + (k > 3 ? 0.7 : 0), -6 + (k % 2) * 0.4));
    }
    for (let k = 0; k < 6; k++) g.add(at(new Mesh(new BoxGeometry(0.25, 0.25, 0.25), ore), -6 + k * 0.5, 0.15, -4.6 + (k % 3) * 0.3));
  }
  for (let k = 0; k < r.hoppers; k++) {
    const x = -13, z = -12 + k * 7;
    for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [1.6, 1.6], [-1.6, 1.6]]) {
      g.add(rod(v3(x + dx, 0, z + dz), v3(x + dx, 5.5, z + dz), 0.14, steel(), 4));
      heap(g, x + dx, z + dz, 0.6);
    }
    const funnel = new Mesh(new ConeGeometry(2.6, 3, 4, 1, true), textured('#5a5040', metalTexture(1), true));
    funnel.rotation.set(Math.PI, Math.PI / 4, 0);
    g.add(at(funnel, x, 5.5, z));
    const rim = new Mesh(new BoxGeometry(3.8, 0.5, 3.8), hazard());
    g.add(at(rim, x, 7.1, z));
    const pile = new Mesh(new SphereGeometry(1.6, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), ore);
    pile.scale.y = 0.5;
    g.add(at(pile, x, 7, z));
    // Lumps dropping from the hopper's mouth: into the crusher's jaws, or onto a pile on the sand.
    const floor = r.crusher ? 3.3 : 0.3;
    move('box', ore, 3, (t, put) => {
      for (let i = 0; i < 3; i++) {
        const p = cycle(t, 2.4, i / 3 + k * 0.17);
        put(i, x + (i - 1) * 0.14, 4 - (4 - floor) * p * p, z + (i - 1) * 0.1, 0.28);
      }
    });
    if (r.crusher) {
      g.add(at(new Mesh(new BoxGeometry(2.4, 2, 2.4), textured(OBSIDIAN, metalTexture(0.6))), x, 1.8, z));
      const wheel = new Mesh(new TorusGeometry(1, 0.2, 4, 12), bright());
      g.add(at(wheel, x, 2, z + 1.4));
      g.add(at(new Mesh(new BoxGeometry(2.5, 0.35, 2.5), hazard()), x, 2.95, z));
      g.add(rod(v3(x, 2, z + 1.1), v3(x, 2, z + 1.6), 0.14, steel(), 5)); // (the flywheel's axle)
      move('box', steel(), 4, (t, put) => {
        const a = t * 1.1 + k, bite = 0.5 - 0.5 * Math.cos(t * 2.2 + k * 1.3); // (0: open, at rest)
        put(0, x, 2, z + 1.4, 1.8, 0.14, 0.12, 0, 0, a); // (spokes, turning round the axle)
        put(1, x, 2, z + 1.4, 1.8, 0.14, 0.12, 0, 0, a + Math.PI / 2);
        put(2, x - 0.55, 3.45, z, 0.3, 0.75, 1.8, 0, 0, 0.25); // (the fixed jaw)
        put(3, x + 0.6 - bite * 0.45, 3.45, z, 0.3, 0.75, 1.8, 0, 0, -0.25 - bite * 0.15);
      });
    } else {
      const fallen = new Mesh(new SphereGeometry(0.9, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), ore);
      fallen.scale.y = 0.45;
      g.add(at(fallen, x, 0, z));
    }
  }
  if (r.conveyor) {
    const lines = Math.max(1, r.hoppers);
    for (let k = 0; k < lines; k++) {
      const z0 = -12 + k * 7, a = v3(-11.5, 1.4, z0), b = v3(-3.5, 4.2, -2 + k * 1.5);
      const d = b.clone().sub(a), len = d.length();
      const belt = new Mesh(new BoxGeometry(len, 0.25, 1.2), lambert('#1e1e24'));
      belt.position.copy(a).addScaledVector(d, 0.5);
      belt.rotation.y = -Math.atan2(d.z, d.x);
      belt.rotateZ(Math.atan2(d.y, Math.hypot(d.x, d.z)));
      g.add(belt);
      for (let t = 0.1; t < 1; t += 0.2) {
        const p = a.clone().addScaledVector(d, t);
        g.add(rod(v3(p.x, 0, p.z - 0.5), v3(p.x, p.y - 0.1, p.z - 0.5), 0.07, steel(), 3), rod(v3(p.x, 0, p.z + 0.5), v3(p.x, p.y - 0.1, p.z + 0.5), 0.07, steel(), 3));
      }
      // Lumps riding up the belt, then falling off its end into the first vat.
      const inX = VATS[0][0] - 0.7, inZ = VATS[0][1] + k * 0.6;
      move('box', ore, 5, (t, put) => {
        for (let i = 0; i < 5; i++) {
          const p = cycle(t, 11, (i + 0.5) / 5 + k * 0.07), u = Math.min(1, p / 0.92), f = Math.max(0, (p - 0.92) / 0.08);
          put(i, a.x + d.x * u + (inX - b.x) * f, a.y + d.y * u + 0.25 - (b.y + 0.25 - surf) * f * f, a.z + d.z * u + (inZ - b.z) * f, 0.4, 0.3, 0.4);
        }
      });
    }
  }

  // Vats of glowing fuel: open steel, a rim, bubbles, a ladder; on legs over burners once there are some.
  const bubbles = r.bigVats ? 5 : 3;
  shadow(g, 9, 3, 0, 0.45);
  for (let k = 0; k < r.vats; k++) {
    const [x, z] = VATS[k];
    const wall = new Mesh(new CylinderGeometry(R, R * 0.92, Hv, 14, 1, true), textured('#7a7e88', repeated(metalTexture(0.6), 2, 1), true));
    g.add(at(wall, x, lift + Hv / 2, z));
    g.add(at(new Mesh(new CylinderGeometry(R * 0.92, R * 0.92, 0.15, 14), steel()), x, lift + 0.08, z));
    const rim = new Mesh(new TorusGeometry(R, 0.14, 4, 16), bright());
    rim.rotation.x = Math.PI / 2;
    g.add(at(rim, x, lift + Hv, z));
    // Its bubbles: each rises out of the fuel, swells and pops.
    move('box', foam, bubbles, (t, put) => {
      for (let b = 0; b < bubbles; b++) {
        const p = cycle(t, 2.6 + b * 0.35, b / bubbles + k * 0.23), s = 0.2 + (b % 3) * 0.05;
        put(b, x + Math.cos(b * 2.1 + k) * R * 0.5, surf + 0.12 + p * 0.8, z + Math.sin(b * 2.1 + k) * R * 0.5, p < 0.85 ? s * (0.5 + 0.6 * p) : p < 0.93 ? s * 1.5 : 0);
      }
    });
    if (r.bigVats) {
      // An agitator: a beam over the rim, a motor, a shaft down into the fuel; its paddles turn round the shaft.
      const top = lift + Hv + 0.6;
      for (const s of [-1, 1]) g.add(rod(v3(x + s * R, lift + Hv, z), v3(x + s * R, top, z), 0.08, steel(), 4));
      g.add(rod(v3(x - R, top, z), v3(x + R, top, z), 0.1, steel(), 4), rod(v3(x, top, z), v3(x, surf, z), 0.07, steel(), 4));
      g.add(at(new Mesh(new BoxGeometry(0.6, 0.5, 0.6), textured(OBSIDIAN, metalTexture(0.6))), x, top + 0.2, z));
      move('box', steel(), 2, (t, put) => {
        for (let i = 0; i < 2; i++) put(i, x, surf + 0.18, z, R * 1.3, 0.14, 0.26, 0, t * 0.7 + k + i * Math.PI / 2, 0);
      });
    }
    ladder(g, x + R * 0.71, 0, z + R * 0.71, lift + Hv, -Math.PI / 4);
    if (r.burners) {
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.add(rod(v3(x + dx * R * 0.6, 0, z + dz * R * 0.6), v3(x + dx * R * 0.6, lift, z + dz * R * 0.6), 0.1, steel(), 4));
      const fire = new Mesh(new TorusGeometry(R * 0.5, 0.15, 3, 12), glow('#ff8a20'));
      fire.rotation.x = Math.PI / 2;
      g.add(at(fire, x, 0.35, z));
      move('box', glow('#ffd070'), 4, (t, put) => {
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + k, h = 0.3 + 0.1 * Math.sin(t * 7 + i * 2.3 + k) + 0.05 * Math.sin(t * 13 + i);
          put(i, x + Math.cos(a) * R * 0.5, 0.35 + h / 2, z + Math.sin(a) * R * 0.5, 0.24, h, 0.24);
        }
      });
    } else heap(g, x, z, R + 0.6);
    // A spill: a faint blue puddle by the vat.
    const puddle = new Mesh(new CylinderGeometry(0.9, 0.9, 0.03, 10), glow(BLUE, 0.3));
    g.add(at(puddle, x - R - 0.4, 0.05, z + 0.6));
  }
  // Every vat's fuel: its surface ripples (it swells a little and bobs).
  move('disc', fuel, r.vats, (t, put) => {
    for (let k = 0; k < r.vats; k++) {
      const s = R * 0.95 * (1 + 0.015 * Math.sin(t * 0.9 + k * 1.9));
      put(k, VATS[k][0], surf + 0.05 * Math.sin(t * 1.3 + k * 1.7), VATS[k][1], s, 0.1, s);
    }
  });
  // The first vat leaks: a spout over its puddle, dripping.
  const spoutX = VATS[0][0] - R - 0.4, spoutZ = VATS[0][1] + 0.6;
  g.add(rod(v3(spoutX + 0.7, lift + 0.9, spoutZ), v3(spoutX, lift + 0.9, spoutZ), 0.08, steel(), 4));
  move('box', fuel, 1, (t, put) => {
    const p = cycle(t, 3.2) / 0.3;
    put(0, spoutX, lift + 0.78 - (lift + 0.68) * p * p, spoutZ, p < 1 ? 0.14 : 0);
  });
  g.add(at(new PointLight(BLUE, 140 + r.vats * 50, 24, 1.3), 3, 6, 1));
  if (r.burners) g.add(at(new PointLight('#ff8a30', 60, 12, 1.5), 3, 0.6, 1));
  // Pipes from the vats to the processing (centrifuge, columns).
  const vatPipe = textured('#8a8e98', metalTexture(0.5));
  const headerZ = VATS[0][1] - R;
  if (r.vats > 1) g.add(rod(v3(VATS[0][0], lift + 0.6, headerZ), v3(VATS[Math.min(2, r.vats - 1)][0], lift + 0.6, headerZ), 0.2, vatPipe, 6));

  // Sand filters: two sieve trays of sand shaking on a frame, fuel dripping through into pans piped to the vats.
  if (r.purity >= 55) {
    const z = -8, trays = [1.5, 4.2];
    for (const x of trays) {
      for (const [dx, dz] of [[-0.9, -0.6], [0.9, -0.6], [0.9, 0.6], [-0.9, 0.6]]) g.add(rod(v3(x + dx, 0, z + dz), v3(x + dx, 1.7, z + dz), 0.08, steel(), 4));
      for (const dz of [-0.6, 0.6]) g.add(rod(v3(x - 0.9, 1.65, z + dz), v3(x + 0.9, 1.65, z + dz), 0.07, steel(), 4));
      g.add(at(new Mesh(new BoxGeometry(2, 0.3, 1.4), textured(OBSIDIAN, metalTexture(0.6))), x, 0.75, z));
    }
    g.add(rod(v3(trays[0], 0.75, z), v3(trays[1], 0.75, z), 0.15, vatPipe, 6));
    g.add(rod(v3(trays[0], 0.75, z + 0.6), v3(trays[0], lift + 0.6, headerZ), 0.15, vatPipe, 6));
    move('box', lambert('#8a86a8'), 2, (t, put) => {
      trays.forEach((x, j) => put(j, x + 0.1 * Math.sin(t * 9 + j * 2), 1.88, z + 0.05 * Math.sin(t * 9 + j * 2 + 1.5), 2.1, 0.32, 1.5));
    });
    move('box', fuel, 4, (t, put) => {
      for (let i = 0; i < 4; i++) {
        const p = cycle(t, 1.7 + i * 0.2, i / 4);
        put(i, trays[i % 2] + (i < 2 ? -0.5 : 0.5), 1.65 - 0.7 * p * p, z + (i % 2 ? 0.25 : -0.25), 0.12);
      }
    });
  }

  // The catalyst reactor: a drum split by a caged bed that glows, breathing.
  if (r.purity >= 85) {
    const x = 7.6, z = -8.2, drum = textured('#6a6e7a', metalTexture(0.5));
    g.add(at(new Mesh(new CylinderGeometry(1.1, 1.2, 1.2, 12), drum), x, 0.6, z), at(new Mesh(new CylinderGeometry(1.1, 1.1, 1.2, 12), drum), x, 2.9, z));
    g.add(at(new Mesh(new SphereGeometry(1.1, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2), bright()), x, 3.5, z));
    g.add(at(new Mesh(new CylinderGeometry(0.72, 0.72, 1.1, 10), glow('#6a2a98')), x, 1.75, z));
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; g.add(rod(v3(x + Math.cos(a), 1.2, z + Math.sin(a)), v3(x + Math.cos(a), 2.3, z + Math.sin(a)), 0.06, steel(), 3)); }
    g.add(rod(v3(x, 0.7, z + 1), v3(x, lift + 0.6, headerZ), 0.15, vatPipe, 6));
    heap(g, x, z, 1.7);
    move('disc', glow('#e48aff'), 1, (t, put) => {
      const breath = 0.5 - 0.5 * Math.cos(t * 0.9);
      put(0, x, 1.75, z, 0.76 + 0.1 * breath, 0.3 + 0.7 * breath, 0.76 + 0.1 * breath);
    });
  }

  // The vacuum still: a tank lying on saddles, piped into the fuel line; the needle of its big gauge swings.
  if (r.purity >= 95) {
    const x = -9, y = 2, z0 = 3.2, z1 = 7.8;
    const tank = new Mesh(new CylinderGeometry(1.2, 1.2, z1 - z0, 12), textured('#8a8e98', repeated(metalTexture(0.5), 2, 1)));
    tank.rotation.x = Math.PI / 2;
    g.add(at(tank, x, y, (z0 + z1) / 2));
    for (const z of [z0 + 1, z1 - 1]) {
      g.add(at(new Mesh(new BoxGeometry(2.2, 1, 0.6), textured(CONCRETE, concreteTexture())), x, 0.5, z));
      const band = new Mesh(new TorusGeometry(1.22, 0.08, 3, 14), hazard());
      g.add(at(band, x, y, z));
      heap(g, x, z, 1.3);
    }
    g.add(rod(v3(x, y + 1.1, z0 + 1), v3(x, y + 2.2, z0 + 1), 0.15, steel(), 5)); // (a vent)
    const dial = new Mesh(new CylinderGeometry(0.75, 0.75, 0.1, 12), glow('#c8d0dc'));
    dial.rotation.x = Math.PI / 2;
    g.add(at(dial, x, y, z1 + 0.03), at(new Mesh(new TorusGeometry(0.75, 0.08, 3, 12), bright()), x, y, z1 + 0.08));
    g.add(rod(v3(x + 1, 1.2, 5.5), v3(-4.7, 0.5, 5.5), 0.15, vatPipe, 6));
    move('box', red, 1, (t, put) => {
      const a = -0.3 + 0.7 * Math.sin(t * 0.6) + 0.06 * Math.sin(t * 4.1); // (round the dial's middle)
      put(0, x - Math.sin(a) * 0.3, y + Math.cos(a) * 0.3, z1 + 0.12, 0.1, 0.62, 0.06, 0, 0, a);
    });
  }

  if (r.centrifuge) {
    const x = 10, z = 6;
    g.add(at(new Mesh(new CylinderGeometry(2, 2.2, 1.6, 14), textured(CONCRETE, concreteTexture())), x, 0.8, z));
    g.add(at(new Mesh(new CylinderGeometry(1.5, 1.5, 2, 14), steel()), x, 2.6, z));
    g.add(at(new Mesh(new SphereGeometry(1.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), bright()), x, 3.6, z));
    // The rotor: four arms with weights, spinning round the drum's axis.
    const rotor = new Group();
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      rotor.add(rod(v3(0, 0, 0), v3(Math.cos(a) * 2.4, 0, Math.sin(a) * 2.4), 0.12, steel(), 4));
      rotor.add(at(new Mesh(new BoxGeometry(0.45, 0.45, 0.45), steel()), Math.cos(a) * 2.4, 0, Math.sin(a) * 2.4).rotateY(-a));
    }
    g.add(animated(rotor, x, 3, z, (o, t) => { o.rotation.y = t * 1.3; }));
    g.add(at(new Mesh(new BoxGeometry(0.8, 0.5, 0.1), glow(BLUE)), x + 1.06, 2.6, z + 1.06).rotateY(Math.PI / 4));
    g.add(rod(v3(VATS[1][0], lift + 0.6, VATS[1][1] + R), v3(x - 1.5, 2, z), 0.2, vatPipe, 6));
  }

  // Distillation columns: tall, ringed with railed platforms, a ladder, sight glasses glowing blue, a pilot flame.
  const colSpots = [[12, -10], [16, -5]];
  for (let k = 0; k < r.columns; k++) {
    const [x, z] = colSpots[k], Hc = 11 + k * 3, glasses: number[] = [];
    g.add(at(new Mesh(new CylinderGeometry(1.2, 1.4, Hc, 12), textured('#8a8e98', repeated(metalTexture(0.5), 1, Math.round(Hc / 3)))), x, Hc / 2, z));
    for (let y = 3.5; y < Hc - 1; y += 3.5) {
      g.add(at(new Mesh(new CylinderGeometry(2, 2, 0.15, 12), steel()), x, y, z));
      railing(g, x, y, z, 1.95);
      g.add(at(new Mesh(new BoxGeometry(0.42, 0.76, 0.08), lambert('#16181e')), x + 0.95, y + 1.2, z + 0.95).rotateY(Math.PI / 4));
      glasses.push(y + 0.9);
    }
    // The levels in its sight glasses bob; puffs vent from its top and drift off.
    move('box', fuel, glasses.length, (t, put) => {
      glasses.forEach((y, j) => {
        const h = 0.36 + 0.2 * Math.sin(t * 0.8 + j * 1.3 + k * 2);
        put(j, x + 0.99, y + h / 2, z + 0.99, 0.3, h, 0.1, 0, Math.PI / 4, 0);
      });
    });
    move('box', glow('#a8c0d0', 0.5), 3, (t, put) => {
      for (let i = 0; i < 3; i++) {
        const p = cycle(t, 5.5, i / 3 + k * 0.4);
        put(i, x + 0.5 + p * 0.9, Hc + 0.6 + p * 2.6, z - 0.5 - p * 0.4, (0.25 + 0.5 * p) * Math.min(1, (1 - p) / 0.15));
      }
    });
    ladder(g, x - 1.3, 0, z, Hc, Math.PI / 2);
    g.add(rod(v3(x, Hc, z), v3(x, Hc + 1.5, z), 0.2, steel(), 5));
    g.add(at(new Mesh(new ConeGeometry(0.35, 1, 5), glow('#7ad8ff')), x, Hc + 2, z));
    warning(g, x + 0.6, Hc + 0.2, z, 0.3);
    heap(g, x, z, 2.2);
    g.add(rod(v3(x - 1.2, 1.2, z), v3(VATS[2][0] + 1, 1.2, VATS[2][1] - 1), 0.2, vatPipe, 6));
  }

  // The pressure core: a glowing sphere on a plinth, caged in rings between four pillars.
  if (r.core) {
    const x = 4, z = 13.2, big = r.core > 1;
    g.add(at(new Mesh(new CylinderGeometry(3.6, 4, 1.2, 16), textured(CONCRETE, repeated(concreteTexture(), 2, 2))), x, 0.6, z));
    g.add(at(new Mesh(new BoxGeometry(7.6, 0.2, 0.6), hazard()), x, 1.25, z + 3.6));
    // The core pulses; its rings (tilted) turn round the vertical through its middle; overdriven, all faster, a white
    // heart beating inside and sparks flying off.
    const rings = big ? 3 : 2, rad = big ? 2.3 : 1.9;
    // (The heart sits inside the core's shell and swells through it at each beat: a white flash.)
    if (big) move('ball', glow('#e8fcff'), 1, (t, put) => put(0, x, 4.4, z, rad * (0.8 + 0.26 * Math.pow(Math.max(0, Math.sin(t * 1.6)), 6))));
    move('ball', glow(BLUE, 0.85), 1, (t, put) => put(0, x, 4.4, z, rad * (1 + 0.06 * Math.sin(t * (big ? 2.6 : 1.4)))));
    move('ring', bright(), rings, (t, put) => {
      for (let k = 0; k < rings; k++) {
        put(k, x, 4.4, z, 2.7 + k * 0.25, 2.7 + k * 0.25, 2.7 + k * 0.25, Math.PI / 2 + 0.3 + k * 0.55, k * 0.9 + t * (big ? 0.8 : 0.3) * (k % 2 ? -1 : 1) * (1 + k * 0.3), 0);
      }
    });
    if (big) {
      move('box', foam, 6, (t, put) => {
        for (let i = 0; i < 6; i++) {
          const u = t / (1.1 + i * 0.17) + i / 6, n = Math.floor(u), p = (u - n) / 0.3;
          const a = hash(n, i) * Math.PI * 2, up = (hash(i, n + 5) - 0.5) * 2.2, d = (rad + 0.2 + p * 1.2) * Math.cos(up);
          put(i, x + Math.cos(a) * d, 4.4 + Math.sin(up) * (rad + 0.2 + p * 1.2), z + Math.sin(a) * d, p < 1 ? 0.18 : 0);
        }
      });
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      g.add(rod(v3(x + Math.cos(a) * 3.3, 1.2, z + Math.sin(a) * 3.3), v3(x + Math.cos(a) * 3.3, 8, z + Math.sin(a) * 3.3), 0.25, steel(), 6));
      warning(g, x + Math.cos(a) * 3.3, 8.25, z + Math.sin(a) * 3.3, 0.35);
    }
    g.add(at(new PointLight(BLUE, big ? 600 : 380, 30, 1.2), x, 5, z));
  }

  // The fuel line out to the tank farm (always there; it meets the farm's at x = 17 on the lane): from the first vat,
  // round the vats and along the front, then on sleepers over the sand, or up onto the pipe rack once there is one.
  const out: [number, number][] = [[VATS[0][0] - R, VATS[0][1]], [-4.7, VATS[0][1]], [-4.7, 8.5], [17, 8.5]];
  if (r.pipes) {
    groundPipe(g, [...out, [17, 9]]);
    g.add(rod(v3(17, 0.5, 9), v3(17, 2.4, 9), 0.22, steel(), 6));
    pipeRack(g, 17, 9, 17, 20, 2.4, 3, FUEL_PIPE);
    // On the rack: fuel pulses running out along each pipe, and a handwheel per pipe turning back and forth on its stem.
    move('box', fuel, 6, (t, put) => {
      for (let i = 0; i < 6; i++) {
        const p = cycle(t, 7, (i % 2) / 2 + Math.floor(i / 2) / 3), s = Math.min(1, p * 8, (1 - p) * 8);
        put(i, 17 + (Math.floor(i / 2) - 1) * 0.6, 2.4, 9.3 + p * 10.4, 0.52 * s, 0.52 * s, 0.9 * s);
      }
    });
    for (let k = 0; k < 3; k++) {
      const x = 17 + (k - 1) * 0.6, z = 10.6 + k * 1.1;
      g.add(rod(v3(x, 2.4, z), v3(x, 3.2, z), 0.07, steel(), 4));
      const wheel = new Mesh(new TorusGeometry(0.3, 0.07, 3, 8), red);
      wheel.rotation.x = Math.PI / 2;
      g.add(at(wheel, x, 3.2, z));
    }
    move('box', red, 6, (t, put) => {
      for (let i = 0; i < 6; i++) {
        const k = Math.floor(i / 2);
        put(i, 17 + (k - 1) * 0.6, 3.2, 10.6 + k * 1.1, 0.6, 0.07, 0.07, 0, Math.sin(t * 0.5 + k * 2) * 2.5 + (i % 2) * Math.PI / 2, 0);
      }
    });
  } else {
    groundPipe(g, [...out, [17, 20]]);
  }
  g.add(at(new Mesh(new BoxGeometry(0.7, 0.9, 0.7), bright()), 11, 0.45, 8.5)); // (a valve on the line)
  g.add(at(new Mesh(new TorusGeometry(0.35, 0.08, 3, 8), red), 11, 1.05, 8.5));
  // Clutter: crates, spare barrels, a lamp.
  crate(g, -15, 15, 1.4, 0.2); crate(g, -13.5, 15.8, 1, 0.9); crate(g, -14.4, 13.8, 0.9, 0.5);
  for (const [x, z] of [[-9, 15], [-8, 15.6]]) g.add(at(new Mesh(new CylinderGeometry(0.55, 0.55, 1.3, 8), textured('#2a5a7a', metalTexture(1))), x, 0.65, z));
  lamp(g, -17, -1);
  g.add(movingPart(movers));
  return g;
}
