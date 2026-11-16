// The tank farm in 3D at its level (`Tanks`, core/tanks.ts): a pallet of rusty barrels at first, then upright tanks
// (conical roofs, ladders, railings, hazard bands and glowing level gauges) inside a concrete bund wall, spheres on
// legs with stairs, a pipe rack from the refinery and a header to the tanks, foam hydrants, a pump house, filling
// arms with hanging hoses for the ships, a pipeline to the dry dock and a beacon mast. White cladding at the top.
import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, TorusGeometry } from 'three';
import type { Tanks } from '../core/tanks';
import {
  at, barrel, bright, cable, crate, glow, hazard, heap, ladder, lamp, lambert, pipeRack, railing, rod, shadow, steel, v3,
  warning, CONCRETE,
} from './kit3d';
import { concreteTexture, metalTexture, repeated, textured } from './textures';

const FUEL = '#ffb030';
const UPRIGHTS = [[-11, -11], [-5.5, -11], [0, -11], [-11, -5.5], [-5.5, -5.5], [0, -5.5]];
const SPHERES = [[11, -11], [11, -2.5], [11, 6], [3.5, 6]];

export function buildTanks(t: Tanks): Group {
  const g = new Group();
  const skin = (u: number, v: number) => textured(t.cladding ? '#c8ccd4' : '#8a8e98', repeated(metalTexture(t.cladding ? 0.1 : 0.5), u, v));

  if (t.barrels) {
    g.add(at(new Mesh(new BoxGeometry(3.4, 0.25, 2.4), textured('#6a5a40', metalTexture(1))), -6, 0.12, 6));
    for (let k = 0; k < 6; k++) barrel(g, -7.2 + (k % 3) * 1.2, 5.4 + Math.floor(k / 3) * 1.2);
    barrel(g, -3, 7.5, true); barrel(g, -2.6, 5.4, true, '#3a5a7a');
    heap(g, -6, 6, 2.6);
  }

  // The bund: a low concrete wall round the upright tanks.
  if (t.bund) {
    const wall = textured(CONCRETE, repeated(concreteTexture(), 4, 0.4));
    for (const [x, z, w, d] of [[-5.5, -14.5, 19, 0.6], [-5.5, -2.2, 19, 0.6], [-14.7, -8.35, 0.6, 12.9], [3.7, -8.35, 0.6, 12.9]]) {
      g.add(at(new Mesh(new BoxGeometry(w, 1.1, d), wall), x, 0.55, z));
    }
    g.add(at(new Mesh(new BoxGeometry(2, 0.2, 0.66), hazard()), 1.5, 1.15, -2.2));
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
      const fill = 0.35 + ((k * 37) % 6) / 10;
      g.add(at(new Mesh(new BoxGeometry(0.35, H * 0.8, 0.1), glow('#14141c')), x - R * 0.72, H / 2, z + R * 0.72).rotateY(-Math.PI / 4));
      g.add(at(new Mesh(new BoxGeometry(0.36, H * 0.8 * fill, 0.12), glow(FUEL)), x - R * 0.72, H * 0.1 + (H * 0.8 * fill) / 2, z + R * 0.72).rotateY(-Math.PI / 4));
    }
    warning(g, x, H + 1, z, 0.3);
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
    warning(g, x, y + R + 0.9, z, 0.35);
    if (t.gauges) g.add(at(new Mesh(new BoxGeometry(0.8, 0.5, 0.1), glow(FUEL)), x + R * 0.75, y - 0.4, z + R * 0.66).rotateY(Math.PI / 4));
  }

  // Pipes: the rack in from the refinery, a header along the tanks.
  if (t.pipes) {
    pipeRack(g, 17, -20, 17, -7, 2.4, 3, '#4a7a9a');
    g.add(rod(v3(17, 1, -7), v3(-12, 1, -7.9), 0.25, textured('#7a7e88', metalTexture(0.5)), 6));
    for (let k = 0; k < Math.min(3, t.uprights); k++) g.add(rod(v3(UPRIGHTS[k][0], 1, -7.9), v3(UPRIGHTS[k][0], 1, UPRIGHTS[k][1] + 2.2), 0.18, steel(), 5));
  }
  if (t.safety) {
    for (const [x, z] of [[-14, 1], [6, -15], [16, 12], [-2, 2]]) {
      g.add(at(new Mesh(new CylinderGeometry(0.25, 0.3, 1, 8), lambert('#c8282a')), x, 0.5, z));
      g.add(at(new Mesh(new SphereGeometry(0.28, 6, 4), lambert('#e83a3a')), x, 1.05, z));
    }
    g.add(rod(v3(6, 0, 1), v3(6, 4, 1), 0.12, steel(), 4));
    g.add(at(new Mesh(new BoxGeometry(0.5, 0.4, 1.4), lambert('#c8282a')), 6, 4.2, 1));
  }
  if (t.pumpHouse) {
    const x = -11, z = 11;
    g.add(at(new Mesh(new BoxGeometry(5, 3, 4), textured(CONCRETE, repeated(concreteTexture(), 2, 1))), x, 1.5, z));
    g.add(at(new Mesh(new BoxGeometry(5.4, 0.3, 4.4), steel()), x, 3.15, z));
    g.add(at(new Mesh(new BoxGeometry(1.2, 2, 0.1), glow('#ffd890')), x + 1, 1, z + 2.02));
    for (let k = 0; k < 3; k++) g.add(at(new Mesh(new BoxGeometry(0.8, 0.15, 0.1), lambert('#1a1a20')), x - 1.2, 1.6 + k * 0.3, z + 2.02));
    g.add(rod(v3(x + 1.5, 3.3, z - 1), v3(x + 1.5, 5, z - 1), 0.25, steel(), 6));
    heap(g, x, z, 3.4);
    if (t.pipes) g.add(rod(v3(x + 2.5, 1, z - 1), v3(-12, 1, -7.9), 0.22, steel(), 5));
  }

  // Filling arms for the ships: a post with hazard stripes, a boom, a hose hanging down.
  for (let k = 0; k < t.arms; k++) {
    const x = 5 + k * 7, z = 15.5;
    g.add(at(new Mesh(new CylinderGeometry(0.45, 0.6, 7, 8), hazard()), x, 3.5, z));
    g.add(rod(v3(x, 7, z), v3(x - 5, 7.5, z + 0.5), 0.25, bright(), 6));
    g.add(rod(v3(x, 6.4, z), v3(x - 3.5, 7.3, z + 0.35), 0.08, steel(), 3));
    cable(g, [[x - 5, z + 0.5], [x - 5.3, z + 1.5], [x - 4, z + 2.4]], 0.18, '#26262e');
    g.add(rod(v3(x - 5, 7.4, z + 0.5), v3(x - 5, 0.2, z + 0.5), 0.15, lambert('#26262e'), 4));
    warning(g, x, 7.4, z, 0.35);
    heap(g, x, z, 1.4);
  }
  if (t.pipeline) {
    const pipe = textured('#7a7e88', repeated(metalTexture(0.5), 1, 4));
    g.add(rod(v3(-13.5, 0.7, 9.5), v3(-20, 0.7, 9.5), 0.3, pipe, 6));
    for (const x of [-15, -18]) g.add(at(new Mesh(new BoxGeometry(0.4, 0.6, 1.2), lambert('#3a3030')), x, 0.3, 9.5));
  }
  if (t.beacon) {
    const x = -16, z = -16, mat = steel();
    for (const [dx, dz] of [[-0.7, -0.7], [0.7, -0.7], [0.7, 0.7], [-0.7, 0.7]]) g.add(rod(v3(x + dx, 0, z + dz), v3(x + dx * 0.2, 13, z + dz * 0.2), 0.08, mat, 3));
    g.add(at(new Mesh(new SphereGeometry(0.6, 6, 4), glow('#ff2a3a')), x, 13.5, z));
    heap(g, x, z, 1.6);
  }

  crate(g, 15, 15, 1.3, 0.3); crate(g, 16.4, 13.8, 1, 0.9);
  lamp(g, -17, 3);
  return g;
}
