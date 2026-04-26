# Operations

This project is static-first. Keep game payloads on Cloudflare Pages static assets, and reserve Pages Functions/D1 for leaderboard actions.

## Data And Build Flow

Normal build:

```bash
npm run build
```

This regenerates ignored daily payloads under `public/data/daily/` before `next build`.

Data checks:

```bash
npm run data:validate:all
```

This validates the canonical CSV, public pools, runtime JSON, and daily payload order. It also prints today's İlk11 source ids for a quick sanity check.

Tracked data scripts are intentionally limited to the scripts required by build/validation:

- `scripts/build-pools.mjs`
- `scripts/build-ilk11-runtime-json.mjs`
- `scripts/build-ilk11-daily-json.mjs`
- `scripts/validate-games.mjs`
- `scripts/validate-ilk11-runtime.mjs`
- `scripts/lib/games-csv.mjs`
- `scripts/lib/ilk11-runtime.mjs`

Other local scraper/backfill helpers stay ignored unless they become part of the normal build.

## Generated Files

Do not commit these generated build outputs:

- `.next/`
- `out/`
- `out-ilk10/`
- `out-ilk11/`
- `public/data/daily/`

The deployed site still includes `public/data/daily/` because `npm run build` creates it before static export.

## Leaderboard

Leaderboard storage is D1:

- `scores` for İlk11
- `ilk10_scores` for İlk10

The API returns a bounded leaderboard (`100` rows per table view; İlk11 is `100` per difficulty). This protects D1 reads and keeps response size predictable.

Apply migrations in order:

```bash
npm run db:migrate:0002
npm run db:migrate:0003
```

For local D1:

```bash
npm run db:migrate:0002:local
npm run db:migrate:0003:local
```

## Deploy Flow

Before deploy:

```bash
npm run data:validate:all
npm run lint
npm run build
npm run build:ilk10-subdomain
npm run build:ilk11-subdomain
```

Then deploy the three Pages outputs:

- `out` -> `play`
- `out-ilk11` -> `missing-eleven-tr`
- `out-ilk10` -> `ilk10`

