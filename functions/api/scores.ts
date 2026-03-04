interface Env {
  DB: D1Database
}

interface ScoreRow {
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

interface ScoreBody {
  nickname: string
  game_date: string
  difficulty: string
  game_id: number
  match_name: string
  solved: number
  total_attempts: number
  failed: number
  is_complete: boolean
}

interface LeaderboardEntry {
  rank: number
  nickname: string
  difficulty: "easy" | "hard"
  solved: number
  total_attempts: number
  failed: number
  is_complete: boolean
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status })
}

// POST /api/scores — submit a score
export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: ScoreBody
  try {
    body = await context.request.json()
  } catch (_e) {
    return jsonError("Invalid JSON body", 400)
  }

  const nickname = typeof body.nickname === "string" ? body.nickname.trim() : ""
  if (!nickname || nickname.length > 20) {
    return jsonError("Nickname must be 1-20 characters", 400)
  }

  if (typeof body.game_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.game_date)) {
    return jsonError("Invalid game_date format", 400)
  }

  if (body.difficulty !== "easy" && body.difficulty !== "hard") {
    return jsonError("Difficulty must be 'easy' or 'hard'", 400)
  }

  if (typeof body.game_id !== "number" || !Number.isInteger(body.game_id) || body.game_id < 0) {
    return jsonError("Invalid game_id", 400)
  }

  if (typeof body.match_name !== "string" || !body.match_name.trim()) {
    return jsonError("match_name is required", 400)
  }

  const solved = body.solved
  if (typeof solved !== "number" || !Number.isInteger(solved) || solved < 0 || solved > 11) {
    return jsonError("solved must be 0-11", 400)
  }

  const totalAttempts = body.total_attempts
  if (typeof totalAttempts !== "number" || !Number.isInteger(totalAttempts) || totalAttempts < 0) {
    return jsonError("total_attempts must be >= 0", 400)
  }

  const failed = body.failed
  if (typeof failed !== "number" || !Number.isInteger(failed) || failed < 0) {
    return jsonError("failed must be >= 0", 400)
  }

  const isComplete = Boolean(body.is_complete)

  try {
    await context.env.DB.prepare(`
      INSERT OR REPLACE INTO scores
        (nickname, game_date, difficulty, game_id, match_name, solved, total_attempts, failed, is_complete)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      nickname,
      body.game_date,
      body.difficulty,
      body.game_id,
      body.match_name.trim(),
      solved,
      totalAttempts,
      failed,
      isComplete ? 1 : 0,
    ).run()

    return Response.json({ success: true })
  } catch (err) {
    console.error("D1 insert error:", err)
    return jsonError("Database error", 500)
  }
}

// GET /api/scores?date=YYYY-MM-DD — get leaderboard for a day
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url)
  const date = url.searchParams.get("date")

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonError("date parameter required (YYYY-MM-DD)", 400)
  }

  try {
    const { results } = await context.env.DB.prepare(`
      SELECT * FROM scores
      WHERE game_date = ?
      ORDER BY is_complete DESC, solved DESC, total_attempts ASC, submitted_at ASC
    `).bind(date).all<ScoreRow>()

    // Build match name map
    const matches: { easy: string | null; hard: string | null } = { easy: null, hard: null }
    for (const row of results) {
      if (row.difficulty === "easy" && !matches.easy) matches.easy = row.match_name
      if (row.difficulty === "hard" && !matches.hard) matches.hard = row.match_name
    }

    // Assign ranks with tie handling
    const rankings: LeaderboardEntry[] = []
    let currentRank = 1

    for (let i = 0; i < results.length; i++) {
      const row = results[i]

      if (i > 0) {
        const prev = results[i - 1]
        const isTie =
          row.is_complete === prev.is_complete &&
          row.solved === prev.solved &&
          row.total_attempts === prev.total_attempts

        if (!isTie) {
          currentRank = i + 1
        }
      }

      rankings.push({
        rank: currentRank,
        nickname: row.nickname,
        difficulty: row.difficulty,
        solved: row.solved,
        total_attempts: row.total_attempts,
        failed: row.failed,
        is_complete: Boolean(row.is_complete),
      })
    }

    return Response.json({
      date,
      matches,
      rankings,
    })
  } catch (err) {
    console.error("D1 query error:", err)
    return jsonError("Database error", 500)
  }
}
