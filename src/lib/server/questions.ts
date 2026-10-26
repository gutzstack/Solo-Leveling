import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Database } from "./db/types";
import { aiConfig } from "./env";
import { GameError } from "./game/service";

/** Player-owned question sets used by Knowledge Trials. */

export const QuestionInputSchema = z.object({
  prompt: z.string().trim().min(3).max(1000),
  choices: z.array(z.string().trim().min(1).max(300)).min(2).max(6),
  answerIndex: z.number().int().min(0).max(5),
  topic: z.string().trim().max(60).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  explanation: z.string().trim().max(1000).optional(),
});
export type QuestionInput = z.infer<typeof QuestionInputSchema>;

export const QuestionRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("import"), deck: z.string().trim().min(1).max(60), format: z.enum(["csv", "json"]), text: z.string().max(2_000_000) }),
  z.object({ action: z.literal("delete"), id: z.string().uuid() }),
  z.object({ action: z.literal("delete_deck"), deck: z.string().max(60) }),
  z.object({ action: z.literal("flag"), id: z.string().uuid(), flagged: z.boolean() }),
  z.object({ action: z.literal("generate"), deck: z.string().trim().min(1).max(60), topic: z.string().trim().min(2).max(120), count: z.number().int().min(3).max(20), difficulty: z.enum(["easy", "medium", "hard"]) }),
]);

const MAX_QUESTIONS = 10_000;

/** RFC-4180-style CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

/**
 * CSV columns: question, choice A, choice B, [choice C, choice D, choice E, choice F,] answer, [topic], [difficulty], [explanation]
 * Use the header row to name columns: question, a, b, c, d, e, f, answer, topic, difficulty, explanation.
 * `answer` is a letter (A–F) or a 1-based number.
 */
export function parseQuestionsCsv(text: string): { questions: QuestionInput[]; errors: string[] } {
  const rows = parseCsv(text);
  if (!rows.length) return { questions: [], errors: ["The file is empty."] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  if (!header.includes("question") || !header.includes("answer")) return { questions: [], errors: ['The first row must be a header with at least "question", "a", "b" and "answer" columns.'] };
  const col = (name: string) => header.indexOf(name);
  const letters = ["a", "b", "c", "d", "e", "f"];
  const questions: QuestionInput[] = [];
  const errors: string[] = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const get = (name: string) => (col(name) >= 0 ? (r[col(name)] ?? "").trim() : "");
    const choices = letters.map((l) => get(l)).filter((c) => c !== "");
    const ans = get("answer").toUpperCase();
    const answerIndex = /^[A-F]$/.test(ans) ? ans.charCodeAt(0) - 65 : /^\d$/.test(ans) ? Number(ans) - 1 : -1;
    const diff = get("difficulty").toLowerCase();
    const parsed = QuestionInputSchema.safeParse({
      prompt: get("question"),
      choices,
      answerIndex,
      topic: get("topic") || undefined,
      difficulty: diff === "easy" || diff === "medium" || diff === "hard" ? diff : undefined,
      explanation: get("explanation") || undefined,
    });
    if (!parsed.success || answerIndex < 0 || answerIndex >= choices.length) errors.push(`Row ${line}: needs a question, at least two choices and an answer letter that matches a choice.`);
    else questions.push(parsed.data);
  });
  return { questions, errors };
}

export function parseQuestionsJson(text: string): { questions: QuestionInput[]; errors: string[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { questions: [], errors: ["Not valid JSON."] };
  }
  const list = Array.isArray(data) ? data : (data as { questions?: unknown })?.questions;
  if (!Array.isArray(list)) return { questions: [], errors: ['Expected an array of questions (or {"questions": [...]}).'] };
  const questions: QuestionInput[] = [];
  const errors: string[] = [];
  list.forEach((q, i) => {
    const p = QuestionInputSchema.safeParse(q);
    if (p.success && p.data.answerIndex < p.data.choices.length) questions.push(p.data);
    else errors.push(`Item ${i + 1}: needs prompt, choices (2–6) and a valid answerIndex.`);
  });
  return { questions, errors };
}

async function insertQuestions(db: Database, userId: string, deck: string, questions: QuestionInput[], source: "import" | "ai") {
  const existing = await db.user(userId).select<{ id: string; prompt: string; deck: string }>("question_items", { eq: { user_id: userId } });
  if (existing.length + questions.length > MAX_QUESTIONS) throw new GameError(`Question limit is ${MAX_QUESTIONS.toLocaleString()}.`);
  const seen = new Set(existing.filter((e) => e.deck === deck).map((e) => e.prompt.toLowerCase()));
  const rows = questions
    .filter((q) => {
      const k = q.prompt.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((q) => ({ user_id: userId, deck, topic: q.topic || deck, prompt: q.prompt, choices: q.choices, answer_index: q.answerIndex, explanation: q.explanation ?? null, difficulty: q.difficulty ?? "medium", source }));
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) inserted += (await db.user(userId).insert("question_items", rows.slice(i, i + 200))).length;
  return { inserted, skippedDuplicates: questions.length - rows.length };
}

export async function handleQuestions(db: Database, userId: string, raw: unknown) {
  const parsed = QuestionRequestSchema.safeParse(raw);
  if (!parsed.success) throw new GameError("Invalid request: " + parsed.error.issues.map((i) => i.message).join("; "));
  const req = parsed.data;
  const u = db.user(userId);
  switch (req.action) {
    case "import": {
      const { questions, errors } = req.format === "csv" ? parseQuestionsCsv(req.text) : parseQuestionsJson(req.text);
      if (!questions.length) throw new GameError(errors.slice(0, 5).join(" ") || "No questions found.");
      const r = await insertQuestions(db, userId, req.deck, questions, "import");
      return { ...r, errors: errors.slice(0, 20) };
    }
    case "delete":
      return { deleted: await u.delete("question_items", { id: req.id, user_id: userId }) };
    case "delete_deck":
      return { deleted: await u.delete("question_items", { deck: req.deck, user_id: userId }) };
    case "flag":
      await u.update("question_items", { id: req.id, user_id: userId }, { flagged: req.flagged });
      return { ok: true };
    case "generate":
      return generateQuestions(db, userId, req.deck, req.topic, req.count, req.difficulty);
  }
}

const Generated = z.object({
  questions: z.array(z.object({ prompt: z.string(), choices: z.array(z.string()), answerIndex: z.number().int(), explanation: z.string() })),
});

async function generateQuestions(db: Database, userId: string, deck: string, topic: string, count: number, difficulty: "easy" | "medium" | "hard") {
  const cfg = aiConfig();
  if (!cfg) throw new GameError("AI question generation needs ANTHROPIC_API_KEY on the server. You can import your own questions instead.", 400);
  const client = new Anthropic({ apiKey: cfg.apiKey, timeout: 120_000, maxRetries: 1 });
  try {
    const res = await client.beta.messages.parse({
      model: cfg.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(Generated) },
      system:
        "You write accurate multiple-choice study questions. Each question has exactly 4 options with one unambiguously correct answer, plausible distractors, and a one-to-two sentence explanation. Prefer well-established facts; if a topic is outside reliable knowledge, write fewer questions rather than guessing.",
      messages: [{ role: "user", content: `Write ${count} ${difficulty} multiple-choice questions about: ${topic}` }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) throw new GameError("The AI could not generate questions for that topic.");
    const questions = res.parsed_output.questions
      .map((q) => QuestionInputSchema.safeParse({ prompt: q.prompt, choices: q.choices, answerIndex: q.answerIndex, explanation: q.explanation, topic: topic.slice(0, 60), difficulty }))
      .filter((p) => p.success && p.data.answerIndex < p.data.choices.length)
      .map((p) => p.data as QuestionInput);
    return { ...(await insertQuestions(db, userId, deck, questions, "ai")), errors: [] as string[] };
  } catch (e) {
    if (e instanceof GameError) throw e;
    if (e instanceof Anthropic.APIError) throw new GameError(`AI service error (${e.status}). Try again later.`, 502);
    throw e;
  }
}
