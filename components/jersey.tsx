import { cn, normalizePlayerName } from "@/lib/utils"
import type { PlayerData, PlayerState } from "@/types/game"
import { TEAM_CONFIGS, DEFAULT_TEAM_CONFIG } from "@/lib/teams"

interface JerseyProps {
  player: PlayerData
  state?: PlayerState
  className?: string
  team?: string
}

export function Jersey({ player, state, className, team }: JerseyProps) {
  const guessCount = state?.guesses?.length ?? 0
  const isFailed = guessCount >= 8 && !state?.isComplete
  const isSolved = !!state?.isComplete
  const hasShirtNumber = typeof player.shirtNumber === "number" && Number.isFinite(player.shirtNumber)

  const isGoalkeeper = player.position === "GK"
  const teamConfig = team && TEAM_CONFIGS[team] ? TEAM_CONFIGS[team] : DEFAULT_TEAM_CONFIG
  
  // Create gradient ID based on team colors to be unique for this team
  // Just using "team-gradient" with a salt if needed, but since all players share same team, one ID is fine.
  // We'll append team name to ID to handle potential hydration mismatches if different teams were shown (not here though).
  const teamId = team ? team.replace(/\s+/g, '-') : 'default'
  const gradId = `grad-${teamId}`
  
  // Helper to adjust color brightness for the gradient
  // Simplistic approach: just use the primary color directly and adding stops 
  // We can let the browser interpolate or just use primary color in middle and slightly modulated version at ends?
  // For better results without a color manipulation library, we can just use the Primary Color as the base
  // and use a white/black overlay gradient for 3D effect.
  // Actually, we can just use the primary color.
  
  const primaryColor = isGoalkeeper ? "#0EA5E9" : teamConfig.primary
  const secondaryColor = isGoalkeeper ? "#082F49" : teamConfig.secondary
  const pattern = isGoalkeeper ? "solid" : (teamConfig.pattern ?? "solid")
  const hasColoredCardData = typeof player.yellowCards === "number" || typeof player.redCards === "number"
  const legacyCardCount = player.cards ?? 0
  const yellowCardCount = hasColoredCardData ? (player.yellowCards ?? 0) : (legacyCardCount > 0 ? 1 : 0)
  const redCardCount = hasColoredCardData ? (player.redCards ?? 0) : (legacyCardCount >= 2 ? 1 : 0)
  const statBadges = [
    { key: "goals", value: player.goals ?? 0 },
    { key: "assists", value: player.assists ?? 0 },
    { key: "yellowcard", value: yellowCardCount },
    { key: "redcard", value: redCardCount },
    { key: "substitutions", value: player.substitutions ?? 0 },
  ].filter((entry) => entry.value > 0)

  // Wikimedia Commons CC0 public domain soccer ball path data
  // Source: https://commons.wikimedia.org/wiki/File:Soccerball.svg
  const SEAMS_D = "m-1643-1716 155 158m-550 2364c231 231 538 195 826 202m-524-2040c-491 351-610 1064-592 1060m1216-1008c-51 373 84 783 364 1220m-107-2289c157-157 466-267 873-329m-528 4112c-50 132-37 315-8 510m62-3883c282 32 792 74 1196 303m-404 2644c310 173 649 247 1060 180m-340-2008c-242 334-534 645-872 936m1109-2119c-111-207-296-375-499-534m1146 1281c100 3 197 44 290 141m-438 495c158 297 181 718 204 1140"
  const PENTAGONS_D = "m-1624-1700c243-153 498-303 856-424 141 117 253 307 372 492-288 275-562 544-724 756-274-25-410-2-740-60 3-244 84-499 236-764zm2904-40c271 248 537 498 724 788-55 262-105 553-180 704-234-35-536-125-820-200-138-357-231-625-340-924 210-156 417-296 616-368zm-3273 3033a2376 2376 0 0 1-378-1392l59-7c54 342 124 674 311 928-36 179-2 323 51 458zm1197-1125c365 60 717 120 1060 180 106 333 120 667 156 1000-263 218-625 287-944 420-372-240-523-508-736-768 122-281 257-561 464-832zm3013 678a2376 2376 0 0 1-925 1147l-116-5c84-127 114-297 118-488 232-111 464-463 696-772 86 30 159 72 227 118zm-2287 1527a2376 2376 0 0 1-993-251c199 74 367 143 542 83 53 75 176 134 451 168z"
  const BALL_SCALE = 0.0059 // maps original r=2376 → r≈14

  const renderStatSymbol = (kind: string) => {
    if (kind === "goals") {
      // Classic white/black soccer ball (Wikimedia Commons CC0)
      return (
        <g transform={`scale(${BALL_SCALE})`}>
          <circle fill="#fff" r="2376" stroke="#374151" strokeWidth="100" />
          <path fill="none" stroke="#374151" strokeWidth="220" d={SEAMS_D} />
          <path fill="#1f2937" d={PENTAGONS_D} />
        </g>
      )
    }

    if (kind === "assists") {
      // White ball with blue pentagons and blue seams (tinted version of goal ball)
      return (
        <g>
          <g transform={`scale(${BALL_SCALE})`}>
            <circle fill="#fff" r="2376" stroke="#3b82f6" strokeWidth="100" />
            <path fill="none" stroke="#3b82f6" strokeWidth="220" d={SEAMS_D} />
            <path fill="#3b82f6" d={PENTAGONS_D} />
          </g>
          <text
            x="9"
            y="15"
            fontSize="13"
            fontWeight="bold"
            fill="#1d4ed8"
            stroke="#fff"
            strokeWidth="2"
            paintOrder="stroke"
            textAnchor="middle"
            dominantBaseline="auto"
            style={{ fontFamily: "sans-serif", letterSpacing: "-0.5px" }}
          >(A)</text>
        </g>
      )
    }

    if (kind === "yellowcard") {
      // Single yellow card
      return (
        <g>
          <circle cx="0" cy="0" r="14" fill="#fbbf24" stroke="#b45309" strokeWidth="1" />
          <rect x="-5" y="-8" width="10" height="14.4" rx="1" fill="#fde047" stroke="#a16207" strokeWidth="0.8" />
          <rect x="-5" y="-8" width="10" height="14.4" rx="1" fill="rgba(0,0,0,0.06)" />
        </g>
      )
    }

    if (kind === "redcard") {
      // Single red card
      return (
        <g>
          <circle cx="0" cy="0" r="14" fill="#b91c1c" stroke="#7f1d1d" strokeWidth="1" />
          <rect x="-5" y="-8" width="10" height="14.4" rx="1" fill="#ef4444" stroke="#991b1b" strokeWidth="0.8" />
          <rect x="-5" y="-8" width="10" height="14.4" rx="1" fill="rgba(0,0,0,0.08)" />
        </g>
      )
    }

    // Substitution arrows on emerald
    return (
      <g>
        <circle cx="0" cy="0" r="14" fill="#10b981" stroke="#059669" strokeWidth="1" />
        {/* White up-arrow ("in") */}
        <g transform="translate(-3.6, 0)">
          <polygon points="0,-9 -4.4,-2.4 -1.6,-2.4 -1.6,7 1.6,7 1.6,-2.4 4.4,-2.4" fill="white" fillOpacity="0.95" />
        </g>
        {/* Red down-arrow ("out") */}
        <g transform="translate(3.6, 0)">
          <polygon points="0,9 -4.4,2.4 -1.6,2.4 -1.6,-7 1.6,-7 1.6,2.4 4.4,2.4" fill="#ef4444" fillOpacity="0.95" />
        </g>
      </g>
    )
  }

  return (
    <div className={cn("relative flex flex-col items-center", className)}>
      <svg
        viewBox="0 0 100 110"
        className={cn(
          "w-full h-full transition-all duration-300 hover:scale-105"
        )}
        style={{
          filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.4))",
          overflow: "visible",
        }}
      >
        <defs>
          {/* Dynamic Team Gradient */}
          <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={primaryColor} stopOpacity="0.8" />
            <stop offset="50%" stopColor={primaryColor} />
            <stop offset="100%" stopColor={primaryColor} stopOpacity="0.9" />
          </linearGradient>

          {/* Shine effect */}
          <linearGradient id="shine" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
            <stop offset="40%" stopColor="rgba(255,255,255,0.1)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>

          {/* Stripes Pattern */}
          <pattern id={`stripes-${teamId}`} x="0" y="0" width="20" height="100" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="10" height="100" fill={primaryColor} />
            <rect x="10" y="0" width="10" height="100" fill={secondaryColor} />
          </pattern>
        </defs>

        {/* Main Shirt Body */}
        <path
          d="M12 22 
             L22 8 
             Q50 18 78 8 
             L88 22 
             L95 38 
             L82 44 
             L82 95 
             Q50 102 18 95 
             L18 44 
             L5 38 
             Z"
          fill={pattern === 'striped' ? `url(#stripes-${teamId})` : `url(#${gradId})`}
          stroke="rgba(0,0,0,0.2)"
          strokeWidth="1"
        />
        
        {/* Half Pattern Overlay if needed */}
        {pattern === 'half' && (
           <path
             d="M50 8 
                L50 102
                Q18 95 18 95
                L18 44 
                L5 38
                L12 22
                L22 8 
                Q50 18 50 18 Z"
             fill={primaryColor}
            />
        )}
        {pattern === 'half' && (
           <path
             d="M50 8 
                L50 102
                Q82 95 82 95
                L82 44 
                L95 38
                L88 22 
                L78 8 
                Q50 18 50 18 Z"
             fill={secondaryColor}
            />
        )}

        {/* Shirt Shine Overlay for 3D effect */}
        <path
          d="M12 22 
             L22 8 
             Q50 18 78 8 
             L88 22 
             L95 38 
             L82 44 
             L82 95 
             Q50 102 18 95 
             L18 44 
             L5 38 
             Z"
          fill="url(#shine)"
          style={{ mixBlendMode: 'soft-light' }}
        />

        {/* Collar - Using Secondary Color */}
        <path
          d="M38 12 Q50 22 62 12"
          fill="none"
          stroke={secondaryColor}
          strokeWidth="4"
          strokeLinecap="round"
        />
        
        {/* Collar inner detail */}
        <ellipse cx="50" cy="16" rx="8" ry="4" fill="rgba(0,0,0,0.15)" />

        {/* Sleeve edges - Using Secondary Color */}
        <path d="M10 24 L24 6" stroke={secondaryColor} strokeWidth="3" opacity="0.8" />
        <path d="M90 24 L76 6" stroke={secondaryColor} strokeWidth="3" opacity="0.8" />
        
        {/* Bottom hem highlight */}
        <path
          d="M18 95 Q50 102 82 95"
          fill="none"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="2"
        />

        {/* Question Mark / Check / X */}
        <text
          x="50"
          y="58"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          stroke="rgba(0,0,0,0.7)"
          strokeWidth="3"
          paintOrder="stroke"
          fontWeight="bold"
          fontSize={hasShirtNumber && !isSolved && !isFailed ? "28" : "32"}
          style={{ 
            textShadow: "0 2px 4px rgba(0,0,0,0.6)",
            fontFamily: "system-ui, sans-serif"
          }}
        >
          {isSolved ? "✓" : isFailed ? "✗" : hasShirtNumber ? String(player.shirtNumber) : "?"}
        </text>

        {/* Stat badges: vertical stack on left shoulder with partial overlap */}
        {statBadges.map((badge, index) => {
          const x = 2
          const y = 18 + index * 24
          const showCount = badge.value > 1
          return (
            <g key={badge.key} transform={`translate(${x} ${y})`}>
              {/* Drop shadow */}
              <circle cx="1" cy="1.5" r="15.5" fill="rgba(0,0,0,0.25)" />
              {/* White border ring */}
              <circle cx="0" cy="0" r="16" fill="white" />

              {renderStatSymbol(badge.key)}

              {/* Count badge – only if value > 1 */}
              {showCount && (
                <>
                  <circle cx="11" cy="10" r="6" fill="#111827" stroke="white" strokeWidth="1.5" />
                  <text x="11" y="10.2" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="7" fontWeight="800" style={{ fontFamily: "system-ui, sans-serif" }}>
                    {String(badge.value)}
                  </text>
                </>
              )}
            </g>
          )
        })}

        {/* Number Badge (if attempts exist) */}
        {state?.guesses?.length ? (
          <g>
            <circle
              cx="82"
              cy="18"
              r="12"
              fill={isSolved ? "#059669" : isFailed ? "#dc2626" : "#d97706"}
              stroke="white"
              strokeWidth="2"
            />
            <text
              x="82"
              y="19"
              textAnchor="middle"
              dominantBaseline="middle"
              fill="white"
              fontSize="13"
              fontWeight="bold"
              style={{ fontFamily: "system-ui, sans-serif" }}
            >
              {state.guesses.length}
            </text>
          </g>
        ) : null}
      </svg>

      {/* Name/Length Label Below */}
      <div className="absolute -bottom-3 sm:-bottom-4 left-1/2 -translate-x-1/2 w-full flex justify-center">
        {(isSolved || isFailed) ? (
          <div className="bg-black/70 px-2 py-0.5 rounded-full backdrop-blur-sm border border-white/20 shadow-lg max-w-full truncate">
            <span className="text-[9px] sm:text-[10px] font-bold text-white uppercase tracking-[0.03em] sm:tracking-wide leading-tight">
              {player.name}
            </span>
          </div>
        ) : (
          <div className="bg-black/70 px-2 py-0.5 rounded-full backdrop-blur-sm border border-white/20 shadow-lg">
            <span className="text-[10px] sm:text-xs font-bold text-white uppercase tracking-wide">
              {player.name.split(' ').map(w => normalizePlayerName(w).length).join(',')}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
