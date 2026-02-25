export interface GameData {
  game: string
  team: string
  formation: string
  lineup: string[]
  lineupNumbers?: Array<number | null>
  lineupCaptains?: number[]
  lineupGoals?: number[]
  lineupAssists?: number[]
  lineupCards?: number[]
  lineupYellowCards?: number[]
  lineupRedCards?: number[]
  lineupSubstitutions?: number[]
  sourceMatchId?: string
}

export interface PlayerData {
  id: number
  name: string
  position: string
  shirtNumber?: number | null
  isCaptain?: boolean
  goals?: number
  assists?: number
  cards?: number
  yellowCards?: number
  redCards?: number
  substitutions?: number
}

export interface PlayerState {
  guesses: string[]
  isComplete: boolean
}
