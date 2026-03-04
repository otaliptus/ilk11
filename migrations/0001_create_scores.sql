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

CREATE INDEX IF NOT EXISTS idx_scores_date ON scores(game_date);
