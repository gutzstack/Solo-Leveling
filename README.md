# SYSTEM IRL

A real-life RPG progression system inspired by the atmosphere of *Solo Leveling*: your real
accomplishments drive your level, attributes, ranks, quests, dungeons, skills and titles.
All artwork, icons and sounds are original (SVG, CSS and Web Audio synthesis); no copyrighted
Solo Leveling assets are used.

> Every action in the real world contributes to the evolution of the Player.

## Quick start

```bash
npm install
npm run dev            # http://localhost:3000
```

No configuration is needed. Without credentials the app runs a **local demo backend**: a real
PostgreSQL database (PGlite, WebAssembly) persisted in `.data/pglite`, using the *same SQL
migration and row-level-security policies* as Supabase, plus email/password auth with
scrypt-hashed passwords and HMAC-signed session cookies.

1. Open the app, press **Accept** and create an account.
2. The **Awakening** sequence walks through onboarding. Every player starts from a blank slate:
   name, age (or date of birth), body measures, education, goals and existing records are all
   optional inputs except name and age, and anything you skip stays blank.
3. You land on **STATUS**. Log activities and measurements, run dungeons, complete quests.

```bash
npm test               # 87 unit + integration + RLS tests (vitest, real PostgreSQL in-memory)
npm run typecheck && npm run lint
npm run build && npm start
BASE_URL=http://localhost:3000 npm run test:e2e   # Playwright smoke test of every page (desktop + mobile)
```

## Architecture

```
src/
  app/                    Next.js 16 App Router (pages + route handlers)
    page.tsx              gate: sign in / sign up
    awakening/            first-time sequence + onboarding
    (game)/               STATUS ATTRIBUTES QUESTS DUNGEONS SKILLS ACHIEVEMENTS ANALYTICS RANKINGS SYSTEM
    api/                  state, command, export, import, guide, benchmarks, auth/*
  lib/
    domain/               pure game rules: units, dates, metrics (96), activities, XP, ranks,
                          skills (75 nodes), achievements (149), titles, dungeons
    percentile/           benchmark registry schema, weighted ECDF utilities, percentile engine
    game/                 evaluation: stats, derived metrics, metric states, hunter rank,
                          quests & progress, analytics, deterministic guide, command schemas
    server/               data layer (PGlite / Supabase adapters), auth, catalog sync,
                          GameService (validated commands + progression loop), LLM guide
    client/               TanStack Query hooks, event bus, synthesized sound, chart theme
  components/             shadcn-style UI on Radix + RPG system components
  data/benchmarks/        generated + curated benchmark bundles (schema-validated at load)
supabase/migrations/      the database schema, RLS policies and grants
supabase/local/           auth shim used only by the local demo database
scripts/benchmarks/       research/import pipeline (XPT reader, NHANES builder, fetcher)
tests/                    vitest suites
```

**Server-authoritative design.** The browser never computes awards. Every mutation is a
Zod-validated command (`POST /api/command`). `GameService` applies it, then runs a
progression loop that detects completed objectives, quests, chapters, skills, achievements
and titles, writes them idempotently, and returns the new snapshot plus the events that drive
the level-up, rank-up and notification animations.

**Database.** 26 tables, including every table in the spec (users, profiles, attributes, metrics,
metric_entries, benchmark_sources, benchmark_distributions, percentile_results, quests,
quest_objectives, quest_completions, dungeons, dungeon_sessions, skills, skill_unlocks,
achievements, achievement_unlocks, player_xp (ledger), player_levels, titles, equipped_titles,
notifications, settings) plus activity_logs and title_unlocks. Foreign keys, check constraints,
indexes and unique idempotency keys throughout.

**Security model.**
* RLS on every table. Users can *read* only their own rows. They can write only "input" tables
  (profile, settings, measurements, activities, custom metrics, equipped title,
  notification `read_at` via a column-level grant).
* XP, unlocks, quests, completions, levels and percentile results are writable only by the
  service role, after server validation. A player cannot grant themselves XP through the database.
* The XP ledger is append-only and auditable: deletions insert *reversal* transactions, and
  `(user_id, idempotency_key)` uniqueness prevents duplicate awards. Same-origin checks on POSTs,
  login rate limiting, constant-time password checks, no secrets in client bundles.
* Profiles are private by default; "public profile" only records consent for future leaderboards.

## Game systems

| System | How it works |
|---|---|
| **XP** | Effort XP for meaningful actions (minimum duration/quantity, per-type daily caps, duplicate detection, idempotency keys); performance XP only for genuine personal records (needs a baseline and a minimum improvement, once per metric per 7 days; historical entries never earn XP). Configurable in SYSTEM → Scoring. |
| **Level** | `XP to next = round(base × level^exponent)`, default `round(100 × level^1.35)`. Levels never affect percentiles. |
| **Attributes** | STR END PHY INT DIS WLT CHA WIS, each with its own XP level, rank, history chart, metrics, milestones and recommended quests. |
| **INT / System Trials** | INT is ranked on tests the System administers, not GPA: **Knowledge Trials** (multiple-choice questions from question sets you import as CSV/JSON, or optionally generate with AI, labelled unverified; Elo-style rating), **Reasoning Trials** (procedurally generated, adaptive number-series and number-grid puzzles; rating), **Memory Trials** (forward + backward digit span) and **Speed Trials** (60-second arithmetic). Weights: Knowledge 3×, Reasoning 2×, official exam percentile 1.5×, Memory 1×, Speed 1×, self-reported exam/quiz/assessment averages 0.5×. GPA, study hours and reading are tracked records only. Items and answer keys are generated and checked server-side (the answer key is not client-readable), with per-item time limits. None of this is an IQ score or a population percentile. |
| **Metric ranks** | Population percentile when appropriate data exists (VERIFIED/ESTIMATED); otherwise game-defined standards or evidence-based goal attainment (PERSONAL). Neutral measures (weight, height, BMI, waist) get descriptive positions, never ranks. Historical PBs are shown separately from current ability. |
| **Hunter Rank** | Game-defined weighted average of ranked attribute scores (configurable weights), explicitly *not* a population percentile, with an uncertainty band propagated only from population CIs. Provisional until 3 attributes rank. |
| **Quests** | Daily board grouped into Physical / Intellectual / Mental / Health / Social / Discipline categories (training days add a 10-minute post-training stretch; Discipline is a morning top-3 plan), built from the player's regimen (System → Regimen). The physical regimen starts at 35 push-ups, 35 sit-ups, 35 squats, 35 dips, 35 pull-ups and a 1.5-mile run, with two rest days a week (Wed/Sun by default). Every Monday it scales: clear it on all but one training day and targets rise (+5 reps, +3 pull-ups, +¼ mile) up to a goal of 100 reps each and 5 km; clear fewer than half and it steps back. Weekly quests, four main story arcs with chapters/prerequisites/titles, optional emergency quests, custom quests with server-capped XP. Progress is tracked automatically from logs; reps can be logged in sets from the quest card. |
| **Rewards** | Quests pay **gold** as well as XP (regimen 50, dailies 10, weekly 75, chapters 300), multiplied by the perfect-day streak (3 days ×1.1, 7 days ×1.25, 14 days ×1.5). Clearing every daily drops a **reward chest** (common 70%, rare 22%, epic 7%, legendary 1%) holding gold and items: Double-XP Elixir, Penalty Shield (absorbs the next penalty), Recovery Pass. Gold buys System items or the real-life rewards the player stocks their own shop with. Failed quests cost gold too. Needs `0004_rewards.sql`. |
| **Accounts** | New players sign up with a username and password (no email, nothing to confirm). Under Supabase the auth record gets a placeholder address on the reserved `.invalid` TLD and is created pre-confirmed; sign-in accepts a username or an email, so email accounts keep working. Needs `0005_friends.sql` (falls back to email sign-up until then). |
| **Friends** | Unique usernames (3–20 chars, a–z 0–9 _, enforced by a unique index). Players add friends by exact username; requests must be accepted. Friends see a progress summary only (level, XP this week, Hunter/attribute ranks, streaks, quest/dungeon/achievement counts, training targets, equipped title), never measurements, grades, finances, notes, logs or email; it is read through the server after the friendship is checked. Leaderboard and head-to-head comparison. Needs `0005_friends.sql`. |
| **Penalties** | Failing a daily, weekly, accepted emergency or custom quest costs its XP reward (scaled by difficulty: casual ×0.5 … nightmare ×2). Failed dailies open a **Penalty Zone** the next day (finish the unfinished work on top of the day's quests, or lose double). Days the player doesn't open the app still fail (up to 7 back). Abandoning quests, retreating from dungeons and abandoning trials also cost XP. One recovery pass per week (configurable 0–2) waives a day's physical quests for illness or injury. Penalties are negative `penalty` rows in the XP ledger and never take XP below zero. |
| **Dungeons** | Server-timed focus sessions (focus or Pomodoro), pause/resume, clear at ≥ 90 %, retreat keeps credit for ≥ 15 min, boss encounters, ambient soundtrack. |
| **Skills** | 15 lines × 5 tiers across Academic / Physical / Discipline trees; unlock from measurable milestones only. |
| **Achievements** | 149 with rarity, icon, criteria, XP and unlock dates; 26 equippable titles. |
| **Analytics** | Level & XP history, attribute radar, rank distribution, weekly completion, quest trends, study vs. results (two aligned charts, never a dual axis), strength, running pace, body weight, finances, streak heatmap, PR log, improvement velocity. 7d/30d/90d/1y/all, each chart with a table view. |
| **System Guide** | Deterministic guide computed from your data (briefings, weekly summary, neglected goals, milestones, stat explanations, study plan, recovery). With `ANTHROPIC_API_KEY` set, an LLM rephrases and prioritises the same facts as structured output; it is instructed never to invent data and may suggest quests the player can accept. |

## Benchmarks: what is genuinely sourced

Percentiles come only from the registry in `src/data/benchmarks/`, validated by
`src/lib/percentile/registry-schema.ts` (which rejects, e.g., median-only tables).

**Verified (survey-weighted microdata, computed by `npm run benchmarks:build`):**

| Metric | Source | Population | Method |
|---|---|---|---|
| Body weight, height, waist circumference, BMI | CDC NHANES 2017–2018 (DEMO_J, BMX_J) | U.S. men / women / all, ages 20–24, pregnant excluded | weighted ECDF, WTMEC2YR; descriptive only |
| Resting heart rate (60-s pulse) | CDC NHANES 2013–2014 (DEMO_H, BPX_H) | U.S. men / women / all, ages 20–24 | weighted ECDF, WTMEC2YR; lower is better |
| Sleep duration (usual weekday) | CDC NHANES 2013–2014 (SLQ_H) | U.S. adults 20–24 | weighted ECDF, WTINT2YR; descriptive; sleep is ranked by 7–9 h goal attainment |

Percentile = share of the population whose value you match or exceed (`P(X ≤ v)` for
higher-is-better, `P(X ≥ v)` for lower-is-better). Each result shows a 95 % Wilson interval at
the Kish effective sample size. That ignores NHANES clustering, so true intervals are wider,
and the UI says so.

**Provenance note.** cdc.gov was blocked by this build environment's network policy, so the five
XPT files were taken from public GitHub mirrors of the CDC release. Their record counts match the
CDC documentation, their SAS creation timestamps match the CDC release, and the TypeScript XPT
reader's output was cross-checked against `pandas.read_sas` (identical n, weighted means and
quantiles). SHA-256 hashes are stored in the bundle and shown on the RANKINGS page. To rebuild
straight from CDC:

```bash
npm run benchmarks:fetch && npm run benchmarks:build
```

**Not sourced, so no percentile is shown** ("Population percentile unavailable — tracking
personal progression"): running times, lifts and bodyweight exercises (no nationally
representative distributions; race-result data is heavily self-selected), VO₂max, grip strength
(NHANES has these, in cycles not yet imported), GPA and exam scores, all wealth metrics (the SCF
is household-level and wasn't retrievable here), and all charisma/wellness habits. These use
clearly labelled game standards. To add a source, put a published table in
`src/data/benchmarks/published-quantiles.json` (≥ 5 quantiles spanning P10–P90, with a citation;
interpolated results are labelled ESTIMATED), or extend `scripts/benchmarks/nhanes-config.ts`
for more NHANES variables, then run the tests.

## Configuration & external credentials

| Feature | Needs | Without it |
|---|---|---|
| Hosted DB + auth | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Local PGlite + cookie auth (fully working) |
| AI guide | `ANTHROPIC_API_KEY` (optional `AI_MODEL`, default `claude-opus-5-5`) | Deterministic guide |
| Apple Health / Strava / Google Calendar / LMS | OAuth apps or native app (see SYSTEM → Integrations) | Not built; shown honestly as "not connected". JSON import/export works. |

## Deploying

### Supabase + Vercel (recommended)
1. Create a Supabase project. In the SQL editor, run every file in `supabase/migrations/` in order
   (`0001_…` through `0005_…`), or use `supabase db push`. Do **not** run
   `supabase/local/auth_shim.sql`. Until `0003_regimen_penalties.sql` is applied the app runs
   without penalties and the regimen can't be edited; until `0004_rewards.sql` is, gold, chests and the shop are off; until `0005_friends.sql` is, friends are off.
2. Auth → URL configuration: set the Site URL to your deployment. Either keep email confirmation
   (users confirm, then sign in) or disable it for a private deployment.
3. On Vercel, import the repo and set the three Supabase variables (plus `ANTHROPIC_API_KEY` if
   wanted). Deploy. Reference catalogs (metrics, achievements, skills, benchmarks…) are synced
   into the database automatically on first request.

### Single server / Docker (local backend)
`npm run build && LOCAL_DB_DIR=/var/lib/system-irl/pglite SESSION_SECRET=<random> npm start`.
PGlite needs a persistent, writable disk and a **single** Node process (it holds an exclusive
lock). Serverless platforms need the Supabase backend instead.

## Troubleshooting sign-in

* **Signed up but bounced back to the gate:** this was a bug in the first build. Session cookies
  were always marked `Secure` in production, so browsers discarded them when the app was opened over
  plain HTTP by IP address or LAN name (e.g. `http://192.168.1.20:3000` from a phone). Cookies are
  now `Secure` only when the request arrived over HTTPS (override with `COOKIE_SECURE`), and the
  gate page tells you explicitly if the browser still refuses the cookie (private mode or strict
  tracking protection).
* **"Cross-origin request blocked":** you're behind a proxy or custom domain that rewrites the
  `Host` header. Add the public URL to `ALLOWED_ORIGINS`.
* **Serverless hosts (Vercel/Netlify) without Supabase:** the local database falls back to `/tmp`,
  which is temporary and not shared between instances, and the gate page shows a warning.
  Configure Supabase for real deployments.

## Remaining limitations

* Only six NHANES-based measures have population percentiles; most performance metrics use game
  standards (see above). Interval estimates ignore the survey's clustering.
* The Supabase adapter has not been run against a live Supabase project from this environment
  (no credentials). The identical SQL schema and RLS policies *are* exercised by the test suite
  in PostgreSQL via PGlite.
* The LLM guide path was type-checked but not called live (no API key here); the deterministic
  guide is always available.
* Third-party integrations (Apple Health, Strava, Google Calendar, LMS) are not implemented.
* Deleting an activity (STATUS → Recent Activity → Full log) reverses its XP but not quests or
  achievements it already completed (achievements are permanent once earned).
* Main story arcs use fixed milestone targets (e.g. sub-20 5K, +10 lb lean mass). Edit
  `src/lib/game/quest-templates.ts` to change them; there's no in-app arc editor yet.
* No push notifications; reminders appear in-app.
