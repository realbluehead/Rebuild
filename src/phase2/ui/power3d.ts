// The mirror tower in 3D at its level (`Power`, core/power.ts): rings of mirrors on posts round a tower (a steel
// lattice, then concrete with bands, a ladder and a railed platform) whose receiver glows hotter as it improves;
// once the mirrors track the sun each one aims at the receiver, and at the hottest levels their beams show. Salt tanks
// with gauges, a heat exchanger with fins, pylons carrying the power line, a control shed with lit windows, and the
// usual clutter (spare mirrors, crates, cables, a work lamp) settle it in the sand.
import {
  BoxGeometry, ConeGeometry, CylinderGeometry, Group, InstancedMesh, Mesh, MeshLambertMaterial, Object3D, PointLight,
  SphereGeometry, TorusGeometry, Vector3, type BufferGeometry, type Material,
} from 'three';
import type { Power } from '../core/power';
import {
  animated, at, bright, cable, crate, cycle, glow, hazard, heap, ladder, lamp, lambert, railing, rod, shadow, steel, v3,
  CONCRETE, LAMP, OBSIDIAN, RED, RUST,
} from './kit3d';
import { concreteTexture, grateTexture, metalTexture, mirrorTexture, repeated, textured } from './textures';

/** Where the tower stands, and where the sun is (for the mirrors' aim). */
const TOWER = v3(-3, 0, -3);
const SUN = new Vector3(-0.35, 0.85, -0.4).normalize();
/** The level axis the sun's height swings round as the tracking mirrors follow it (square to the sun's bearing). */
const ARC = new Vector3(0.4, 0, -0.35).normalize();
const UP = new Vector3(0, 1, 0);
/** Scratch pieces for the instances' matrices. */
const D = new Object3D(), V = new Vector3(), SUN_NOW = new Vector3();

/** `n` copies of one shape, each moved on its own by its matrix (one draw call). */
function copies(geometry: BufferGeometry, material: Material, n: number): InstancedMesh {
  const m = new InstancedMesh(geometry, material, n);
  m.frustumCulled = false; // (its copies move: the bounds worked out once would go stale)
  return m;
}
/** Sets copy `i` of `m` from the scratch object `D`. */
function put(m: InstancedMesh, i: number): void {
  D.updateMatrix();
  m.setMatrixAt(i, D.matrix);
}
/** A lift's ride, 0 (bottom) to 1 (top): up, a wait, down, a wait. */
function ride(t: number, period: number): number {
  const u = cycle(t, period), f = u < 0.4 ? u / 0.4 : u < 0.5 ? 1 : u < 0.9 ? (0.9 - u) / 0.4 : 0;
  return f * f * (3 - 2 * f);
}
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

// What moves, by upgrade (level) — every part below is an `animated` one (kit3d), posed at rest at t = 0:
//  1 Scrap mirrors     the panels rock on their posts, each with its own phase; the mast's beacon blinks
//  2 More mirrors      more rocking panels (rings ripple outwards: the phase grows with the ring)
//  3 Taller tower      a hoist: a bucket up and down its cable inside the lattice (later the lift's counterweight)
//  4 Polished glass    glints sweep across the panels, a wave of them crossing the field
//  5 Second ring       more rocking panels and glints
//  6 Ceramic receiver  a halo round the receiver breathes
//  7 Salt tank         its gauge's level rises and falls; lumps of hot salt run along its pipe from the tower
//  8 Third ring        more rocking panels and glints
//  9 Concrete tower    a lift cage rides its rails up to the deck and back
// 10 Tracking motors   all the panels turn together, following the sun up and down (and hunt a little)
// 11 Fourth ring       more turning panels and glints
// 12 Second salt tank  its own gauge (out of step) and salt lumps
// 13 Cavity receiver   beams from every third mirror, each flickering; the halo breathes faster
// 14 Crowned tower     the crown's lamps chase round the deck
// 15 Fifth ring        more turning panels, glints and beams
// 16 Power line        lights run along the wires out to the base; the pylons' lamps blink in turn
// 17 Heat exchanger    a fan spins over its fins (and the third tank's gauge and salt)
// 18 Sixth ring        more turning panels and beams; at 90% a second wave of glints
// 19 Sky tower         two beams sweep round from the mast's lamp head
// 20 Sun core          a corona of rays turns and throbs round the receiver; a beam from every mirror, the fastest halo
export function buildPower(p: Power): Group {
  const g = new Group();
  /** Red lamps that blink: [x, y, z, size, period (s), phase (0..1)], all drawn as one. */
  const blinkers: number[][] = [];
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
    if (H >= 7) {
      // The hoist: a bucket on a cable down the middle of the lattice.
      g.add(rod(v3(TOWER.x, 0.3, TOWER.z), v3(TOWER.x, H, TOWER.z), 0.03, lambert('#14141a'), 3));
      const bucket = new Group().add(new Mesh(new CylinderGeometry(0.45, 0.35, 0.7, 8), textured(RUST, metalTexture(1))));
      g.add(animated(bucket, TOWER.x, 0.6, TOWER.z, (o, t) => { o.position.y = 0.6 + (H - 1.6) * ride(t, 16); }));
    }
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
    // The lift: two rails up the side (tied to the wall and the deck), a cage between them and its counterweight.
    const lz = TOWER.z + r0 + 0.3, mid = (r0 + 1.2 + H * 0.03) / 2;
    for (const s of [-0.8, 0.8]) {
      const x = TOWER.x + s;
      g.add(rod(v3(x, 0, lz), v3(x, H + 1.2, lz), 0.06, steel(), 4), rod(v3(x, H, TOWER.z + 2.2), v3(x, H, lz), 0.05, steel(), 3),
        rod(v3(x, H / 2, TOWER.z + mid - 0.2), v3(x, H / 2, lz), 0.05, steel(), 3));
    }
    const cage = new Group().add(new Mesh(new BoxGeometry(0.7, 1.3, 0.6), hazard()), at(new Mesh(new BoxGeometry(0.3, 0.2, 0.3), glow(LAMP)), 0, 0.75, 0));
    g.add(animated(cage, TOWER.x - 0.4, 0.75, lz, (o, t) => { o.position.y = 0.75 + (H - 0.25) * ride(t, 24); }));
    const weight = new Group().add(new Mesh(new BoxGeometry(0.45, 1, 0.4), textured(RUST, metalTexture(1))));
    g.add(animated(weight, TOWER.x + 0.45, 0.7, lz, (o, t) => { o.position.y = 0.7 + (H - 0.4) * (1 - ride(t, 24)); }));
  }
  // The platform at the top: grating, railing, the receiver and its cap, a mast with a red light.
  const deck = new Mesh(new CylinderGeometry(2.4, 2.4, 0.25, 14), textured('#9a9aa8', repeated(grateTexture(), 3, 3)));
  g.add(at(deck, top.x, H, top.z));
  railing(g, top.x, H + 0.12, top.z, 2.3);
  const R = 1.1 + p.heat / 1500, RH = 1.8 + p.heat / 600;
  const receiver = new Mesh(new CylinderGeometry(R, R, RH, 12), glow(heatColour(p.heat)));
  g.add(at(receiver, top.x, receiverY, top.z));
  if (p.heat >= 700) {
    // Its halo breathes, faster the hotter it runs.
    const halo = new Group().add(new Mesh(new CylinderGeometry(R + 0.15, R + 0.15, RH * 0.9, 12), glow(heatColour(p.heat), 0.3)));
    const speed = p.heat >= 1200 ? 3.6 : p.heat >= 900 ? 2.2 : 1.2;
    g.add(animated(halo, top.x, receiverY, top.z, (o, t) => {
      const s = 1 + 0.09 * (1 + Math.sin(t * speed));
      o.scale.set(s, 1, s);
    }));
  }
  if (p.heat >= 1200) {
    // The sun core's corona: rays out of the receiver, turning round the tower's axis and throbbing.
    const rays = new Group(), mat = glow('#fff4c8', 0.45);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      rays.add(rod(v3(Math.cos(a) * R * 0.8, 0, Math.sin(a) * R * 0.8), v3(Math.cos(a) * (R + 1.5), k % 2 ? 0.5 : -0.5, Math.sin(a) * (R + 1.5)), 0.07, mat, 3));
    }
    g.add(animated(rays, top.x, receiverY, top.z, (o, t) => {
      const s = 1 + 0.12 * Math.sin(t * 3.6);
      o.rotation.y = t * 0.3;
      o.scale.set(s, 1, s);
    }));
  }
  const cap = new Mesh(new CylinderGeometry(1.5, 1.9, 0.6, 12), steel());
  g.add(at(cap, top.x, receiverY + 1 + p.heat / 1200, top.z));
  const mastTop = receiverY + 1.4 + p.heat / 1200 + 2.5;
  g.add(rod(v3(top.x, receiverY + 1.3, top.z), v3(top.x, mastTop, top.z), 0.08, steel(), 4));
  blinkers.push([top.x, mastTop + 0.2, top.z, 0.45, 2, 0]);
  if (H >= 16) {
    // The sky tower's lamp head on the mast, two beams sweeping round it.
    g.add(at(new Mesh(new BoxGeometry(0.5, 0.4, 0.5), glow(LAMP)), top.x, mastTop - 0.7, top.z));
    const sweep = new Group().add(rod(v3(-5, -0.5, 0), v3(5, 0.5, 0), 0.12, glow('#ffe8a0', 0.22), 4));
    g.add(animated(sweep, top.x, mastTop - 0.7, top.z, (o, t) => { o.rotation.y = 0.6 + t * 0.5; }));
  }
  g.add(at(new PointLight(heatColour(p.heat), 80 + p.heat * 0.35, 34, 1.2), top.x, receiverY, top.z));
  if (p.crown) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.add(rod(v3(top.x + Math.cos(a) * 2.3, H, top.z + Math.sin(a) * 2.3), v3(top.x + Math.cos(a) * 1.5, receiverY + 2.2, top.z + Math.sin(a) * 1.5), 0.08, bright(), 4));
    }
    // The crown's lamps, lit up one after another round the deck (the lit one swells, the rest stay small).
    const lamps = copies(new BoxGeometry(0.4, 0.3, 0.4), glow(LAMP), 8);
    g.add(animated(new Group().add(lamps), 0, 0, 0, (_o, t) => {
      const head = cycle(t, 4) * 8;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2, behind = (head - k + 8) % 8;
        D.position.set(top.x + Math.cos(a) * 2.35, H + 0.3, top.z + Math.sin(a) * 2.35);
        D.quaternion.identity();
        D.scale.setScalar(0.7 + 0.8 * Math.max(0, 1 - behind / 3));
        put(lamps, k);
      }
      lamps.instanceMatrix.needsUpdate = true;
    }));
  }

  // The mirrors: a post, a gearbox and a framed panel; aimed at the receiver once they track the sun.
  const glass = new MeshLambertMaterial({ map: mirrorTexture(), color: '#a8b8e0', emissive: '#16203a', emissiveMap: mirrorTexture() });
  const post = steel(), box = lambert('#2a2c34');
  const beam = glow('#ffe8a0', 0.22);
  const spots = mirrorSpots(p.mirrors);
  const aim = v3(top.x, receiverY, top.z);
  for (const [x, z] of spots) g.add(rod(v3(x, 0, z), v3(x, 1.7, z), 0.09, post, 4), at(new Mesh(new BoxGeometry(0.4, 0.35, 0.4), box), x, 1.55, z));
  // The panels (one instanced mesh): each tilts about its own level hinge with its own phase, rippling out ring by
  // ring; tracking, they all follow the sun as it climbs and sinks (its rest, t = 0, is the aim they always had).
  const panels = copies(new BoxGeometry(1.8, 1.3, 0.08), glass, spots.length);
  // Polished glass: a bright streak crossing each panel (thicker than it, so it shows from the back too), one panel
  // after another in a wave over the field; two waves at 90%.
  const glints = p.reflect >= 75 ? copies(new BoxGeometry(0.2, 1.36, 0.16), glow('#e6eeff'), spots.length) : null;
  const waves = p.reflect >= 90 ? 2 : 1;
  // The beams (from 900 °C: every third mirror's, then all): each one's thickness flickers.
  const lit = spots.filter((_, i) => p.heat >= 900 && (p.heat >= 1200 || (i + 1) % 3 === 0)).map(([x, z], j) => {
    const from = v3(x, 1.9, z), d = aim.clone().sub(from), len = d.length();
    return { mid: from.addScaledVector(d, 0.5), turn: D.quaternion.clone().setFromUnitVectors(UP, d.normalize()), len, phase: j * 1.9 };
  });
  const beams = lit.length ? copies(new CylinderGeometry(0.05, 0.05, 1, 3), beam, lit.length) : null;
  const field = new Group().add(panels);
  if (glints) field.add(glints);
  if (beams) field.add(beams);
  const flicker = p.heat >= 1200 ? 5 : 3;
  g.add(animated(field, 0, 0, 0, (_o, t) => {
    SUN_NOW.copy(SUN).applyAxisAngle(ARC, 0.6 * Math.sin((t * Math.PI * 2) / 40));
    spots.forEach(([x, z], i) => {
      const ring = Math.round((Math.hypot(x - TOWER.x, z - TOWER.z) - 5) / 2.3), phase = ring * 0.9 + i * 0.61;
      if (p.tracking) V.set(top.x - x, receiverY - 1.7, top.z - z).normalize().add(SUN_NOW).normalize();
      else V.set(-0.2, 1, -0.2).normalize();
      D.position.set(x, 1.9, z);
      D.scale.setScalar(1);
      D.lookAt(V.add(D.position));
      D.rotateX(p.tracking ? 0.025 * Math.sin(t * 1.7 + phase) : 0.08 * Math.sin(t * 0.6 + phase));
      put(panels, i);
      if (glints) {
        const w = (cycle(t, 10, -(x + z + 40) / 80) * waves) % 1, span = 0.12 * waves;
        D.translateX(w < span ? (w / span - 0.5) * 1.6 : 0);
        D.scale.setScalar(w < span ? 1 : 0);
        put(glints, i);
      }
    });
    panels.instanceMatrix.needsUpdate = true;
    if (glints) glints.instanceMatrix.needsUpdate = true;
    if (beams) {
      lit.forEach((b, j) => {
        const s = 1.2 + 0.8 * Math.sin(t * flicker + b.phase);
        D.position.copy(b.mid);
        D.quaternion.copy(b.turn);
        D.scale.set(s, b.len, s);
        put(beams, j);
      });
      beams.instanceMatrix.needsUpdate = true;
    }
  }));

  // Molten-salt tanks with gauges and a hot pipe to the tower; the heat exchanger.
  const tankSpots = [[13, -14], [13, -8.5], [7.5, -14]];
  for (let k = 0; k < p.saltTanks; k++) {
    const [x, z] = tankSpots[k];
    g.add(at(new Mesh(new CylinderGeometry(2.2, 2.2, 4.4, 14), textured('#a8a4a0', repeated(metalTexture(0.4), 3, 2))), x, 2.2, z));
    g.add(at(new Mesh(new ConeGeometry(2.3, 0.8, 14), steel()), x, 4.8, z));
    const band = new Mesh(new CylinderGeometry(2.25, 2.25, 0.5, 14, 1, true), hazard());
    g.add(at(band, x, 0.6, z));
    g.add(at(new Mesh(new BoxGeometry(0.3, 3, 0.1), glow('#1a1410')), x + 1.6, 2.4, z + 1.6));
    ladder(g, x - 2.25, 0, z, 4.6, Math.PI / 2);
    railing(g, x, 4.6, z, 1.8);
    heap(g, x, z, 3);
    g.add(rod(v3(x - 1.5, 0.5, z), v3(TOWER.x + 2, 0.5, TOWER.z), 0.25, textured('#8a5040', metalTexture(0.8)), 6));
  }
  if (p.saltTanks) {
    // Each tank's gauge level rises and falls in its own time, and lumps of hot salt run down its pipe from the tower.
    const n = p.saltTanks, hot = glow('#ff8a3a');
    const levels = copies(new BoxGeometry(0.32, 1, 0.12), hot, n), lumps = copies(new SphereGeometry(0.36, 6, 4), hot, n * 2);
    g.add(animated(new Group().add(levels, lumps), 0, 0, 0, (_o, t) => {
      D.quaternion.identity();
      for (let k = 0; k < n; k++) {
        const [x, z] = tankSpots[k], level = 2.2 + 0.5 * Math.sin(t * 0.35 + k * 2.1);
        D.position.set(x + 1.6, 0.9 + level / 2, z + 1.6);
        D.scale.set(1, level, 1);
        put(levels, k);
        for (let j = 0; j < 2; j++) {
          const u = cycle(t, 7, k * 0.3 + j * 0.5);
          D.position.set(TOWER.x + 2 + (x - 1.5 - TOWER.x - 2) * u, 0.5, TOWER.z + (z - TOWER.z) * u);
          D.scale.setScalar(Math.sin(u * Math.PI));
          put(lumps, k * 2 + j);
        }
      }
      levels.instanceMatrix.needsUpdate = true;
      lumps.instanceMatrix.needsUpdate = true;
    }));
  }
  if (p.exchanger) {
    // A fan over the fins: a shroud ring resting on them, and the blades turning on their upright shaft.
    const ring = new Mesh(new TorusGeometry(1, 0.07, 4, 14), steel());
    ring.rotation.x = Math.PI / 2;
    g.add(at(ring, 7.5, 3.67, -8.5), rod(v3(7.5, 3.4, -8.5), v3(7.5, 3.75, -8.5), 0.1, steel(), 5));
    const fan = new Group().add(new Mesh(new CylinderGeometry(0.2, 0.2, 0.2, 6), bright()));
    for (let k = 0; k < 4; k++) {
      const blade = new Mesh(new BoxGeometry(0.85, 0.05, 0.3), bright());
      blade.rotation.set(0.35, (k / 4) * Math.PI * 2, 0, 'YXZ');
      blade.position.set(Math.cos((k / 4) * Math.PI * 2) * 0.5, 0, -Math.sin((k / 4) * Math.PI * 2) * 0.5);
      fan.add(blade);
    }
    g.add(animated(fan, 7.5, 3.8, -8.5, (o, t) => { o.rotation.y = t * 2.4; }));
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
      blinkers.push([x, 9.3, z, 0.35, 1.6, x === -12 ? 0 : 0.5]);
    }
    const runs = [-1, 1].map((s) => [v3(TOWER.x + s * 1.2, 6, TOWER.z - s * 1.2), v3(-12 + s * 2, 8.5, 12 - s * 2), v3(-19 + s * 2, 8.5, 19 - s * 2)]);
    for (const [a, b, c] of runs) g.add(rod(a, b, 0.04, wire, 3), rod(b, c, 0.04, wire, 3));
    // Lights running along both wires, from the tower out towards the base.
    const pulses = copies(new SphereGeometry(0.16, 5, 3), glow('#ffe8a0'), 4);
    g.add(animated(new Group().add(pulses), 0, 0, 0, (_o, t) => {
      D.quaternion.identity();
      runs.forEach(([a, b, c], w) => {
        const first = a.distanceTo(b), all = first + b.distanceTo(c);
        for (let j = 0; j < 2; j++) {
          const u = cycle(t, 6, w * 0.25 + j * 0.5), d = u * all;
          if (d < first) D.position.lerpVectors(a, b, d / first); else D.position.lerpVectors(b, c, (d - first) / (all - first));
          D.scale.setScalar(Math.min(1, Math.sin(u * Math.PI) * 4));
          put(pulses, w * 2 + j);
        }
      });
      pulses.instanceMatrix.needsUpdate = true;
    }));
  }

  // The control shed (lit windows, a door, an antenna) and the clutter of a work site.
  const shed = new Mesh(new BoxGeometry(4, 2.6, 3), textured('#5a5a6a', repeated(metalTexture(0.8), 2, 1)));
  g.add(at(shed, 15, 1.3, 15));
  g.add(at(new Mesh(new BoxGeometry(4.4, 0.25, 3.4), steel()), 15, 2.7, 15));
  for (const dx of [-1, 0.6]) g.add(at(new Mesh(new BoxGeometry(0.9, 0.7, 0.1), glow('#ffd890')), 15 + dx, 1.6, 16.55));
  g.add(rod(v3(16.4, 2.8, 14), v3(16.4, 5.5, 14), 0.05, steel(), 3));
  blinkers.push([16.4, 5.6, 14, 0.25, 3, 0]);
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
  // The red lamps (mast, pylons, the shed's aerial): lit for the first half of their period, shrunk (dim) for the rest.
  const reds = copies(new BoxGeometry(1, 1, 1), glow(RED), blinkers.length);
  g.add(animated(new Group().add(reds), 0, 0, 0, (_o, t) => {
    D.quaternion.identity();
    blinkers.forEach(([x, y, z, size, period, phase], i) => {
      D.position.set(x, y, z);
      D.scale.setScalar(cycle(t, period, phase) < 0.5 ? size : size * 0.4);
      put(reds, i);
    });
    reds.instanceMatrix.needsUpdate = true;
  }));
  return g;
}

/** A dark, lightly rusted metal for machinery. */
const obsidianish = () => textured(OBSIDIAN, metalTexture(0.5));
