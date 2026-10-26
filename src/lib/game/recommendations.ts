import type { AttributeCode } from "../domain/types";

export interface QuestRecommendation {
  title: string;
  description: string;
  difficulty: "E" | "D" | "C" | "B" | "A";
  objectives: { title: string; tracker: { type: "activity_minutes" | "activity_count" | "activity_quantity"; activities: string[] }; target: number }[];
}

/** Recommended quests per attribute. Each is measurable from logs and kept realistic and balanced. */
export const RECOMMENDED: Record<AttributeCode, QuestRecommendation[]> = {
  STR: [
    { title: "Three-session strength week", description: "Three full-body sessions this week, each with progressive overload.", difficulty: "C", objectives: [{ title: "3 strength workouts", tracker: { type: "activity_count", activities: ["workout"] }, target: 3 }] },
    { title: "Foundation & mobility", description: "Pair lifting with mobility to protect joints.", difficulty: "D", objectives: [{ title: "2 workouts", tracker: { type: "activity_count", activities: ["workout"] }, target: 2 }, { title: "2 mobility sessions", tracker: { type: "activity_count", activities: ["mobility"] }, target: 2 }] },
  ],
  END: [
    { title: "Aerobic base builder", description: "Mostly easy running. Build the base before adding speed.", difficulty: "C", objectives: [{ title: "Run 20 km", tracker: { type: "activity_quantity", activities: ["run"] }, target: 20 }] },
    { title: "Cross-training circuit", description: "One ride or swim to load the heart without pounding the legs.", difficulty: "D", objectives: [{ title: "1 ride or swim", tracker: { type: "activity_count", activities: ["cycle", "swim"] }, target: 1 }, { title: "2 runs", tracker: { type: "activity_count", activities: ["run"] }, target: 2 }] },
  ],
  PHY: [
    { title: "Recovery protocol", description: "Recovery is training: mobility, walking and a planned rest day.", difficulty: "E", objectives: [{ title: "2 mobility sessions", tracker: { type: "activity_count", activities: ["mobility"] }, target: 2 }, { title: "1 planned rest day", tracker: { type: "activity_count", activities: ["rest_day"] }, target: 1 }] },
    { title: "Fuel the build", description: "Log nutrition on 5 days to see whether intake matches your goals.", difficulty: "D", objectives: [{ title: "5 nutrition logs", tracker: { type: "activity_count", activities: ["nutrition_log"] }, target: 5 }] },
  ],
  INT: [
    { title: "Deep-work sprint", description: "Five focused study hours in blocks of 50–90 minutes.", difficulty: "C", objectives: [{ title: "300 minutes of study", tracker: { type: "activity_minutes", activities: ["study", "quiz", "practice_exam"] }, target: 300 }] },
    { title: "Retrieval gauntlet", description: "Active recall beats rereading.", difficulty: "C", objectives: [{ title: "300 flashcards", tracker: { type: "activity_quantity", activities: ["flashcards"] }, target: 300 }, { title: "2 question-bank blocks", tracker: { type: "activity_count", activities: ["quiz"] }, target: 2 }] },
  ],
  DIS: [
    { title: "No-zero week", description: "At least one qualifying action every day for 7 days.", difficulty: "C", objectives: [{ title: "7 days with a study, training or wellness log", tracker: { type: "activity_count", activities: ["study", "workout", "run", "reflection", "mobility", "mindfulness"] }, target: 7 }] },
  ],
  WLT: [
    { title: "Money clarity", description: "Review your budget and learn one concept.", difficulty: "D", objectives: [{ title: "Budget review", tracker: { type: "activity_count", activities: ["financial_review"] }, target: 1 }, { title: "Financial-literacy lesson", tracker: { type: "activity_count", activities: ["financial_lesson"] }, target: 1 }] },
  ],
  CHA: [
    { title: "Bridge builder", description: "Reach out to a classmate, mentor or friend twice this week.", difficulty: "D", objectives: [{ title: "2 connections", tracker: { type: "activity_count", activities: ["social_connection", "networking"] }, target: 2 }] },
    { title: "Find your voice", description: "Practice communication deliberately, e.g. a case presentation dry run.", difficulty: "C", objectives: [{ title: "2 communication practices", tracker: { type: "activity_count", activities: ["communication", "public_speaking", "presentation"] }, target: 2 }] },
  ],
  WIS: [
    { title: "Still mind", description: "Short daily mindfulness and reflection.", difficulty: "D", objectives: [{ title: "60 minutes of mindfulness", tracker: { type: "activity_minutes", activities: ["mindfulness"] }, target: 60 }, { title: "4 reflections", tracker: { type: "activity_count", activities: ["reflection"] }, target: 4 }] },
  ],
};
