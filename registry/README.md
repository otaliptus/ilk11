# Registry Project

This folder is an isolated entity-registry subproject for `ilk10`.
It exists to keep player / manager / referee data work separate from the current game dataset and UI code.

## Goals

- build canonical registries for `player`, `coach`, and `referee`
- keep stable internal IDs separate from display names
- support autocomplete, aliases, and duplicate-name disambiguation
- leave room for richer source data such as Transfermarkt, FBref, and TFF

## Current Scope

Today this project ships with:

- a working bootstrap builder for players from the existing root `data/games.csv`
- manual-input builders for coaches and referees
- an optional Transfermarkt match-page enrichment builder for players
- an autocomplete index builder that merges the best available registries

The bootstrap player registry is intentionally marked as provisional:

- the existing `games.csv` stores starter lineups only
- many lineup names are surname-only or short display names
- birth year and external IDs are not available in `games.csv`

That means `players.bootstrap.json` is useful as a local corpus and autocomplete seed, but not yet the final production registry.

## Folder Layout

- `lib/`: self-contained helpers for parsing, normalization, and HTTP fetches
- `scripts/`: builders
- `data/manual/`: seed inputs for coaches and referees
- `output/`: generated registries and summaries

## Commands

From the repo root:

```bash
cd registry
npm run build
```

Build the provisional player registry from the existing root dataset:

```bash
cd registry
npm run build:players:bootstrap
```

Build a Transfermarkt-backed starter registry by re-fetching match pages referenced by root `data/games.csv`:

```bash
cd registry
npm run build:players:transfermarkt -- --limit 100 --concurrency 4 --delay-ms 150
```

Notes:

- this script is resumable because it caches raw match pages under `output/cache/transfermarkt-match-pages/`
- without `--limit`, it attempts the full corpus referenced by root `data/games.csv`
- the full run is much heavier than the bootstrap build

Build manual coach and referee registries:

```bash
cd registry
npm run build:manual
```

Build the autocomplete artifact from the best currently available registries:

```bash
cd registry
npm run build:autocomplete
```

Build and store season leaderboard data from FBref season pages:

```bash
cd registry
npm run build:season-leaderboards:fbref -- --season 2022 --headed
```

Notes:

- this writes normalized season source data under `output/fbref-season-leaderboards/`
- use `--headed` when FBref triggers Cloudflare so you can solve the challenge in the browser window
- add `--limit 3` to test only a few seasons before running the full range

Print a compact summary of generated outputs:

```bash
cd registry
npm run summary
```

## Output Files

- `output/players.bootstrap.json`
- `output/players.transfermarkt.json`
- `output/coaches.manual.json`
- `output/referees.manual.json`
- `output/autocomplete.json`
- `output/summary.json`
- `output/fbref-season-leaderboards/index.json`
- `output/fbref-season-leaderboards/seasons/*.json`

## FBref Note

The original goal for this project is to ingest richer historical data from FBref, starting with:

`https://fbref.com/en/comps/26/2001-2002/2001-2002-Super-Lig-Stats`

From this environment, direct automated access to FBref is currently blocked by a Cloudflare verification challenge.
That means the project can prepare for FBref ingestion, but the working automated path in this repo is currently Transfermarkt-backed.

## Recommended Next Steps

1. Extend the Transfermarkt pipeline so it captures substitutes and not only starters.
2. Add a dedicated coach source adapter.
3. Add a dedicated referee source adapter.
4. Move `ilk10` answer matching to entity IDs instead of raw strings.
5. Add UI autocomplete that filters against the registry for the current entity type.
