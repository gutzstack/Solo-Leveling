import type { AttributeCode } from "./types";

/**
 * Real-world actions the player logs. Each one awards *effort* XP, kept separate from *performance*
 * XP (personal records), subject to minimum-completion rules and daily caps so XP can't be farmed.
 */
export interface ActivityDef {
  type: string;
  name: string;
  attribute: AttributeCode;
  /** default XP per qualifying log (configurable per player) */
  xp: number;
  /** maximum XP-earning logs of this type per day; further logs are recorded with 0 XP */
  dailyCap: number;
  /** minimum minutes for the log to count as meaningful */
  minMinutes?: number;
  /** minimum quantity (e.g. 20 flashcards, 1.5 km) when quantity is the completion criterion */
  minQuantity?: number;
  /** quantity semantics; distance is canonical km */
  quantity?: { label: string; kind: "distance" | "count" | "pages" | "cards" | "volume_kg" };
  requiresDuration: boolean;
  icon: string;
  group: "training" | "study" | "wellness" | "social" | "finance" | "life";
}

export const ACTIVITIES: ActivityDef[] = [
  // Training
  { type: "workout", name: "Strength workout", attribute: "STR", xp: 50, dailyCap: 2, minMinutes: 20, requiresDuration: true, icon: "Dumbbell", group: "training", quantity: { label: "Volume (sets × reps × load)", kind: "volume_kg" } },
  { type: "run", name: "Run", attribute: "END", xp: 40, dailyCap: 2, minMinutes: 10, minQuantity: 1.5, requiresDuration: true, icon: "Footprints", group: "training", quantity: { label: "Distance", kind: "distance" } },
  { type: "cycle", name: "Cycling", attribute: "END", xp: 40, dailyCap: 2, minMinutes: 20, requiresDuration: true, icon: "Bike", group: "training", quantity: { label: "Distance", kind: "distance" } },
  { type: "swim", name: "Swim", attribute: "END", xp: 40, dailyCap: 2, minMinutes: 15, requiresDuration: true, icon: "Waves", group: "training", quantity: { label: "Distance", kind: "distance" } },
  { type: "walk", name: "Walk", attribute: "PHY", xp: 10, dailyCap: 2, minMinutes: 15, requiresDuration: true, icon: "PersonStanding", group: "training", quantity: { label: "Steps", kind: "count" } },
  { type: "mobility", name: "Mobility / stretching", attribute: "PHY", xp: 15, dailyCap: 2, minMinutes: 10, requiresDuration: true, icon: "StretchHorizontal", group: "training" },
  { type: "rest_day", name: "Planned rest / recovery day", attribute: "PHY", xp: 10, dailyCap: 1, requiresDuration: false, icon: "BedDouble", group: "training" },
  // Study
  { type: "study", name: "Focused study session", attribute: "INT", xp: 30, dailyCap: 6, minMinutes: 15, requiresDuration: true, icon: "BookOpen", group: "study" },
  { type: "flashcards", name: "Flashcard review", attribute: "INT", xp: 15, dailyCap: 3, minQuantity: 20, requiresDuration: false, icon: "Layers", group: "study", quantity: { label: "Cards reviewed", kind: "cards" } },
  { type: "practice_exam", name: "Practice examination", attribute: "INT", xp: 100, dailyCap: 1, minMinutes: 30, requiresDuration: true, icon: "ClipboardCheck", group: "study" },
  { type: "quiz", name: "Quiz / question bank block", attribute: "INT", xp: 20, dailyCap: 3, minMinutes: 10, requiresDuration: true, icon: "ListChecks", group: "study" },
  { type: "reading", name: "Reading", attribute: "INT", xp: 15, dailyCap: 3, minMinutes: 15, requiresDuration: true, icon: "BookMarked", group: "study", quantity: { label: "Pages", kind: "pages" } },
  { type: "educational_milestone", name: "Educational milestone", attribute: "INT", xp: 150, dailyCap: 1, requiresDuration: false, icon: "GraduationCap", group: "study" },
  // Wellness
  { type: "reflection", name: "Daily reflection / journal", attribute: "WIS", xp: 20, dailyCap: 1, minMinutes: 3, requiresDuration: true, icon: "NotebookPen", group: "wellness" },
  { type: "mindfulness", name: "Mindfulness / meditation", attribute: "WIS", xp: 15, dailyCap: 2, minMinutes: 5, requiresDuration: true, icon: "Flower2", group: "wellness" },
  { type: "stress_management", name: "Stress-management practice", attribute: "WIS", xp: 15, dailyCap: 1, minMinutes: 5, requiresDuration: true, icon: "HeartPulse", group: "wellness" },
  { type: "emotional_regulation", name: "Emotional-regulation practice", attribute: "WIS", xp: 15, dailyCap: 1, minMinutes: 5, requiresDuration: true, icon: "Smile", group: "wellness" },
  { type: "personal_development", name: "Personal development", attribute: "WIS", xp: 20, dailyCap: 1, minMinutes: 15, requiresDuration: true, icon: "Sprout", group: "wellness" },
  { type: "decision_reflection", name: "Decision-making reflection", attribute: "WIS", xp: 15, dailyCap: 1, minMinutes: 5, requiresDuration: true, icon: "Scale", group: "wellness" },
  { type: "nutrition_log", name: "Nutrition log", attribute: "PHY", xp: 10, dailyCap: 1, requiresDuration: false, icon: "Apple", group: "wellness" },
  // Social
  { type: "communication", name: "Communication practice", attribute: "CHA", xp: 20, dailyCap: 2, minMinutes: 10, requiresDuration: true, icon: "MessagesSquare", group: "social" },
  { type: "public_speaking", name: "Public speaking", attribute: "CHA", xp: 60, dailyCap: 1, minMinutes: 3, requiresDuration: true, icon: "Mic", group: "social" },
  { type: "presentation", name: "Presentation delivered", attribute: "CHA", xp: 60, dailyCap: 1, minMinutes: 5, requiresDuration: true, icon: "Presentation", group: "social" },
  { type: "networking", name: "Networking", attribute: "CHA", xp: 30, dailyCap: 2, minMinutes: 15, requiresDuration: true, icon: "Network", group: "social" },
  { type: "social_connection", name: "Relationship maintenance", attribute: "CHA", xp: 15, dailyCap: 2, minMinutes: 10, requiresDuration: true, icon: "HeartHandshake", group: "social" },
  { type: "volunteering", name: "Volunteering", attribute: "CHA", xp: 40, dailyCap: 1, minMinutes: 30, requiresDuration: true, icon: "HandHeart", group: "social" },
  { type: "mentoring", name: "Mentoring", attribute: "CHA", xp: 40, dailyCap: 1, minMinutes: 20, requiresDuration: true, icon: "UserRoundCheck", group: "social" },
  { type: "leadership", name: "Leadership responsibility", attribute: "CHA", xp: 40, dailyCap: 1, minMinutes: 20, requiresDuration: true, icon: "Crown", group: "social" },
  { type: "interpersonal", name: "Interpersonal skill practice", attribute: "CHA", xp: 20, dailyCap: 1, minMinutes: 10, requiresDuration: true, icon: "Handshake", group: "social" },
  // Finance
  { type: "financial_review", name: "Budget / finance review", attribute: "WLT", xp: 25, dailyCap: 1, minMinutes: 10, requiresDuration: true, icon: "Wallet", group: "finance" },
  { type: "financial_lesson", name: "Financial-literacy lesson", attribute: "WLT", xp: 25, dailyCap: 1, minMinutes: 15, requiresDuration: true, icon: "Landmark", group: "finance" },
  { type: "investment_contribution", name: "Investment contribution", attribute: "WLT", xp: 30, dailyCap: 1, requiresDuration: false, icon: "TrendingUp", group: "finance" },
];

export const ACTIVITY_BY_TYPE: Record<string, ActivityDef> = Object.fromEntries(ACTIVITIES.map((a) => [a.type, a]));

export interface ActivityQualification {
  qualifies: boolean;
  reason?: string;
}

/** Whether a log meets the "meaningful completion" bar for XP. */
export function qualifiesForXp(
  def: ActivityDef,
  log: { duration_min?: number | null; quantity?: number | null },
): ActivityQualification {
  const minutes = log.duration_min ?? 0;
  const qty = log.quantity ?? 0;
  if (def.minMinutes !== undefined && def.minQuantity !== undefined) {
    // Either criterion is enough (e.g. a 10-minute run OR 1.5 km).
    if (minutes >= def.minMinutes || qty >= def.minQuantity) return { qualifies: true };
    return { qualifies: false, reason: `Needs at least ${def.minMinutes} min or ${def.minQuantity} ${def.quantity?.kind === "distance" ? "km" : "units"}.` };
  }
  if (def.minMinutes !== undefined && minutes < def.minMinutes) {
    return { qualifies: false, reason: `Needs at least ${def.minMinutes} minutes to count.` };
  }
  if (def.minQuantity !== undefined && qty < def.minQuantity) {
    return { qualifies: false, reason: `Needs at least ${def.minQuantity} ${def.quantity?.label.toLowerCase() ?? "units"}.` };
  }
  return { qualifies: true };
}
