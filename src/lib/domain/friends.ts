import { z } from "zod";

/**
 * Friends see a progress summary only. It is built from game state (levels, ranks, streaks, quest
 * counts, training targets) and never includes measurements, GPA, finances, notes, logs or email.
 */

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export const UsernameSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/^@/, "").toLowerCase())
  .refine((s) => USERNAME_RE.test(s), "Usernames are 3–20 characters: letters, numbers and underscores.");

export interface FriendStats {
  level: number;
  totalXp: number;
  weekXp: number;
  hunterRank: string | null;
  attributes: { code: string; level: number; rank: string | null }[];
  perfectStreak: number;
  perfectDays: number;
  activeStreak: number;
  questsCompleted: number;
  regimenDays: number;
  dungeonsCleared: number;
  achievements: number;
  title: string | null;
  regimen: { pushups: number; situps: number; squats: number; dips: number; pullups: number; runKm: number } | null;
  updatedAt: string;
}

export interface FriendCard {
  userId: string;
  friendshipId: string | null;
  username: string | null;
  displayName: string;
  stats: FriendStats | null;
}

/** Rows compared head-to-head (higher wins). */
export const COMPARE_ROWS: { key: string; label: string; get: (s: FriendStats) => number }[] = [
  { key: "level", label: "Level", get: (s) => s.level },
  { key: "weekXp", label: "XP this week", get: (s) => s.weekXp },
  { key: "perfectStreak", label: "Perfect-day streak", get: (s) => s.perfectStreak },
  { key: "perfectDays", label: "Perfect days", get: (s) => s.perfectDays },
  { key: "regimenDays", label: "Regimen days cleared", get: (s) => s.regimenDays },
  { key: "questsCompleted", label: "Quests completed", get: (s) => s.questsCompleted },
  { key: "dungeonsCleared", label: "Dungeons cleared", get: (s) => s.dungeonsCleared },
  { key: "achievements", label: "Achievements", get: (s) => s.achievements },
];
