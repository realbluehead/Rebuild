// The bluetreri refinery in 3D at its level (`Refinery`, core/refinery.ts): sacks of ore at first, then hoppers with
// hazard bands over jaw crushers, a conveyor belt carrying glowing ore up to open vats of blue fuel (bubbling, with
// rims, ladders and, later, burners glowing underneath), a centrifuge, distillation columns with platforms and sight
// glasses, and at the top a pressure core in a cage of rings. A pipe rack carries the fuel out towards the tank farm.
import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, PointLight, SphereGeometry, TorusGeometry } from 'three';
import type { Refinery } from '../core/refinery';
import {
  at, bright, crate, glow, groundPipe, hazard, heap, ladder, lamp, lambert, pipeRack, railing, rod, shadow, steel, v3, warning,
  CONCRETE, FUEL_PIPE, OBSIDIAN,
} from './kit3d';
import { concreteTexture, metalTexture, repeated, sackTexture, textured } from './textures';

const BLUE = '#3ac8ff';
const VATS = [[-2, -2], [3.5, -2], [9, -2], [-2, 3.5], [3.5, 3.5]];

export function buildRefinery(r: Refinery): Group {
  const g = new Group();
  const ore = glow('#2a8ac8');

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
    if (r.crusher) {
      g.add(at(new Mesh(new BoxGeometry(2.4, 2, 2.4), textured(OBSIDIAN, metalTexture(0.6))), x, 1.8, z));
      const wheel = new Mesh(new TorusGeometry(1, 0.2, 4, 12), bright());
      g.add(at(wheel, x, 2, z + 1.4));
      g.add(at(new Mesh(new BoxGeometry(2.5, 0.35, 2.5), hazard()), x, 2.95, z));
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
        g.add(at(new Mesh(new BoxGeometry(0.4, 0.3, 0.4), ore), p.x, p.y + 0.25, p.z));
      }
    }
  }

  // Vats of glowing fuel: open steel, a rim, bubbles, a ladder; on legs over burners once there are some.
  const R = r.bigVats ? 2.2 : 1.6, Hv = r.bigVats ? 3.2 : 2.4, lift = r.burners ? 0.8 : 0;
  shadow(g, 9, 3, 0, 0.45);
  for (let k = 0; k < r.vats; k++) {
    const [x, z] = VATS[k];
    const wall = new Mesh(new CylinderGeometry(R, R * 0.92, Hv, 14, 1, true), textured('#7a7e88', repeated(metalTexture(0.6), 2, 1), true));
    g.add(at(wall, x, lift + Hv / 2, z));
    g.add(at(new Mesh(new CylinderGeometry(R * 0.92, R * 0.92, 0.15, 14), steel()), x, lift + 0.08, z));
    const rim = new Mesh(new TorusGeometry(R, 0.14, 4, 16), bright());
    rim.rotation.x = Math.PI / 2;
    g.add(at(rim, x, lift + Hv, z));
    g.add(at(new Mesh(new CylinderGeometry(R * 0.95, R * 0.95, 0.1, 14), glow(BLUE)), x, lift + Hv - 0.35, z));
    for (let b = 0; b < 3; b++) g.add(at(new Mesh(new SphereGeometry(0.18 + b * 0.05, 4, 3), glow('#c8f4ff')), x + Math.cos(b * 2.1 + k) * R * 0.5, lift + Hv - 0.2, z + Math.sin(b * 2.1 + k) * R * 0.5));
    ladder(g, x + R * 0.71, 0, z + R * 0.71, lift + Hv, -Math.PI / 4);
    if (r.burners) {
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.add(rod(v3(x + dx * R * 0.6, 0, z + dz * R * 0.6), v3(x + dx * R * 0.6, lift, z + dz * R * 0.6), 0.1, steel(), 4));
      const fire = new Mesh(new TorusGeometry(R * 0.5, 0.15, 3, 12), glow('#ff8a20'));
      fire.rotation.x = Math.PI / 2;
      g.add(at(fire, x, 0.35, z));
    } else heap(g, x, z, R + 0.6);
    // A spill: a faint blue puddle by the vat.
    const puddle = new Mesh(new CylinderGeometry(0.9, 0.9, 0.03, 10), glow(BLUE, 0.3));
    g.add(at(puddle, x - R - 0.4, 0.05, z + 0.6));
  }
  g.add(at(new PointLight(BLUE, 140 + r.vats * 50, 24, 1.3), 3, 6, 1));
  if (r.burners) g.add(at(new PointLight('#ff8a30', 60, 12, 1.5), 3, 0.6, 1));
  // Pipes from the vats to the processing (centrifuge, columns).
  const vatPipe = textured('#8a8e98', metalTexture(0.5));
  if (r.vats > 1) g.add(rod(v3(VATS[0][0], lift + 0.6, VATS[0][1] - R), v3(VATS[Math.min(2, r.vats - 1)][0], lift + 0.6, VATS[0][1] - R), 0.2, vatPipe, 6));

  if (r.centrifuge) {
    const x = 10, z = 6;
    g.add(at(new Mesh(new CylinderGeometry(2, 2.2, 1.6, 14), textured(CONCRETE, concreteTexture())), x, 0.8, z));
    g.add(at(new Mesh(new CylinderGeometry(1.5, 1.5, 2, 14), steel()), x, 2.6, z));
    g.add(at(new Mesh(new SphereGeometry(1.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), bright()), x, 3.6, z));
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4; g.add(rod(v3(x, 3, z), v3(x + Math.cos(a) * 2.4, 3, z + Math.sin(a) * 2.4), 0.12, steel(), 4)); }
    g.add(at(new Mesh(new BoxGeometry(0.8, 0.5, 0.1), glow(BLUE)), x + 1.06, 2.6, z + 1.06).rotateY(Math.PI / 4));
    g.add(rod(v3(VATS[1][0], lift + 0.6, VATS[1][1] + R), v3(x - 1.5, 2, z), 0.2, vatPipe, 6));
  }

  // Distillation columns: tall, ringed with railed platforms, a ladder, sight glasses glowing blue, a pilot flame.
  const colSpots = [[12, -10], [16, -5]];
  for (let k = 0; k < r.columns; k++) {
    const [x, z] = colSpots[k], Hc = 11 + k * 3;
    g.add(at(new Mesh(new CylinderGeometry(1.2, 1.4, Hc, 12), textured('#8a8e98', repeated(metalTexture(0.5), 1, Math.round(Hc / 3)))), x, Hc / 2, z));
    for (let y = 3.5; y < Hc - 1; y += 3.5) {
      g.add(at(new Mesh(new CylinderGeometry(2, 2, 0.15, 12), steel()), x, y, z));
      railing(g, x, y, z, 1.95);
      g.add(at(new Mesh(new BoxGeometry(0.3, 0.6, 0.1), glow(BLUE)), x + 0.95, y + 1.2, z + 0.95).rotateY(Math.PI / 4));
    }
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
    g.add(at(new Mesh(new SphereGeometry(big ? 2.3 : 1.9, 16, 12), glow(BLUE, 0.85)), x, 4.4, z));
    if (big) g.add(at(new Mesh(new SphereGeometry(1.1, 10, 8), glow('#e8fcff')), x, 4.4, z));
    for (let k = 0; k < (big ? 3 : 2); k++) {
      const ring = new Mesh(new TorusGeometry(2.9 + k * 0.3, 0.18, 4, 24), bright());
      ring.rotation.set(Math.PI / 2 + k * 0.6, k * 0.9, 0);
      g.add(at(ring, x, 4.4, z));
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
  } else {
    groundPipe(g, [...out, [17, 20]]);
  }
  g.add(at(new Mesh(new BoxGeometry(0.7, 0.9, 0.7), bright()), 11, 0.45, 8.5)); // (a valve on the line)
  g.add(at(new Mesh(new TorusGeometry(0.35, 0.08, 3, 8), lambert('#c8282a')), 11, 1.05, 8.5));
  // Clutter: crates, spare barrels, a lamp.
  crate(g, -15, 15, 1.4, 0.2); crate(g, -13.5, 15.8, 1, 0.9); crate(g, -14.4, 13.8, 0.9, 0.5);
  for (const [x, z] of [[-9, 15], [-8, 15.6]]) g.add(at(new Mesh(new CylinderGeometry(0.55, 0.55, 1.3, 8), textured('#2a5a7a', metalTexture(1))), x, 0.65, z));
  lamp(g, -17, -1);
  return g;
}
