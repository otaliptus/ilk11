# Manual Seed Format

`coaches.json` and `referees.json` are intentionally separate from the game data and from the player pipeline.

Use this shape per item:

```json
[
  {
    "canonicalName": "Fatih Terim",
    "displayName": "Fatih Terim",
    "aliases": ["F. Terim"],
    "birthYear": 1953,
    "sourceIds": {
      "transfermarkt": "1234"
    },
    "sourceUrls": [
      "https://www.transfermarkt.com/example"
    ],
    "provisional": false,
    "notes": ["Verified manually against source."]
  }
]
```

These files are for seed data and hand-curated backfills.
They are not meant to replace source-specific scrapers.
