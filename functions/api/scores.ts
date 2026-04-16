interface Env {
  DB: D1Database
}

interface Ilk11ScoreRow {
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

interface Ilk10ScoreRow {
  id: number
  nickname: string
  game_date: string
  question_id: string
  question_label: string
  found: number
  lives_used: number
  is_complete: number
  submitted_at: string
}

type GameKey = "ilk10" | "ilk11"

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status })
}

function validateNickname(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed.length < 1 || trimmed.length > 20) return null
  return trimmed
}

function validateGameDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return value
}

function validateIntInRange(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null
  if (value < min || value > max) return null
  return value
}

function validateGameKey(value: unknown): GameKey | null {
  return value === "ilk10" || value === "ilk11" ? value : null
}

// ---- ilk11 ----

async function handleIlk11Post(context: { env: Env }, body: Record<string, unknown>): Promise<Response> {
  const nickname = validateNickname(body.nickname)
  if (!nickname) return jsonError("Nickname must be 1-20 characters", 400)

  const gameDate = validateGameDate(body.game_date)
  if (!gameDate) return jsonError("Invalid game_date format", 400)

  const difficulty = body.difficulty === "easy" || body.difficulty === "hard" ? body.difficulty : null
  if (!difficulty) return jsonError("Difficulty must be 'easy' or 'hard'", 400)

  const gameId = validateIntInRange(body.game_id, 0, Number.MAX_SAFE_INTEGER)
  if (gameId === null) return jsonError("Invalid game_id", 400)

  const matchNameRaw = typeof body.match_name === "string" ? body.match_name.trim() : ""
  if (matchNameRaw.length < 1 || matchNameRaw.length > 120) {
    return jsonError("match_name must be 1-120 characters", 400)
  }

  const solved = validateIntInRange(body.solved, 0, 11)
  if (solved === null) return jsonError("solved must be 0-11", 400)

  const totalAttempts = validateIntInRange(body.total_attempts, 0, 200)
  if (totalAttempts === null) return jsonError("total_attempts must be 0-200", 400)

  const failed = validateIntInRange(body.failed, 0, 100)
  if (failed === null) return jsonError("failed must be 0-100", 400)

  const isComplete = Boolean(body.is_complete)

  await context.env.DB.prepare(`
    INSERT OR REPLACE INTO scores
      (nickname, game_date, difficulty, game_id, match_name, solved, total_attempts, failed, is_complete)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    nickname,
    gameDate,
    difficulty,
    gameId,
    matchNameRaw,
    solved,
    totalAttempts,
    failed,
    isComplete ? 1 : 0,
  ).run()

  return Response.json({ success: true })
}

async function handleIlk11Get(context: { env: Env }, date: string): Promise<Response> {
  const { results } = await context.env.DB.prepare(`
    SELECT * FROM scores
    WHERE game_date = ?
    ORDER BY is_complete DESC, solved DESC, total_attempts ASC, submitted_at ASC
  `).bind(date).all<Ilk11ScoreRow>()

  const matches: { easy: string | null; hard: string | null } = { easy: null, hard: null }
  for (const row of results) {
    if (row.difficulty === "easy" && !matches.easy) matches.easy = row.match_name
    if (row.difficulty === "hard" && !matches.hard) matches.hard = row.match_name
  }

  const rankings: Array<{
    game: "ilk11"
    rank: number
    nickname: string
    difficulty: "easy" | "hard"
    solved: number
    total_attempts: number
    failed: number
    is_complete: boolean
  }> = []
  let currentRank = 1
  for (let i = 0; i < results.length; i++) {
    const row = results[i]
    if (i > 0) {
      const prev = results[i - 1]
      const isTie =
        row.is_complete === prev.is_complete &&
        row.solved === prev.solved &&
        row.total_attempts === prev.total_attempts
      if (!isTie) currentRank = i + 1
    }
    rankings.push({
      game: "ilk11",
      rank: currentRank,
      nickname: row.nickname,
      difficulty: row.difficulty,
      solved: row.solved,
      total_attempts: row.total_attempts,
      failed: row.failed,
      is_complete: Boolean(row.is_complete),
    })
  }

  return Response.json({ game: "ilk11", date, matches, rankings })
}

// ---- ilk10 ----

async function handleIlk10Post(context: { env: Env }, body: Record<string, unknown>): Promise<Response> {
  const nickname = validateNickname(body.nickname)
  if (!nickname) return jsonError("Nickname must be 1-20 characters", 400)

  const gameDate = validateGameDate(body.game_date)
  if (!gameDate) return jsonError("Invalid game_date format", 400)

  const questionIdRaw = typeof body.question_id === "string" ? body.question_id.trim() : ""
  if (questionIdRaw.length < 1 || questionIdRaw.length > 120) {
    return jsonError("question_id must be 1-120 characters", 400)
  }

  const questionLabelRaw = typeof body.question_label === "string" ? body.question_label.trim() : ""
  if (questionLabelRaw.length < 1 || questionLabelRaw.length > 120) {
    return jsonError("question_label must be 1-120 characters", 400)
  }

  const found = validateIntInRange(body.found, 0, 10)
  if (found === null) return jsonError("found must be 0-10", 400)

  const livesUsed = validateIntInRange(body.lives_used, 0, 5)
  if (livesUsed === null) return jsonError("lives_used must be 0-5", 400)

  const isComplete = Boolean(body.is_complete)

  await context.env.DB.prepare(`
    INSERT OR REPLACE INTO ilk10_scores
      (nickname, game_date, question_id, question_label, found, lives_used, is_complete)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    nickname,
    gameDate,
    questionIdRaw,
    questionLabelRaw,
    found,
    livesUsed,
    isComplete ? 1 : 0,
  ).run()

  return Response.json({ success: true })
}

async function handleIlk10Get(context: { env: Env }, date: string): Promise<Response> {
  const { results } = await context.env.DB.prepare(`
    SELECT * FROM ilk10_scores
    WHERE game_date = ?
    ORDER BY is_complete DESC, found DESC, lives_used ASC, submitted_at ASC
  `).bind(date).all<Ilk10ScoreRow>()

  let questionLabel: string | null = null
  for (const row of results) {
    if (!questionLabel) questionLabel = row.question_label
  }

  const rankings: Array<{
    game: "ilk10"
    rank: number
    nickname: string
    found: number
    lives_used: number
    is_complete: boolean
  }> = []
  let currentRank = 1
  for (let i = 0; i < results.length; i++) {
    const row = results[i]
    if (i > 0) {
      const prev = results[i - 1]
      const isTie =
        row.is_complete === prev.is_complete &&
        row.found === prev.found &&
        row.lives_used === prev.lives_used
      if (!isTie) currentRank = i + 1
    }
    rankings.push({
      game: "ilk10",
      rank: currentRank,
      nickname: row.nickname,
      found: row.found,
      lives_used: row.lives_used,
      is_complete: Boolean(row.is_complete),
    })
  }

  return Response.json({ game: "ilk10", date, question_label: questionLabel, rankings })
}

// ---- entry points ----

export const onRequestPost: PagesFunction<Env> = async (context) => {
  if (!context.env.DB) {
    return jsonError("D1 binding 'DB' not configured. Bind it in Cloudflare Pages → Settings → Functions → D1.", 500)
  }

  let body: Record<string, unknown>
  try {
    body = (await context.request.json()) as Record<string, unknown>
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const game = validateGameKey(body.game)
  if (!game) return jsonError("game must be 'ilk10' or 'ilk11'", 400)

  try {
    return game === "ilk11"
      ? await handleIlk11Post(context, body)
      : await handleIlk10Post(context, body)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("D1 insert error:", msg)
    return jsonError(`Database error: ${msg}`, 500)
  }
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  if (!context.env.DB) {
    return jsonError("D1 binding 'DB' not configured. Bind it in Cloudflare Pages → Settings → Functions → D1.", 500)
  }

  const url = new URL(context.request.url)
  const date = url.searchParams.get("date")
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonError("date parameter required (YYYY-MM-DD)", 400)
  }

  const gameParam = url.searchParams.get("game")
  const game = validateGameKey(gameParam)
  if (!game) return jsonError("game must be 'ilk10' or 'ilk11'", 400)

  try {
    return game === "ilk11"
      ? await handleIlk11Get(context, date)
      : await handleIlk10Get(context, date)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("D1 query error:", msg)
    return jsonError(`Database error: ${msg}`, 500)
  }
}
