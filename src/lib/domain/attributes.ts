import type { AttributeCode } from "./types";

export interface AttributeDef {
  code: AttributeCode;
  name: string;
  short: string;
  description: string;
  /** identity color (dark-surface step of the validated categorical palette) */
  color: string;
  /** light-surface step of the same hue */
  colorLight: string;
  icon: string;
  scientificNote?: string;
}

export const ATTRIBUTES: AttributeDef[] = [
  {
    code: "STR",
    colorLight: "#e34948",
    name: "Strength",
    short: "STR",
    description: "Maximal and relative strength: lifts, bodyweight skills, grip and training volume.",
    color: "#e66767",
    icon: "Dumbbell",
  },
  {
    code: "END",
    colorLight: "#eb6834",
    name: "Endurance",
    short: "END",
    description: "Aerobic capacity and race performance: running, cycling, swimming, heart-rate fitness.",
    color: "#d95926",
    icon: "Wind",
  },
  {
    code: "PHY",
    colorLight: "#1baf7a",
    name: "Physical Development",
    short: "PHY",
    description: "Body composition, mobility, recovery and sleep, the body you are building.",
    color: "#199e70",
    icon: "Activity",
  },
  {
    code: "INT",
    colorLight: "#2a78d6",
    name: "Intelligence / Knowledge",
    short: "INT",
    description:
      "Ranked on System Trials: knowledge of your own material, reasoning, working memory and processing speed. GPA is kept only as a record. Not IQ.",
    color: "#3987e5",
    icon: "Brain",
    scientificNote:
      "The INT rank is a game-defined score built from tests the System gives you (Knowledge 3×, Reasoning 2×, official exam percentile 1.5×, Memory 1×, Speed 1×, self-reported exam and quiz averages 0.5×). It is not an IQ score or a population percentile. GPA and study hours are tracked but not ranked.",
  },
  {
    code: "DIS",
    colorLight: "#6250d6",
    name: "Discipline",
    short: "DIS",
    description: "Consistency and follow-through: quest completion, streaks, focus sessions, bouncing back.",
    color: "#9085e9",
    icon: "Flame",
    scientificNote:
      "Discipline is a game-defined attribute. It has no validated population percentile, so it is ranked against game standards only.",
  },
  {
    code: "WLT",
    colorLight: "#eda100",
    name: "Wealth",
    short: "WLT",
    description: "Financial position and habits: savings, net worth, debt, income, emergency fund.",
    color: "#c98500",
    icon: "Coins",
    scientificNote:
      "Your entries are individual figures. Many published wealth statistics describe households/families and are not directly comparable.",
  },
  {
    code: "CHA",
    colorLight: "#e87ba4",
    name: "Charisma / Social",
    short: "CHA",
    description: "Communication, leadership, networking, relationships, service.",
    color: "#d55181",
    icon: "Users",
    scientificNote: "Tracked as personal progression. There are no invented population rankings.",
  },
  {
    code: "WIS",
    colorLight: "#008300",
    name: "Wisdom / Wellness",
    short: "WIS",
    description: "Sleep regularity, reflection, stress management, mindfulness, balance.",
    color: "#008300",
    icon: "Sparkles",
    scientificNote:
      "Wellness is scored on healthy habits and goal attainment. Sleep deprivation and overwork are never rewarded.",
  },
];

export const ATTRIBUTE_BY_CODE: Record<AttributeCode, AttributeDef> = Object.fromEntries(
  ATTRIBUTES.map((a) => [a.code, a]),
) as Record<AttributeCode, AttributeDef>;
