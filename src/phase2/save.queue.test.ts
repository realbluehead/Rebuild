import { describe, expect, it, vi } from 'vitest';

// A slow store: each read and write takes a while, so overlapping saves would interleave.
const data = new Map<string, string>();
const later = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), Math.random() * 5));
vi.mock('../platform', () => ({
  store: {
    get: (k: string) => later(data.get(k) ?? null),
    set: (k: string, v: string) => later(void data.set(k, v)),
    remove: (k: string) => later(void data.delete(k)),
  },
}));

const { savePhase2, wipePhase2, loadPhase2 } = await import('./save');
const { newPhase2 } = await import('./core/state');
const { PHASE2_BACKUP_KEY, PHASE2_KEY } = await import('../shared/keys');

const legacy = {
  seed: 7, version: '1', at: 1, playTime: 1, bluetreri: '1', totalBluetreri: '1', metal: 1,
  items: { page: 0, note: 0, photo: 0 }, collected: { page: 0, note: 0, photo: 0 }, works: { book: 0, cd: 0, album: 0 },
  sheets: 0, lore: 0, cells: 0, rovers: [],
};

describe('phase II saves in turn', () => {
  it('keeps the order asked: the last save wins, the one before is the backup', async () => {
    const s = newPhase2(legacy);
    await Promise.all([1, 2, 3].map((t) => { s.playTime = t; return savePhase2(s, t); }));
    expect((await loadPhase2())?.state.playTime).toBe(3);
    expect(JSON.parse(data.get(PHASE2_BACKUP_KEY)!).playTime).toBe(2);
  });

  it('a wipe after a save is not undone by it', async () => {
    const s = newPhase2(legacy);
    void savePhase2(s);
    await wipePhase2();
    expect(data.has(PHASE2_KEY)).toBe(false);
    expect(data.has(PHASE2_BACKUP_KEY)).toBe(false);
  });
});
