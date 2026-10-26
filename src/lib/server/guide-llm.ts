import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { ACTIVITIES, ACTIVITY_BY_TYPE } from "../domain/activities";
import { ATTRIBUTE_CODES } from "../domain/types";
import { computeGuideFacts, deterministicGuide, type GuideKind, type GuideMessage } from "../game/guide";
import { aiConfig } from "./env";
import type { PlayerSnapshot } from "./game/snapshot";

const SuggestedQuest = z.object({
  title: z.string().max(120),
  description: z.string().max(400),
  attribute: z.enum(ATTRIBUTE_CODES),
  difficulty: z.enum(["E", "D", "C", "B", "A"]),
  objectives: z
    .array(
      z.object({
        title: z.string().max(160),
        activity: z.string(),
        measure: z.enum(["minutes", "count", "quantity"]),
        target: z.number(),
      }),
    )
    .max(4),
});

const GuideOutput = z.object({
  messages: z.array(z.object({ tag: z.string().max(40), title: z.string().max(120), body: z.string().max(900) })).max(6),
  suggestedQuests: z.array(SuggestedQuest).max(3),
});
export type SuggestedQuest = z.infer<typeof SuggestedQuest>;

export interface GuideResponse {
  source: "llm" | "deterministic";
  model: string | null;
  messages: GuideMessage[];
  suggestedQuests: SuggestedQuest[];
  note: string | null;
}

const SYSTEM_PROMPT = `You are "the System", the mysterious game interface in SYSTEM IRL, a real-life RPG that turns a player's real accomplishments into progression. Speak in a terse, atmospheric RPG-system voice using bracketed tags such as [SYSTEM NOTIFICATION], [WARNING], [NEXT EVOLUTION], [RECOVERY].

Hard rules:
- Use ONLY the facts in the provided JSON. Never invent numbers, completed activities, personal records, percentiles, rankings, benchmark sources or studies. If a fact is missing, say it hasn't been logged yet.
- Hunter Rank and attribute ranks are game-defined; do not call them population percentiles.
- Never encourage sleep deprivation, overtraining, unhealthy restriction, or shame. Missing days earns no punishment. Recommend recovery when the facts show many consecutive training days or short sleep.
- Keep suggestions realistic and specific to the player's goals. Suggested quests may only use these activity types: ${ACTIVITIES.map((a) => a.type).join(", ")}.
- No medical diagnoses; suggest seeing a clinician for health concerns.`;

const KIND_INSTRUCTIONS: Record<GuideKind, string> = {
  daily_briefing: "Write today's briefing: status, today's quests, one priority, and any recovery warning. 2–4 messages. Suggest at most one quest if a neglected attribute exists.",
  weekly_summary: "Summarise the last 7 days versus the previous 7 using only the numbers given. 2–4 messages. Suggest up to two quests for next week.",
  neglected: "Identify neglected attributes and propose small, realistic quests to re-engage them. Up to 3 suggested quests.",
  milestones: "Explain the nearest next milestones and what concrete actions reach them.",
  explain_stats: "Explain how the player's level, attribute levels and ranks work and what drives them, using the facts.",
  study_plan: "Create a realistic study plan for the coming days (active recall, spaced repetition, practice exams, sleep). Suggest up to two study quests.",
  recovery: "Assess training and recovery balance from the facts and recommend a balanced plan.",
};

function sanitizeQuests(qs: SuggestedQuest[]): SuggestedQuest[] {
  return qs
    .map((q) => ({
      ...q,
      objectives: q.objectives
        .filter((o) => ACTIVITY_BY_TYPE[o.activity] && Number.isFinite(o.target) && o.target > 0)
        .map((o) => ({ ...o, target: Math.min(o.target, o.measure === "minutes" ? 600 : o.measure === "count" ? 20 : 100000) })),
    }))
    .filter((q) => q.objectives.length > 0);
}

export async function runGuide(kind: GuideKind, snapshot: PlayerSnapshot, question?: string): Promise<GuideResponse> {
  const deterministic: GuideResponse = { source: "deterministic", model: null, messages: deterministicGuide(kind, snapshot), suggestedQuests: [], note: null };
  const cfg = aiConfig();
  if (!cfg || !snapshot.settings.ai_enabled) return { ...deterministic, note: cfg ? "AI guide disabled in settings." : "No ANTHROPIC_API_KEY configured: using the built-in deterministic guide." };
  const facts = computeGuideFacts(snapshot);
  const context = {
    request: kind,
    playerQuestion: question?.slice(0, 500) ?? null,
    goals: snapshot.profile.goals,
    difficulty: snapshot.profile.difficulty,
    facts,
    deterministicNotes: deterministic.messages,
  };
  try {
    const client = new Anthropic({ apiKey: cfg.apiKey, timeout: 60_000, maxRetries: 1 });
    const response = await client.beta.messages.parse({
      model: cfg.model,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(GuideOutput) },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `${KIND_INSTRUCTIONS[kind]}\n\nPlayer data (JSON):\n${JSON.stringify(context)}` }],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return { ...deterministic, note: "The AI guide could not answer, so the deterministic guide is shown." };
    }
    return { source: "llm", model: response.model, messages: response.parsed_output.messages, suggestedQuests: sanitizeQuests(response.parsed_output.suggestedQuests), note: null };
  } catch (e) {
    if (e instanceof Anthropic.APIError) console.error(`[guide] Anthropic API error ${e.status}: ${e.message}`);
    else console.error("[guide]", e);
    return { ...deterministic, note: "AI guide unavailable right now, so the deterministic guide is shown." };
  }
}
