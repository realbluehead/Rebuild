import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PointLight, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { mergeByMaterial } from './merge3d';

describe('mergeByMaterial', () => {
  it('draws one mesh per material, keeps lights and live pieces where they were', () => {
    const a = new MeshBasicMaterial(), b = new MeshBasicMaterial();
    const root = new Group();
    root.position.set(100, 0, 0); // (merged in the root's own space: its own placement does not count)
    const inner = new Group();
    inner.position.set(0, 5, 0);
    for (let k = 0; k < 5; k++) {
      const m = new Mesh(new BoxGeometry(1, 1, 1), k % 2 ? a : b);
      m.position.set(k * 2, 0, 0);
      inner.add(m);
    }
    const light = new PointLight('#fff', 3);
    light.position.set(1, 2, 3);
    inner.add(light);
    const live = new Mesh(new BoxGeometry(), a);
    live.userData.live = true;
    live.position.set(0, 1, 0);
    inner.add(live);
    root.add(inner);

    const out = mergeByMaterial(root);
    const meshes = out.children.filter((o) => o instanceof Mesh && o !== live) as Mesh[];
    expect(meshes).toHaveLength(2);
    expect(out.children).toContain(light);
    expect(out.children).toContain(live);
    expect(light.position).toEqual(new Vector3(1, 7, 3));
    expect(live.position).toEqual(new Vector3(0, 6, 0));
    const merged = meshes.find((m) => m.material === b)!;
    merged.geometry.computeBoundingBox();
    expect(merged.geometry.boundingBox!.min.toArray()).toEqual([-0.5, 4.5, -0.5]);
    expect(merged.geometry.boundingBox!.max.toArray()).toEqual([8.5, 5.5, 0.5]);
  });
});
