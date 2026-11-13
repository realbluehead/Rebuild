// Goals (records): each has 5 tiers. Reaching a tier lets the player claim it (Goals tab); every claimed tier multiplies one
// stat for good. Claiming is the player's action (like buying), so the simulation stays exact between taps.
export type GoalId = 'cartographer' | 'tycoon' | 'collector' | 'excavator' | 'engineer' | 'archivist';
/** What a goal's reward multiplies: rover speed, bluetreri, holds, the Miner's drill, or the drive to and from camp. */
export type GoalReward = 'speed' | 'loot' | 'cargo' | 'drill' | 'travel';

export interface GoalDef {
  id: GoalId;
  name: string;
  /** What is counted, for the card ("cells explored"). */
  what: string;
  /** Thresholds of the 5 tiers. With `per`, they are shares of the map's cells or items (small maps scale down). */
  tiers: readonly number[];
  per?: 'cells' | 'items' | 'lore';
  reward: GoalReward;
  /** Multiplier per claimed tier. */
  mult: number;
  /** The reward in words. */
  rewardText: string;
}

export const GOAL_TIERS = 5;

export const GOALS: readonly GoalDef[] = [
  { id: 'cartographer', name: 'Cartographer', what: 'cells explored', tiers: [0.0005, 0.005, 0.05, 0.3, 1], per: 'cells', reward: 'speed', mult: 1.05, rewardText: 'rover speed' },
  { id: 'tycoon', name: 'Tycoon', what: 'bluetreri earned', tiers: [1e3, 3e4, 1e6, 5e6, 1.5e7], reward: 'loot', mult: 1.05, rewardText: 'bluetreri' },
  { id: 'collector', name: 'Collector', what: 'pages, notes and photos', tiers: [0.02, 0.1, 0.3, 0.6, 1], per: 'items', reward: 'cargo', mult: 1.08, rewardText: 'holds' },
  { id: 'excavator', name: 'Excavator', what: 'cells dug out', tiers: [0.001, 0.01, 0.1, 0.4, 1], per: 'cells', reward: 'drill', mult: 1.1, rewardText: 'Miner drill' },
  { id: 'engineer', name: 'Engineer', what: 'part levels fitted', tiers: [10, 30, 60, 90, 120], reward: 'travel', mult: 1.1, rewardText: 'drive to and from camp' },
  { id: 'archivist', name: 'Archivist', what: 'scraps of lore found', tiers: [0.01, 0.1, 0.3, 0.6, 1], per: 'lore', reward: 'loot', mult: 1.03, rewardText: 'bluetreri' },
];

export const goalById = (id: GoalId): GoalDef => GOALS.find((g) => g.id === id)!;
