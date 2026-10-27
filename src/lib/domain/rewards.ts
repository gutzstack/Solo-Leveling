/**
 * Rewards beyond XP: gold (spent in the reward shop), a streak multiplier for consecutive perfect
 * days, reward chests for clearing every daily quest, and items that bank today's consistency.
 */

export type ItemCode = "xp_elixir" | "penalty_shield" | "recovery_pass";
export type ChestRarity = "common" | "rare" | "epic" | "legendary";

export const ITEM_INFO: Record<ItemCode, { name: string; description: string; icon: string }> = {
  xp_elixir: { name: "Double-XP Elixir", description: "Drink it to earn double XP for the rest of the day.", icon: "FlaskConical" },
  penalty_shield: { name: "Penalty Shield", description: "Absorbs the next penalty automatically: no XP or gold lost.", icon: "Shield" },
  recovery_pass: { name: "Recovery Pass", description: "Waives a day's physical quests when this week's free passes are used up.", icon: "BedDouble" },
};

/** Items the System sells for gold, alongside the player's own real-life rewards. */
export const SYSTEM_SHOP: { code: ItemCode; price: number }[] = [
  { code: "xp_elixir", price: 400 },
  { code: "recovery_pass", price: 500 },
  { code: "penalty_shield", price: 600 },
];

export const CHEST_INFO: Record<ChestRarity, { name: string; odds: number }> = {
  common: { name: "Common Chest", odds: 0.7 },
  rare: { name: "Rare Chest", odds: 0.22 },
  epic: { name: "Epic Chest", odds: 0.07 },
  legendary: { name: "Legendary Chest", odds: 0.01 },
};

/** Title granted by the first legendary chest. */
export const LEGENDARY_TITLE = "chosen_by_the_system";

/** Base gold a completed quest pays (before the streak multiplier). */
export function questGold(q: { kind: string; template_code: string }): number {
  if (q.template_code === "daily_regimen") return 50;
  switch (q.kind) {
    case "daily":
      return 10;
    case "weekly":
      return 75;
    case "emergency":
      return 40;
    case "custom":
      return 20;
    default:
      return 0; // main-story chapters pay MAIN_CHAPTER_GOLD; penalty zones pay nothing
  }
}
export const MAIN_CHAPTER_GOLD = 300;
export const DAILY_ALL_GOLD = 25;

/** Consecutive perfect days → gold multiplier. */
export function streakMultiplier(perfectStreak: number): number {
  if (perfectStreak >= 14) return 1.5;
  if (perfectStreak >= 7) return 1.25;
  if (perfectStreak >= 3) return 1.1;
  return 1;
}
export const STREAK_TIERS = [
  { days: 3, multiplier: 1.1 },
  { days: 7, multiplier: 1.25 },
  { days: 14, multiplier: 1.5 },
];

/** Deterministic 0..1 from a string seed (mulberry32 over an FNV hash). */
export function seededUnit(seed: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let t = (h >>> 0) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rollChestRarity(seed: string): ChestRarity {
  const r = seededUnit(seed);
  if (r < CHEST_INFO.legendary.odds) return "legendary";
  if (r < CHEST_INFO.legendary.odds + CHEST_INFO.epic.odds) return "epic";
  if (r < CHEST_INFO.legendary.odds + CHEST_INFO.epic.odds + CHEST_INFO.rare.odds) return "rare";
  return "common";
}

export interface ChestContents {
  gold: number;
  items: ItemCode[];
  title: string | null;
}

/** What a chest holds, fixed by its id so opening it twice can't re-roll. */
export function chestContents(rarity: ChestRarity, seed: string): ChestContents {
  const u = (salt: number) => seededUnit(seed, salt);
  const between = (lo: number, hi: number, salt: number) => lo + Math.floor(u(salt) * (hi - lo + 1));
  switch (rarity) {
    case "common":
      return { gold: between(20, 40, 1), items: [], title: null };
    case "rare":
      return { gold: between(80, 150, 1), items: u(2) < 0.5 ? ["xp_elixir"] : [], title: null };
    case "epic":
      return { gold: between(200, 300, 1), items: [u(2) < 0.5 ? "recovery_pass" : "penalty_shield"], title: null };
    case "legendary":
      return { gold: between(600, 1000, 1), items: ["xp_elixir", "penalty_shield"], title: LEGENDARY_TITLE };
  }
}
