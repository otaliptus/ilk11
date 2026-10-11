## Data Update Pipeline

This project serves gameplay pools from `public/easy.csv` and `public/hard.csv`.
The merged canonical dataset is kept in `data/games.csv`.

CSV format:

```csv
game,team,difficulty,formation,lineup,lineup_numbers,lineup_captains,lineup_goals,lineup_assists,lineup_cards,lineup_yellow_cards,lineup_red_cards,lineup_substitutions,source_match_id
```

- `lineup` must contain exactly 11 players separated by `;`
- `lineup_numbers` should contain 11 shirt numbers aligned by lineup index (use `;` separators)
- `lineup_captains` should contain 11 captain flags (`0` or `1`) aligned by lineup index (usually one captain, but source data can include multiple flagged players)
- `lineup_goals`, `lineup_assists`, `lineup_cards`, `lineup_yellow_cards`, `lineup_red_cards`, `lineup_substitutions` should each contain 11 non-negative integers aligned by lineup index
- `source_match_id` is the Transfermarkt match id used for traceability/backfills
- player names should be uppercase for gameplay matching
- each match should usually produce 2 rows (one per team)
- `difficulty` should be `easy` or `hard`

### 1) Fetch a season

Fetches Super Lig fixtures + lineups from Transfermarkt and writes a season CSV:

```bash
npm run data:fetch-season -- --season 2025 --out data/seasons/tr1-2025.csv
```

Note: `fetch-season.mjs`, `merge-games.mjs` and `expand-dotted-names.mjs` are
local maintainer tooling and are **not shipped** in this repository (they are
covered by the `scripts/*` gitignore whitelist). The npm entries exist for
machines that have them; cloning the repo alone is enough for everything below.

Optional flags:

- `--limit 20` (fetch only first N match reports)
- `--concurrency 4`
- `--delay-ms 75`
- `--difficulty hard` (or `easy`, or `auto`)

### 2) Validate the CSV

```bash
npm run data:validate -- --file data/seasons/tr1-2025.csv
```

This checks:

- malformed rows
- duplicate `game+team`
- formation format
- lineup size (`11`)
- uppercase player names
- warnings: duplicate shirt numbers, captain-count anomalies, duplicate
  surnames within a lineup, and assists exceeding goals for the starting XI

### 3) Merge into canonical dataset (`data/games.csv`)

```bash
npm run data:merge -- --incoming data/seasons/tr1-2025.csv
```

Defaults:

- base file: `data/games.csv`
- output file: `data/games.csv`
- conflict rule: incoming row replaces existing row with same `game+team`
- automatic backup is created before overwrite
- if base has a `difficulty` column, incoming rows without difficulty are filled from `--default-difficulty` (default `hard`)

### 4) Rebuild public pools

```bash
npm run data:build-pools
```

This writes:

- `data/games.csv`
- `public/easy.csv`
- `public/hard.csv`
- `public/data/ilk11/easy.json`
- `public/data/ilk11/hard.json`
- `public/data/daily/YYYY-MM-DD.json` files for the next 400 days

During the rebuild the script also normalizes the canonical rows:

- `difficulty` is re-derived from the pool policy, so `data/games.csv`, the
  public pool CSVs and the runtime JSON always agree (easy = one of the big
  four, 2010 onward; everything else is hard).
- `lineup_captains` keeps at most one captain flag per lineup (source data can
  flag multiple players, which would render duplicate captain badges).

Then validate final files:

```bash
npm run data:validate:all
```

### 5) Build runtime JSON only

The browser consumes compact JSON generated from the public pool CSVs:

```bash
npm run data:build-ilk11-json
```

This writes:

- `public/data/ilk11/easy.json`
- `public/data/ilk11/hard.json`

Keep the CSV files as the source of truth. `npm run data:build-pools` already rebuilds these JSON files; use `npm run data:build-ilk11-json` only when the public CSVs already exist and you only need to refresh the runtime JSON.

### 6) Build daily payloads

The app first tries to load a small daily payload:

```bash
npm run data:build-daily
```

This writes ignored build artifacts under `public/data/daily/`. If a daily file is missing, the browser falls back to the full runtime pools and computes the same game locally.

Daily payloads are generated from `public/data/ilk11/easy.json` and `public/data/ilk11/hard.json`, using the same deterministic picker. They are regenerated automatically before `npm run build`.

### 7) Runtime validation

```bash
npm run data:validate:runtime
```

This checks:

- runtime JSON row counts match the CSV-derived pools
- runtime JSON rows match the CSV-derived pools
- daily payloads match the deterministic picker for the validation window
- today's easy/hard source match ids are printed for a quick sanity check

### 8) İlk 10 question bank

`data/ilk10/questions.json` is the canonical question bank consumed by the app
(and by `data/ilk10-questions.ts`). Edit the JSON directly and keep it in the
shape enforced by the validator; the legacy pack files
(`data/ilk10-fbref-season-questions.json`,
`data/ilk10-research-verified-questions.json`) are kept for provenance only.

```bash
npm run data:build-ilk10   # normalize statuses in place (idempotent)
npm run data:validate:ilk10
```

The validator checks:

- every question has 10 unique non-empty answers and a valid status
- ids are unique, prompts/labels/categories are present
- design examples are not marked live
- live questions without `sourceUrl` or `note` are flagged
- **exact duplicate answer sets across live questions are flagged** (these are
  effectively the same quiz shown on two different days)
- near-duplicates (8+/10 shared answers) are listed for review
