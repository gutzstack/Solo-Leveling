import { randomUUID } from "node:crypto";
import { LocalDatabase } from "@/lib/server/db/local";
import { ensureCatalogs } from "@/lib/server/catalog";
import { GameService } from "@/lib/server/game/service";
import { INITIAL_METRICS, INITIAL_PROFILE } from "@/lib/game/initial-profile";
import type { ProfileInput } from "@/lib/game/commands";

export async function testDb(): Promise<LocalDatabase> {
  const db = await LocalDatabase.open();
  await ensureCatalogs(db.service(), db);
  return db;
}

export async function createUser(db: LocalDatabase, email = `p${randomUUID().slice(0, 8)}@example.test`): Promise<string> {
  const rows = await db.raw<{ id: string }>("insert into auth.users (email, encrypted_password) values ($1, 'x') returning id", [email]);
  return rows[0].id;
}

export function profileInput(overrides: Partial<ProfileInput> = {}): ProfileInput {
  return {
    display_name: "Test Player",
    date_of_birth: null,
    age_years: INITIAL_PROFILE.age_years,
    country: "United States",
    height_cm: INITIAL_PROFILE.height_cm,
    weight_kg: INITIAL_PROFILE.weight_kg,
    sex: "male",
    education_level: INITIAL_PROFILE.education_level,
    occupation: INITIAL_PROFILE.occupation,
    goals: INITIAL_PROFILE.goals,
    fitness_experience: "Intermediate",
    academic_info: {},
    financial_info: {},
    difficulty: "normal",
    tracked_categories: ["STR", "END", "PHY", "INT", "DIS", "WLT", "CHA", "WIS"],
    timezone: "America/New_York",
    ...overrides,
  };
}

/** A clock that can be moved forward in tests. */
export function testClock(start = "2026-10-20T14:00:00.000Z") {
  let t = Date.parse(start);
  return {
    now: () => new Date(t),
    advance: (ms: number) => {
      t += ms;
    },
    set: (iso: string) => {
      t = Date.parse(iso);
    },
  };
}

export async function onboardedPlayer(db: LocalDatabase, clock = testClock(), withInitial = true) {
  const userId = await createUser(db);
  const game = new GameService(db, userId, clock.now);
  await game.ensureBootstrap();
  const today = clock.now().toISOString().slice(0, 10);
  await game.execute({
    type: "complete_onboarding",
    profile: profileInput(),
    unit_system: "imperial",
    metrics: withInitial ? INITIAL_METRICS.map((m) => ({ metricId: m.metricId, value: m.value, context: m.context, recordedOn: today, note: m.note })) : [],
  });
  return { userId, game, clock };
}

let n = 0;
export const key = (p = "k") => `${p}_${Date.now()}_${n++}_${randomUUID().slice(0, 6)}`;
