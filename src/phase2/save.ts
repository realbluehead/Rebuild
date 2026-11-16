// Phase II's save, separate from phase I's (own key, own versions). Whenever `P2State` changes: bump P2_SAVE_VERSION,
// add the migration (vN -> vN+1) to MIGRATIONS and a test with a real old save.
// v1: the legacy and the resources brought over (metal, bluetreri, items), phase II's play time.
// v2: the economy (core/economy.ts): building levels, the crew's and the lab's jobs, research, ship modules, fuel, data,
//     samples, star system studies, the probes' target and those out, XP and attribute points, the launch; the bluetreri
//     is the siphon's sump (all phase I brought up).
import { amount, Decimal } from '../shared/decimal';
import { noAttrs, type Attr } from './core/attributes';
import { BUILDING_IDS, TOP_LEVEL, type BuildingId } from './core/curves';
import { techById } from './core/research';
import { moduleById } from './core/ship';
import { SAMPLE_KINDS, STUDIES, type SampleKind } from './core/starmap';
import { SYSTEMS, type Job, type Probe } from './core/state';
import { PHASE2_BACKUP_KEY, PHASE2_KEY } from '../shared/keys';
import { store } from '../platform';
import { cleanItems, cleanLegacy, type Legacy, type LegacyItem } from './core/legacy';
import type { P2State } from './core/state';

export const P2_SAVE_VERSION = 2;

/** JSON shape: Decimals as text. `phase` tells it apart from a phase I save (exported texts can be either). */
export interface P2SaveData {
  phase: 2;
  v: number;
  /** Save time (ms epoch). */
  savedAt: number;
  legacy: Legacy;
  metal: string;
  bluetreri: string;
  items: Record<LegacyItem, number>;
  playTime: number;
  levels: Record<BuildingId, number>;
  crew: Job | null;
  lab: { id: string; left: number } | null;
  researched: string[];
  modules: string[];
  fuel: number;
  data: number;
  samples: Record<SampleKind, number>;
  studies: number[];
  target: number | null;
  launchWait: number;
  probes: Probe[];
  xp: number;
  attrs: Record<Attr, number>;
  launchedAt: number | null;
}

type RawP2 = { phase: 2; v: number } & Record<string, unknown>;

const MIGRATIONS: Record<number, (d: RawP2) => RawP2> = {
  // v1 -> v2: the economy starts (every building at level 1, nothing under way); the sump holds all phase I brought up.
  1: (d) => {
    const total = (d.legacy as { totalBluetreri?: unknown } | null)?.totalBluetreri;
    return { ...d, bluetreri: Decimal.max(amount(d.bluetreri), amount(total)).toString() };
  },
};

export const isPhase2Save = (raw: unknown): raw is RawP2 =>
  typeof raw === 'object' && raw !== null && (raw as { phase?: unknown }).phase === 2;

export function serializeP2(s: P2State, now: number): P2SaveData {
  return {
    phase: 2,
    v: P2_SAVE_VERSION,
    savedAt: now,
    legacy: s.legacy,
    metal: s.metal.toString(),
    bluetreri: s.bluetreri.toString(),
    items: { ...s.items },
    playTime: s.playTime,
    levels: { ...s.levels },
    crew: s.crew && { ...s.crew },
    lab: s.lab && { ...s.lab },
    researched: [...s.researched],
    modules: [...s.modules],
    fuel: s.fuel,
    data: s.data,
    samples: { ...s.samples },
    studies: [...s.studies],
    target: s.target,
    launchWait: s.launchWait,
    probes: s.probes.map((p) => ({ ...p })),
    xp: s.xp,
    attrs: { ...s.attrs },
    launchedAt: s.launchedAt,
  };
}

const fin = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0);
const whole = (x: unknown) => Math.floor(fin(x));
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});
const ids = (x: unknown, ok: (id: string) => boolean): string[] =>
  Array.isArray(x) ? [...new Set(x.filter((v): v is string => typeof v === 'string' && ok(v)))] : [];

function cleanJob(x: unknown): Job | null {
  const j = obj(x);
  if (j.kind === 'building' && BUILDING_IDS.includes(j.id as BuildingId)) return { kind: 'building', id: j.id as BuildingId, left: fin(j.left) };
  if (j.kind === 'module' && typeof j.id === 'string' && moduleById(j.id)) return { kind: 'module', id: j.id, left: fin(j.left) };
  return null;
}
const isSystem = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) < SYSTEMS;

/** Reads a phase II save (migrating it); throws if it is not one. */
export function deserializeP2(raw: unknown): { state: P2State; savedAt: number } {
  if (!isPhase2Save(raw)) throw new Error('Not a phase II save');
  let d = raw;
  if (!Number.isInteger(d.v) || d.v < 1) throw new Error('Phase II save without a version');
  if (d.v > P2_SAVE_VERSION) throw new Error(`Phase II save from a newer version (v${d.v})`);
  while (d.v < P2_SAVE_VERSION) d = { ...MIGRATIONS[d.v](d), v: d.v + 1 };
  const data = d as unknown as Partial<P2SaveData>;
  const levels = obj(data.levels);
  const samples = obj(data.samples);
  const attrs = obj(data.attrs);
  const lab = obj(data.lab);
  const studies = Array.isArray(data.studies) ? data.studies : [];
  return {
    state: {
      legacy: cleanLegacy(data.legacy),
      metal: amount(data.metal),
      bluetreri: amount(data.bluetreri),
      items: cleanItems(data.items),
      playTime: fin(data.playTime),
      levels: Object.fromEntries(BUILDING_IDS.map((id) => [id, Math.max(1, Math.min(TOP_LEVEL[id], whole(levels[id])))])) as Record<BuildingId, number>,
      crew: cleanJob(data.crew),
      lab: typeof lab.id === 'string' && techById(lab.id) ? { id: lab.id, left: fin(lab.left) } : null,
      researched: ids(data.researched, (id) => !!techById(id)),
      modules: ids(data.modules, (id) => !!moduleById(id)),
      fuel: fin(data.fuel),
      data: fin(data.data),
      samples: Object.fromEntries(SAMPLE_KINDS.map((k) => [k, fin(samples[k])])) as Record<SampleKind, number>,
      studies: Array.from({ length: SYSTEMS }, (_, i) => Math.min(STUDIES, whole(studies[i]))),
      target: isSystem(data.target) ? data.target : null,
      launchWait: fin(data.launchWait),
      probes: Array.isArray(data.probes)
        ? data.probes.map(obj).filter((p) => isSystem(p.system)).map((p) => ({ system: p.system as number, left: fin(p.left) }))
        : [],
      xp: fin(data.xp),
      attrs: Object.fromEntries(Object.keys(noAttrs()).map((a) => [a, whole(attrs[a])])) as Record<Attr, number>,
      launchedAt: typeof data.launchedAt === 'number' && Number.isFinite(data.launchedAt) && data.launchedAt >= 0 ? data.launchedAt : null,
    },
    savedAt: fin(data.savedAt),
  };
}

/** Writes run one after another, in the order asked (see src/phase1/save/persist.ts). */
let queue: Promise<unknown> = Promise.resolve();
const queued = <T>(job: () => Promise<T>): Promise<T> => {
  const run = queue.then(job);
  queue = run.catch(() => {});
  return run;
};

/** Saves phase II as it is now (serialised at once, written in turn), keeping the previous save as the backup. */
export function savePhase2(s: P2State, now = Date.now()): Promise<void> {
  const text = JSON.stringify(serializeP2(s, now));
  return queued(async () => {
    const prev = await store.get(PHASE2_KEY);
    if (prev) await store.set(PHASE2_BACKUP_KEY, prev);
    await store.set(PHASE2_KEY, text);
  });
}

/** Loads phase II; if the main copy is unreadable, tries the backup. */
export async function loadPhase2(): Promise<{ state: P2State; savedAt: number } | null> {
  for (const key of [PHASE2_KEY, PHASE2_BACKUP_KEY]) {
    const raw = await store.get(key);
    if (!raw) continue;
    try {
      return deserializeP2(JSON.parse(raw));
    } catch (e) {
      console.error(`Unreadable phase II save ${key}`, e);
    }
  }
  return null;
}

export function wipePhase2(): Promise<void> {
  return queued(async () => {
    await store.remove(PHASE2_KEY);
    await store.remove(PHASE2_BACKUP_KEY);
  });
}
