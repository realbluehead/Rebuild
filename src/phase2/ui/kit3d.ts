// Shared pieces for the base's buildings in 3D (telescope, mirror tower, refinery, tank farm): plain and glowing
// materials, rods between two points, and the details that settle a building into the desert (a soft shadow, heaps
// of sand, crates, barrels, ladders, railings, cables, red warning lights, work lamps). Everything in a building's
// local units, its plot's centre at the origin on the flat sand (y = 0).
import {
  BoxGeometry, CatmullRomCurve3, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry,
  PointLight, SphereGeometry, TorusGeometry, TubeGeometry, Vector3, type Material,
} from 'three';
import { hazardTexture, metalTexture, repeated, SAND_LOW, sandTexture, shadowTexture, textured } from './textures';

export const STEEL = '#4a4e58';
export const BRIGHT = '#6a707c';
export const OBSIDIAN = '#3a3c48';
export const CONCRETE = '#4a4a62';
export const RUST = '#5a4e40';
export const RED = '#ff2a3a';
export const LAMP = '#fff2b0';

export const lambert = (c: string) => new MeshLambertMaterial({ color: c, flatShading: true });
export const glow = (c: string, opacity = 1) => new MeshBasicMaterial({ color: c, transparent: opacity < 1, opacity, depthWrite: opacity === 1 });
export const steel = () => textured(STEEL, metalTexture(0.7));
export const bright = () => textured(BRIGHT, metalTexture(0.3));
export const obsidian = () => textured(OBSIDIAN, metalTexture(0.2));
export const hazard = () => textured('#c0c0c0', hazardTexture());

const UP = new Vector3(0, 1, 0);
export const v3 = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** A cylinder from `a` to `b`. */
export function rod(a: Vector3, b: Vector3, r: number, mat: Material, sides = 5): Mesh {
  const d = b.clone().sub(a);
  const m = new Mesh(new CylinderGeometry(r, r, d.length(), sides), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  return m;
}

/** `m` placed at (x, y, z). */
export function at<T extends Mesh | Group | PointLight>(m: T, x: number, y: number, z: number): T {
  m.position.set(x, y, z);
  return m;
}

/** A soft round shadow on the sand, `r` across from the middle. */
export function shadow(g: Group, r: number, x = 0, z = 0, opacity = 0.5): void {
  const m = new Mesh(new PlaneGeometry(r * 2, r * 2),
    new MeshBasicMaterial({ color: '#000', alphaMap: shadowTexture(), transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  g.add(at(m, x, 0.04, z));
}

/** A low heap of sand at (x, z), as if drifted against what stands there. */
export function heap(g: Group, x: number, z: number, r: number): void {
  const m = new Mesh(new SphereGeometry(r, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), textured(SAND_LOW, repeated(sandTexture(), r / 3, r / 3)));
  m.scale.y = 0.35;
  g.add(at(m, x, -0.05, z));
}

/** A crate of parts. */
export function crate(g: Group, x: number, z: number, s = 1.2, turn = 0): void {
  const m = new Mesh(new BoxGeometry(s, s * 0.8, s), textured(RUST, metalTexture(1)));
  m.rotation.y = turn;
  g.add(at(m, x, s * 0.4, z));
}

/** A rusty barrel (standing, or lying when `lying`). */
export function barrel(g: Group, x: number, z: number, lying = false, colour = '#7a3a2a'): void {
  const m = new Mesh(new CylinderGeometry(0.55, 0.55, 1.3, 8), textured(colour, metalTexture(1)));
  if (lying) { m.rotation.z = Math.PI / 2; g.add(at(m, x, 0.55, z)); } else g.add(at(m, x, 0.65, z));
  const band = new Mesh(new TorusGeometry(0.56, 0.06, 3, 8), lambert('#2a2a30'));
  band.rotation.x = Math.PI / 2;
  if (!lying) g.add(at(band, x, 0.65, z));
}

/** A ladder up from `a` (bottom) to height `h`, facing `dir` (radians round y). */
export function ladder(g: Group, x: number, y: number, z: number, h: number, dir = 0): void {
  const l = new Group(), mat = steel();
  for (const s of [-0.3, 0.3]) l.add(rod(v3(s, 0, 0), v3(s, h, 0), 0.05, mat, 3));
  for (let k = 0.4; k < h; k += 0.6) l.add(rod(v3(-0.3, k, 0), v3(0.3, k, 0), 0.04, mat, 3));
  l.rotation.y = dir;
  g.add(at(l, x, y, z));
}

/** A ring of railing (posts and a top rail) of radius `r` at height `y`. */
export function railing(g: Group, x: number, y: number, z: number, r: number): void {
  const mat = steel();
  const top = new Mesh(new TorusGeometry(r, 0.06, 3, 20), mat);
  top.rotation.x = Math.PI / 2;
  g.add(at(top, x, y + 1, z));
  const n = Math.max(6, Math.round(r * 3));
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    g.add(rod(v3(x + Math.cos(a) * r, y, z + Math.sin(a) * r), v3(x + Math.cos(a) * r, y + 1, z + Math.sin(a) * r), 0.04, mat, 3));
  }
}

/** A cable (or hose) snaking over the sand through `pts` (y is set just above the sand). */
export function cable(g: Group, pts: [number, number][], r = 0.12, colour = '#1e1e26'): void {
  const curve = new CatmullRomCurve3(pts.map(([x, z]) => v3(x, r, z)));
  g.add(new Mesh(new TubeGeometry(curve, pts.length * 8, r, 4), lambert(colour)));
}

/** A blinking-red-style warning light (static here). */
export function warning(g: Group, x: number, y: number, z: number, s = 0.4): void {
  g.add(at(new Mesh(new BoxGeometry(s, s, s), glow(RED)), x, y, z));
}

/** A work lamp on a pole, lighting the sand round it. */
export function lamp(g: Group, x: number, z: number, h = 10, power = 240): void {
  g.add(rod(v3(x, 0, z), v3(x, h, z), 0.22, steel(), 4), at(new Mesh(new BoxGeometry(1.2, 0.6, 0.6), glow(LAMP)), x, h + 0.3, z));
  g.add(at(new PointLight(LAMP, power, 24, 1.4), x * 0.85, h - 1, z * 0.85));
}

/** An elevated pipe on H-frames from (x0, z0) to (x1, z1) at height `y`. */
export function pipeRack(g: Group, x0: number, z0: number, x1: number, z1: number, y = 2.2, pipes = 2, colour = '#7a7e88'): void {
  const d = Math.hypot(x1 - x0, z1 - z0), nx = (x1 - x0) / d, nz = (z1 - z0) / d, sx = -nz, sz = nx;
  const pipe = textured(colour, repeated(metalTexture(0.5), 1, Math.max(1, Math.round(d / 4))));
  for (let k = 0; k < pipes; k++) {
    const o = (k - (pipes - 1) / 2) * 0.6;
    g.add(rod(v3(x0 + sx * o, y, z0 + sz * o), v3(x1 + sx * o, y, z1 + sz * o), 0.22, pipe, 6));
  }
  const frame = steel();
  for (let t = 0; t <= d; t += 4) {
    const px = x0 + nx * t, pz = z0 + nz * t, w = (pipes / 2) * 0.6 + 0.2;
    g.add(rod(v3(px - sx * w, 0, pz - sz * w), v3(px - sx * w, y, pz - sz * w), 0.08, frame, 4));
    g.add(rod(v3(px + sx * w, 0, pz + sz * w), v3(px + sx * w, y, pz + sz * w), 0.08, frame, 4));
    g.add(rod(v3(px - sx * w, y - 0.25, pz - sz * w), v3(px + sx * w, y - 0.25, pz + sz * w), 0.08, frame, 4));
  }
}

/** Frees a building's geometries, materials and texture copies (not the shared textures). */
export function disposeGroup(g: Group): void {
  g.traverse((o) => {
    if (o instanceof Mesh) {
      o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: Material) => {
        const map = (m as MeshLambertMaterial).map;
        if (map?.userData.copy) map.dispose();
        m.dispose();
      });
    }
  });
}
