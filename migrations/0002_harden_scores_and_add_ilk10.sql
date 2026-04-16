-- Hardens the ilk11 scores table with upper-bound CHECKs and adds ilk10_scores.
-- SQLite doesn't support ALTER TABLE ADD CHECK, so we recreate `scores`.
-- No explicit BEGIN/COMMIT: D1 rejects SQL-level transaction statements and
-- instead wraps `wrangler d1 execute --file` submissions in a single atomic
-- batch on the server.

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
