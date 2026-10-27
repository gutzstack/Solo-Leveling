import type { Rarity } from "./titles";

/**
 * Achievement catalog (140+). Each one unlocks when a stat from the player's progress context
 * reaches a threshold, so every unlock traces back to recorded data.
 */

export interface AchievementDef {
  code: string;
  name: string;
  description: string;
  rarity: Rarity;
  category: string;
  icon: string;
  xp: number;
  stat: string;
  threshold: number;
  title?: string;
  secret?: boolean;
}

export const RARITY_XP: Record<Rarity, number> = { common: 25, uncommon: 50, rare: 100, epic: 200, legendary: 400, mythic: 1000 };
export const RARITY_ORDER: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];

type Tier = [threshold: number, name: string, rarity: Rarity, title?: string];

function family(category: string, icon: string, stat: string, describe: (n: number) => string, tiers: Tier[], codePrefix = stat): AchievementDef[] {
  return tiers.map(([threshold, name, rarity, title]) => ({
    code: `${codePrefix}_${String(threshold).replace(".", "_")}`,
    name,
    description: describe(threshold),
    rarity,
    category,
    icon,
    xp: RARITY_XP[rarity],
    stat,
    threshold,
    title,
  }));
}

const n = (x: number) => x.toLocaleString("en-US");

export const ACHIEVEMENTS: AchievementDef[] = [
  { code: "the_awakening", name: "THE AWAKENING", description: "Complete onboarding and accept the System.", rarity: "common", category: "System", icon: "Eye", xp: RARITY_XP.common, stat: "onboarded", threshold: 1, title: "the_awakened" },
  ...family("Level", "ChevronsUp", "level", (t) => `Reach player level ${t}.`, [
    [5, "First Steps of a Hunter", "common"],
    [10, "Novice Hunter", "uncommon", "novice_hunter"],
    [20, "Rising Hunter", "rare"],
    [30, "Seasoned Hunter", "rare", "seasoned_hunter"],
    [40, "Veteran Hunter", "epic"],
    [50, "Elite Hunter", "epic", "elite_hunter"],
    [75, "National-Level Hunter", "legendary"],
    [100, "THE ASCENDED", "mythic", "the_ascended"],
  ]),
  ...family("Strength", "Dumbbell", "workouts_total", (t) => `Complete ${n(t)} strength workout${t === 1 ? "" : "s"}.`, [
    [1, "First Rep", "common"],
    [10, "Iron Initiate", "common"],
    [30, "IRON WILL", "rare", "iron_will"],
    [50, "Forged in Iron", "rare"],
    [100, "Iron Body", "epic"],
    [250, "Titan-Forged", "legendary", "titan_forged"],
  ]),
  ...family("Knowledge", "BookOpen", "study_hours_total", (t) => `Accumulate ${n(t)} focused study hour${t === 1 ? "" : "s"}.`, [
    [1, "Opening the Tome", "common"],
    [10, "Apprentice Scholar", "common"],
    [25, "Diligent Student", "uncommon"],
    [50, "Keeper of Notes", "rare"],
    [100, "THE SCHOLAR", "epic", "the_scholar"],
    [250, "Sage of the Library", "epic"],
    [500, "Grand Sage", "legendary"],
    [1000, "Archmage of Knowledge", "mythic", "archmage"],
  ]),
  ...family("Endurance", "Footprints", "runs_total", (t) => `Complete ${n(t)} run${t === 1 ? "" : "s"}.`, [
    [1, "First Stride", "common"],
    [10, "Road Initiate", "common"],
    [25, "Pathfinder", "uncommon"],
    [50, "Tireless", "rare"],
    [100, "Hundred Roads", "epic"],
    [250, "Wind Walker", "legendary"],
  ]),
  ...family("Endurance", "Route", "run_km_total", (t) => `Run ${n(t)} km in total.`, [
    [42.2, "A Marathon in Pieces", "common"],
    [100, "Century Runner", "uncommon"],
    [250, "Long Road", "rare"],
    [500, "Five Hundred Leagues", "epic"],
    [1000, "Thousand-Kilometre Shadow", "legendary"],
    [2000, "Circumnavigator", "mythic"],
  ]),
  ...family("Endurance", "Mountain", "longest_run_km", (t) => (t >= 42.195 ? `Complete a single run of at least ${t} km${t === 42.195 ? " (marathon)" : ""}.` : `Complete a single run of at least ${t} km.`), [
    [21.0975, "Half-Way to Legend", "rare"],
    [42.195, "SHADOW MARATHONER", "epic", "shadow_marathoner"],
    [50, "Ultra Shadow", "legendary", "ultra_shadow"],
  ]),
  ...family("Discipline", "Flame", "longest_streak", (t) => `Maintain a ${t}-day consistency streak.`, [
    [3, "Spark", "common"],
    [7, "Week of Will", "uncommon"],
    [14, "Fortnight Flame", "rare"],
    [30, "UNBREAKABLE", "epic", "unbreakable"],
    [60, "Undying Flame", "legendary"],
    [100, "Centurion of Habit", "legendary"],
    [365, "Eternal Flame", "mythic", "eternal_flame"],
  ]),
  ...family("Dungeons", "DoorOpen", "dungeons_cleared", (t) => `Clear ${n(t)} dungeon${t === 1 ? "" : "s"}.`, [
    [1, "Gate Opener", "common"],
    [5, "Dungeon Crawler", "common"],
    [10, "Raider", "uncommon"],
    [25, "Gate Breaker", "rare", "gate_breaker"],
    [50, "Raid Leader", "epic"],
    [100, "Dungeon Monarch", "legendary", "dungeon_monarch"],
  ]),
  ...family("Dungeons", "Skull", "boss_cleared", (t) => `Defeat ${t} boss dungeon${t === 1 ? "" : "s"} (practice exams).`, [
    [1, "Boss Slayer", "uncommon"],
    [5, "Bane of Bosses", "rare", "boss_slayer"],
    [15, "Examiner's Bane", "epic", "the_examiner_falls"],
  ]),
  ...family("Dungeons", "Lock", "uninterrupted_clears", (t) => `Clear the Deep Work Gate without pausing ${t} time${t === 1 ? "" : "s"}.`, [
    [1, "Unbroken Mind", "uncommon"],
    [10, "Monk of Focus", "epic"],
  ]),
  ...family("Quests", "ScrollText", "quests_completed", (t) => `Complete ${n(t)} quest${t === 1 ? "" : "s"}.`, [
    [1, "Quest Accepted", "common"],
    [10, "Errand Runner", "common"],
    [50, "Quest Hunter", "uncommon"],
    [100, "Centurion", "rare"],
    [250, "Quest Lord", "epic"],
    [500, "Legend of the Guild", "legendary"],
  ]),
  ...family("Quests", "CalendarCheck", "perfect_days", (t) => `Complete every daily quest on ${t} day${t === 1 ? "" : "s"}.`, [
    [1, "Flawless Day", "common"],
    [7, "Flawless Week", "uncommon"],
    [30, "Flawless Month", "epic"],
    [60, "Master of Habits", "legendary", "master_of_habits"],
    [100, "Perfect Century", "legendary"],
  ]),
  ...family("Quests", "Dumbbell", "regimen_days", (t) => `Complete the daily training regimen on ${t} day${t === 1 ? "" : "s"}.`, [
    [1, "Preparations Begin", "common"],
    [7, "A Week of Preparation", "uncommon"],
    [30, "Thirty Days of Hell", "epic"],
    [100, "The Weak No Longer", "legendary"],
  ]),
  ...family("Quests", "Skull", "quests_penalty_completed", (t) => (t === 1 ? "Survive the Penalty Zone." : `Survive the Penalty Zone ${t} times.`), [
    [1, "Penalty Zone Survivor", "uncommon"],
    [5, "Back From the Brink", "rare"],
  ]),
  ...family("Rewards", "Coins", "gold_earned_total", (t) => `Earn ${n(t)} gold in total.`, [
    [500, "Pocket Money", "common"],
    [5000, "Treasure Hunter", "rare"],
    [25000, "Dragon's Hoard", "epic"],
  ]),
  ...family("Rewards", "Gem", "chests_opened", (t) => `Open ${t} reward chest${t === 1 ? "" : "s"}.`, [
    [1, "First Loot", "common"],
    [10, "Loot Goblin", "uncommon"],
    [50, "Vault Breaker", "rare"],
  ]),
  ...family("Rewards", "Crown", "legendary_chests", () => "Open a legendary chest.", [[1, "Fortune's Favourite", "epic"]]),
  ...family("Rewards", "Trophy", "rewards_purchased", (t) => (t === 1 ? "Claim a reward from your shop." : `Claim ${t} rewards from your shop.`), [
    [1, "Earned It", "common"],
    [25, "Work Hard, Play Hard", "rare"],
  ]),
  ...family("Quests", "CalendarRange", "quests_weekly_completed", (t) => `Complete ${t} weekly quests.`, [
    [1, "Week Conquered", "common"],
    [10, "Weekly Warden", "uncommon"],
    [25, "Season Keeper", "rare"],
  ]),
  ...family("Quests", "Siren", "quests_emergency_completed", (t) => `Complete ${t} emergency quest${t === 1 ? "" : "s"}.`, [
    [1, "First Responder", "common"],
    [10, "Crisis Averted", "rare"],
  ]),
  ...family("Story", "BookMarked", "main_chapters", (t) => `Complete ${t} main-story chapter${t === 1 ? "" : "s"}.`, [
    [1, "The Story Begins", "uncommon"],
    [5, "Chronicler", "rare"],
    [10, "Saga Writer", "epic"],
  ]),
  ...family("Story", "Crown", "main_quests_completed", (t) => (t === 1 ? "Complete a main story quest." : `Complete ${t} main story quests.`), [
    [1, "Arc Complete", "epic"],
    [4, "Protagonist", "mythic"],
  ]),
  ...family("Records", "Zap", "prs_total", (t) => `Set ${t} personal record${t === 1 ? "" : "s"}.`, [
    [1, "Limit Tested", "common"],
    [5, "Limit Pusher", "uncommon"],
    [10, "Limit Breaker", "rare", "limit_breaker"],
    [25, "Beyond Yesterday", "epic"],
    [50, "Unbound", "legendary"],
  ]),
  ...family("System", "Gauge", "metrics_tracked", (t) => `Track ${t} different metrics.`, [
    [5, "Self-Observer", "common"],
    [15, "Analyst", "uncommon"],
    [30, "Quantified Hunter", "rare"],
    [50, "Omniscient Eye", "epic"],
  ]),
  { code: "measured_against_world", name: "Measured Against the World", description: "Earn your first population-based rank (verified or estimated).", rarity: "uncommon", category: "Rankings", icon: "Globe", xp: RARITY_XP.uncommon, stat: "population_ranked", threshold: 1 },
  { code: "verified_b_rank", name: "Above the Crowd", description: "Reach B-rank (≥ 60th percentile) on a verified population metric.", rarity: "uncommon", category: "Rankings", icon: "BadgeCheck", xp: RARITY_XP.uncommon, stat: "best_verified_rank_index", threshold: 3 },
  { code: "verified_a_rank", name: "Elite Among Peers", description: "Reach A-rank (≥ 80th percentile) on a verified population metric.", rarity: "rare", category: "Rankings", icon: "Medal", xp: RARITY_XP.rare, stat: "best_verified_rank_index", threshold: 4 },
  { code: "beyond_human_limits", name: "BEYOND HUMAN LIMITS", description: "Achieve an S-rank on a verified population metric.", rarity: "legendary", category: "Rankings", icon: "Sparkle", xp: RARITY_XP.legendary, stat: "best_verified_rank_index", threshold: 5, title: "beyond_human_limits" },
  { code: "one_in_a_hundred", name: "One in a Hundred", description: "Reach S+ (≥ 99th percentile) on a verified population metric.", rarity: "mythic", category: "Rankings", icon: "Gem", xp: RARITY_XP.mythic, stat: "best_verified_rank_index", threshold: 6 },
  { code: "personal_a_rank", name: "Self-Surpassing", description: "Reach A-rank against a game standard on any metric.", rarity: "uncommon", category: "Rankings", icon: "Target", xp: RARITY_XP.uncommon, stat: "best_personal_rank_index", threshold: 4 },
  { code: "personal_s_rank", name: "Standard Breaker", description: "Reach S-rank against a game standard on any metric.", rarity: "rare", category: "Rankings", icon: "Star", xp: RARITY_XP.rare, stat: "best_personal_rank_index", threshold: 5 },
  ...family("Rankings", "Shield", "hunter_rank_index", (t) => `Reach Hunter Rank ${["E", "D", "C", "B", "A", "S", "S+"][t]} (game-defined aggregate).`, [
    [2, "C-Rank Hunter", "uncommon"],
    [3, "B-Rank Hunter", "rare"],
    [4, "A-Rank Hunter", "epic"],
    [5, "S-Rank Hunter", "legendary"],
  ], "hunter_rank"),
  ...family("Skills", "Network", "skills_unlocked", (t) => `Unlock ${t} skill node${t === 1 ? "" : "s"}.`, [
    [1, "First Skill", "common"],
    [5, "Skilled", "uncommon"],
    [15, "Versatile", "rare"],
    [30, "Polymath", "epic"],
    [50, "Skill Sovereign", "legendary"],
  ]),
  ...family("Skills", "Trophy", "skills_tier5", (t) => (t === 1 ? "Master any skill line to tier V." : `Master ${t} skill lines to tier V.`), [
    [1, "Mastery", "epic", "skill_sovereign"],
    [5, "Grandmaster", "legendary"],
    [15, "Shadow Monarch", "mythic"],
  ]),
  ...family("Wellness", "NotebookPen", "reflections_total", (t) => `Write ${t} daily reflection${t === 1 ? "" : "s"}.`, [
    [1, "Inner Voice", "common"],
    [10, "Introspective", "uncommon"],
    [50, "Mind Cartographer", "rare"],
    [100, "Sage's Journal", "epic"],
  ]),
  ...family("Wellness", "Flower2", "mindfulness_minutes_total", (t) => `Practice ${n(t)} minutes of mindfulness.`, [
    [60, "Still Mind", "common"],
    [300, "Calm Waters", "uncommon"],
    [1000, "Zen Hunter", "rare"],
  ]),
  ...family("Wellness", "Moon", "sleep_in_range_nights", (t) => `Log ${t} nights of 7–9 h sleep.`, [
    [7, "Well Rested", "common"],
    [30, "Sleep Guardian", "uncommon"],
    [100, "Dream Keeper", "rare"],
  ]),
  ...family("Wellness", "BedDouble", "rest_days_total", (t) => `Take ${t} planned recovery days.`, [[10, "Recovery Aware", "uncommon"]]),
  ...family("Social", "Presentation", "presentations_total", (t) => `Deliver ${t} presentation${t === 1 ? "" : "s"}.`, [
    [1, "Voice Found", "common"],
    [5, "Speaker", "uncommon"],
    [20, "Orator", "epic"],
  ]),
  ...family("Social", "HandHeart", "volunteering_hours_total", (t) => `Volunteer for ${t} hours.`, [
    [10, "Helping Hand", "uncommon"],
    [50, "Pillar of the Community", "epic"],
  ]),
  ...family("Social", "UserRoundCheck", "mentoring_total", (t) => `Give ${t} mentoring session${t === 1 ? "" : "s"}.`, [
    [1, "Guide", "common"],
    [10, "Mentor", "rare"],
  ]),
  ...family("Social", "Network", "networking_total", (t) => `Log ${t} networking activities.`, [
    [5, "Connector", "uncommon"],
    [25, "Guild Ambassador", "rare"],
  ]),
  ...family("Wealth", "Coins", "financial_entries", (t) => (t === 1 ? "Log your first financial figure." : `Log ${t} financial figures.`), [[1, "Financial Awakening Begins", "common"]]),
  ...family("Wealth", "ShieldCheck", "emergency_fund_months", (t) => `Build an emergency fund covering ${t} months of expenses.`, [
    [3, "Safety Net", "rare"],
    [6, "Fortress of Solitude", "epic"],
  ]),
  ...family("Wealth", "PiggyBank", "savings_rate_current", (t) => `Reach a savings rate of ${t}%.`, [[20, "Disciplined Saver", "rare"]]),
  ...family("Wealth", "Landmark", "financial_lessons", (t) => `Complete ${t} financial-literacy lessons.`, [
    [5, "Money-Literate", "uncommon"],
    [15, "Treasurer", "rare"],
  ]),
  { code: "debt_free", name: "Chains Broken", description: "Log a debt balance of $0 after previously carrying debt.", rarity: "epic", category: "Wealth", icon: "Unlink", xp: RARITY_XP.epic, stat: "debt_free", threshold: 1 },
  ...family("Knowledge", "Layers", "flashcards_total", (t) => `Review ${n(t)} flashcards.`, [
    [100, "Card Initiate", "common"],
    [1000, "Card Adept", "uncommon"],
    [5000, "Card Master", "rare"],
    [20000, "Living Archive", "epic"],
  ]),
  ...family("Knowledge", "ClipboardCheck", "practice_exams_total", (t) => `Complete ${t} practice examination${t === 1 ? "" : "s"}.`, [
    [1, "Trial by Paper", "common"],
    [10, "Exam Hardened", "rare"],
    [25, "Unshakeable Under Pressure", "epic"],
  ]),
  ...family("Trials", "Brain", "trials_completed", (t) => `Complete ${t} System Trial${t === 1 ? "" : "s"}.`, [
    [1, "Trial Initiate", "common"],
    [10, "Trial Seeker", "uncommon"],
    [50, "Trial Veteran", "rare"],
    [200, "Trial Sovereign", "epic"],
  ]),
  ...family("Trials", "Puzzle", "reasoning_rating_value", (t) => `Reach a Reasoning rating of ${t}.`, [
    [1150, "Pattern Seer", "uncommon"],
    [1300, "Logic Adept", "rare"],
    [1450, "Mind of the Monarch", "epic"],
  ]),
  ...family("Trials", "Layers", "knowledge_rating_value", (t) => `Reach a Knowledge rating of ${t}.`, [
    [1150, "Well-Read", "uncommon"],
    [1300, "Master of the Material", "rare"],
    [1450, "Living Codex", "epic"],
  ]),
  ...family("Trials", "Hash", "working_memory_value", (t) => `Reach a combined digit span of ${t}.`, [
    [12, "Sharp Recall", "uncommon"],
    [15, "Photographic", "rare"],
  ]),
  ...family("Attributes", "BarChart3", "max_attribute_level", (t) => `Raise any attribute to level ${t}.`, [
    [5, "Specialist", "common"],
    [10, "Expert", "uncommon"],
    [25, "Paragon", "epic"],
  ]),
  ...family("Attributes", "Hexagon", "min_attribute_level", (t) => `Raise every attribute to level ${t}.`, [
    [3, "Well-Rounded", "uncommon"],
    [5, "The Balanced", "epic", "balanced_hunter"],
  ]),
  ...family("Discipline", "RotateCcw", "comebacks", (t) => (t === 1 ? "Return after a break of 3+ days. Coming back is a skill." : `Come back after a break ${t} times.`), [[1, "Rise Again", "uncommon"]]),
  ...family("System", "LogIn", "login_streak", (t) => `Open the System ${t} days in a row.`, [
    [7, "Daily Visitor", "common"],
    [30, "Bound to the System", "uncommon"],
  ]),
  ...family("System", "PenTool", "custom_quests_created", () => "Create your own quest.", [[1, "Quest Architect", "common"]]),
  ...family("System", "SlidersHorizontal", "custom_metrics_created", () => "Create your own stat.", [[1, "Stat Smith", "common"]]),
];

export const ACHIEVEMENT_BY_CODE: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.code, a]));
