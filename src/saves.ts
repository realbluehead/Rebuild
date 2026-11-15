// Both phases' saves together, for the menus of either phase: importing an exported game (a phase I or a phase II text)
// and restarting. The only module that knows both phases' saves (main.ts only knows phase II's key).
import { decodeSave } from './shared/codec';
import { deserializeP2, isPhase2Save, savePhase2, wipePhase2 } from './phase2/save';

/** Stores an exported game as the one to play (throws if the text is not a game). A phase II text replaces phase II and
 *  keeps phase I's save as it is; a phase I text replaces phase I and drops phase II (it starts again when that game
 *  ends). Reload afterwards. */
export async function importAny(text: string): Promise<void> {
  const raw = decodeSave(text);
  if (isPhase2Save(raw)) {
    await savePhase2(deserializeP2(raw).state);
    return;
  }
  const [{ deserialize }, { saveGame }] = await Promise.all([import('./phase1/save/save'), import('./phase1/save/persist')]);
  const { state } = deserialize(raw as { v: number } & Record<string, unknown>);
  await saveGame(state);
  await wipePhase2();
}

/** Erases both phases (a new map from scratch). Reload afterwards. */
export async function wipeAll(): Promise<void> {
  const { wipeGame } = await import('./phase1/save/persist');
  await wipeGame();
  await wipePhase2();
}
