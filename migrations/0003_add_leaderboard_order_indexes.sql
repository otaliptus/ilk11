-- Keeps leaderboard reads bounded and index-friendly for the ordering used by
-- functions/api/scores.ts.

CREATE INDEX IF NOT EXISTS idx_scores_leaderboard
ON scores (
  game_date,
  difficulty,
  is_complete DESC,
  solved DESC,
  total_attempts ASC,
  submitted_at ASC
);

CREATE INDEX IF NOT EXISTS idx_ilk10_scores_leaderboard
ON ilk10_scores (
  game_date,
  is_complete DESC,
  found DESC,
  lives_used ASC,
  submitted_at ASC
);

