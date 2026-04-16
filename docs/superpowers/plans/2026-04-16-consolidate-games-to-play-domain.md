# Consolidate ilk10 + ilk11 onto play.otaliptus.com — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the `ilk10` branch to `main`, then add a consolidated `play.otaliptus.com` home that hosts both games with a shared leaderboard (per-game boards + shared identity) — without tearing down the existing `ilk10.` and `ilk11.` subdomain deploys.

**Architecture:** One Next.js static-export app. Three coexisting Cloudflare Pages projects: existing `missing-eleven-tr` (ilk11 subdomain, gets a `/` → `/ilk11` redirect), existing `ilk10` (unchanged slice), and a new `play` project that deploys the full consolidated site. One shared D1 (`ilk11-leaderboard`) with two tables: existing `scores` (ilk11) + new `ilk10_scores`. One generalized `/api/scores` Function that dispatches on a `game` discriminator. Per-game leaderboard modals share a single nickname identity via localStorage.

**Tech Stack:** Next.js 14 (app router, `output: "export"`), React 18, Cloudflare Pages + Pages Functions, Cloudflare D1 (SQLite), Wrangler CLI, Tailwind + Radix UI.

**Spec:** `docs/superpowers/specs/2026-04-16-consolidate-games-to-play-domain-design.md`

---

## File Structure

### Milestone 1 — Merge ilk10 → main

Modified (existing working-tree edits, to commit):
- `data/ilk10-questions.ts` — refreshed top-10 Süper Lig scorers, sourced from Transfermarkt
- `lib/ilk10.ts` — cycle-based non-repeating daily question rotation
- `registry/scripts/build-autocomplete-index.mjs` — autocomplete index builder refactor
- `registry/output/autocomplete.json` — regenerated (smaller) index

### Milestone 2 — Consolidation

Created:
- `migrations/0002_harden_scores_and_add_ilk10.sql` — adds upper-bound CHECKs to `scores`, creates `ilk10_scores`
- `lib/routes.ts` — path constants (`/ilk10`, `/ilk11`) + kept share domain
- `app/ilk11/page.tsx` — moved from `app/page.tsx`, one-line import edits
- `app/page.tsx` — new landing (two-card picker + leaderboard entry + last-played redirect)
- `cloudflare/prepare-ilk11-subdomain.mjs` — copies `out/` to `out-ilk11/` and writes a `_redirects` file

Modified:
- `types/leaderboard.ts` — adds `Ilk10ScoreSubmission`, `Ilk10LeaderboardEntry`, `GameKey`
- `functions/api/scores.ts` — dispatches on `game`, adds ilk10 handlers + hardened bounds on ilk11
- `lib/leaderboard.ts` — all fns take a `game` param; ilk10 submission shape added
- `components/leaderboard-modal.tsx` — game switcher tab, uses `game`-aware fetch, renders per-game score shape
- `components/leaderboard-submit.tsx` — accepts a `game` discriminator + per-game payload
- `app/ilk10/page.tsx` — adds leaderboard button, renders `LeaderboardSubmit` on finish, imports from `lib/routes`
- `app/page.tsx` (ilk11, after rename) — imports from `lib/routes`, cross-link to `/ilk10`
- `package.json` — adds `build:ilk11-subdomain` + `db:migrate:0002*` scripts
- `.github/workflows/cloudflare-pages.yml` — ilk11 step deploys `out-ilk11`; new `play` step deploys `out/`

Deleted:
- `lib/site.ts` — replaced by `lib/routes.ts`

---

## Milestone 1 — Merge `ilk10` to `main`

Small, low-risk milestone. Two commits, one PR. After this merges, the running deploys don't change (already deploy from `main` via the workflow).

### Task 1: Commit the question-pack + rotation refactor

**Files:**
- Modify (already edited in working tree): `data/ilk10-questions.ts`
- Modify (already edited in working tree): `lib/ilk10.ts`

- [ ] **Step 1: Review the working-tree diff**

Run:
```bash
git diff data/ilk10-questions.ts lib/ilk10.ts
```
Expected: shows the Transfermarkt-sourced top-10 all-time scorers update and the new cycle-based rotation in `pickNonRepeatingIlk10Question`. No surprise edits.

- [ ] **Step 2: Stage just these two files**

Run:
```bash
git add data/ilk10-questions.ts lib/ilk10.ts
```

- [ ] **Step 3: Commit**

Run:
```bash
git commit -m "$(cat <<'EOF'
Refresh ilk10 all-time scorers and cycle-based rotation

Replaces the hand-curated top-10 Süper Lig scorers list with a
Transfermarkt-sourced version and switches the daily question picker to a
cycle-based non-repeating rotation keyed on a new epoch.
EOF
)"
```

- [ ] **Step 4: Verify the commit landed**

Run:
```bash
git log -1 --format="%H %s"
```
Expected: shows the new commit on the `ilk10` branch.

### Task 2: Commit the regenerated autocomplete index

**Files:**
- Modify (already edited in working tree): `registry/output/autocomplete.json`
- Modify (already edited in working tree): `registry/scripts/build-autocomplete-index.mjs`

- [ ] **Step 1: Review the builder script diff**

Run:
```bash
git diff registry/scripts/build-autocomplete-index.mjs
```
Expected: shows the builder refactor (125k-line index shrink).

- [ ] **Step 2: Spot-check the regenerated index is valid JSON**

Run:
```bash
node -e 'console.log(Object.keys(JSON.parse(require("fs").readFileSync("registry/output/autocomplete.json","utf8"))).slice(0,5))'
```
Expected: prints a short array of top-level keys (no SyntaxError).

- [ ] **Step 3: Stage and commit**

Run:
```bash
git add registry/scripts/build-autocomplete-index.mjs registry/output/autocomplete.json
git commit -m "$(cat <<'EOF'
Regenerate autocomplete index with smaller builder output

Shrinks the ilk10 autocomplete artifact by refactoring the index builder to
drop redundant fields.
EOF
)"
```

- [ ] **Step 4: Verify the commit landed**

Run:
```bash
git log -2 --format="%H %s"
```
Expected: the two new commits on top of `f230f69`.

### Task 3: Push `ilk10` and open the PR

**Files:** none (git/GitHub operation only).

- [ ] **Step 1: Push the branch**

Run:
```bash
git push origin ilk10
```
Expected: push succeeds; `origin/ilk10` advances to match local.

- [ ] **Step 2: Open the PR**

Run:
```bash
gh pr create --base main --head ilk10 --title "Bring ilk10 to main" --body "$(cat <<'EOF'
## Summary
- Adds the ilk10 game at `/ilk10` (subdomain `ilk10.otaliptus.com`) alongside ilk11.
- Ships the ilk10 autocomplete index, FBref season question pack, and rotation logic.
- Adds the two-project Cloudflare Pages workflow that was already in use on `main` via environment vars.

## Test plan
- [ ] CI build passes.
- [ ] `ilk11.otaliptus.com` continues to serve ilk11 unchanged.
- [ ] `ilk10.otaliptus.com` serves the ilk10 game and daily rotation resolves.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: prints the PR URL.

- [ ] **Step 3: Stop — let Talip review & merge**

Do NOT auto-merge. Leave the PR for human review. After Talip merges, Milestone 2 begins on a fresh branch off `main`.

---

## Milestone 2 — Consolidation to `play.otaliptus.com`

Starts **after Milestone 1 is merged** so the diff is scoped to the consolidation itself. Creates a single feature branch off `main`.

### Task 4: Start a fresh feature branch off `main`

- [ ] **Step 1: Fetch and check out**

Run:
```bash
git fetch origin main
git checkout -b feat/consolidate-play-domain origin/main
```
Expected: new branch created at `origin/main`.

- [ ] **Step 2: Confirm clean tree**

Run:
```bash
git status
```
Expected: `nothing to commit, working tree clean`.

### Task 5: Add the migration SQL

**Files:**
- Create: `migrations/0002_harden_scores_and_add_ilk10.sql`

- [ ] **Step 1: Create the migration file**

Write `migrations/0002_harden_scores_and_add_ilk10.sql` with exactly:

```sql
-- Hardens the ilk11 scores table with upper-bound CHECKs and adds ilk10_scores.
-- SQLite doesn't support ALTER TABLE ADD CHECK, so we recreate `scores`.

BEGIN TRANSACTION;

CREATE TABLE scores_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT NOT NULL CHECK(length(nickname) BETWEEN 1 AND 20),
  game_date TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK(difficulty IN ('easy', 'hard')),
  game_id INTEGER NOT NULL CHECK(game_id >= 0),
  match_name TEXT NOT NULL CHECK(length(match_name) BETWEEN 1 AND 120),
  solved INTEGER NOT NULL CHECK(solved >= 0 AND solved <= 11),
  total_attempts INTEGER NOT NULL CHECK(total_attempts >= 0 AND total_attempts <= 200),
  failed INTEGER NOT NULL CHECK(failed >= 0 AND failed <= 100),
  is_complete BOOLEAN NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(nickname, game_date, difficulty)
);

INSERT INTO scores_new
SELECT id, nickname, game_date, difficulty, game_id, match_name, solved, total_attempts, failed, is_complete, submitted_at
FROM scores
WHERE length(nickname) BETWEEN 1 AND 20
  AND length(match_name) BETWEEN 1 AND 120
  AND total_attempts BETWEEN 0 AND 200
  AND failed BETWEEN 0 AND 100;

DROP TABLE scores;
ALTER TABLE scores_new RENAME TO scores;
CREATE INDEX IF NOT EXISTS idx_scores_date ON scores(game_date);

CREATE TABLE IF NOT EXISTS ilk10_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT NOT NULL CHECK(length(nickname) BETWEEN 1 AND 20),
  game_date TEXT NOT NULL,
  question_id TEXT NOT NULL,
  question_label TEXT NOT NULL CHECK(length(question_label) BETWEEN 1 AND 120),
  found INTEGER NOT NULL CHECK(found >= 0 AND found <= 10),
  lives_used INTEGER NOT NULL CHECK(lives_used >= 0 AND lives_used <= 5),
  is_complete BOOLEAN NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(nickname, game_date, question_id)
);

CREATE INDEX IF NOT EXISTS idx_ilk10_scores_date ON ilk10_scores(game_date);

COMMIT;
```

- [ ] **Step 2: Dry-run the migration against a local D1**

Run:
```bash
npx wrangler d1 execute ilk11-leaderboard --local --file=migrations/0001_create_scores.sql
npx wrangler d1 execute ilk11-leaderboard --local --file=migrations/0002_harden_scores_and_add_ilk10.sql
```
Expected: both commands complete without error.

- [ ] **Step 3: Verify the new schema via D1 query**

Run:
```bash
npx wrangler d1 execute ilk11-leaderboard --local --command "SELECT sql FROM sqlite_master WHERE name IN ('scores','ilk10_scores');"
```
Expected: both `CREATE TABLE` statements reflect the new CHECK constraints.

- [ ] **Step 4: Verify CHECK constraints trip on bad data**

Run:
```bash
npx wrangler d1 execute ilk11-leaderboard --local --command "INSERT INTO scores (nickname,game_date,difficulty,game_id,match_name,solved,total_attempts,failed,is_complete) VALUES ('x','2026-04-16','easy',1,'m',1,9999,0,0);"
```
Expected: CHECK constraint failure on `total_attempts`.

- [ ] **Step 5: Commit**

Run:
```bash
git add migrations/0002_harden_scores_and_add_ilk10.sql
git commit -m "$(cat <<'EOF'
Harden ilk11 scores CHECKs and add ilk10_scores table

Recreates the ilk11 `scores` table with upper-bound CHECKs (nickname length,
attempts/failed caps) and introduces `ilk10_scores` with tight bounds for the
new ilk10 leaderboard.
EOF
)"
```

### Task 6: Add migration helper scripts to `package.json`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add two new scripts under `"scripts"`**

Insert these keys (after the existing `db:migrate:local`):

```json
"db:migrate:0002": "wrangler d1 execute ilk11-leaderboard --file=migrations/0002_harden_scores_and_add_ilk10.sql",
"db:migrate:0002:local": "wrangler d1 execute ilk11-leaderboard --local --file=migrations/0002_harden_scores_and_add_ilk10.sql",
```

- [ ] **Step 2: Verify they parse**

Run:
```bash
node -e 'JSON.parse(require("fs").readFileSync("package.json","utf8"))'
```
Expected: no output (no SyntaxError).

- [ ] **Step 3: Commit**

Run:
```bash
git add package.json
git commit -m "Add npm scripts for the 0002 migration"
```

### Task 7: Extend `types/leaderboard.ts` with ilk10 + game discriminator

**Files:**
- Modify: `types/leaderboard.ts`

- [ ] **Step 1: Replace the file with the generalized types**

Write `types/leaderboard.ts` with exactly:

```ts
export type GameKey = "ilk10" | "ilk11"

// ---- ilk11 ----

export interface Ilk11ScoreSubmission {
  game: "ilk11"
  nickname: string
  game_date: string
  difficulty: "easy" | "hard"
  game_id: number
  match_name: string
  solved: number
  total_attempts: number
  failed: number
  is_complete: boolean
}

export interface Ilk11LeaderboardEntry {
  game: "ilk11"
  rank: number
  nickname: string
  difficulty: "easy" | "hard"
  solved: number
  total_attempts: number
  failed: number
  is_complete: boolean
}

// ---- ilk10 ----

export interface Ilk10ScoreSubmission {
  game: "ilk10"
  nickname: string
  game_date: string
  question_id: string
  question_label: string
  found: number
  lives_used: number
  is_complete: boolean
}

export interface Ilk10LeaderboardEntry {
  game: "ilk10"
  rank: number
  nickname: string
  found: number
  lives_used: number
  is_complete: boolean
}

// ---- union types ----

export type ScoreSubmission = Ilk11ScoreSubmission | Ilk10ScoreSubmission
export type LeaderboardEntry = Ilk11LeaderboardEntry | Ilk10LeaderboardEntry

export interface Ilk11LeaderboardResponse {
  game: "ilk11"
  date: string
  matches: { easy: string | null; hard: string | null }
  rankings: Ilk11LeaderboardEntry[]
}

export interface Ilk10LeaderboardResponse {
  game: "ilk10"
  date: string
  question_label: string | null
  rankings: Ilk10LeaderboardEntry[]
}

export type LeaderboardResponse = Ilk11LeaderboardResponse | Ilk10LeaderboardResponse
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors (or only pre-existing ones unrelated to this file — this is a pure addition + tightening of existing types; any downstream breakage will be fixed in later tasks).

- [ ] **Step 3: Commit**

Run:
```bash
git add types/leaderboard.ts
git commit -m "Add GameKey union and ilk10 leaderboard types"
```

### Task 8: Rewrite `functions/api/scores.ts` for game dispatch + bounds

**Files:**
- Modify: `functions/api/scores.ts`

- [ ] **Step 1: Replace the file**

Write `functions/api/scores.ts` with exactly:

```ts
interface Env {
  DB: D1Database
}

interface Ilk11ScoreRow {
  id: number
  nickname: string
  game_date: string
  difficulty: "easy" | "hard"
  game_id: number
  match_name: string
  solved: number
  total_attempts: number
  failed: number
  is_complete: number
  submitted_at: string
}

interface Ilk10ScoreRow {
  id: number
  nickname: string
  game_date: string
  question_id: string
  question_label: string
  found: number
  lives_used: number
  is_complete: number
  submitted_at: string
}

type GameKey = "ilk10" | "ilk11"

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status })
}

function validateNickname(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed.length < 1 || trimmed.length > 20) return null
  return trimmed
}

function validateGameDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return value
}

function validateIntInRange(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null
  if (value < min || value > max) return null
  return value
}

function validateGameKey(value: unknown): GameKey | null {
  return value === "ilk10" || value === "ilk11" ? value : null
}

// ---- ilk11 ----

async function handleIlk11Post(context: { env: Env }, body: Record<string, unknown>): Promise<Response> {
  const nickname = validateNickname(body.nickname)
  if (!nickname) return jsonError("Nickname must be 1-20 characters", 400)

  const gameDate = validateGameDate(body.game_date)
  if (!gameDate) return jsonError("Invalid game_date format", 400)

  const difficulty = body.difficulty === "easy" || body.difficulty === "hard" ? body.difficulty : null
  if (!difficulty) return jsonError("Difficulty must be 'easy' or 'hard'", 400)

  const gameId = validateIntInRange(body.game_id, 0, Number.MAX_SAFE_INTEGER)
  if (gameId === null) return jsonError("Invalid game_id", 400)

  const matchNameRaw = typeof body.match_name === "string" ? body.match_name.trim() : ""
  if (matchNameRaw.length < 1 || matchNameRaw.length > 120) {
    return jsonError("match_name must be 1-120 characters", 400)
  }

  const solved = validateIntInRange(body.solved, 0, 11)
  if (solved === null) return jsonError("solved must be 0-11", 400)

  const totalAttempts = validateIntInRange(body.total_attempts, 0, 200)
  if (totalAttempts === null) return jsonError("total_attempts must be 0-200", 400)

  const failed = validateIntInRange(body.failed, 0, 100)
  if (failed === null) return jsonError("failed must be 0-100", 400)

  const isComplete = Boolean(body.is_complete)

  await context.env.DB.prepare(`
    INSERT OR REPLACE INTO scores
      (nickname, game_date, difficulty, game_id, match_name, solved, total_attempts, failed, is_complete)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    nickname,
    gameDate,
    difficulty,
    gameId,
    matchNameRaw,
    solved,
    totalAttempts,
    failed,
    isComplete ? 1 : 0,
  ).run()

  return Response.json({ success: true })
}

async function handleIlk11Get(context: { env: Env }, date: string): Promise<Response> {
  const { results } = await context.env.DB.prepare(`
    SELECT * FROM scores
    WHERE game_date = ?
    ORDER BY is_complete DESC, solved DESC, total_attempts ASC, submitted_at ASC
  `).bind(date).all<Ilk11ScoreRow>()

  const matches: { easy: string | null; hard: string | null } = { easy: null, hard: null }
  for (const row of results) {
    if (row.difficulty === "easy" && !matches.easy) matches.easy = row.match_name
    if (row.difficulty === "hard" && !matches.hard) matches.hard = row.match_name
  }

  const rankings: Array<{
    game: "ilk11"
    rank: number
    nickname: string
    difficulty: "easy" | "hard"
    solved: number
    total_attempts: number
    failed: number
    is_complete: boolean
  }> = []
  let currentRank = 1
  for (let i = 0; i < results.length; i++) {
    const row = results[i]
    if (i > 0) {
      const prev = results[i - 1]
      const isTie =
        row.is_complete === prev.is_complete &&
        row.solved === prev.solved &&
        row.total_attempts === prev.total_attempts
      if (!isTie) currentRank = i + 1
    }
    rankings.push({
      game: "ilk11",
      rank: currentRank,
      nickname: row.nickname,
      difficulty: row.difficulty,
      solved: row.solved,
      total_attempts: row.total_attempts,
      failed: row.failed,
      is_complete: Boolean(row.is_complete),
    })
  }

  return Response.json({ game: "ilk11", date, matches, rankings })
}

// ---- ilk10 ----

async function handleIlk10Post(context: { env: Env }, body: Record<string, unknown>): Promise<Response> {
  const nickname = validateNickname(body.nickname)
  if (!nickname) return jsonError("Nickname must be 1-20 characters", 400)

  const gameDate = validateGameDate(body.game_date)
  if (!gameDate) return jsonError("Invalid game_date format", 400)

  const questionIdRaw = typeof body.question_id === "string" ? body.question_id.trim() : ""
  if (questionIdRaw.length < 1 || questionIdRaw.length > 120) {
    return jsonError("question_id must be 1-120 characters", 400)
  }

  const questionLabelRaw = typeof body.question_label === "string" ? body.question_label.trim() : ""
  if (questionLabelRaw.length < 1 || questionLabelRaw.length > 120) {
    return jsonError("question_label must be 1-120 characters", 400)
  }

  const found = validateIntInRange(body.found, 0, 10)
  if (found === null) return jsonError("found must be 0-10", 400)

  const livesUsed = validateIntInRange(body.lives_used, 0, 5)
  if (livesUsed === null) return jsonError("lives_used must be 0-5", 400)

  const isComplete = Boolean(body.is_complete)

  await context.env.DB.prepare(`
    INSERT OR REPLACE INTO ilk10_scores
      (nickname, game_date, question_id, question_label, found, lives_used, is_complete)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    nickname,
    gameDate,
    questionIdRaw,
    questionLabelRaw,
    found,
    livesUsed,
    isComplete ? 1 : 0,
  ).run()

  return Response.json({ success: true })
}

async function handleIlk10Get(context: { env: Env }, date: string): Promise<Response> {
  const { results } = await context.env.DB.prepare(`
    SELECT * FROM ilk10_scores
    WHERE game_date = ?
    ORDER BY is_complete DESC, found DESC, lives_used ASC, submitted_at ASC
  `).bind(date).all<Ilk10ScoreRow>()

  let questionLabel: string | null = null
  for (const row of results) {
    if (!questionLabel) questionLabel = row.question_label
  }

  const rankings: Array<{
    game: "ilk10"
    rank: number
    nickname: string
    found: number
    lives_used: number
    is_complete: boolean
  }> = []
  let currentRank = 1
  for (let i = 0; i < results.length; i++) {
    const row = results[i]
    if (i > 0) {
      const prev = results[i - 1]
      const isTie =
        row.is_complete === prev.is_complete &&
        row.found === prev.found &&
        row.lives_used === prev.lives_used
      if (!isTie) currentRank = i + 1
    }
    rankings.push({
      game: "ilk10",
      rank: currentRank,
      nickname: row.nickname,
      found: row.found,
      lives_used: row.lives_used,
      is_complete: Boolean(row.is_complete),
    })
  }

  return Response.json({ game: "ilk10", date, question_label: questionLabel, rankings })
}

// ---- entry points ----

export const onRequestPost: PagesFunction<Env> = async (context) => {
  if (!context.env.DB) {
    return jsonError("D1 binding 'DB' not configured. Bind it in Cloudflare Pages → Settings → Functions → D1.", 500)
  }

  let body: Record<string, unknown>
  try {
    body = (await context.request.json()) as Record<string, unknown>
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const game = validateGameKey(body.game)
  if (!game) return jsonError("game must be 'ilk10' or 'ilk11'", 400)

  try {
    return game === "ilk11"
      ? await handleIlk11Post(context, body)
      : await handleIlk10Post(context, body)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("D1 insert error:", msg)
    return jsonError(`Database error: ${msg}`, 500)
  }
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  if (!context.env.DB) {
    return jsonError("D1 binding 'DB' not configured. Bind it in Cloudflare Pages → Settings → Functions → D1.", 500)
  }

  const url = new URL(context.request.url)
  const date = url.searchParams.get("date")
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonError("date parameter required (YYYY-MM-DD)", 400)
  }

  const gameParam = url.searchParams.get("game")
  const game = validateGameKey(gameParam)
  if (!game) return jsonError("game must be 'ilk10' or 'ilk11'", 400)

  try {
    return game === "ilk11"
      ? await handleIlk11Get(context, date)
      : await handleIlk10Get(context, date)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("D1 query error:", msg)
    return jsonError(`Database error: ${msg}`, 500)
  }
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors for this file (downstream callers will be updated in later tasks; if they break here, their tasks will fix them).

- [ ] **Step 3: Commit**

Run:
```bash
git add functions/api/scores.ts
git commit -m "$(cat <<'EOF'
Dispatch /api/scores on game and add ilk10 handlers

Splits POST/GET into per-game handlers and a shared validator layer. Tightens
ilk11 bounds (attempts 0-200, failed 0-100, nickname 1-20) and adds the
matching ilk10 bounds (found 0-10, lives 0-5). GET now requires
?game=ilk10|ilk11 in addition to the date param.
EOF
)"
```

### Task 9: Smoke-test the API locally with wrangler

**Files:** none.

- [ ] **Step 1: Build the static export**

Run:
```bash
npm run build
```
Expected: `out/` generated, no TS errors.

- [ ] **Step 2: Start wrangler pages dev with local D1**

Run in a background shell:
```bash
npx wrangler pages dev out --d1 DB=ilk11-leaderboard --local-protocol http --port 8788
```
Expected: wrangler is listening on `http://127.0.0.1:8788`.

- [ ] **Step 3: POST an ilk11 score**

Run:
```bash
curl -s -X POST http://127.0.0.1:8788/api/scores \
  -H 'Content-Type: application/json' \
  -d '{"game":"ilk11","nickname":"tester","game_date":"2026-04-16","difficulty":"easy","game_id":1,"match_name":"Galatasaray - Fenerbahce","solved":11,"total_attempts":15,"failed":2,"is_complete":true}'
```
Expected: `{"success":true}`.

- [ ] **Step 4: POST an ilk10 score**

Run:
```bash
curl -s -X POST http://127.0.0.1:8788/api/scores \
  -H 'Content-Type: application/json' \
  -d '{"game":"ilk10","nickname":"tester","game_date":"2026-04-16","question_id":"alltime-scorers","question_label":"Top 10 all-time Super Lig scorers","found":9,"lives_used":2,"is_complete":true}'
```
Expected: `{"success":true}`.

- [ ] **Step 5: GET both boards**

Run:
```bash
curl -s 'http://127.0.0.1:8788/api/scores?date=2026-04-16&game=ilk11'
curl -s 'http://127.0.0.1:8788/api/scores?date=2026-04-16&game=ilk10'
```
Expected: both return JSON with `rankings` arrays containing the rows you just posted.

- [ ] **Step 6: Confirm bounds reject**

Run:
```bash
curl -s -X POST http://127.0.0.1:8788/api/scores \
  -H 'Content-Type: application/json' \
  -d '{"game":"ilk11","nickname":"","game_date":"2026-04-16","difficulty":"easy","game_id":1,"match_name":"m","solved":1,"total_attempts":9999,"failed":0,"is_complete":false}'
```
Expected: `{"error":"Nickname must be 1-20 characters"}` (400).

- [ ] **Step 7: Stop wrangler dev** (foreground the background shell and Ctrl-C, or kill by port).

No commit here — this task is purely verification. If anything fails, back up and fix in the earlier task.

### Task 10: Update `lib/leaderboard.ts` for game-parameterized calls

**Files:**
- Modify: `lib/leaderboard.ts`

- [ ] **Step 1: Replace the file**

Write `lib/leaderboard.ts` with exactly:

```ts
import type {
  GameKey,
  Ilk10ScoreSubmission,
  Ilk11ScoreSubmission,
  LeaderboardResponse,
  ScoreSubmission,
} from "@/types/leaderboard"

const NICKNAME_KEY = "leaderboard_nickname"

export function getStoredNickname(): string | null {
  try {
    return localStorage.getItem(NICKNAME_KEY)
  } catch {
    return null
  }
}

export function setStoredNickname(name: string): void {
  try {
    localStorage.setItem(NICKNAME_KEY, name)
  } catch {
    // ignore storage errors
  }
}

function submissionKey(game: GameKey, key: string): string {
  return `leaderboard_submitted_${game}_${key}`
}

export function isAlreadySubmitted(game: GameKey, key: string): boolean {
  try {
    return localStorage.getItem(submissionKey(game, key)) === "1"
  } catch {
    return false
  }
}

export function markAsSubmitted(game: GameKey, key: string): void {
  try {
    localStorage.setItem(submissionKey(game, key), "1")
  } catch {
    // ignore storage errors
  }
}

export async function submitScore(data: ScoreSubmission): Promise<{ success: boolean }> {
  const res = await fetch("/api/scores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `Submit failed (${res.status})`)
  }
  return res.json()
}

export async function fetchLeaderboard(game: GameKey, date: string): Promise<LeaderboardResponse> {
  const url = `/api/scores?date=${encodeURIComponent(date)}&game=${encodeURIComponent(game)}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to load leaderboard (${res.status})`)
  }
  return res.json()
}

// Narrow helper types for callers that already know their game.
export type Ilk11SubmissionInput = Omit<Ilk11ScoreSubmission, "game">
export type Ilk10SubmissionInput = Omit<Ilk10ScoreSubmission, "game">

export function submitIlk11Score(input: Ilk11SubmissionInput) {
  return submitScore({ game: "ilk11", ...input })
}

export function submitIlk10Score(input: Ilk10SubmissionInput) {
  return submitScore({ game: "ilk10", ...input })
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit
```
Expected: errors in `components/leaderboard-submit.tsx` and `components/leaderboard-modal.tsx` (they use the old signatures). Those are fixed in the next tasks.

- [ ] **Step 3: Commit**

Run:
```bash
git add lib/leaderboard.ts
git commit -m "Parameterize lib/leaderboard.ts by GameKey"
```

### Task 11: Update `components/leaderboard-submit.tsx` for both games

**Files:**
- Modify: `components/leaderboard-submit.tsx`

- [ ] **Step 1: Replace the file**

Write `components/leaderboard-submit.tsx` with exactly:

```tsx
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Send } from "lucide-react"
import {
  submitScore,
  getStoredNickname,
  setStoredNickname,
  isAlreadySubmitted,
  markAsSubmitted,
} from "@/lib/leaderboard"
import { getTurkeyDateKey } from "@/lib/date"
import type { Ilk10ScoreSubmission, Ilk11ScoreSubmission } from "@/types/leaderboard"

type Ilk11Props = {
  game: "ilk11"
  submissionKey: string
  payload: Omit<Ilk11ScoreSubmission, "game" | "nickname" | "game_date">
}

type Ilk10Props = {
  game: "ilk10"
  submissionKey: string
  payload: Omit<Ilk10ScoreSubmission, "game" | "nickname" | "game_date">
}

type LeaderboardSubmitProps = Ilk11Props | Ilk10Props

export function LeaderboardSubmit(props: LeaderboardSubmitProps) {
  const { game, submissionKey } = props
  const [nickname, setNickname] = useState(getStoredNickname() ?? "")
  const [submitted, setSubmitted] = useState(isAlreadySubmitted(game, submissionKey))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    const trimmed = nickname.trim()
    if (!trimmed || trimmed.length > 20) {
      setError("Rumuz 1-20 karakter olmali")
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      if (props.game === "ilk11") {
        await submitScore({
          game: "ilk11",
          nickname: trimmed,
          game_date: getTurkeyDateKey(),
          ...props.payload,
        })
      } else {
        await submitScore({
          game: "ilk10",
          nickname: trimmed,
          game_date: getTurkeyDateKey(),
          ...props.payload,
        })
      }
      setStoredNickname(trimmed)
      markAsSubmitted(game, submissionKey)
      setSubmitted(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gonderme hatasi")
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex items-center justify-center gap-2 text-emerald-400 text-sm mt-3">
        <CheckCircle2 className="h-4 w-4" />
        <span>Skor gonderildi!</span>
      </div>
    )
  }

  return (
    <div className="mt-4 pt-4 border-t border-white/10 w-full">
      <p className="text-xs text-slate-400 text-center mb-2">Skor Tablosu</p>
      <div className="flex gap-2">
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          onFocus={(e) => {
            const target = e.target
            setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "center" }), 300)
          }}
          placeholder="Rumuz"
          maxLength={20}
          className="flex-1 bg-slate-800/60 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
        />
        <Button
          onClick={handleSubmit}
          disabled={submitting || !nickname.trim()}
          className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm px-3 disabled:opacity-50"
          size="sm"
        >
          {submitting ? (
            <span className="animate-pulse">...</span>
          ) : (
            <>
              <Send className="h-3.5 w-3.5 mr-1" />
              Gonder
            </>
          )}
        </Button>
      </div>
      {error && <p className="text-xs text-red-400 text-center mt-1">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Update the ilk11 caller in `app/page.tsx`** (the current ilk11 page — moved to `app/ilk11/page.tsx` in a later task; for now it still lives at `app/page.tsx`). Find the `<LeaderboardSubmit .../>` usage and replace its props with the new shape:

Search for the `<LeaderboardSubmit` JSX in `app/page.tsx` using grep:
```bash
grep -n "LeaderboardSubmit" app/page.tsx
```

Replace the old prop form:

```tsx
<LeaderboardSubmit
  gameId={dailyGameId}
  difficulty={difficulty}
  matchName={matchName}
  solved={solved}
  totalAttempts={totalAttempts}
  failed={failed}
  isComplete={isComplete}
/>
```

with the new form:

```tsx
<LeaderboardSubmit
  game="ilk11"
  submissionKey={`${dailyGameId}_${difficulty}`}
  payload={{
    difficulty,
    game_id: dailyGameId,
    match_name: matchName,
    solved,
    total_attempts: totalAttempts,
    failed,
    is_complete: isComplete,
  }}
/>
```

(Variable names on the left of `:` stay identical to the surrounding file — adjust if the existing file uses different local identifiers.)

- [ ] **Step 3: Typecheck**

Run:
```bash
npx tsc --noEmit
```
Expected: errors now only in `components/leaderboard-modal.tsx` (next task fixes).

- [ ] **Step 4: Commit**

Run:
```bash
git add components/leaderboard-submit.tsx app/page.tsx
git commit -m "Parameterize LeaderboardSubmit by GameKey and update ilk11 caller"
```

### Task 12: Add game switcher to `components/leaderboard-modal.tsx`

**Files:**
- Modify: `components/leaderboard-modal.tsx`

- [ ] **Step 1: Replace the file**

Write `components/leaderboard-modal.tsx` with exactly:

```tsx
"use client"

import { useState, useEffect, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Trophy } from "lucide-react"
import { fetchLeaderboard } from "@/lib/leaderboard"
import { getLastNDates, formatDateForDisplay } from "@/lib/date"
import type {
  GameKey,
  Ilk10LeaderboardEntry,
  Ilk10LeaderboardResponse,
  Ilk11LeaderboardEntry,
  Ilk11LeaderboardResponse,
  LeaderboardResponse,
} from "@/types/leaderboard"

interface LeaderboardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The game the user is currently playing (determines default tab + spoiler-hide logic). */
  activeGame: GameKey
  /** Whether the player has completed today's instance of `activeGame`. */
  isGameComplete: boolean
  /** For ilk11 only: which difficulty the player is on. Ignored for ilk10. */
  ilk11Difficulty?: "easy" | "hard"
}

function isIlk11Response(res: LeaderboardResponse): res is Ilk11LeaderboardResponse {
  return res.game === "ilk11"
}

function isIlk10Response(res: LeaderboardResponse): res is Ilk10LeaderboardResponse {
  return res.game === "ilk10"
}

export function LeaderboardModal({
  open,
  onOpenChange,
  activeGame,
  isGameComplete,
  ilk11Difficulty,
}: LeaderboardModalProps) {
  const dates = getLastNDates(7)
  const [selectedDate, setSelectedDate] = useState(dates[0])
  const [selectedGame, setSelectedGame] = useState<GameKey>(activeGame)
  const [selectedDifficulty, setSelectedDifficulty] = useState<"easy" | "hard">(ilk11Difficulty ?? "easy")
  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    fetchLeaderboard(selectedGame, selectedDate)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Yukleme hatasi"))
      .finally(() => setLoading(false))
  }, [open, selectedDate, selectedGame])

  const today = dates[0]

  // Hide today's scores until the user finishes (only for their active game).
  const hideScores =
    selectedDate === today &&
    (selectedGame === activeGame
      ? selectedGame === "ilk11"
        ? selectedDifficulty === (ilk11Difficulty ?? "easy") && !isGameComplete
        : !isGameComplete
      : true)

  const ilk11Rankings = useMemo<Ilk11LeaderboardEntry[]>(() => {
    if (!data || !isIlk11Response(data)) return []
    const filtered = data.rankings.filter((e) => e.difficulty === selectedDifficulty)
    let rank = 1
    return filtered.map((entry, i) => {
      if (i > 0) {
        const prev = filtered[i - 1]
        const isTie =
          entry.is_complete === prev.is_complete &&
          entry.solved === prev.solved &&
          entry.total_attempts === prev.total_attempts
        if (!isTie) rank = i + 1
      }
      return { ...entry, rank }
    })
  }, [data, selectedDifficulty])

  const ilk10Rankings = useMemo<Ilk10LeaderboardEntry[]>(() => {
    if (!data || !isIlk10Response(data)) return []
    return data.rankings
  }, [data])

  const ilk11MatchName =
    data && isIlk11Response(data) ? data.matches[selectedDifficulty] ?? null : null
  const ilk10QuestionLabel = data && isIlk10Response(data) ? data.question_label : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="font-mono sm:max-w-md glass rounded-2xl flex flex-col items-center min-h-[60vh] max-h-[85vh]">
        <DialogHeader className="w-full">
          <div className="flex items-center justify-center gap-2">
            <Trophy className="h-6 w-6 text-emerald-400" />
            <DialogTitle className="text-white text-lg">Skor Tablosu</DialogTitle>
          </div>
        </DialogHeader>

        {/* Game switcher */}
        <div className="flex gap-1 w-full">
          <button
            onClick={() => setSelectedGame("ilk11")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              selectedGame === "ilk11"
                ? "bg-sky-600 text-white"
                : "bg-slate-700/50 text-slate-400 hover:bg-slate-600/50"
            }`}
          >
            İlk 11
          </button>
          <button
            onClick={() => setSelectedGame("ilk10")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              selectedGame === "ilk10"
                ? "bg-emerald-600 text-white"
                : "bg-slate-700/50 text-slate-400 hover:bg-slate-600/50"
            }`}
          >
            İlk 10
          </button>
        </div>

        {/* Day selector */}
        <div className="grid grid-cols-7 gap-1 w-full py-1">
          {dates.map((date) => {
            const { dayName, dayNumber } = formatDateForDisplay(date)
            const isSelected = date === selectedDate
            const isToday = date === today
            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={`flex flex-col items-center py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  isSelected
                    ? "bg-emerald-600 text-white"
                    : isToday
                      ? "bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30"
                      : "bg-slate-700/50 text-slate-300 hover:bg-slate-600/50"
                }`}
              >
                <span className="text-[10px] leading-none">{dayName}</span>
                <span className="text-sm leading-tight">{dayNumber}</span>
              </button>
            )
          })}
        </div>

        {/* ilk11 difficulty toggle (only when showing ilk11) */}
        {selectedGame === "ilk11" && (
          <div className="flex gap-1 w-full">
            <button
              onClick={() => setSelectedDifficulty("easy")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                selectedDifficulty === "easy"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-700/50 text-slate-400 hover:bg-slate-600/50"
              }`}
            >
              Easy
            </button>
            <button
              onClick={() => setSelectedDifficulty("hard")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                selectedDifficulty === "hard"
                  ? "bg-red-600 text-white"
                  : "bg-slate-700/50 text-slate-400 hover:bg-slate-600/50"
              }`}
            >
              Hard
            </button>
          </div>
        )}

        {/* Match / question subtitle */}
        {selectedGame === "ilk11" && ilk11MatchName && (
          <div className="w-full text-xs text-slate-300 px-1">
            <span className="block break-words">{ilk11MatchName}</span>
          </div>
        )}
        {selectedGame === "ilk10" && ilk10QuestionLabel && (
          <div className="w-full text-xs text-slate-300 px-1">
            <span className="block break-words">{ilk10QuestionLabel}</span>
          </div>
        )}

        {/* Rankings */}
        <div className="w-full overflow-y-auto flex-1 min-h-0 mt-1">
          {loading && (
            <div className="space-y-2 p-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 rounded-lg bg-slate-700/30 animate-pulse" />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="text-center py-8 text-sm text-red-400">{error}</div>
          )}

          {!loading && !error && selectedGame === "ilk11" && ilk11Rankings.length === 0 && (
            <div className="text-center py-8 text-sm text-slate-400">Henuz skor yok</div>
          )}
          {!loading && !error && selectedGame === "ilk10" && ilk10Rankings.length === 0 && (
            <div className="text-center py-8 text-sm text-slate-400">Henuz skor yok</div>
          )}

          {!loading && !error && selectedGame === "ilk11" &&
            ilk11Rankings.map((entry, i) => {
              const rankDisplay =
                entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : `${entry.rank}`
              return (
                <div
                  key={`${entry.nickname}-${i}`}
                  className={`flex items-center gap-2 px-2 py-2 ${i % 2 === 0 ? "bg-slate-800/20" : ""} rounded-lg`}
                >
                  <span className="w-8 text-center text-sm font-bold text-slate-400 flex-shrink-0">
                    {hideScores ? "-" : rankDisplay}
                  </span>
                  <span className="flex-1 text-sm text-white truncate font-medium">{entry.nickname}</span>
                  <span className="w-20 text-right text-sm flex-shrink-0">
                    {hideScores ? (
                      <span className="text-slate-500">•••</span>
                    ) : entry.is_complete ? (
                      <span className="text-emerald-300 font-bold">
                        {entry.solved}/11{" "}
                        <span className="text-slate-400 font-normal text-xs">({entry.total_attempts})</span>
                      </span>
                    ) : (
                      <span className="text-red-400">❌</span>
                    )}
                  </span>
                </div>
              )
            })}

          {!loading && !error && selectedGame === "ilk10" &&
            ilk10Rankings.map((entry, i) => {
              const rankDisplay =
                entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : `${entry.rank}`
              return (
                <div
                  key={`${entry.nickname}-${i}`}
                  className={`flex items-center gap-2 px-2 py-2 ${i % 2 === 0 ? "bg-slate-800/20" : ""} rounded-lg`}
                >
                  <span className="w-8 text-center text-sm font-bold text-slate-400 flex-shrink-0">
                    {hideScores ? "-" : rankDisplay}
                  </span>
                  <span className="flex-1 text-sm text-white truncate font-medium">{entry.nickname}</span>
                  <span className="w-20 text-right text-sm flex-shrink-0">
                    {hideScores ? (
                      <span className="text-slate-500">•••</span>
                    ) : entry.is_complete ? (
                      <span className="text-emerald-300 font-bold">
                        {entry.found}/10{" "}
                        <span className="text-slate-400 font-normal text-xs">(-{entry.lives_used}♥)</span>
                      </span>
                    ) : (
                      <span className="text-red-400">❌</span>
                    )}
                  </span>
                </div>
              )
            })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Update the caller in `app/page.tsx`**

Find the `<LeaderboardModal` JSX and replace its props with:

```tsx
<LeaderboardModal
  open={showLeaderboard}
  onOpenChange={setShowLeaderboard}
  activeGame="ilk11"
  isGameComplete={isComplete}
  ilk11Difficulty={difficulty}
/>
```

(`showLeaderboard`, `setShowLeaderboard`, `isComplete`, `difficulty` already exist in `app/page.tsx`.)

- [ ] **Step 3: Typecheck**

Run:
```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 4: Commit**

Run:
```bash
git add components/leaderboard-modal.tsx app/page.tsx
git commit -m "Add ilk10/ilk11 switcher to LeaderboardModal and update ilk11 caller"
```

### Task 13: Replace `lib/site.ts` with `lib/routes.ts`

**Files:**
- Create: `lib/routes.ts`
- Delete: `lib/site.ts`
- Modify: `app/page.tsx`, `app/ilk10/page.tsx`, `lib/ilk10.ts`

- [ ] **Step 1: Create `lib/routes.ts`**

Write `lib/routes.ts` with exactly:

```ts
export const ILK10_PATH = "/ilk10"
export const ILK11_PATH = "/ilk11"

// Kept for share-text back-compat until share URLs move to play.otaliptus.com.
export const ILK10_SHARE_DOMAIN = "ilk10.otaliptus.com"
```

- [ ] **Step 2: Update imports in `app/page.tsx` (ilk11)**

Replace:
```ts
import { ILK10_PUBLIC_URL } from "@/lib/site"
```
with:
```ts
import { ILK10_PATH } from "@/lib/routes"
```

And the usage `href={ILK10_PUBLIC_URL}` becomes `href={ILK10_PATH}`.

- [ ] **Step 3: Update imports in `app/ilk10/page.tsx`**

Replace:
```ts
import { ILK11_PUBLIC_URL } from "@/lib/site"
```
with:
```ts
import { ILK11_PATH } from "@/lib/routes"
```

And `href={ILK11_PUBLIC_URL}` becomes `href={ILK11_PATH}`.

- [ ] **Step 4: Update import in `lib/ilk10.ts`**

Replace:
```ts
import { ILK10_SHARE_DOMAIN } from "@/lib/site"
```
with:
```ts
import { ILK10_SHARE_DOMAIN } from "@/lib/routes"
```

- [ ] **Step 5: Delete `lib/site.ts`**

Run:
```bash
git rm lib/site.ts
```

- [ ] **Step 6: Typecheck + build**

Run:
```bash
npx tsc --noEmit
npm run build
```
Expected: clean build; no references to `@/lib/site`.

- [ ] **Step 7: Commit**

Run:
```bash
git add lib/routes.ts app/page.tsx app/ilk10/page.tsx lib/ilk10.ts
git commit -m "Replace lib/site.ts with lib/routes.ts and switch to path-based cross-links"
```

### Task 14: Move ilk11 from `/` to `/ilk11`

**Files:**
- Move: `app/page.tsx` → `app/ilk11/page.tsx`
- Delete: `app/page.tsx` (after move; replaced in Task 15)

Next.js app-router uses the folder layout for routing — moving `app/page.tsx` to `app/ilk11/page.tsx` changes the URL from `/` to `/ilk11`. The file contents stay identical.

- [ ] **Step 1: Move the file with git**

Run:
```bash
mkdir -p app/ilk11
git mv app/page.tsx app/ilk11/page.tsx
```

- [ ] **Step 2: Typecheck + build**

Run:
```bash
npx tsc --noEmit
npm run build
```
Expected: build succeeds; `out/ilk11.html` exists; `out/index.html` does NOT exist yet (will be generated by the new landing page in Task 15).

- [ ] **Step 3: Commit**

Run:
```bash
git add -A
git commit -m "Move the ilk11 game page to /ilk11"
```

### Task 15: Create the `/` landing page

**Files:**
- Create: `app/page.tsx`

- [ ] **Step 1: Write the new landing page**

Write `app/page.tsx` with exactly:

```tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Trophy } from "lucide-react"
import { LeaderboardModal } from "@/components/leaderboard-modal"
import { ILK10_PATH, ILK11_PATH } from "@/lib/routes"
import { ILK10_QUESTIONS } from "@/data/ilk10-questions"
import { pickDailyIlk10Question } from "@/lib/ilk10"

const LAST_PLAYED_KEY = "last_played_game"
const AUTO_REDIRECT_DISABLED_KEY = "last_played_auto_redirect_disabled"

type GameKey = "ilk10" | "ilk11"

const ILK10_DATE_OVERRIDES: Record<string, string> = {
  "2026-04-12": "super-lig-title-coaches",
  "2026-04-19": "turkish-super-cup-winning-coaches",
}

function getIlk10TodayTeaser(): string {
  const live = ILK10_QUESTIONS.filter((q) => !q.designExample)
  const pick = pickDailyIlk10Question(live, new Date(), ILK10_DATE_OVERRIDES)
  return pick.question.shortLabel
}

export default function LandingPage() {
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [ilk10Teaser, setIlk10Teaser] = useState<string | null>(null)
  const [ilk11Teaser, setIlk11Teaser] = useState<string | null>(null)
  const [autoRedirectDisabled, setAutoRedirectDisabled] = useState(false)

  useEffect(() => {
    setIlk10Teaser(getIlk10TodayTeaser())
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const disabled = localStorage.getItem(AUTO_REDIRECT_DISABLED_KEY) === "1"
      setAutoRedirectDisabled(disabled)
      if (disabled) return

      const stored = localStorage.getItem(LAST_PLAYED_KEY) as GameKey | null
      if (stored === "ilk10" || stored === "ilk11") {
        const path = stored === "ilk10" ? ILK10_PATH : ILK11_PATH
        window.location.replace(path)
      }
    } catch {
      // ignore storage errors
    }
  }, [])

  // ilk11 teaser: read the easy CSV head to find today's match name.
  useEffect(() => {
    const buildId = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"
    fetch(`/easy.csv?v=${encodeURIComponent(buildId)}`)
      .then((res) => res.text())
      .then((text) => {
        const firstDataLine = text.split("\n")[1]?.trim()
        if (!firstDataLine) return
        const match = firstDataLine.split(",")[0]?.replace(/"/g, "").trim()
        if (match) setIlk11Teaser(match)
      })
      .catch(() => {
        // ignore — teaser is optional
      })
  }, [])

  const handleToggleAutoRedirect = () => {
    try {
      const next = !autoRedirectDisabled
      setAutoRedirectDisabled(next)
      localStorage.setItem(AUTO_REDIRECT_DISABLED_KEY, next ? "1" : "0")
    } catch {
      // ignore
    }
  }

  return (
    <main className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-white">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.08),transparent_60%)]" />

      <div className="relative mx-auto max-w-3xl px-4 py-10 flex flex-col gap-8">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold font-mono tracking-tight">
            <span className="text-emerald-400">otaliptus</span>
            <span className="text-slate-300"> · play</span>
          </h1>
          <Button
            onClick={() => setShowLeaderboard(true)}
            className="bg-slate-800/70 hover:bg-slate-700 border border-white/10 text-white rounded-xl text-sm"
            size="sm"
          >
            <Trophy className="h-4 w-4 mr-2 text-emerald-400" />
            Skor Tablosu
          </Button>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href={ILK11_PATH}
            className="group rounded-2xl border border-sky-400/20 bg-slate-900/60 p-5 hover:border-sky-400/50 transition-colors flex flex-col gap-3 min-h-[180px]"
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-sky-400/50 text-sm font-bold text-sky-300">
                11
              </span>
              <h2 className="text-xl font-extrabold font-mono">İlk 11</h2>
            </div>
            <p className="text-sm text-slate-300 leading-snug">
              Bugünkü Süper Lig maçının ilk 11&apos;ini tahmin et. Easy / Hard.
            </p>
            {ilk11Teaser && (
              <p className="text-xs text-slate-400 font-mono mt-auto">Bugün: {ilk11Teaser}</p>
            )}
          </Link>

          <Link
            href={ILK10_PATH}
            className="group rounded-2xl border border-emerald-400/20 bg-slate-900/60 p-5 hover:border-emerald-400/50 transition-colors flex flex-col gap-3 min-h-[180px]"
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-400/50 text-sm font-bold text-emerald-300">
                10
              </span>
              <h2 className="text-xl font-extrabold font-mono">İlk 10</h2>
            </div>
            <p className="text-sm text-slate-300 leading-snug">
              Günlük sıralama: 10 kişilik listeyi 5 canla bul.
            </p>
            {ilk10Teaser && (
              <p className="text-xs text-slate-400 font-mono mt-auto">Bugün: {ilk10Teaser}</p>
            )}
          </Link>
        </section>

        <section className="text-center">
          <label className="inline-flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRedirectDisabled}
              onChange={handleToggleAutoRedirect}
              className="accent-emerald-500"
            />
            Son oynadığım oyuna otomatik yönlendirme
          </label>
        </section>
      </div>

      <LeaderboardModal
        open={showLeaderboard}
        onOpenChange={setShowLeaderboard}
        activeGame="ilk11"
        isGameComplete={false}
      />
    </main>
  )
}
```

- [ ] **Step 2: Add `last_played_game` writes from the game pages**

In `app/ilk11/page.tsx`, near the top-level client effects (e.g., inside the `useEffect` that runs on mount), add:

```ts
try {
  localStorage.setItem("last_played_game", "ilk11")
} catch {}
```

In `app/ilk10/page.tsx`, add the matching line with `"ilk10"`:

```ts
try {
  localStorage.setItem("last_played_game", "ilk10")
} catch {}
```

Place each inside an existing `useEffect(() => { ... }, [])` at the top of the component — does not matter which as long as it fires on mount. Keep it inside a try/catch for SSR/export safety.

- [ ] **Step 3: Build and visually check**

Run:
```bash
npm run build
```
Expected: build succeeds; `out/index.html` exists and renders the two cards.

- [ ] **Step 4: Smoke test locally**

Run in the foreground:
```bash
npm run dev
```
Open `http://localhost:3000/`. Confirm:
- Two cards render, the ilk10 teaser shows a short question label, the ilk11 teaser shows a match name after a moment.
- Clicking each card routes to the correct game.
- "Skor Tablosu" button opens the modal with an ilk11/ilk10 switcher and the date picker.
- After visiting a game page, reload `/`: you get redirected to that game. Toggle the checkbox to disable auto-redirect, reload `/`: landing stays.

Stop the dev server.

- [ ] **Step 5: Commit**

Run:
```bash
git add app/page.tsx app/ilk11/page.tsx app/ilk10/page.tsx
git commit -m "Add play.otaliptus.com landing page with two-card picker + auto-redirect"
```

### Task 16: Wire ilk10 leaderboard UI into `app/ilk10/page.tsx`

**Files:**
- Modify: `app/ilk10/page.tsx`

- [ ] **Step 1: Add the leaderboard imports near the top of the file**

Add:
```tsx
import { LeaderboardModal } from "@/components/leaderboard-modal"
import { LeaderboardSubmit } from "@/components/leaderboard-submit"
import { Trophy } from "lucide-react"
```

(`Trophy` is from `lucide-react`; the rest of the imports are additive.)

- [ ] **Step 2: Add state for the leaderboard modal**

Near the existing `useState` block at the top of `Ilk10Page`, add:
```tsx
const [showLeaderboard, setShowLeaderboard] = useState(false)
```

- [ ] **Step 3: Add a leaderboard trigger button in the header row**

Locate the header / top-of-page area (where the hearts/lives display is rendered, around the `ILK10_MAX_LIVES`-from-array block). Add a button aligned to the right:

```tsx
<Button
  onClick={() => setShowLeaderboard(true)}
  className="bg-slate-800/70 hover:bg-slate-700 border border-white/10 text-white rounded-xl text-sm"
  size="sm"
>
  <Trophy className="h-4 w-4 mr-2 text-emerald-400" />
  Skor Tablosu
</Button>
```

Keep the existing lives display; place this button on the same row (flex container, `justify-between` between lives and button).

- [ ] **Step 4: Render the `LeaderboardSubmit` inside the summary dialog after a win/finish**

Inside the `<DialogContent>` of the summary dialog (the block that shows Score/Lives/Guesses), below the "Share" button, add:

```tsx
<LeaderboardSubmit
  game="ilk10"
  submissionKey={`${DAILY_QUESTION.id}_${DAILY_PICK.dateKey}`}
  payload={{
    question_id: DAILY_QUESTION.id,
    question_label: DAILY_QUESTION.shortLabel,
    found: gameState.foundIndexes.length,
    lives_used: gameState.missCount,
    is_complete: isIlk10Solved(DAILY_QUESTION, gameState),
  }}
/>
```

- [ ] **Step 5: Render the modal at the end of the component's returned JSX**

Just before the closing `</main>`:

```tsx
<LeaderboardModal
  open={showLeaderboard}
  onOpenChange={setShowLeaderboard}
  activeGame="ilk10"
  isGameComplete={isIlk10Finished(DAILY_QUESTION, gameState)}
/>
```

- [ ] **Step 6: Typecheck + build**

Run:
```bash
npx tsc --noEmit
npm run build
```
Expected: clean.

- [ ] **Step 7: Local smoke test**

Run `npm run dev`, play ilk10 to completion, confirm:
- "Skor Tablosu" button opens the modal with game switcher.
- Summary dialog shows the nickname form; submitting writes to the local D1 (requires wrangler dev running separately for the API call; otherwise expect a network error, which is fine for the static build smoke).

Stop dev server.

- [ ] **Step 8: Commit**

Run:
```bash
git add app/ilk10/page.tsx
git commit -m "Wire ilk10 leaderboard modal trigger and score submit"
```

### Task 17: Add the ilk11 subdomain prepare script

**Files:**
- Create: `cloudflare/prepare-ilk11-subdomain.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the prepare script**

Write `cloudflare/prepare-ilk11-subdomain.mjs` with exactly:

```js
#!/usr/bin/env node

import fs from "node:fs/promises"
import path from "node:path"

const repoRoot = process.cwd()
const outDir = path.join(repoRoot, "out")
const targetDir = path.join(repoRoot, "out-ilk11")

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function main() {
  if (!(await exists(outDir))) {
    throw new Error(`Missing "${outDir}". Run "npm run build" first.`)
  }

  await fs.rm(targetDir, { recursive: true, force: true })
  await fs.cp(outDir, targetDir, { recursive: true })

  // Preserve the legacy subdomain behaviour: ilk11.otaliptus.com/ should land
  // on the ilk11 game, not the new landing page.
  const redirectsPath = path.join(targetDir, "_redirects")
  const existing = (await exists(redirectsPath)) ? await fs.readFile(redirectsPath, "utf8") : ""
  const header = "# Added by cloudflare/prepare-ilk11-subdomain.mjs\n/  /ilk11  301\n"
  await fs.writeFile(redirectsPath, header + existing, "utf8")

  console.log(`[cloudflare] prepared ilk11 subdomain bundle at ${targetDir}`)
}

await main()
```

- [ ] **Step 2: Add a package.json script**

Insert (near the existing `build:ilk10-subdomain`):

```json
"build:ilk11-subdomain": "node cloudflare/prepare-ilk11-subdomain.mjs",
```

- [ ] **Step 3: Dry-run**

Run:
```bash
npm run build
node cloudflare/prepare-ilk11-subdomain.mjs
ls out-ilk11/_redirects && head -n 3 out-ilk11/_redirects
```
Expected: `_redirects` exists and starts with the `/ /ilk11 301` line.

- [ ] **Step 4: Commit**

Run:
```bash
git add cloudflare/prepare-ilk11-subdomain.mjs package.json
git commit -m "Add ilk11 subdomain bundle prep with / → /ilk11 redirect"
```

### Task 18: Extend the CI workflow

**Files:**
- Modify: `.github/workflows/cloudflare-pages.yml`

- [ ] **Step 1: Replace the workflow**

Overwrite `.github/workflows/cloudflare-pages.yml` with exactly:

```yaml
name: Cloudflare Pages

on:
  push:
    branches:
      - main
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CF_PAGES_PROJECT_PLAY: ${{ vars.CF_PAGES_PROJECT_PLAY || 'play' }}
      CF_PAGES_PROJECT_ILK11: ${{ vars.CF_PAGES_PROJECT_ILK11 || 'missing-eleven-tr' }}
      CF_PAGES_PROJECT_ILK10: ${{ vars.CF_PAGES_PROJECT_ILK10 || 'ilk10' }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build static export
        run: npm run build

      - name: Prepare ilk10 subdomain bundle
        run: node cloudflare/prepare-ilk10-subdomain.mjs

      - name: Prepare ilk11 subdomain bundle
        run: node cloudflare/prepare-ilk11-subdomain.mjs

      - name: Ensure play Pages project exists
        run: |
          if ! npx wrangler pages project list | grep -q "^│ ${CF_PAGES_PROJECT_PLAY} "; then
            npx wrangler pages project create "${CF_PAGES_PROJECT_PLAY}" --production-branch main
          fi

      - name: Ensure ilk10 Pages project exists
        run: |
          if ! npx wrangler pages project list | grep -q "^│ ${CF_PAGES_PROJECT_ILK10} "; then
            npx wrangler pages project create "${CF_PAGES_PROJECT_ILK10}" --production-branch main
          fi

      - name: Deploy play Pages project
        run: >
          npx wrangler pages deploy out
          --project-name="${CF_PAGES_PROJECT_PLAY}"
          --branch=main
          --commit-hash="${GITHUB_SHA}"
          --commit-message="${GITHUB_SHA}"

      - name: Deploy ilk11 Pages project
        run: >
          npx wrangler pages deploy out-ilk11
          --project-name="${CF_PAGES_PROJECT_ILK11}"
          --branch=main
          --commit-hash="${GITHUB_SHA}"
          --commit-message="${GITHUB_SHA}"

      - name: Deploy ilk10 Pages project
        run: >
          npx wrangler pages deploy out-ilk10
          --project-name="${CF_PAGES_PROJECT_ILK10}"
          --branch=main
          --commit-hash="${GITHUB_SHA}"
          --commit-message="${GITHUB_SHA}"
```

Key differences from today:
- Drops the `NEXT_PUBLIC_ILK11_URL`/`NEXT_PUBLIC_ILK10_URL`/`NEXT_PUBLIC_ILK10_SHARE_DOMAIN` env vars (no longer referenced after `lib/routes.ts` swap; share domain is inlined).
- Adds a new `play` project deploy step.
- Switches the ilk11 deploy to `out-ilk11` (was `out`).

- [ ] **Step 2: Commit**

Run:
```bash
git add .github/workflows/cloudflare-pages.yml
git commit -m "Extend CI to deploy play, ilk11 (out-ilk11), and ilk10 bundles"
```

### Task 19: End-to-end build + full-site smoke

**Files:** none.

- [ ] **Step 1: Clean build**

Run:
```bash
rm -rf .next out out-ilk10 out-ilk11
npm run build
node cloudflare/prepare-ilk10-subdomain.mjs
node cloudflare/prepare-ilk11-subdomain.mjs
```
Expected: all three directories exist and contain `index.html`.

- [ ] **Step 2: Verify the ilk11 bundle still routes `/` to the game**

Run:
```bash
head -n 3 out-ilk11/_redirects
```
Expected: `/  /ilk11  301` line present.

- [ ] **Step 3: Verify the play bundle has all three HTML entrypoints**

Run:
```bash
ls out/index.html out/ilk10.html out/ilk11.html
```
Expected: all three files exist.

- [ ] **Step 4: Dev-mode smoke**

Run `npm run dev`. Open `http://localhost:3000/`, `/ilk11`, `/ilk10`. Confirm each renders and cross-links still work.

Stop the dev server.

No commit here — this task is verification only. If anything fails, back up to the relevant task and fix.

### Task 20: Open the consolidation PR

**Files:** none.

- [ ] **Step 1: Push the branch**

Run:
```bash
git push -u origin feat/consolidate-play-domain
```

- [ ] **Step 2: Open the PR**

Run:
```bash
gh pr create --base main --head feat/consolidate-play-domain --title "Add play.otaliptus.com with shared leaderboard" --body "$(cat <<'EOF'
## Summary
- Adds a game-picker landing page at `/` and moves the ilk11 game to `/ilk11`.
- Adds a shared `LeaderboardModal` game switcher and writes ilk10 scores to a new `ilk10_scores` table.
- Hardens the ilk11 `scores` table with upper-bound CHECKs (nickname length, attempts ≤ 200, failed ≤ 100). Matching bounds enforced in the API.
- New Cloudflare Pages deploy target `play.otaliptus.com`. Existing `ilk10.otaliptus.com` and `ilk11.otaliptus.com` are unchanged (`ilk11.` gets a `_redirects` entry so `/` still serves the ilk11 game).

## Manual Cloudflare steps (do before merging to main, or carefully after)
- [ ] Create the `play` Cloudflare Pages project (or let the CI step auto-create it).
- [ ] Bind D1 database `ilk11-leaderboard` to the `play` project with binding name `DB`.
- [ ] Add `play.otaliptus.com` as a custom domain on the `play` project.
- [ ] Run `npm run db:migrate:0002` against production D1.

## Test plan
- [ ] Landing `/` shows two cards with today's teasers.
- [ ] `/ilk11` plays the ilk11 game and submits to `/api/scores`; leaderboard modal shows the row.
- [ ] `/ilk10` plays the ilk10 game, submits, and the modal's ilk10 tab shows the row.
- [ ] `ilk11.otaliptus.com/` redirects to `/ilk11` and plays the game.
- [ ] `ilk10.otaliptus.com` unchanged.
- [ ] Invalid POSTs (too-long nickname, out-of-bounds attempts) return 400 with specific errors.

## Non-goals (future work)
- DNS cutover of ilk10/ilk11 subdomains to `play`.
- Deletion of the old Pages projects.
- Social login.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: PR URL printed.

- [ ] **Step 3: Stop — hand off to Talip for review, manual Cloudflare steps, and merge.**

Do NOT auto-merge. After Talip completes the manual Cloudflare steps (create `play` project, bind D1, add custom domain, run migration), he merges the PR and the CI deploys all three bundles.

---

## Self-review notes

- [x] Every spec requirement has a task: landing (14, 15), ilk11-at-`/ilk11` (14), ilk10 leaderboard (16), shared identity (10 keeps single `leaderboard_nickname` key), DB hardening (5), API dispatch + bounds (8), `_redirects` for ilk11 subdomain (17), third Pages deploy (18), lib/site.ts removal (13), no teardown of existing deploys (explicit in Task 20 PR body), social-login-ready schema (types & schema keep nickname column unchanged, future migration will add `player_id`).
- [x] No placeholders. Every step has a concrete command or a full code block.
- [x] Type consistency: `GameKey` used in types, lib, components, API. `submissionKey` is the localStorage dedupe key, shared between `LeaderboardSubmit` props and `lib/leaderboard.ts`. `Ilk10ScoreSubmission`, `Ilk10LeaderboardEntry`, `Ilk10LeaderboardResponse` consistent across types → API → lib → component.
- [x] Scope: two milestones, one plan file. PR 1 is purely a git merge. PR 2 is a single feature branch with ~17 tasks, each committed.
