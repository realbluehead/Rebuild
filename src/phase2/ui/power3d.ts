// The mirror tower in 3D at its level (`Power`, core/power.ts): rings of mirrors on posts round a tower (a steel
// lattice, then concrete with bands, a ladder and a railed platform) whose receiver glows hotter as it improves;
// once the mirrors track the sun each one aims at the receiver, and at the hottest levels their beams show. Salt tanks
// with gauges, a heat exchanger with fins, pylons carrying the power line, a control shed with lit windows, and the
// usual clutter (spare mirrors, crates, cables, a work lamp) settle it in the sand.
import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial, PointLight, TorusGeometry, Vector3 } from 'three';
import type { Power } from '../core/power';
import {
  at, bright, cable, crate, glow, hazard, heap, ladder, lamp, lambert, railing, rod, shadow, steel, v3, warning, CONCRETE,
  LAMP, OBSIDIAN,
} from './kit3d';
import { concreteTexture, grateTexture, metalTexture, mirrorTexture, repeated, textured } from './textures';

/** Where the tower stands, and where the sun is (for the mirrors' aim). */
const TOWER = v3(-3, 0, -3);
const SUN = new Vector3(-0.35, 0.85, -0.4).normalize();
/** Mirror slots per ring (rings fill in order; outer rings lose the slots off the plot or on reserved ground). */
const RINGS = [6, 8, 10, 12, 16, 20, 24, 28, 32, 36];

/** The receiver's glow for its temperature. */
const heatColour = (heat: number) => (heat >= 1200 ? '#fff4c8' : heat >= 900 ? '#ffb040' : heat >= 700 ? '#ff7a2a' : '#c84020');

/** Spots kept clear of mirrors: tank yard, exchanger, shed, pylons. */
const reserved = (x: number, z: number) =>
  (x > 5 && z < -5) || (x > 11 && z > 11) || Math.hypot(x + 12, z - 12) < 2.5 || Math.hypot(x - TOWER.x, z - TOWER.z) < 3.5;

/** Where the first `n` mirrors stand (x, z): ring by ring round the tower, skipping slots off the plot or reserved. */
export function mirrorSpots(n: number): [number, number][] {
  const out: [number, number][] = [];
  RINGS.forEach((slots, ring) => {
    for (let k = 0; k < slots && out.length < n; k++) {
      const a = (k / slots) * Math.PI * 2 + ring * 0.37, r = 5 + ring * 2.3;
      const x = TOWER.x + Math.cos(a) * r, z = TOWER.z + Math.sin(a) * r;
      if (Math.abs(x) <= 18.5 && Math.abs(z) <= 18.5 && !reserved(x, z)) out.push([x, z]);
    }
  });
  return out;
}

export function buildPower(p: Power): Group {
  const g = new Group();
  const H = p.tower;
  const top = v3(TOWER.x, H, TOWER.z);
  const receiverY = H + 1.2;

  // The tower: a steel lattice while short, concrete with bands once tall.
  shadow(g, 6, TOWER.x, TOWER.z, 0.6);
  if (H < 10) {
    const s = 1.3, legs = [[-s, -s], [s, -s], [s, s], [-s, s]];
    const mat = steel();
    for (const [x, z] of legs) g.add(rod(v3(TOWER.x + x * 1.4, 0, TOWER.z + z * 1.4), v3(TOWER.x + x * 0.7, H, TOWER.z + z * 0.7), 0.12, mat, 4));
    for (let y = 0; y < H - 1; y += 2) {
      const f0 = 1.4 - (y / H) * 0.7, f1 = 1.4 - ((y + 2) / H) * 0.7;
      for (let k = 0; k < 4; k++) {
        const [ax, az] = legs[k], [bx, bz] = legs[(k + 1) % 4];
        g.add(rod(v3(TOWER.x + ax * f0, y, TOWER.z + az * f0), v3(TOWER.x + bx * f1, y + 2, TOWER.z + bz * f1), 0.05, mat, 3));
      }
    }
    for (const [x, z] of legs) heap(g, TOWER.x + x * 1.4, TOWER.z + z * 1.4, 0.7);
  } else {
    const body = new Mesh(new CylinderGeometry(1.2 + H * 0.03, 1.8 + H * 0.05, H, 12), textured(CONCRETE, repeated(concreteTexture(), 2, Math.round(H / 4))));
    g.add(at(body, TOWER.x, H / 2, TOWER.z));
    for (let y = 4; y < H; y += 4) {
      const band = new Mesh(new TorusGeometry(1.25 + H * 0.03 + (1 - y / H) * (0.6 + H * 0.02), 0.18, 4, 16), steel());
      band.rotation.x = Math.PI / 2;
      g.add(at(band, TOWER.x, y, TOWER.z));
    }
    const door = new Mesh(new BoxGeometry(1, 1.8, 0.2), glow('#ffd890'));
    door.lookAt(1, 0, 1);
    const r0 = 1.8 + H * 0.05;
    g.add(at(door, TOWER.x + r0 * 0.7, 0.9, TOWER.z + r0 * 0.7));
    ladder(g, TOWER.x + (r0 - 0.2) * 0.71, 0, TOWER.z - (r0 - 0.2) * 0.71, H, Math.PI / 4);
    heap(g, TOWER.x, TOWER.z, r0 + 1.2);
  }
  // The platform at the top: grating, railing, the receiver and its cap, a mast with a red light.
  const deck = new Mesh(new CylinderGeometry(2.4, 2.4, 0.25, 14), textured('#9a9aa8', repeated(grateTexture(), 3, 3)));
  g.add(at(deck, top.x, H, top.z));
  railing(g, top.x, H + 0.12, top.z, 2.3);
  const receiver = new Mesh(new CylinderGeometry(1.1 + p.heat / 1500, 1.1 + p.heat / 1500, 1.8 + p.heat / 600, 12), glow(heatColour(p.heat)));
  g.add(at(receiver, top.x, receiverY, top.z));
  const cap = new Mesh(new CylinderGeometry(1.5, 1.9, 0.6, 12), steel());
  g.add(at(cap, top.x, receiverY + 1 + p.heat / 1200, top.z));
  const mastTop = receiverY + 1.4 + p.heat / 1200 + 2.5;
  g.add(rod(v3(top.x, receiverY + 1.3, top.z), v3(top.x, mastTop, top.z), 0.08, steel(), 4));
  warning(g, top.x, mastTop + 0.2, top.z, 0.45);
  g.add(at(new PointLight(heatColour(p.heat), 80 + p.heat * 0.35, 34, 1.2), top.x, receiverY, top.z));
  if (p.crown) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.add(rod(v3(top.x + Math.cos(a) * 2.3, H, top.z + Math.sin(a) * 2.3), v3(top.x + Math.cos(a) * 1.5, receiverY + 2.2, top.z + Math.sin(a) * 1.5), 0.08, bright(), 4));
      g.add(at(new Mesh(new BoxGeometry(0.4, 0.3, 0.4), glow(LAMP)), top.x + Math.cos(a) * 2.35, H + 0.3, top.z + Math.sin(a) * 2.35));
    }
  }

  // The mirrors: a post, a gearbox and a framed panel; aimed at the receiver once they track the sun.
  const glass = new MeshLambertMaterial({ map: mirrorTexture(), color: '#a8b8e0', emissive: '#16203a', emissiveMap: mirrorTexture() });
  const post = steel(), box = lambert('#2a2c34');
  const beam = glow('#ffe8a0', 0.22);
  let placed = 0;
  for (const [x, z] of mirrorSpots(p.mirrors)) {
    placed++;
    const pos = v3(x, 1.7, z);
    g.add(rod(v3(x, 0, z), pos, 0.09, post, 4), at(new Mesh(new BoxGeometry(0.4, 0.35, 0.4), box), x, 1.55, z));
    const toTower = v3(top.x, receiverY, top.z).sub(pos).normalize();
    const normal = p.tracking ? toTower.clone().add(SUN).normalize() : v3(-0.2, 1, -0.2).normalize();
    const m = new Mesh(new BoxGeometry(1.8, 1.3, 0.08), glass);
    m.position.copy(pos).setY(1.9);
    m.lookAt(pos.clone().setY(1.9).add(normal));
    g.add(m);
    if (p.heat >= 900 && (p.heat >= 1200 || placed % 3 === 0)) g.add(rod(m.position, v3(top.x, receiverY, top.z), 0.05, beam, 3));
  }

  // Molten-salt tanks with gauges and a hot pipe to the tower; the heat exchanger.
  const tankSpots = [[13, -14], [13, -8.5], [7.5, -14]];
  for (let k = 0; k < p.saltTanks; k++) {
    const [x, z] = tankSpots[k];
    g.add(at(new Mesh(new CylinderGeometry(2.2, 2.2, 4.4, 14), textured('#a8a4a0', repeated(metalTexture(0.4), 3, 2))), x, 2.2, z));
    g.add(at(new Mesh(new ConeGeometry(2.3, 0.8, 14), steel()), x, 4.8, z));
    const band = new Mesh(new CylinderGeometry(2.25, 2.25, 0.5, 14, 1, true), hazard());
    g.add(at(band, x, 0.6, z));
    g.add(at(new Mesh(new BoxGeometry(0.3, 3, 0.1), glow('#1a1410')), x + 1.6, 2.4, z + 1.6));
    g.add(at(new Mesh(new BoxGeometry(0.32, 2.2, 0.12), glow('#ff8a3a')), x + 1.6, 2, z + 1.6));
    ladder(g, x - 2.25, 0, z, 4.6, Math.PI / 2);
    railing(g, x, 4.6, z, 1.8);
    heap(g, x, z, 3);
    g.add(rod(v3(x - 1.5, 0.5, z), v3(TOWER.x + 2, 0.5, TOWER.z), 0.25, textured('#8a5040', metalTexture(0.8)), 6));
  }
  if (p.exchanger) {
    g.add(at(new Mesh(new BoxGeometry(3, 2.4, 2), obsidianish()), 7.5, 1.2, -8.5));
    for (let k = 0; k < 6; k++) g.add(at(new Mesh(new BoxGeometry(0.12, 2, 2.2), steel()), 6.3 + k * 0.48, 2.6, -8.5));
    g.add(at(new Mesh(new BoxGeometry(0.8, 0.5, 0.1), glow('#4aff8a')), 7.5, 1.4, -7.45));
  }

  // The power line: pylons (tapered lattice and a crossarm) carrying wires off the plot towards the base.
  if (p.grid) {
    const mat = steel(), wire = lambert('#14141a');
    const pyl = [[-12, 12], [-19, 19]];
    for (const [x, z] of pyl) {
      for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]) g.add(rod(v3(x + dx, 0, z + dz), v3(x + dx * 0.25, 9, z + dz * 0.25), 0.08, mat, 3));
      g.add(rod(v3(x - 2.2, 8.6, z - 2.2), v3(x + 2.2, 8.6, z + 2.2), 0.12, mat, 4));
      warning(g, x, 9.3, z, 0.35);
    }
    for (const s of [-1, 1]) {
      const a = v3(TOWER.x + s * 1.2, 6, TOWER.z - s * 1.2), b = v3(-12 + s * 2, 8.5, 12 - s * 2), c = v3(-19 + s * 2, 8.5, 19 - s * 2);
      g.add(rod(a, b, 0.04, wire, 3), rod(b, c, 0.04, wire, 3));
    }
  }

  // The control shed (lit windows, a door, an antenna) and the clutter of a work site.
  const shed = new Mesh(new BoxGeometry(4, 2.6, 3), textured('#5a5a6a', repeated(metalTexture(0.8), 2, 1)));
  g.add(at(shed, 15, 1.3, 15));
  g.add(at(new Mesh(new BoxGeometry(4.4, 0.25, 3.4), steel()), 15, 2.7, 15));
  for (const dx of [-1, 0.6]) g.add(at(new Mesh(new BoxGeometry(0.9, 0.7, 0.1), glow('#ffd890')), 15 + dx, 1.6, 16.55));
  g.add(rod(v3(16.4, 2.8, 14), v3(16.4, 5.5, 14), 0.05, steel(), 3));
  warning(g, 16.4, 5.6, 14, 0.25);
  heap(g, 15, 15, 3);
  cable(g, [[13, 14], [8, 10], [2, 5], [TOWER.x + 1.5, TOWER.z + 1.5]]);
  for (const [x, z, a] of [[16, 6, 0.4], [17, 7.5, 0.9]] as const) {
    const spare = new Mesh(new BoxGeometry(1.8, 1.3, 0.08), glass);
    spare.position.set(x, 0.6, z);
    spare.rotation.set(-0.3, a, 0.2);
    g.add(spare);
  }
  crate(g, 17, 10, 1.3, 0.3); crate(g, 15.6, 10.8, 1, 1.1);
  lamp(g, -17, 4);
  return g;
}

/** A dark, lightly rusted metal for machinery. */
const obsidianish = () => textured(OBSIDIAN, metalTexture(0.5));
