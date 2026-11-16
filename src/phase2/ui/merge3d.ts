// Draw calls: a building is hundreds of small meshes (rods, boxes, bolts) over a few shared materials. Drawn as they
// are, each is a draw call; merged into one mesh per material, a whole building is a few dozen.
import { Group, InstancedMesh, Matrix4, Mesh, type BufferGeometry, type Material, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A group drawing the same as `root`: its meshes merged into one per material (in `root`'s own space), its lights and
 *  anything marked `userData.live` (changed after building, like a blinking beacon) kept as they are. Frees the
 *  meshes' original geometries; `root` is left empty and should not be used again. */
export function mergeByMaterial(root: Object3D): Group {
  root.updateMatrixWorld(true);
  const toRoot = new Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, { material: Material; parts: BufferGeometry[] }>();
  const kept: Object3D[] = [];
  const rel = (o: Object3D) => new Matrix4().multiplyMatrices(toRoot, o.matrixWorld);
  root.traverse((o) => {
    if (o === root) return;
    if (o.userData.live || (!(o instanceof Mesh) && !(o instanceof Group) && o.type !== 'Object3D')) {
      // Lights and live pieces: placed where they were, relative to the new group. (Their children go with them.)
      if (!kept.some((k) => isInside(o, k))) kept.push(o);
      return;
    }
    if (!(o instanceof Mesh) || kept.some((k) => isInside(o, k))) return;
    const material = o.material as Material | Material[];
    if (Array.isArray(material) || o instanceof InstancedMesh) { kept.push(o); return; }
    const g = (o.geometry as BufferGeometry).clone().applyMatrix4(rel(o));
    (o.geometry as BufferGeometry).dispose();
    const key = `${material.uuid}|${g.index ? 'i' : 'n'}|${Object.keys(g.attributes).sort().join(',')}`;
    const b = buckets.get(key) ?? { material, parts: [] };
    b.parts.push(g);
    buckets.set(key, b);
  });
  const out = new Group();
  for (const o of kept) {
    rel(o).decompose(o.position, o.quaternion, o.scale);
    out.add(o); // (removes it from its old parent)
  }
  for (const { material, parts } of buckets.values()) {
    const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts);
    if (parts.length > 1) parts.forEach((p) => p.dispose());
    if (merged) out.add(new Mesh(merged, material));
  }
  return out;
}

const isInside = (o: Object3D, parent: Object3D): boolean => {
  for (let p = o.parent; p; p = p.parent) if (p === parent) return true;
  return false;
};
