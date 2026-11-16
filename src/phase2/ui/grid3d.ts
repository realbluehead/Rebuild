// The base's power grid, at every level of every building: poles along the inner lanes (the ones between plots)
// carrying two wires, and on each plot a transformer by the lane, fed by a drop wire from the nearest pole, with a
// cable over the sand into the plot's building (or to a cabinet waiting for one). The mirror tower's plot is the
// source (its transformer shows orange); every other plot draws from the grid (green). Built in world units.
import { BoxGeometry, CatmullRomCurve3, Group, Mesh, TubeGeometry, Vector3 } from 'three';
import { at, glow, hazard, lambert, rod, steel, v3, warning } from './kit3d';
import { concreteTexture, metalTexture, repeated, textured } from './textures';

export interface GridSite {
  /** The plot's hookup in its own units: the transformer first, then the cable's way into the building. */
  path: [number, number][];
  /** A cabinet at the cable's end (no building there to plug into). */
  cabinet?: boolean;
}

/** Pole spacing along a lane (poles sit between the crossings; one lane direction is higher, so wires never meet). */
const STEP = 10;

export function buildGrid(o: {
  plots: number;
  side: number;
  centre(k: number): Vector3;
  height(x: number, z: number): number;
  source: number;
  sites: Record<number, GridSite>;
}): Group {
  const g = new Group();
  const size = o.side * o.plots, half = size / 2;
  const lanes: number[] = [];
  for (let i = 1; i < o.plots; i++) lanes.push(-half + i * o.side);
  const poles: Vector3[] = [];
  const pole = steel(), wire = lambert('#14141a'), insulator = lambert('#c8c8d0');
  const ground = (x: number, z: number) => o.height(x, z);

  // Poles along the inner lanes (both ways), and the wires between them.
  for (const [dir, top] of [[0, 6], [1, 6.6]] as const) {
    for (const lane of lanes) {
      let prev: Vector3[] | null = null;
      for (let t = -half + STEP / 2; t < half; t += STEP) {
        const x = dir === 0 ? lane : t, z = dir === 0 ? t : lane, y = ground(x, z);
        const p = v3(x, y + top, z);
        poles.push(p);
        g.add(rod(v3(x, y, z), p, 0.15, pole, 5));
        const arm = new Mesh(new BoxGeometry(dir === 0 ? 2.2 : 0.18, 0.18, dir === 0 ? 0.18 : 2.2), pole);
        g.add(at(arm, x, p.y - 0.3, z));
        const ends = [-0.9, 0.9].map((s) => (dir === 0 ? v3(x + s, p.y - 0.05, z) : v3(x, p.y - 0.05, z + s)));
        for (const e of ends) g.add(at(new Mesh(new BoxGeometry(0.18, 0.3, 0.18), insulator), e.x, e.y - 0.1, e.z));
        if (prev) ends.forEach((e, k) => g.add(rod(prev![k], e, 0.035, wire, 3)));
        prev = ends;
      }
    }
  }

  // Each plot's transformer, its drop wire, and its cable into the building.
  for (let k = 0; k < o.plots * o.plots; k++) {
    const c = o.centre(k);
    const sx = c.x > 0 ? -1 : 1, sz = c.z > 0 ? -1 : 1; // (towards the ground's centre: inner lanes)
    const site = o.sites[k] ?? { path: [[18 * sx, 18 * sz], [13 * sx, 13 * sz]], cabinet: true };
    const pts = site.path.map(([x, z]) => v3(c.x + x, 0, c.z + z));
    const tr = pts[0];
    const y0 = ground(tr.x, tr.z);
    g.add(at(new Mesh(new BoxGeometry(2.2, 0.25, 1.9), textured('#5a5a72', repeated(concreteTexture(), 1, 1))), tr.x, y0 + 0.1, tr.z));
    g.add(at(new Mesh(new BoxGeometry(1.3, 1.7, 1.1), textured('#6a7080', metalTexture(0.5))), tr.x, y0 + 1.1, tr.z));
    for (const d of [-0.35, 0, 0.35]) g.add(at(new Mesh(new BoxGeometry(0.1, 1.3, 1.3), steel()), tr.x + 0.7, y0 + 1, tr.z + d));
    g.add(at(new Mesh(new BoxGeometry(1.32, 0.25, 1.12), hazard()), tr.x, y0 + 0.4, tr.z));
    g.add(at(new Mesh(new BoxGeometry(0.3, 0.3, 0.1), glow(k === o.source ? '#ffb040' : '#4aff8a')), tr.x - 0.3, y0 + 1.5, tr.z + 0.56));
    // Drop wire from the nearest pole top.
    let near = poles[0];
    for (const p of poles) if (p.distanceTo(v3(tr.x, p.y, tr.z)) < near.distanceTo(v3(tr.x, near.y, tr.z))) near = p;
    g.add(rod(near, v3(tr.x, y0 + 1.95, tr.z), 0.035, wire, 3));
    // The cable, following the sand.
    const line: Vector3[] = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const n = Math.max(2, Math.ceil(a.distanceTo(b)));
      for (let s = i === 1 ? 0 : 1; s <= n; s++) {
        const x = a.x + ((b.x - a.x) * s) / n, z = a.z + ((b.z - a.z) * s) / n;
        line.push(v3(x, ground(x, z) + 0.13, z));
      }
    }
    if (line.length > 1) g.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(line), line.length * 2, 0.13, 4), lambert('#1a1a22')));
    if (site.cabinet) {
      const e = pts[pts.length - 1], y = ground(e.x, e.z);
      g.add(at(new Mesh(new BoxGeometry(0.9, 1.4, 0.6), textured('#5a5e6a', metalTexture(0.6))), e.x, y + 0.7, e.z));
      g.add(at(new Mesh(new BoxGeometry(0.2, 0.2, 0.1), glow('#4aff8a')), e.x, y + 1.15, e.z + 0.31));
      warning(g, e.x, y + 1.55, e.z, 0.2);
    }
  }
  return g;
}
