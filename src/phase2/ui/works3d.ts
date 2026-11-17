// The crew at work: while a building's level (or a ship module) is under way, worker robots stand round its plot
// welding, with a blue-white torch flash and showers of sparks. Four robots on the side the camera sees, each on
// tracks with a hazard-yellow body, a head with a cyan eye and an arm holding the torch out towards the building. They
// weld in bursts (on `WELD_ON` of every `WELD_SEC`, each robot at its own beat), bobbing slightly; the sparks fly out
// of the torch, fall and fade (one InstancedMesh for all, like the buildings' many moving copies). Built round the
// plot's centre, `radius` out (just past the building); `ground(x, z)` is the sand's height there.
import { BoxGeometry, CylinderGeometry, Group, InstancedMesh, Mesh, Object3D, SphereGeometry, Vector3 } from 'three';
import { animated, at, cycle, glow, lambert, rod, STEEL, v3 } from './kit3d';

/** Where the robots stand: angles round the plot (towards the camera, which looks from +x +z) and how far out. */
const SPOTS = [Math.PI / 4 - 1.1, Math.PI / 4 - 0.35, Math.PI / 4 + 0.35, Math.PI / 4 + 1.1];
/** How big a robot is (its parts are drawn about a unit across). */
const SIZE = 1.9;
/** Welding bursts: seconds a cycle, the share of it the torch is lit. */
const WELD_SEC = 2.6;
const WELD_ON = 0.65;
/** Sparks per robot, how long one flies (s), how fast it leaves and how hard it falls. */
const SPARKS = 22;
const SPARK_SEC = 0.7;
const SPARK_SPEED = 4;
const GRAVITY = 12;

const YELLOW = '#d9a520';
const TRACK = '#2a2c33';

/** One robot round its feet, facing +x (its arm and torch out that way); returns it and the torch tip (local). */
function robot(): { g: Group; tip: Vector3 } {
  const g = new Group();
  const tracks = lambert(TRACK), body = lambert(YELLOW), steel = lambert(STEEL);
  for (const z of [-0.45, 0.45]) g.add(at(new Mesh(new BoxGeometry(1.3, 0.35, 0.3), tracks), 0, 0.18, z));
  g.add(at(new Mesh(new BoxGeometry(0.9, 0.8, 0.8), body), 0, 0.8, 0));
  g.add(at(new Mesh(new BoxGeometry(0.55, 0.4, 0.5), steel), 0.05, 1.42, 0));
  g.add(at(new Mesh(new BoxGeometry(0.06, 0.12, 0.3), glow('#5ff0ff')), 0.33, 1.45, 0));
  g.add(rod(v3(0.3, 1.0, 0.3), v3(0.95, 1.05, 0.45), 0.08, steel, 4));
  g.add(rod(v3(0.95, 1.05, 0.45), v3(1.45, 0.75, 0.45), 0.07, steel, 4));
  g.add(at(new Mesh(new CylinderGeometry(0.06, 0.1, 0.3, 5), glow('#9aa0aa')), 1.5, 0.7, 0.45));
  return { g, tip: v3(1.6, 0.62, 0.45) };
}

export function buildWorks(radius: number, ground: (x: number, z: number) => number): Group {
  const works = new Group();
  const tips: Vector3[] = [];
  const flashes: Group[] = [];
  SPOTS.forEach((a, i) => {
    const x = Math.cos(a) * radius, z = Math.sin(a) * radius, y = ground(x, z);
    const { g, tip } = robot();
    g.scale.setScalar(SIZE);
    tip.multiplyScalar(SIZE);
    const face = Math.atan2(-z, -x); // (towards the plot's centre)
    g.rotation.y = -face;
    const turned = new Group(); // (merging bakes the children's transforms, not the part's own)
    turned.add(g);
    const phase = i * 0.37;
    const bot = animated(turned, x, y, z, (o, t) => {
      const on = cycle(t, WELD_SEC, phase) < WELD_ON;
      o.position.y = (o.userData.at as Vector3).y + (on ? Math.sin(t * 40 + i) * 0.02 : Math.sin(t * 2 + i) * 0.05);
    });
    works.add(bot);
    const world = tip.clone().applyAxisAngle(new Vector3(0, 1, 0), -face).add(v3(x, y, z));
    tips.push(world);
    // The torch's flash: a bright blue-white blob that flickers while it welds.
    const flash = new Group();
    flash.add(new Mesh(new SphereGeometry(0.45, 6, 4), glow('#dff4ff')));
    flashes.push(animated(flash, world.x, world.y, world.z, (o, t) => {
      const on = cycle(t, WELD_SEC, phase) < WELD_ON;
      o.visible = on;
      if (on) o.scale.setScalar(0.6 + 0.6 * Math.abs(Math.sin(t * 53 + i * 7)));
    }));
  });
  works.add(...flashes);
  // The sparks: out of each torch in a spray, falling and shrinking as they fly.
  const sparks = new InstancedMesh(new BoxGeometry(0.22, 0.22, 0.22), glow('#ffcf5a'), SPOTS.length * SPARKS);
  sparks.frustumCulled = false;
  const shower = new Group();
  shower.add(sparks);
  const o = new Object3D();
  const pose = (_g: Group, t: number) => {
    tips.forEach((tip, i) => {
      const phase = i * 0.37;
      const on = cycle(t, WELD_SEC, phase) < WELD_ON;
      for (let k = 0; k < SPARKS; k++) {
        const u = cycle(t, SPARK_SEC, k / SPARKS + i * 0.13);
        // Each spark a fixed direction of its own (a hash of its number), up and out.
        const h1 = Math.sin((i * SPARKS + k) * 12.9898) * 43758.5453, h2 = Math.sin((i * SPARKS + k) * 78.233) * 12345.678;
        const a = (h1 - Math.floor(h1)) * Math.PI * 2, up = 0.4 + (h2 - Math.floor(h2)) * 0.8;
        const fly = u * SPARK_SEC;
        o.position.set(tip.x + Math.cos(a) * SPARK_SPEED * 0.6 * fly, tip.y + (SPARK_SPEED * up - (GRAVITY * fly) / 2) * fly, tip.z + Math.sin(a) * SPARK_SPEED * 0.6 * fly);
        o.position.y = Math.max(o.position.y, tip.y - 0.6);
        o.scale.setScalar(on ? 1 - u : 0);
        o.updateMatrix();
        sparks.setMatrixAt(i * SPARKS + k, o.matrix);
      }
    });
    sparks.instanceMatrix.needsUpdate = true;
  };
  pose(shower, 0);
  works.add(animated(shower, 0, 0, 0, pose));
  return works;
}
