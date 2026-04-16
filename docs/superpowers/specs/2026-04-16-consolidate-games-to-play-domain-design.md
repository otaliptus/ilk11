# Consolidating ilk10 + ilk11 onto `play.otaliptus.com`

**Date:** 2026-04-16
**Status:** Approved (pending user review of this spec)
**Author:** pair-brainstormed

## Problem

Two daily football-trivia games, `ilk11` and `ilk10`, currently live on separate Cloudflare Pages projects behind two subdomains (`ilk11.otaliptus.com`, `ilk10.otaliptus.com`). Only `ilk11` has a leaderboard, backed by a Cloudflare D1 database and a Pages Function. The `ilk10` subdomain is a slimmed static bundle with no API and no leaderboard.

Goals:
1. Bring `ilk10` onto the same leaderboard infrastructure as `ilk11`.
2. Give both games a shared home at a new domain `play.otaliptus.com` with a game-picker landing page.
3. Share player identity (nickname now, account later) across the two games.
4. Do so without tearing down the existing `ilk10.` and `ilk11.` deploys — both keep working exactly as they do today.
5. Set the schema and cookie shape now so social login can be added later as a non-breaking second milestone.

Non-goals for this spec:
- DNS cutover of `ilk10.` / `ilk11.` subdomains to the new domain.
- Deletion of old Pages projects.
- Zone-level Bulk Redirects.
- Social login itself (sketched in the "Future work" section below as a forward-compatibility check only).

## Architecture overview

```
                       Cloudflare DNS
                       /      |      \
                      /       |       \
          ilk10.otaliptus.com ilk11.otaliptus.com play.otaliptus.com
              |               |                    |
        Pages: ilk10    Pages: missing-eleven-tr   Pages: play (NEW)
        out-ilk10/      out-ilk11/                 out/
        (slice)         (slice + functions)        (full + functions)
              \         |                          /
               \        +----+       +-------------+
                \            |       |
                           D1: ilk11-leaderboard (shared)
                             tables: scores, ilk10_scores
```

- **Single Next.js static-export app** produces the full consolidated site in `out/`.
- **Three Pages projects** deployed from a single `main` push:
  - `play` — new, deploys `out/` as-is. Hosts the landing page, `/ilk10`, `/ilk11`, and `/api/scores`.
  - `missing-eleven-tr` — existing ilk11 project. Deploys `out-ilk11/` (full site + a `_redirects` entry so `/ → /ilk11`). Keeps serving `ilk11.otaliptus.com` exactly as today. Still has `/api/scores`.
  - `ilk10` — existing ilk10 project. Deploys `out-ilk10/` (unchanged slice). Still API-less as today.
- **Single D1 database** `ilk11-leaderboard` continues; its binding `DB` is attached to `play` and `missing-eleven-tr` projects. Two tables: existing `scores` (ilk11) and new `ilk10_scores`.

## Routes

Paths on the consolidated site:

| Path             | Content                                                         |
|------------------|-----------------------------------------------------------------|
| `/`              | Game picker landing page (two cards, teaser, last-played logic) |
| `/ilk11`         | The existing ilk11 game (moved from `/` to this path)           |
| `/ilk10`         | The existing ilk10 game (unchanged)                             |
| `/api/scores`    | Leaderboard POST/GET, routes on `game` param                    |

On `play.otaliptus.com`: `/` shows the landing page.
On `ilk11.otaliptus.com`: `/` is redirected to `/ilk11` by a `_redirects` file in the ilk11 bundle, so the old subdomain continues to feel like a single-game site.
On `ilk10.otaliptus.com`: unchanged — its bundle only contains the ilk10 page served at the root.

### Landing page

File: `app/page.tsx` (new, replaces the current ilk11 page which moves to `app/ilk11/page.tsx`).

Content:
- Site title / logo.
- Two large cards side-by-side: "İlk 11" and "İlk 10". Each card shows a one-line description and a teaser for today (match name for ilk11 via the CSV head; shortLabel for ilk10 from the question picker). Tapping a card navigates to the game path.
- A "Skor Tablosu" button that opens the shared leaderboard modal (game switcher visible).
- An optional "Son oynadığını hatırla" (remember last played) toggle that writes `last_played_game` to localStorage. If present and non-null on a future visit, the landing page redirects (client-side) to that game path automatically. A visible "I'd rather pick" affordance lets the user opt out of auto-redirect.

Educational note: the landing page is client-only (`"use client"`) — the teaser data comes from the same CSV and question pack that the games already fetch. No new server-side fetches.

## Data model

### Existing `scores` table (ilk11)

Current schema in `migrations/0001_create_scores.sql`:

```sql
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT NOT NULL,
  game_date TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK(difficulty IN ('easy', 'hard')),
  game_id INTEGER NOT NULL,
  match_name TEXT NOT NULL,
  solved INTEGER NOT NULL CHECK(solved >= 0 AND solved <= 11),
  total_attempts INTEGER NOT NULL CHECK(total_attempts >= 0),
  failed INTEGER NOT NULL CHECK(failed >= 0),
  is_complete BOOLEAN NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(nickname, game_date, difficulty)
);
```

Missing bounds today: nickname length, upper bound on `total_attempts` and `failed`. We harden these in a migration.

### New `ilk10_scores` table

```sql
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
```

Ranking order (server-side): `is_complete DESC, found DESC, lives_used ASC, submitted_at ASC`. Mirrors the ilk11 logic.

### Hardening migration for `scores`

SQLite doesn't support `ALTER TABLE ADD CHECK`, so we recreate:

```sql
-- migrations/0002_harden_scores_and_add_ilk10.sql

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

-- ilk10_scores (inline)
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

Rows that fail the new constraints are dropped on copy. With current user counts (~zero), this is acceptable. If that changes before deploy, we log-and-skip instead.

### API layer validation

`functions/api/scores.ts` today validates the ilk11 shape. It will be generalized:
- Both POST and GET accept a `game` discriminator (`"ilk10" | "ilk11"`).
- POST dispatches to one of two validators and writes to the matching table.
- GET returns both games' rankings when `game` is omitted (landing page uses this), or just one when `game` is provided.
- Validation bounds mirror the DB constraints exactly, so a valid-at-API payload is always a valid-at-DB payload.

## Identity

- `leaderboard_nickname` key in `localStorage` continues to back both games. Scope is origin, so `play.otaliptus.com` has its own store (cold start for users migrating from the old subdomains). The `ilk10.` and `ilk11.` subdomains keep their own copies too — fine during the coexistence phase.
- Schema is forward-compatible with accounts: when social login lands, add `player_id INTEGER NULL REFERENCES players(id)` to both score tables. Anonymous nickname rows stay valid.

## Cloudflare / build / CI

### Build scripts

- `npm run build` → `out/` (consolidated site, no redirects).
- `node cloudflare/prepare-ilk10-subdomain.mjs` → `out-ilk10/` (unchanged — still the ilk10 slice).
- `node cloudflare/prepare-ilk11-subdomain.mjs` (NEW) → `out-ilk11/` (copy of `out/` + a `_redirects` file containing `/  /ilk11  301`). Functions continue to be picked up from repo-root `/functions`.

### CI

`.github/workflows/cloudflare-pages.yml` gets a third deploy step:

```yaml
- name: Deploy play Pages project
  run: >
    npx wrangler pages deploy out
    --project-name="${CF_PAGES_PROJECT_PLAY}"
    --branch=main
    --commit-hash="${GITHUB_SHA}"
    --commit-message="${GITHUB_SHA}"
```

with `CF_PAGES_PROJECT_PLAY` defaulting to `play`. The existing two deploy steps are unchanged except the ilk11 step deploys `out-ilk11` instead of `out`.

### DNS

Single new record: `play.otaliptus.com` CNAME → Pages. No change to existing records. Cloudflare custom domain binding on the `play` project.

### D1 binding

Add the existing `ilk11-leaderboard` D1 as a binding named `DB` on the new `play` Pages project. No migration of data; both projects read/write the same physical DB.

## lib/site.ts → lib/routes.ts

`lib/site.ts` currently exposes three absolute-URL constants used for cross-linking and sharing. On the consolidated site, cross-links become paths:

```ts
// lib/routes.ts
export const ILK10_PATH = "/ilk10"
export const ILK11_PATH = "/ilk11"

// Kept for share-text back-compat until we migrate share URLs to play.otaliptus.com.
export const ILK10_SHARE_DOMAIN = "ilk10.otaliptus.com"
```

Footer links in both game pages switch from absolute URLs to these paths. Share text for ilk10 keeps using the old share domain until Phase 2 (not in this spec).

## Error handling

- API returns `400` for out-of-bounds values with a specific reason; `500` on DB binding missing or insert/select failures. Unchanged from today for the existing ilk11 path.
- Frontend leaderboard fetch errors surface inline in the modal (already the pattern).
- Migration is idempotent (`IF NOT EXISTS` + transaction); running it twice on the same DB is a no-op after the first successful run.

## Testing plan

Manual (no automated test harness exists in this repo):
1. **Migration**: run `wrangler d1 execute ilk11-leaderboard --local --file=migrations/0002_harden_scores_and_add_ilk10.sql` on a local D1; verify old rows preserved with new constraints; verify `ilk10_scores` exists.
2. **Landing**: load `/` locally, see two cards with today's teasers. Click each → correct game loads. Toggle "remember", reload, confirm redirect; disable, reload, confirm landing returns.
3. **ilk11 at `/ilk11`**: load the moved page; play a game; submit a score; verify leaderboard modal shows it under ilk11 tab. Bookmark-equivalent test: `ilk11.otaliptus.com/` in a preview deploy redirects to `/ilk11` and the game still works.
4. **ilk10 leaderboard**: play ilk10; submit a score with a nickname; verify DB row exists in `ilk10_scores` with expected columns; open modal → ilk10 tab shows it; switch to ilk11 tab → ilk10 entries don't leak in.
5. **Bounds**: attempt a POST with `solved: 99`, `nickname: ""`, `total_attempts: 9999`. Each returns 400 with a specific error.
6. **Cross-game identity**: set nickname in ilk11, play ilk10, submit — same nickname appears on both boards.
7. **Coexistence**: verify `ilk10.otaliptus.com` and `ilk11.otaliptus.com` still serve their existing experiences unchanged.

## Rollout (phasing)

Two PRs.

### PR 1 — Merge `ilk10` to `main`

Scope:
- Commit the current working-tree changes on the `ilk10` branch (question-pack refresh, rotation refactor in `lib/ilk10.ts`, regenerated autocomplete index, build-script changes).
- Open the existing branch as a PR to `main` and merge.

No user-visible change. Both subdomains deploy from `main` as configured today.

### PR 2 — Consolidate to `play.otaliptus.com`

Scope:
- `app/page.tsx` (new landing) + move current `app/page.tsx` to `app/ilk11/page.tsx`.
- New `migrations/0002_harden_scores_and_add_ilk10.sql`.
- Extend `functions/api/scores.ts` with `game` discriminator + ilk10 handlers + hardened bounds.
- Extend `lib/leaderboard.ts`, `components/leaderboard-modal.tsx`, `components/leaderboard-submit.tsx` with a `game` parameter.
- Wire an ilk10 leaderboard UI (modal trigger + submit on complete) into `app/ilk10/page.tsx`.
- Add `cloudflare/prepare-ilk11-subdomain.mjs`; switch ilk11 CI step to deploy `out-ilk11`.
- Extend CI with the `play` deploy step.
- `lib/site.ts` → `lib/routes.ts`; cross-link rewrites.
- Manual Cloudflare work (documented in PR description): create the `play` Pages project; bind D1; point `play.otaliptus.com` custom domain; run the migration once against production D1.

No deletions of old projects, no DNS cutover for old subdomains. Both keep running.

## Future work (out of scope for this spec)

- **Social login**: Sign in with Google via a Pages Function OAuth handler. Session cookie scoped to `play.otaliptus.com`. `players(id, provider, provider_user_id, display_name, created_at)`. `player_id` added to both score tables. "Claim past scores" flow keyed on stored nickname.
- **DNS cutover**: point `ilk10.otaliptus.com` and `ilk11.otaliptus.com` at Bulk Redirects → `play.otaliptus.com/ilk10` / `/ilk11`. Remove the old Pages projects and the two prepare scripts.
- **Daily double meta-rank**: cross-game leaderboard for players who played both on the same date.
