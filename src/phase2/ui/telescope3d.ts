// The giant telescope in 3D, as it stands at some level (`Telescope`, core/telescope.ts): a tube (refractor, then an
// open reflector, then a truss with a segmented mirror) tilted towards the sky on its mount (tripod, pier, then a fork on
// a turntable), lens rings that glow brighter as it gets sharper, and as it grows a platform, a wind wall, a half dome
// and laser guide stars. Built in local units round the plot's centre, on the flat sand (y = 0).
import { BoxGeometry, CylinderGeometry, Group, InstancedMesh, Mesh, Object3D, PointLight, SphereGeometry, TorusGeometry, Vector3, Color, CatmullRomCurve3, TubeGeometry, type BufferGeometry, type Material } from 'three';
import type { Telescope } from '../core/telescope';
import { animated, BRIGHT, CONCRETE, glow, LAMP, lambert, OBSIDIAN, RED, rod, shadow, STEEL } from './kit3d';
import { concreteTexture, metalTexture, repeated, SAND_LOW, SAND_TILE, sandTexture, textured } from './textures';

const LASER = '#ffb030';

/** Where the tube points: altitude and azimuth (direction (cos, sin) in x, z). Sideways to the starting view, so its
 *  whole length shows. */
const ALT = (40 * Math.PI) / 180;
const AZ = (135 * Math.PI) / 180;

const TAU = Math.PI * 2;
/** The tube's rest tilt in its head's frame (x towards the sky's azimuth, z the tilt axis; the tube runs along its +y). */
const TILT = ALT - Math.PI / 2;
/** The sharpness each "sharper" upgrade reaches: one status lamp on the tube for each one built. */
const SHARP_STEPS = [25, 40, 60, 75, 88, 99];

const scratch = new Object3D();
/** `n` copies of one shape, each posed on its own every frame (`pose(o, k, t)` on a blank object): one draw call.
 *  Returns the mesh and its `tick(t)`, to call from the anim of the animated part it is in. */
function copies(geo: BufferGeometry, mat: Material, n: number, pose: (o: Object3D, k: number, t: number) => void): { mesh: InstancedMesh; tick: (t: number) => void } {
  const mesh = new InstancedMesh(geo, mat, n);
  mesh.frustumCulled = false; // (its bounds would go stale as the copies move)
  const tick = (t: number) => {
    for (let k = 0; k < n; k++) {
      scratch.position.set(0, 0, 0);
      scratch.rotation.set(0, 0, 0);
      scratch.scale.set(1, 1, 1);
      pose(scratch, k, t);
      scratch.updateMatrix();
      mesh.setMatrixAt(k, scratch.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  tick(0);
  return { mesh, tick };
}

/** The telescope at its level, its foot at the origin (the desert frees it with `disposeGroup` when replaced).
 *
 *  What moves, by upgrade (level): every one is an `animated` part (kit3d), nested where it rides on another: the
 *  head turns on the mount, the tube tilts in the head, and the tube's own parts move on the tube.
 *   1 Scrap spyglass     the tube nods up and down, following the sky (on the tripod it also trembles)
 *   2 Longer tube        the eyepiece's draw tube racks in and out, focusing (while a refractor)
 *   3 Second lens        lens rings: a pulse runs along the tube, ring by ring (one ring per lens: 3, 7, 13, 17, 20)
 *   4 Ground glass       sharpness lamps on the tube's back end breathe in turn (one per step: 4, 9, 15, 17, 19, 20)
 *   5 Steel pier         no more trembling: the head turns steadily on the pier, swinging its counterweight round
 *   6 Wide reflector     the mouth's dust cover, hinged open, sways (while a reflector)
 *   7 Finder scope       the finder nods on its bracket (and one more ring pulsing)
 *   8 Concrete platform  its red lights blink, odd and even in turn
 *   9 Collimation        the side focuser slides in and out (while a reflector), and one more lamp
 *  10 Fork mount         the fork and its turntable turn, sweeping the tube round
 *  11 Truss tube         the top cage (ring, spider, secondary mirror, instrument boxes) turns about the tube's axis
 *  12 Wind wall          a windsock on its rim swings in the wind; a gap runs round its red lights
 *  13 Corrector plate    the corrector's holder spins slowly inside the truss (and one more ring)
 *  14 Rotating dome      the half dome and its ribs turn slowly back and forth
 *  15 Cooled sensor      the fan on the sensor's housing, under the mirror cell, spins (and one more lamp)
 *  16 Segmented mirror   the segments shimmer: each shrinks and grows in a ripple from the middle
 *  17 Adaptive optics    actuator lights chase round the mirror cell (and one more ring and lamp)
 *  18 Giant truss        the ripple reaches the second ring of segments (19 of them)
 *  19 Laser guide star   the beam, riding on the tube, sweeps a little on its own (and one more lamp)
 *  20 Star array         three beams, each sweeping out of step (and the sixth ring and lamp) */
export function buildTelescope(t: Telescope): Group {
  const g = new Group();
  // Worn plating everywhere (rust on the older steel), concrete for the base.
  const steel = textured(STEEL, metalTexture(0.7)), bright = textured(BRIGHT, metalTexture(0.3));
  const obsidian = textured(OBSIDIAN, metalTexture(0.2)), red = glow(RED);
  const lens = glow(`#${new Color('#28406a').lerp(new Color('#c8f6ff'), t.sharpness / 100).getHexString()}`);
  const r = 0.35 + Math.sqrt(t.aperture); // tube radius
  const L = 6 + r * 4; // tube length
  const back = 0.35; // share of the tube behind the pivot
  const base = t.platform ? 1.2 : 0;
  const H = base + (t.mount === 'tripod' ? 2.5 + r : t.mount === 'pier' ? 3.5 + r * 1.2 : 2.7 + r * 1.5);

  // Ground works: platform, wind wall, dome (open towards the view and the tube).
  const Rw = Math.max(11, L * 0.7 + 2);
  const Rp = t.wall ? Rw : Math.max(7, L * 0.55);
  if (t.platform) {
    const slab = new Mesh(new CylinderGeometry(Rp, Rp + 0.5, base, 20), textured(CONCRETE, repeated(concreteTexture(), Rp / 2, Rp / 2)));
    // (its top face: the cylinder's caps take the texture's middle; tiles of ~6 units)
    slab.position.y = base / 2;
    g.add(slab);
  }
  if (t.platform || t.wall) {
    // Red lights, all one instanced mesh: 12 round the platform blinking odd and even in turn, 16 on the wall with a
    // gap running round them.
    const nP = t.platform ? 12 : 0, nW = t.wall ? 16 : 0;
    const lights = copies(new BoxGeometry(1, 1, 1), red, nP + nW, (o, k, time) => {
      if (k < nP) {
        const a = (k / 12) * TAU, on = (k + Math.floor(time / 1.5)) % 2 === 0;
        o.position.set(Math.cos(a) * (Rp + 0.3), base + 0.1, Math.sin(a) * (Rp + 0.3));
        o.scale.set(0.4, 0.3, 0.4).multiplyScalar(on ? 1 : 0);
      } else {
        const j = k - nP, a = (j / 16) * TAU, on = (j + Math.floor(time * 2.5)) % 4 !== 0;
        o.position.set(Math.cos(a) * (Rw + 0.3), base + 3, Math.sin(a) * (Rw + 0.3));
        o.scale.set(0.5, 0.4, 0.5).multiplyScalar(on ? 1 : 0);
      }
    });
    g.add(animated(new Group().add(lights.mesh), 0, 0, 0, (_, time) => lights.tick(time)));
  }
  if (t.wall) {
    const wall = new Mesh(new CylinderGeometry(Rw, Rw, 4, 32, 1, true), textured(OBSIDIAN, repeated(metalTexture(0.4), Math.round(Rw), 0.5), true));
    wall.position.y = base + 2;
    const rim = new Mesh(new TorusGeometry(Rw, 0.35, 4, 32), steel);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = base + 4;
    g.add(wall, rim);
    // A windsock on the rim, on the open side (clear of the dome as it turns): it swings round its pole and droops.
    const wx = Math.cos(0.35) * Rw, wz = Math.sin(0.35) * Rw, wy = base + 7;
    g.add(rod(new Vector3(wx, base + 4, wz), new Vector3(wx, wy + 0.3, wz), 0.1, steel, 4));
    const sock = new Mesh(new CylinderGeometry(0.16, 0.5, 2.2, 6, 1, true), textured('#c8502a', metalTexture(0.2), true));
    sock.rotation.z = Math.PI / 2; // (its wide mouth at the pole, its tail along +x)
    sock.position.x = 1.1;
    g.add(animated(new Group().add(sock), wx, wy, wz, (o, time) => {
      o.rotation.y = 0.5 + 0.4 * Math.sin(time * 0.9) + 0.12 * Math.sin(time * 2.3);
      o.rotation.z = -0.3 + 0.14 * Math.sin(time * 1.7);
    }));
  }
  if (t.dome) {
    // Half a dome behind (angles as three's sphere phi: direction (−cos, sin)): it covers azimuths 150°..330°, and
    // turns slowly a few degrees either way.
    const shell = new Group();
    shell.add(new Mesh(new SphereGeometry(Rw, 24, 8, (7 * Math.PI) / 6, Math.PI, 0, Math.PI / 2),
      textured(OBSIDIAN, repeated(metalTexture(0.25), Math.round(Rw / 2), 3), true)));
    for (let k = 0; k <= 4; k++) { // ribs
      const rib = new Mesh(new TorusGeometry(Rw + 0.05, 0.18, 4, 12, Math.PI / 2), steel);
      const phi = (7 * Math.PI) / 6 + (k / 4) * Math.PI;
      rib.rotation.y = phi + Math.PI;
      shell.add(rib);
    }
    g.add(animated(shell, 0, base + 4, 0, (o, time) => { o.rotation.y = 0.16 * Math.sin(time * 0.13); }));
  }

  // The mount. Its head (what turns: at the plot's centre, x towards the tube's azimuth, z along the tilt axis) holds
  // the tube; the tripod's legs and the pier stand still under it.
  const head = new Group();
  if (t.mount === 'tripod') {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.4;
      g.add(rod(new Vector3(Math.cos(a) * (1.4 + r), base, Math.sin(a) * (1.4 + r)), new Vector3(0, H, 0), 0.12 + r * 0.06, steel, 4));
    }
  } else if (t.mount === 'pier') {
    const R = 0.45 + r * 0.25;
    g.add(rod(new Vector3(0, base, 0), new Vector3(0, H - r * 0.9 - 0.3, 0), R, steel, 8));
    // The pier's head: a collar turning on its top, a counterweight on a shaft out along the tilt axis.
    head.add(rod(new Vector3(0, H - r * 0.9 - 0.3, 0), new Vector3(0, H - r * 0.9, 0), R + 0.15, bright, 8));
    head.add(rod(new Vector3(0, H - r * 0.5, 0), new Vector3(0, H - r * 0.5, -(r + 1.6)), 0.1 + r * 0.04, steel, 4));
    head.add(rod(new Vector3(0, H - r * 0.5, -(r + 1)), new Vector3(0, H - r * 0.5, -(r + 1.6)), 0.3 + r * 0.15, bright, 6));
  } else {
    const table = new Mesh(new CylinderGeometry(r + 1.4, r + 1.6, 1.2, 16), steel);
    table.position.y = base + 0.6;
    head.add(table);
    for (const s of [-1, 1]) {
      const z = s * (r + 0.7);
      head.add(rod(new Vector3(0, base + 1.2, z), new Vector3(0, H, z), 0.35 + r * 0.12, bright, 4));
      head.add(rod(new Vector3(0, H, z), new Vector3(0, H, z * 0.8), 0.5 + r * 0.1, steel, 6));
    }
  }

  // The tube: its own group, +y along the tube, the pivot at its origin; −x is its top side, z the tilt axis.
  const tube = new Group();
  const ticks: ((time: number) => void)[] = []; // (its instanced parts, moved by its anim)
  const y0 = -L * back, y1 = L * (1 - back);
  const along = (y: number) => new Vector3(0, y, 0);
  /** A point on the tube's side: `a` round from its top, `rad` from its axis. */
  const round = (a: number, rad: number, y: number) => new Vector3(-Math.cos(a) * rad, y, Math.sin(a) * rad);
  let backR = r; // the radius of its back end, where the lamps sit
  if (t.tube === 'refractor') {
    backR = r * 0.83;
    const body = new Mesh(new CylinderGeometry(r, r * 0.8, L, 10), textured(STEEL, repeated(metalTexture(0.7), 1, Math.round(L / 3))));
    body.position.y = (y0 + y1) / 2;
    const shield = new Mesh(new CylinderGeometry(r * 1.15, r * 1.15, L * 0.18, 10, 1, true), obsidian);
    shield.position.y = y1 - L * 0.09;
    const glass = new Mesh(new CylinderGeometry(r * 0.9, r * 0.9, 0.12, 10), lens);
    glass.position.y = y1 - 0.4;
    tube.add(body, shield, glass);
    const eye = new Group().add(rod(along(0.4), along(-0.8), r * 0.3, bright, 6));
    if (t.aperture >= 0.2) {
      // The draw tube racks in and out, with its focus knob.
      eye.add(rod(new Vector3(0, -0.3, -r * 0.6), new Vector3(0, -0.3, r * 0.6), r * 0.14, bright, 4));
      tube.add(animated(eye, 0, y0, 0, (o, time) => { o.position.y = (o.userData.at as Vector3).y - 0.16 + 0.16 * Math.cos(time * 0.55); }));
    } else {
      eye.position.y = y0;
      tube.add(eye);
    }
  } else if (t.tube === 'reflector') {
    const body = new Mesh(new CylinderGeometry(r, r, L, 14, 1, true), textured(BRIGHT, repeated(metalTexture(0.3), 2, Math.round(L / 4)), true));
    body.position.y = (y0 + y1) / 2;
    const cap = new Mesh(new CylinderGeometry(r, r, 0.3, 14), steel);
    cap.position.y = y0;
    const mirror = new Mesh(new CylinderGeometry(r * 0.85, r * 0.85, 0.1, 14), lens);
    mirror.position.y = y0 + 0.25;
    tube.add(body, cap, mirror);
    // The focuser on its top side: once collimated it slides in and out.
    const focuser = new Group().add(rod(new Vector3(0.3 * r, 0, 0), new Vector3(-0.45 * r, 0, 0), r * 0.18, steel, 5));
    if (t.sharpness >= 40) {
      tube.add(animated(focuser, -r, y1 - 1, 0, (o, time) => { o.position.x = (o.userData.at as Vector3).x - r * 0.1 * (1 - Math.cos(time * 0.6)); }));
    } else {
      focuser.position.set(-r, y1 - 1, 0);
      tube.add(focuser);
    }
    // The mouth's dust cover, hinged open at the top edge, swaying.
    const lid = new Mesh(new CylinderGeometry(r * 1.02, r * 1.02, 0.1, 14), bright);
    lid.position.x = r;
    tube.add(animated(new Group().add(lid), -r, y1 + 0.05, 0, (o, time) => { o.rotation.z = 2 + 0.14 * Math.sin(time * 0.6); }));
  } else {
    const cell = new Mesh(new CylinderGeometry(r * 1.05, r * 1.05, 1.2, 16), steel);
    cell.position.y = y0 + 0.6;
    backR = r * 1.05;
    const mid = new Mesh(new TorusGeometry(r, 0.25, 4, 18), bright);
    mid.rotation.x = Math.PI / 2;
    mid.position.y = (y0 + y1) / 2;
    tube.add(cell, mid);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, b = ((k + 1) / 8) * Math.PI * 2;
      const p = (ang: number, y: number) => new Vector3(Math.cos(ang) * r, y, Math.sin(ang) * r);
      tube.add(rod(p(a, y0 + 1.2), p(a, y1), 0.1, steel, 4), rod(p(a, y0 + 1.2), p(b, (y0 + y1) / 2), 0.07, steel, 3));
    }
    // The main mirror: one disc, or hexagonal segments that shimmer (each shrinks a little, in a ripple outwards).
    const top = y0 + 1.25;
    if (t.segments === 0) {
      const m = new Mesh(new CylinderGeometry(r * 0.9, r * 0.9, 0.1, 16), lens);
      m.position.y = top;
      tube.add(m);
    } else {
      const rings = t.segments > 7 ? 2 : 1;
      const s = (r * 0.92) / (rings * Math.sqrt(3) + 1);
      const spots: [number, number, number][] = []; // x, z, ring
      for (let q = -rings; q <= rings; q++) {
        for (let w = -rings; w <= rings; w++) {
          if (Math.abs(q + w) > rings) continue;
          spots.push([s * Math.sqrt(3) * (q + w / 2), s * 1.5 * w, Math.max(Math.abs(q), Math.abs(w), Math.abs(q + w))]);
        }
      }
      const hexes = copies(new CylinderGeometry(s * 0.9, s * 0.9, 0.12, 6), lens, spots.length, (o, k, time) => {
        const [x, z, ring] = spots[k];
        const f = 1 - 0.22 * Math.max(0, Math.sin(time * 1.3 - ring * 1.4 + k * 0.5));
        o.position.set(x, top, z);
        o.scale.set(f, 1, f);
      });
      tube.add(hexes.mesh);
      ticks.push(hexes.tick);
    }
    // The top cage: the ring, the secondary mirror on its spider and two instrument boxes, turning about the axis.
    const cage = new Group();
    const ring = new Mesh(new TorusGeometry(r, 0.25, 4, 18), bright);
    ring.rotation.x = Math.PI / 2;
    const sec = new Mesh(new CylinderGeometry(r * 0.25, r * 0.25, 0.3, 8), bright);
    sec.position.y = -0.2;
    cage.add(ring, sec, rod(new Vector3(-r, -0.2, 0), new Vector3(r, -0.2, 0), 0.07, bright, 3));
    for (const s of [-1, 1]) {
      const box = new Mesh(new BoxGeometry(0.4 + r * 0.2, 0.5 + r * 0.15, 0.4 + r * 0.2), bright);
      box.position.set(0, 0.1, s * (r + 0.15));
      cage.add(box);
    }
    tube.add(animated(cage, 0, y1, 0, (o, time) => { o.rotation.y = 0.6 * Math.sin(time * 0.16); }));
    if (t.lenses >= 4) {
      // The corrector plate's holder, a little down the truss: a ring on three arms, spinning slowly.
      const holder = new Group();
      const inner = new Mesh(new TorusGeometry(r * 0.55, 0.14, 4, 12), bright);
      inner.rotation.x = Math.PI / 2;
      holder.add(inner);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU;
        holder.add(rod(new Vector3(Math.cos(a) * r * 0.55, 0, Math.sin(a) * r * 0.55), new Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), 0.1, bright, 3));
      }
      tube.add(animated(holder, 0, y1 - L * 0.14, 0, (o, time) => { o.rotation.y = -time * 0.22; }));
    }
  }
  // Lens rings: one per lens, along the tube; a pulse runs up them.
  if (t.lenses > 0) {
    const rings = copies(new TorusGeometry(r + 0.15, 0.13, 4, 16).rotateX(Math.PI / 2), lens, t.lenses, (o, k, time) => {
      const p = Math.sin(TAU * (time / 3.2 - k / t.lenses));
      o.position.y = y0 + ((k + 0.5) / t.lenses) * (y1 - y0) * 0.9;
      o.scale.set(1 + 0.06 * p, 1 + 0.6 * p, 1 + 0.06 * p);
    });
    tube.add(rings.mesh);
    ticks.push(rings.tick);
  }
  // Sharpness lamps round the back end, one per step reached, breathing in turn.
  const sharp = SHARP_STEPS.filter((s) => t.sharpness >= s).length;
  if (sharp > 0) {
    const size = 0.2 + r * 0.07, step = (size * 1.7) / backR;
    const lamps = copies(new BoxGeometry(size, size, size), glow('#8ff0ff'), sharp, (o, k, time) => {
      const a = 0.5 + k * step;
      o.position.copy(round(a, backR + size * 0.4, y0 + 0.6));
      o.rotation.y = a;
      o.scale.setScalar(0.85 + 0.45 * Math.sin(TAU * (time / 2.6 - k / sharp)));
    });
    tube.add(lamps.mesh);
    ticks.push(lamps.tick);
  }
  if (t.sharpness >= 60) {
    // The cooled sensor: a housing under the back end, its fan spinning.
    const R = r * 0.4 + 0.2;
    tube.add(rod(along(y0 - 1), along(y0), R, steel, 8));
    const fan = new Group();
    for (const a of [0, Math.PI / 2]) {
      const blade = new Mesh(new BoxGeometry(R * 2.1, 0.12, R * 0.4), bright);
      blade.rotation.y = a;
      fan.add(blade);
    }
    tube.add(animated(fan, 0, y0 - 1.1, 0, (o, time) => { o.rotation.y = time * 2.2; }));
  }
  if (t.lenses >= 5 && t.sharpness >= 75) {
    // Adaptive optics: actuator lights round the top of the mirror cell, every fourth lit, chasing round.
    const n = 12, size = 0.18 + r * 0.05;
    const act = copies(new BoxGeometry(size, size, size), glow(LASER), n, (o, k, time) => {
      const a = (k / n) * TAU;
      o.position.copy(round(a, backR + size * 0.4, y0 + 1.2));
      o.rotation.y = a;
      o.scale.setScalar((k + Math.floor(time * 5)) % 4 === 0 ? 1 : 0);
    });
    tube.add(act.mesh);
    ticks.push(act.tick);
  }
  if (t.finder) {
    // The finder on its bracket, on the tube's top side: it nods a little about the bracket.
    tube.add(rod(new Vector3(-r * 0.9, L * 0.1, 0), new Vector3(-(r + 0.45), L * 0.1, 0), 0.12 + r * 0.03, steel, 4));
    const finder = new Group().add(rod(along(-L * 0.2), along(L * 0.2), 0.22 + r * 0.04, steel, 6));
    const tip = new Mesh(new SphereGeometry(0.22, 5, 3), lens);
    tip.position.y = L * 0.2;
    finder.add(tip);
    tube.add(animated(finder, -(r + 0.45), L * 0.1, 0, (o, time) => { o.rotation.z = 0.05 * Math.sin(time * 0.8); o.rotation.x = 0.04 * Math.sin(time * 0.53); }));
  }
  if (t.lasers > 0) {
    // Laser guide stars, from the tube's mouth up into the sky: they ride on the tube, each sweeping a little.
    const beam = new CylinderGeometry(0.12, 0.12, 140, 4).translate(0, 70, 0);
    const beams = copies(beam, glow(LASER, 0.75), t.lasers, (o, k, time) => {
      const off = k - (t.lasers - 1) / 2;
      o.position.set(0, y1, off * r * 0.6);
      o.rotation.x = Math.atan(off * 0.12) + 0.012 * Math.sin(time * 0.7 + k * 2.1);
      o.rotation.z = 0.01 * Math.sin(time * 0.45 + k * 1.3);
    });
    tube.add(beams.mesh);
    ticks.push(beams.tick);
  }
  // The tube tilts about its pivot, following the sky (and trembles on the tripod); the head turns on the pier or
  // with the fork.
  const tremble = t.mount === 'tripod' ? 1 : 0;
  const moved = animated(tube, 0, H, 0, (o, time) => {
    o.rotation.set(0, 0, TILT + 0.04 * Math.sin(time * 0.27) + tremble * 0.007 * Math.sin(time * 5.3));
    for (const tick of ticks) tick(time);
  });
  moved.rotation.z = TILT;
  head.add(moved);
  const turning = animated(head, 0, 0, 0, (o, time) => {
    // (all three angles: merging leaves a turn of over 90° as other Euler angles)
    o.rotation.set(0, -AZ + (tremble ? 0.005 * Math.sin(time * 4.1) : 0.07 * Math.sin(time * 0.17)), 0);
  });
  turning.rotation.y = -AZ;
  g.add(turning);

  // Settled in the sand: a soft shadow round its foot, sand drifted against its base (or heaped at its feet), and the
  // site's clutter: crates of parts and the lamp's cable snaking over the sand.
  const foot = t.wall ? Rw : t.platform ? Math.max(7, L * 0.55) : 1.6 + r;
  shadow(g, foot * 1.4, 0, 0, 0.55);
  const sand = (u: number, v: number) => textured(SAND_LOW, repeated(sandTexture(), u, v));
  if (t.platform) {
    const drift = new Mesh(new TorusGeometry(foot + 0.3, 1.3, 5, 36), sand((foot * 2 * Math.PI) / SAND_TILE, 0.4));
    drift.rotation.x = Math.PI / 2;
    drift.scale.z = 0.45; // (flattened: a low bank of sand)
    g.add(drift);
  } else {
    const legs = t.mount === 'tripod' ? [0, 1, 2].map((k) => (k / 3) * Math.PI * 2 + 0.4) : [0];
    for (const a of legs) {
      const heap = new Mesh(new SphereGeometry(t.mount === 'tripod' ? 0.6 : 1.4 + r * 0.3, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), sand(0.5, 0.5));
      heap.scale.y = 0.35;
      const d = t.mount === 'tripod' ? 1.4 + r : 0;
      heap.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      g.add(heap);
    }
  }
  const crates = textured('#5a4e40', metalTexture(1));
  for (const [a, d, s] of [[AZ + 1.9, foot + 2.2, 1.4], [AZ + 2.05, foot + 3.6, 1], [AZ + 1.7, foot + 3.4, 0.8]]) {
    const box = new Mesh(new BoxGeometry(s, s * 0.8, s), crates);
    box.position.set(Math.cos(a) * d, s * 0.35, Math.sin(a) * d);
    box.rotation.y = a * 3;
    g.add(box);
  }

  // A work lamp beside it.
  const lx = Math.cos(AZ + 2.4) * (Rw + 3), lz = Math.sin(AZ + 2.4) * (Rw + 3);
  g.add(rod(new Vector3(lx, 0, lz), new Vector3(lx, 11, lz), 0.25, steel, 4));
  const lamp = new Mesh(new BoxGeometry(1.4, 0.7, 0.7), glow(LAMP));
  lamp.position.set(lx, 11.3, lz);
  const light = new PointLight(LAMP, 300, 26, 1.4);
  light.position.set(lx * 0.75, 10, lz * 0.75);
  g.add(lamp, light);
  const pts: Vector3[] = [];
  for (let k = 0; k <= 8; k++) {
    const f = k / 8, x = lx * (1 - f) + Math.cos(AZ + 2.4) * foot * f, z = lz * (1 - f) + Math.sin(AZ + 2.4) * foot * f;
    pts.push(new Vector3(x + Math.sin(f * 9) * 0.8, 0.12, z + Math.cos(f * 7) * 0.8));
  }
  g.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 24, 0.12, 4), lambert('#1e1e26')));
  return g;
}

