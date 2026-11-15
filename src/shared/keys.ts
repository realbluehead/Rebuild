// Storage keys main.ts needs before either phase's code is loaded.
/** Phase II's save: once it exists, the game boots straight into phase II (phase I's save is kept, untouched). */
export const PHASE2_KEY = 'rebuild:p2';
export const PHASE2_BACKUP_KEY = 'rebuild:p2:backup';
/** IndexedDB database where phase I keeps its built map (tens of MB); phase II deletes it, it has no use for it. */
export const WORLD_CACHE_DB = 'rebuild-world';
