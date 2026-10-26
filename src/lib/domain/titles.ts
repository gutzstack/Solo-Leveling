export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";

export interface TitleDef {
  code: string;
  name: string;
  description: string;
  rarity: Rarity;
}

export const TITLES: TitleDef[] = [
  { code: "the_awakened", name: "The Awakened", description: "Chosen by the System.", rarity: "common" },
  { code: "novice_hunter", name: "Novice Hunter", description: "Reached player level 10.", rarity: "uncommon" },
  { code: "seasoned_hunter", name: "Seasoned Hunter", description: "Reached player level 30.", rarity: "rare" },
  { code: "elite_hunter", name: "Elite Hunter", description: "Reached player level 50.", rarity: "epic" },
  { code: "the_ascended", name: "The Ascended", description: "Reached player level 100.", rarity: "mythic" },
  { code: "iron_will", name: "Iron Will", description: "Completed 30 workouts.", rarity: "rare" },
  { code: "titan_forged", name: "Titan-Forged", description: "Completed 250 workouts.", rarity: "legendary" },
  { code: "the_scholar", name: "The Scholar", description: "100 focused study hours.", rarity: "epic" },
  { code: "archmage", name: "Archmage of Knowledge", description: "1,000 focused study hours.", rarity: "mythic" },
  { code: "shadow_marathoner", name: "Shadow Marathoner", description: "Completed a marathon-distance run.", rarity: "epic" },
  { code: "ultra_shadow", name: "Ultra Shadow", description: "Ran beyond the marathon.", rarity: "legendary" },
  { code: "unbreakable", name: "Unbreakable", description: "A 30-day consistency streak.", rarity: "epic" },
  { code: "eternal_flame", name: "Eternal Flame", description: "A 365-day consistency streak.", rarity: "mythic" },
  { code: "gate_breaker", name: "Gate Breaker", description: "Cleared 25 dungeons.", rarity: "rare" },
  { code: "dungeon_monarch", name: "Dungeon Monarch", description: "Cleared 100 dungeons.", rarity: "legendary" },
  { code: "boss_slayer", name: "Boss Slayer", description: "Defeated 5 boss dungeons.", rarity: "rare" },
  { code: "limit_breaker", name: "Limit Breaker", description: "Set 10 personal records.", rarity: "rare" },
  { code: "beyond_human_limits", name: "Beyond Human Limits", description: "S-rank on a verified population metric.", rarity: "legendary" },
  { code: "balanced_hunter", name: "The Balanced", description: "Every attribute at level 5 or higher.", rarity: "epic" },
  { code: "white_coat", name: "Ascended Scholar", description: "Completed The Scholar's Ascension.", rarity: "legendary" },
  { code: "titan", name: "The Titan", description: "Completed The Titan's Body.", rarity: "legendary" },
  { code: "limiter_broken", name: "Limiter Broken", description: "Completed Break the Limiter (sub-20 5K).", rarity: "mythic" },
  { code: "financially_awakened", name: "Financially Awakened", description: "Completed Financial Awakening.", rarity: "legendary" },
  { code: "master_of_habits", name: "Master of Habits", description: "60 perfect days.", rarity: "legendary" },
  { code: "skill_sovereign", name: "Skill Sovereign", description: "Mastered a skill line to tier V.", rarity: "epic" },
  { code: "the_examiner_falls", name: "Examiner's Bane", description: "Cleared 15 boss dungeons.", rarity: "epic" },
];

export const TITLE_BY_CODE: Record<string, TitleDef> = Object.fromEntries(TITLES.map((t) => [t.code, t]));
