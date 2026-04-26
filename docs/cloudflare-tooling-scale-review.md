# Cloudflare Tooling Scale Review

This is a pragmatic map of Cloudflare tools for scaling the game without overbuilding it.

The core recommendation is to keep the app **static by default** and use dynamic Cloudflare tooling only where it removes real friction.

## Preferred Tooling

| Tooling | What it does | How it works | Advantages to this game | Disadvantages to this game | Potential cost at 1k / 10k / 100k / 1M users per day |
|---|---|---|---|---|---|
| Cloudflare Pages / Workers Static Assets | Hosts the app and generated JSON files. | User requests static HTML, JS, CSS, and JSON from Cloudflare edge. No Worker invocation if routed as static. | Best fit. Game payloads, `today.json`, calendar JSON, JS bundle, icons all stay free and fast. | You need a build pipeline that generates clean runtime JSON. Dynamic changes require deploy unless paired with KV/D1. | `$0 / $0 / $0 / $0` for static asset requests. Cloudflare says static asset requests are free and unlimited. |
| Pages Functions / Workers | Tiny API layer. | Runs JS/TS at edge for `/api/scores`, maybe `/api/today`, admin endpoints. | Good for leaderboard submission, validation, small JSON composition. Avoids a full backend. | Free plan has 100k Worker/Function requests/day. If every user hits Worker for game load, you hit limits sooner. | Static-first leaderboard-only: likely `$0 / $0 / $0 / ~$6-8/mo`. If `/api/today` is called by every 1M/day user, more like `~$15-20/mo`. |
| D1 | Serverless SQL database. | SQLite-like database queried from Workers/Pages Functions. | Good source of truth for leaderboards, admin overrides, score history. SQL is easier than KV for ranking. | Not ideal for serving every game payload. Poor queries can scan many rows. Needs indexes and `LIMIT`. | With indexed leaderboard queries and `LIMIT 100`: likely `$0 / $0 / $0 / ~$5/mo paid minimum`. At 1M/day, free daily write/read limits may be tight if submissions are high. |
| KV | Global key-value store. | Worker reads/writes small string/JSON values by key; reads are cached globally and eventually consistent. | Good for feature flags, active build/version, cached `today` payload, maintenance switches. | Eventually consistent. Bad fit for exact scores, counters, or anything requiring immediate consistency. Free reads cap at 100k/day. | If one KV read/user/day: `$0 / $0 / $0 at 100k limit / ~$15/mo at 1M/day`. If cached by browser/static instead, near `$0`. |
| R2 | Object storage. | S3-compatible bucket for large JSON, archives, generated outputs. No egress fees. | Good for moving heavy registry/research/generated artifacts out of Git. Can store historical data packs. | Overkill for tiny runtime JSON. R2 object reads are billable after free tier. Static Assets are cheaper/simpler for public runtime files. | Archive/admin usage: likely `$0` at all tiers. If one R2 read/user/day: `$0 / $0 / $0 / ~$7.20/mo` for Class B reads, plus storage if over 10 GB. |
| Turnstile | Bot/spam challenge. | Client gets a token; your Worker verifies it before accepting sensitive actions. | Add only to score submission if spam appears. Free, low-friction alternative to CAPTCHA. | Adds UX friction and implementation complexity. Needs server-side verification. | Turnstile itself: `$0 / $0 / $0 / $0` on Free plan with unlimited challenges. Worker verification requests still count as Worker/API traffic. |
| Cron Triggers | Scheduled Worker runs. | Cloudflare invokes a Worker on a schedule. | Useful for daily precompute, health checks, warming KV, generating tomorrow preview. | If build-time generation works, cron may be unnecessary. Scraping from cron can be brittle. | Daily/hourly jobs are tiny: `$0 / $0 / $0 / $0` in practice unless job CPU or request volume grows. Counts as Workers usage. |
| Workers Analytics Engine | Event analytics. | Worker writes data points; query later with SQL API/Grafana. | Lightweight way to track plays, completions, share clicks, failed loads without GA. | Requires a Worker call or piggybacking on existing API calls. Pricing is published but Cloudflare says billing is not active yet. | If 1 event/user/day: `$0 / $0 / $0 at 100k/day free / future paid maybe ~$10/mo at 1M/day including Workers Paid minimum`. Currently not billed per docs. |

## Tooling To Avoid For Now

| Tooling | What it does | How it works | Advantages to this game | Disadvantages to this game | Potential cost at 1k / 10k / 100k / 1M users per day |
|---|---|---|---|---|---|
| Durable Objects | Strongly consistent per-object state and WebSockets. | Requests route to a named object instance with local state/storage. | Useful for live multiplayer, rooms, live races, strict counters. | This game is daily async trivia. D1 + localStorage is enough. Durable Objects add architectural weight. | If one simple Durable Object request/user/day: `$0 / $0 / around free limit / ~$10/mo`. WebSockets can become much more expensive if objects stay active. |
| Queues | Async background jobs. | Worker writes messages; consumer Worker processes them later with retries. | Useful if score processing, analytics, or imports become slow. | Current score writes are simple. Queue would add moving parts without much benefit. | If only score submissions, usually `$0 / $0 / maybe $5 paid at 100k/day / ~$8-10/mo at 1M/day`, depending operations. |
| Workflows | Durable multi-step jobs. | Long-running Worker workflow with stored state, sleeps, retries. | Good for complex scrape/import pipelines or multi-step moderation. | Overkill for daily static JSON generation. Normal scripts or cron are enough. | Small admin jobs: `$0`. If user-triggered per session, same shape as Workers: free until limits, then `$5+`. |
| Hyperdrive | Connection pooling/caching for external SQL databases. | Worker talks to external Postgres/MySQL through Hyperdrive. | Useful if you move to Neon, Supabase, or another external database. | You do not need an external database. D1 is enough for leaderboard/admin metadata. | Not relevant unless external DB exists. Would add external DB cost plus Worker usage. |
| Vectorize | Vector database/search. | Stores embeddings and runs vector queries. | Could power fuzzy player search someday. | Overkill. Normal normalized string/entity autocomplete is enough. | Avoid. Paid-plan product; cost depends on dimensions/queries. Not worth it here. |
| Workers AI | Serverless AI inference. | Worker calls Cloudflare-hosted AI models. | Could generate hints or summaries. | Not needed for deterministic football trivia. Adds cost and unpredictability. | Avoid unless adding AI features; costs depend on model/token/usage. |
| Containers | Runs containerized services. | Worker can start/route to containers. | Useful for heavy scrapers or custom services. | Completely unnecessary for this app. Would break the basically-free spirit. | Avoid. Paid only, resource-metered. |

## Recommended Architecture

```txt
Static Assets
  app + generated daily JSON

D1
  leaderboard + admin overrides

KV
  tiny config / cached today payload

R2
  heavy generated/research artifacts, not hot gameplay

Turnstile
  only for score-submit spam

Cron
  optional daily precompute

Analytics Engine
  optional lightweight events
```

The biggest cost-control rule is:

> Do not put every page load through a Worker.

Let the game load from static assets, and reserve Worker/D1/KV for actions that genuinely need dynamic behavior.

## Practical Next Step

The best non-overkill upgrade would be:

1. Generate compact static runtime JSON from the CSV/data pipeline.
2. Serve daily game payloads from static assets.
3. Keep D1 for leaderboards.
4. Add KV only for tiny config or cached `today` payload.
5. Move large generated/research artifacts to R2 or out of the main Git repo.

That preserves the basically-free model while making the project much cleaner at 1k to 100k+ daily users.

## Sources

- Cloudflare Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare Pages Functions/static asset pricing: https://developers.cloudflare.com/pages/functions/pricing/
- Cloudflare D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- Cloudflare KV pricing: https://developers.cloudflare.com/kv/platform/pricing/
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Cloudflare Queues pricing: https://developers.cloudflare.com/queues/platform/pricing/
- Cloudflare Durable Objects pricing: https://developers.cloudflare.com/durable-objects/platform/pricing/
- Cloudflare Turnstile plans: https://developers.cloudflare.com/turnstile/plans/
- Cloudflare Workers Analytics Engine pricing: https://developers.cloudflare.com/analytics/analytics-engine/pricing/
