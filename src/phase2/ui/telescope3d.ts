// The giant telescope in 3D, as it stands at some level (`Telescope`, core/telescope.ts): a tube (refractor, then an
// open reflector, then a truss with a segmented mirror) tilted towards the sky on its mount (tripod, pier, then a fork on
// a turntable), lens rings that glow brighter as it gets sharper, and as it grows a platform, a wind wall, a half dome
// and laser guide stars. Built in local units round the plot's centre, on the flat sand (y = 0).
import {
  BoxGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, PointLight, Quaternion,
  SphereGeometry, TorusGeometry, Vector3, Color, type Material,
} from 'three';
import type { Telescope } from '../core/telescope';

const OBSIDIAN = '#3a3c48';
const STEEL = '#4a4e58';
const BRIGHT = '#6a707c';
const CONCRETE = '#4a4a62';
const RED = '#ff2a3a';
const LASER = '#ffb030';
const LAMP = '#fff2b0';

const lambert = (c: string) => new MeshLambertMaterial({ color: c, flatShading: true });
const glow = (c: string | Color, opacity = 1) => new MeshBasicMaterial({ color: c, transparent: opacity < 1, opacity });
const UP = new Vector3(0, 1, 0);

/** A cylinder from `a` to `b`. */
function rod(a: Vector3, b: Vector3, r: number, mat: Material, sides = 5): Mesh {
  const d = b.clone().sub(a);
  const m = new Mesh(new CylinderGeometry(r, r, d.length(), sides), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  return m;
}

/** Where the tube points: altitude and azimuth (direction (cos, sin) in x, z). Sideways to the starting view, so its
 *  whole length shows. */
const ALT = (40 * Math.PI) / 180;
const AZ = (135 * Math.PI) / 180;

/** The telescope at its level, its foot at the origin (call `disposeTelescope` before dropping it). */
export function buildTelescope(t: Telescope): Group {
  const g = new Group();
  const steel = lambert(STEEL), bright = lambert(BRIGHT), obsidian = lambert(OBSIDIAN), red = glow(RED);
  const lens = glow(new Color('#28406a').lerp(new Color('#c8f6ff'), t.sharpness / 100));
  const r = 0.35 + Math.sqrt(t.aperture); // tube radius
  const L = 6 + r * 4; // tube length
  const back = 0.35; // share of the tube behind the pivot
  const base = t.platform ? 1.2 : 0;
  const H = base + (t.mount === 'tripod' ? 2.5 + r : t.mount === 'pier' ? 3.5 + r * 1.2 : 2.7 + r * 1.5);
  const dir = new Vector3(Math.cos(ALT) * Math.cos(AZ), Math.sin(ALT), Math.cos(ALT) * Math.sin(AZ));
  const side = new Vector3(Math.cos(AZ + Math.PI / 2), 0, Math.sin(AZ + Math.PI / 2)); // the tilt axis

  // Ground works: platform, wind wall, dome (open towards the view and the tube).
  const Rw = Math.max(11, L * 0.7 + 2);
  if (t.platform) {
    const Rp = t.wall ? Rw : Math.max(7, L * 0.55);
    const slab = new Mesh(new CylinderGeometry(Rp, Rp + 0.5, base, 20), lambert(CONCRETE));
    slab.position.y = base / 2;
    g.add(slab);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2, light = new Mesh(new BoxGeometry(0.4, 0.3, 0.4), red);
      light.position.set(Math.cos(a) * (Rp + 0.3), base + 0.1, Math.sin(a) * (Rp + 0.3));
      g.add(light);
    }
  }
  if (t.wall) {
    const wall = new Mesh(new CylinderGeometry(Rw, Rw, 4, 32, 1, true), obsidian);
    (wall.material as Material).side = DoubleSide;
    wall.position.y = base + 2;
    const rim = new Mesh(new TorusGeometry(Rw, 0.35, 4, 32), steel);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = base + 4;
    g.add(wall, rim);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, light = new Mesh(new BoxGeometry(0.5, 0.4, 0.5), red);
      light.position.set(Math.cos(a) * (Rw + 0.3), base + 3, Math.sin(a) * (Rw + 0.3));
      g.add(light);
    }
  }
  if (t.dome) {
    // Half a dome behind (angles as three's sphere phi: direction (−cos, sin)): it covers azimuths 150°..330°.
    const dome = new Mesh(new SphereGeometry(Rw, 24, 8, (7 * Math.PI) / 6, Math.PI, 0, Math.PI / 2), obsidian);
    (dome.material as Material).side = DoubleSide;
    dome.position.y = base + 4;
    g.add(dome);
    for (let k = 0; k <= 4; k++) { // ribs
      const rib = new Mesh(new TorusGeometry(Rw + 0.05, 0.18, 4, 12, Math.PI / 2), steel);
      const phi = (7 * Math.PI) / 6 + (k / 4) * Math.PI;
      rib.rotation.y = phi + Math.PI;
      rib.position.y = base + 4;
      g.add(rib);
    }
  }

  // The mount.
  const pivot = new Vector3(0, H, 0);
  if (t.mount === 'tripod') {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.4;
      g.add(rod(new Vector3(Math.cos(a) * (1.4 + r), base, Math.sin(a) * (1.4 + r)), pivot, 0.12 + r * 0.06, steel, 4));
    }
  } else if (t.mount === 'pier') {
    g.add(rod(new Vector3(0, base, 0), new Vector3(0, H - r * 0.9, 0), 0.45 + r * 0.25, steel, 8));
  } else {
    const table = new Mesh(new CylinderGeometry(r + 1.4, r + 1.6, 1.2, 16), steel);
    table.position.y = base + 0.6;
    g.add(table);
    for (const s of [-1, 1]) {
      const at = side.clone().multiplyScalar(s * (r + 0.7));
      g.add(rod(new Vector3(at.x, base + 1.2, at.z), new Vector3(at.x, H, at.z), 0.35 + r * 0.12, bright, 4));
      g.add(rod(new Vector3(at.x, H, at.z), at.clone().multiplyScalar(0.8).setY(H), 0.5 + r * 0.1, steel, 6));
    }
  }

  // The tube: its own group, +y along the tube, the pivot at its origin.
  const tube = new Group();
  const y0 = -L * back, y1 = L * (1 - back);
  const along = (y: number) => new Vector3(0, y, 0);
  if (t.tube === 'refractor') {
    const body = new Mesh(new CylinderGeometry(r, r * 0.8, L, 10), steel);
    body.position.y = (y0 + y1) / 2;
    const shield = new Mesh(new CylinderGeometry(r * 1.15, r * 1.15, L * 0.18, 10, 1, true), obsidian);
    shield.position.y = y1 - L * 0.09;
    const glass = new Mesh(new CylinderGeometry(r * 0.9, r * 0.9, 0.12, 10), lens);
    glass.position.y = y1 - 0.4;
    const eye = rod(along(y0), along(y0 - 0.8), r * 0.3, bright, 6);
    tube.add(body, shield, glass, eye);
  } else if (t.tube === 'reflector') {
    const body = new Mesh(new CylinderGeometry(r, r, L, 14, 1, true), bright);
    (body.material as Material).side = DoubleSide;
    body.position.y = (y0 + y1) / 2;
    const cap = new Mesh(new CylinderGeometry(r, r, 0.3, 14), steel);
    cap.position.y = y0;
    const mirror = new Mesh(new CylinderGeometry(r * 0.85, r * 0.85, 0.1, 14), lens);
    mirror.position.y = y0 + 0.25;
    tube.add(body, cap, mirror, rod(along(y1 - 1), along(y1 - 1).setX(r * 1.3), r * 0.18, steel, 5));
  } else {
    const cell = new Mesh(new CylinderGeometry(r * 1.05, r * 1.05, 1.2, 16), steel);
    cell.position.y = y0 + 0.6;
    tube.add(cell);
    for (const y of [y1, (y0 + y1) / 2]) {
      const ring = new Mesh(new TorusGeometry(r, 0.25, 4, 18), bright);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      tube.add(ring);
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, b = ((k + 1) / 8) * Math.PI * 2;
      const p = (ang: number, y: number) => new Vector3(Math.cos(ang) * r, y, Math.sin(ang) * r);
      tube.add(rod(p(a, y0 + 1.2), p(a, y1), 0.1, steel, 4), rod(p(a, y0 + 1.2), p(b, (y0 + y1) / 2), 0.07, steel, 3));
    }
    // The main mirror: one disc, or hexagonal segments.
    const top = y0 + 1.25;
    if (t.segments === 0) {
      const m = new Mesh(new CylinderGeometry(r * 0.9, r * 0.9, 0.1, 16), lens);
      m.position.y = top;
      tube.add(m);
    } else {
      const rings = t.segments > 7 ? 2 : 1;
      const s = (r * 0.92) / (rings * Math.sqrt(3) + 1);
      for (let q = -rings; q <= rings; q++) {
        for (let w = -rings; w <= rings; w++) {
          if (Math.abs(q + w) > rings) continue;
          const hex = new Mesh(new CylinderGeometry(s * 0.9, s * 0.9, 0.12, 6), lens);
          hex.position.set(s * Math.sqrt(3) * (q + w / 2), top, s * 1.5 * w);
          tube.add(hex);
        }
      }
    }
    // The secondary mirror up front, on its spider.
    const sec = new Mesh(new CylinderGeometry(r * 0.25, r * 0.25, 0.3, 8), steel);
    sec.position.y = y1 - 0.2;
    tube.add(sec, rod(along(y1 - 0.2).setX(-r), along(y1 - 0.2).setX(r), 0.05, steel, 3));
  }
  // Lens rings: one per lens, along the tube.
  for (let k = 0; k < t.lenses; k++) {
    const ring = new Mesh(new TorusGeometry(r + 0.15, 0.13, 4, 16), lens);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y0 + ((k + 0.5) / t.lenses) * (y1 - y0) * 0.9;
    tube.add(ring);
  }
  if (t.finder) {
    const f = rod(new Vector3(r + 0.45, -L * 0.1, 0), new Vector3(r + 0.45, L * 0.3, 0), 0.22 + r * 0.04, steel, 6);
    const tip = new Mesh(new SphereGeometry(0.22, 5, 3), lens);
    tip.position.set(r + 0.45, L * 0.3, 0);
    tube.add(f, tip);
  }
  tube.position.copy(pivot);
  tube.quaternion.copy(new Quaternion().setFromUnitVectors(UP, dir));
  g.add(tube);

  // Laser guide stars, from the tube's mouth up into the sky.
  const mouth = pivot.clone().addScaledVector(dir, y1);
  for (let k = 0; k < t.lasers; k++) {
    const spread = (k - (t.lasers - 1) / 2) * 0.12;
    const d = dir.clone().addScaledVector(side, spread).normalize();
    g.add(rod(mouth.clone().addScaledVector(side, (k - (t.lasers - 1) / 2) * r * 0.6), mouth.clone().addScaledVector(d, 140), 0.12, glow(LASER, 0.75), 4));
  }

  // A work lamp beside it.
  const lx = Math.cos(AZ + 2.4) * (Rw + 3), lz = Math.sin(AZ + 2.4) * (Rw + 3);
  g.add(rod(new Vector3(lx, 0, lz), new Vector3(lx, 11, lz), 0.25, steel, 4));
  const lamp = new Mesh(new BoxGeometry(1.4, 0.7, 0.7), glow(LAMP));
  lamp.position.set(lx, 11.3, lz);
  const light = new PointLight(LAMP, 300, 26, 1.4);
  light.position.set(lx * 0.75, 10, lz * 0.75);
  g.add(lamp, light);
  return g;
}

/** Frees a telescope's geometries and materials. */
export function disposeTelescope(g: Group): void {
  g.traverse((o) => {
    if (o instanceof Mesh) {
      o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: Material) => m.dispose());
    }
  });
}
