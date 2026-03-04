"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { PlayerCard } from "@/components/player-card"
import { WordleDialog } from "@/components/wordle-dialog"
import { parseFormation } from "@/lib/api"
import type { PlayerData, PlayerState } from "@/types/game"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Share2, Info, Trophy, CheckCircle2, BarChart3, Send } from "lucide-react"
import { LeaderboardSubmit } from "@/components/leaderboard-submit"
import { LeaderboardModal } from "@/components/leaderboard-modal"
import { isAlreadySubmitted } from "@/lib/leaderboard"

interface FormationProps {
  formation: string
  players: PlayerData[]
  game: string
  team: string
  gameId: number
  difficulty: "easy" | "hard"
}

export function Formation({ formation, players, game, team, gameId, difficulty }: FormationProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerData | null>(null)
  const [playerStates, setPlayerStates] = useState<Record<number, PlayerState>>({});
  const [showModal, setShowModal] = useState(true);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionShown, setCompletionShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [currentUrl, setCurrentUrl] = useState("");
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showSubmitInShare, setShowSubmitInShare] = useState(false);

  // Scoped per difficulty+day via gameId
  const storageKey = `playerStates_${gameId}`;

  // Guard that prevents the save effect from firing on the very first render
  // (which would overwrite stored data with {} before the load effect applies it).
  const skipFirstSave = useRef(true);

  // Load saved guesses from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.states && typeof parsed.states === "object") {
          setPlayerStates(parsed.states as Record<number, PlayerState>);
        }
      }
    } catch (e) {
      console.error("Failed to load player states:", e);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Persist guesses — skips the first invocation so we never overwrite
  // localStorage with {} before the loaded state has been applied.
  useEffect(() => {
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify({ states: playerStates }));
    } catch (e) {
      console.error("Failed to save player states:", e);
    }
  }, [playerStates, storageKey]);

  useEffect(() => {
    setCurrentUrl(window.location.href);
  }, []);

  // Close info modal
  const handleCloseInfoModal = () => {
    setShowModal(false);
  };
  
  const [showCopyModal, setShowCopyModal] = useState(false)
  const formationRows = useMemo(() => [1, ...parseFormation(formation)], [formation])
  const rowWeights = useMemo(() => {
    const totalRows = formationRows.length
    return formationRows.map((_, index) => {
      const distanceFromEdge = Math.min(index, totalRows - 1 - index)
      if (distanceFromEdge === 0) return 1.7
      if (distanceFromEdge === 1) return 1.2
      return 1
    })
  }, [formationRows])
  const rowOrder = useMemo(
    () => Array.from({ length: formationRows.length }, (_, index) => index).reverse(),
    [formationRows.length]
  )
  const isBottomToTop = rowOrder[0] === formationRows.length - 1

  // FIX: CSV stores players in TV-camera order (left-to-right from broadcast view),
  // but the pitch renders bottom-to-top, which mirrors the X-axis. Invert the
  // horizontal order so players appear on their real-life side of the pitch.
  const orientRowPlayers = (rowPlayers: PlayerData[]) => {
    if (isBottomToTop) return rowPlayers
    return [...rowPlayers].reverse()
  }

  const handleGuessComplete = (playerId: number, guesses: string[], isComplete: boolean) => {
    setPlayerStates(prev => ({
      ...prev,
      [playerId]: {
        guesses,
        isComplete
      }
    }))
  }

  // Compute game stats
  const gameStats = useMemo(() => {
    const statesArray = players.map(p => playerStates[p.id]);
    const solved = statesArray.filter(s => s?.isComplete).length;
    const failed = statesArray.filter(s => s && !s.isComplete && s.guesses?.length >= 8).length;
    const attempted = statesArray.filter(s => s && s.guesses?.length > 0).length;
    const totalAttempts = statesArray.reduce((sum, s) => sum + (s?.guesses?.length || 0), 0);
    const isGameComplete = (solved + failed) === 11;
    return { solved, failed, attempted, totalAttempts, isGameComplete };
  }, [players, playerStates]);

  // Auto-show completion modal when game is complete
  useEffect(() => {
    if (gameStats.isGameComplete && !completionShown) {
      setCompletionShown(true);
      setShowCompletionModal(true);
    }
  }, [gameStats.isGameComplete, completionShown]);

  // Helper to get player state by player data
  const getPlayerState = (player: PlayerData) => {
    return playerStates[player.id];
  };

  const getPlayersByRow = (rowIndex: number, players: PlayerData[]) => {
    const rowCounts = formationRows
    let startIndex = 0
    for (let i = 0; i < rowIndex; i++) {
      startIndex += rowCounts[i]
    }
    return players.slice(startIndex, startIndex + rowCounts[rowIndex])
  }

  const generateCopyableTable = () => {
    const gameData = {
      game,
      team,
      formation
    }

    if (!gameData) return '';

    // Calculate score semantics
    const statesArray = players.map(p => playerStates[p.id]);
    const solved = statesArray.filter(s => s?.isComplete).length;
    const failed = statesArray.filter(s => s && !s.isComplete && s.guesses?.length >= 8).length;
    const totalAttempts = statesArray.reduce((sum, state) => sum + (state?.guesses?.length || 0), 0);

    let table = `İlk 11! #${gameId}\n`;
    if (currentUrl) table += `${currentUrl}\n`;
    table += `${gameData.game}\n${gameData.team} • ${gameData.formation}\n\n`;
    table += `✅ Solved: ${solved}/11\n`;
    table += `🎯 Attempts: ${totalAttempts}\n`;
    if (failed > 0) {
      table += `❌ Failed: ${failed}\n`;
    }
    table += `\n`;

    const rowsByIndex = formationRows.map((_, rowIndex) => {
      const rowPlayers = getPlayersByRow(rowIndex, players)
      return orientRowPlayers(rowPlayers)
    })

    const rowsInOrder = rowOrder.map((rowIndex) => rowsByIndex[rowIndex])

    // Function to generate row with correct player placement and green padding
    const generateRow = (rowPlayers: PlayerData[]) => {
      let rowString = '';

      switch (rowPlayers.length) {
        case 0:
          rowString = '🟩🟩🟩🟩🟩🟩🟩🟩🟩';
          break;
        case 1:
          rowString = '🟩🟩🟩🟩' + getPlayerEmoji(rowPlayers[0]) + '🟩🟩🟩🟩';
          break;
        case 2:
          rowString = '🟩🟩🟩' + getPlayerEmoji(rowPlayers[0]) + '🟩' + getPlayerEmoji(rowPlayers[1]) + '🟩🟩🟩';
          break;
        case 3:
          rowString = '🟩🟩' + getPlayerEmoji(rowPlayers[0]) + '🟩' + getPlayerEmoji(rowPlayers[1]) + '🟩' + getPlayerEmoji(rowPlayers[2]) + '🟩🟩';
          break;
        case 4:
          rowString = '🟩' + getPlayerEmoji(rowPlayers[0]) + '🟩' + getPlayerEmoji(rowPlayers[1]) + '🟩' + getPlayerEmoji(rowPlayers[2]) + '🟩' + getPlayerEmoji(rowPlayers[3]) + '🟩';
          break;
        case 5:
          rowString = getPlayerEmoji(rowPlayers[0]) + '🟩' + getPlayerEmoji(rowPlayers[1]) + '🟩' + getPlayerEmoji(rowPlayers[2]) + '🟩' + getPlayerEmoji(rowPlayers[3]) + '🟩' + getPlayerEmoji(rowPlayers[4]);
          break;
        default:
          break;
      }

      return rowString;
    };

    // Helper function to get player emoji based on their state
    const getPlayerEmoji = (player: PlayerData | undefined) => {
      if (!player) return '❔';
      const playerState = playerStates[player.id];

      if (playerState?.isComplete) {
        return `${playerState.guesses.length}️⃣`; // Number emoji based on attempts
      } else if (playerState?.guesses?.length >= 8) {
        return '❌'; // X for failed players
      } else {
        return '❔'; // Question mark for unattempted players
      }
    };

    // Generate emoji table based on player state
    rowsInOrder.forEach((row, rowIndex) => {
      if (rowIndex > 0) table += '🟩🟩🟩🟩🟩🟩🟩🟩🟩\n'; // Add green row between rows
      table += generateRow(row) + '\n'; // Centered player row
    });

    return table;
  };

  const copyTableToClipboard = () => {
    const table = generateCopyableTable();
  
    const onSuccess = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(table)
        .then(onSuccess)
        .catch((err) => console.error('Failed to copy:', err));
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = table;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
  
      try {
        document.execCommand('copy');
        onSuccess();
      } catch (err) {
        console.error('Fallback copy failed:', err);
      }
  
      document.body.removeChild(textArea);
    }
  };

  return (
    <div className="relative h-full w-full max-w-[90vw] sm:max-w-[80vw] md:max-w-[720px] mx-auto overflow-hidden rounded-xl shadow-2xl bg-slate-900">
    {/* Pitch Background - clipped to boundary */}
    <div className="absolute inset-0 z-0 gradient-pitch m-[1%] rounded" />
    
    {/* Pitch Markings */}
    <div className="absolute inset-0 z-0 pointer-events-none">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 160"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* Pitch boundary line */}
        <rect x="1.5" y="1.5" width="97" height="157" rx="2" ry="2" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
        
        {/* Center line and circle */}
        <line x1="1.5" y1="80" x2="98.5" y2="80" stroke="rgba(255,255,255,0.22)" strokeWidth="0.8" />
        <circle cx="50" cy="80" r="10" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.8" />

        {/* Penalty boxes */}
        <rect x="20" y="1.5" width="60" height="22.5" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.8" />
        <rect x="20" y="136" width="60" height="22.5" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.8" />

        {/* 6-yard boxes */}
        <rect x="35" y="1.5" width="30" height="10.5" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.8" />
        <rect x="35" y="148" width="30" height="10.5" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.8" />

        {/* Penalty spots - positioned between 6-yard box and penalty box lines */}
        <circle cx="50" cy="18" r="1.2" fill="rgba(255,255,255,0.22)" />
        <circle cx="50" cy="142" r="1.2" fill="rgba(255,255,255,0.22)" />

        {/* Penalty arcs */}
        <path d="M40 24 A10 10 0 0 0 60 24" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.8" />
        <path d="M40 136 A10 10 0 0 1 60 136" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.8" />
      </svg>

      {/* Subtle grass texture overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/10 m-[1%] rounded" />
    </div>
    {/* Players Grid */}
    <div 
      className="relative z-10 grid h-full gap-2 sm:gap-3" 
      style={{ 
        gridTemplateRows: rowWeights.map((weight) => `${weight}fr`).join(" "),
      }}
    >
      {rowOrder.map((rowIndex) => {
        const rowPlayers = orientRowPlayers(getPlayersByRow(rowIndex, players))
        return (
          <div key={rowIndex} className="flex items-center justify-around px-2 sm:px-4">
            {rowPlayers.map(player => (
              <PlayerCard
                key={player.id}
                player={player}
                state={getPlayerState(player)}
                onClick={() => setSelectedPlayer(player)}
                team={team}
              />
            ))}
          </div>
        )
      })}
    </div>
    <>
    {/* Info + Leaderboard Buttons - Left */}
    <div className="absolute top-2 left-2 sm:top-4 sm:left-4 z-50 flex gap-1.5">
      <Button
        variant="outline"
        size="icon"
        className="glass border-white/20 text-white hover:bg-white/10 hover:border-white/30 transition-all duration-200 shadow-lg"
        onClick={() => setShowModal(true)}
        aria-label="Game info"
      >
        <Info className="h-4 w-4" />
      </Button>
      {gameStats.isGameComplete && (
        <Button
          variant="outline"
          size="icon"
          className="glass border-white/20 text-white hover:bg-white/10 hover:border-white/30 transition-all duration-200 shadow-lg"
          onClick={() => setShowLeaderboard(true)}
          aria-label="Leaderboard"
        >
          <BarChart3 className="h-4 w-4" />
        </Button>
      )}
    </div>

    {/* Share Button - Right */}
    <div className="absolute top-2 right-2 sm:top-4 sm:right-4 z-50">
      <Button
        variant="outline"
        size="icon"
        className="glass border-white/20 text-white hover:bg-white/10 hover:border-white/30 transition-all duration-200 shadow-lg"
        onClick={() => setShowCopyModal(true)}
        aria-label="Share results"
      >
        <Share2 className="h-4 w-4" />
      </Button>
    </div>
  </>

    <Dialog open={showModal} onOpenChange={(open) => !open && handleCloseInfoModal()}>
      <DialogContent className="font-mono sm:max-w-md glass rounded-2xl flex flex-col items-center">
        <div className="pb-2">
          <Trophy className="h-10 w-10 text-emerald-400 mx-auto drop-shadow-lg" />
          <div className="text-center mt-3">
            <div className="flex items-center justify-center gap-2 mb-1">
              <h2 className="text-2xl font-extrabold text-white tracking-tight">{team}</h2>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  difficulty === "easy"
                    ? "bg-emerald-600/80 text-emerald-100"
                    : "bg-red-700/80 text-red-100"
                }`}
              >
                {difficulty === "easy" ? "Easy" : "Hard"}
              </span>
            </div>
            <p className="text-sm text-slate-300 mt-1">
              {game}
            </p>
            <p className="text-sm text-slate-300 mt-1">
              {formation}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>

      <Dialog open={showCopyModal} onOpenChange={(open) => { setShowCopyModal(open); if (!open) setShowSubmitInShare(false); }}>
        <DialogContent className="font-mono sm:max-w-md flex flex-col items-center glass rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-white text-lg">Share Results</DialogTitle>
          </DialogHeader>
          <pre className="whitespace-pre-wrap break-words text-sm text-center text-white/90 bg-slate-800/50 p-4 rounded-xl w-full border border-white/10">
            {generateCopyableTable()}
          </pre>
          {showSubmitInShare ? (
            <LeaderboardSubmit
              gameId={gameId}
              difficulty={difficulty}
              matchName={game}
              solved={gameStats.solved}
              totalAttempts={gameStats.totalAttempts}
              failed={gameStats.failed}
              isComplete={gameStats.isGameComplete}
            />
          ) : (
            <div className="flex gap-2 w-full">
              <Button
                onClick={copyTableToClipboard}
                className={`${copied ? 'bg-emerald-600 hover:bg-emerald-600' : 'bg-emerald-600 hover:bg-emerald-500'} text-white rounded-xl transition-all duration-200 shadow-lg ${gameStats.isGameComplete ? 'flex-1' : 'w-full'}`}
                disabled={copied}
              >
                {copied ? (
                  <><CheckCircle2 className="h-4 w-4 mr-2" />Copied!</>
                ) : (
                  'Copy to Clipboard'
                )}
              </Button>
              {gameStats.isGameComplete && (
                isAlreadySubmitted(gameId, difficulty) ? (
                  <div className="flex-1 flex items-center justify-center gap-1.5 text-emerald-400 text-sm">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Gonderildi</span>
                  </div>
                ) : (
                  <Button
                    onClick={() => setShowSubmitInShare(true)}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-all duration-200 shadow-lg"
                  >
                    <Send className="h-4 w-4 mr-1" />
                    Skor Gonder
                  </Button>
                )
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <WordleDialog
        player={selectedPlayer}
        state={selectedPlayer ? getPlayerState(selectedPlayer) : undefined}
        open={!!selectedPlayer}
        onOpenChange={(open) => {
          if (!open) setSelectedPlayer(null)
        }}
        onGuessComplete={handleGuessComplete}
      />

      {/* Game Completion Modal */}
      <Dialog open={showCompletionModal} onOpenChange={setShowCompletionModal}>
        <DialogContent className="font-mono sm:max-w-md glass rounded-2xl flex flex-col items-center max-h-[90vh] overflow-y-auto">
          <div className="pb-4 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-400 mx-auto mb-3 drop-shadow-lg" />
            <h2 className="text-2xl font-bold text-white mb-1">Game Complete!</h2>
            <p className="text-slate-300 text-sm">
              İlk 11! #{gameId}
            </p>
          </div>
          <div className="text-center space-y-2 mb-4">
            <p className="text-xl">
              <span className="text-emerald-400 font-bold">✅ {gameStats.solved}</span> / 11 Solved
            </p>
            <p className="text-sm text-slate-300">
              🎯 {gameStats.totalAttempts} Total Attempts
            </p>
            {gameStats.failed > 0 && (
              <p className="text-sm text-red-400">
                ❌ {gameStats.failed} Failed
              </p>
            )}
          </div>
          <Button
            onClick={() => {
              setShowCompletionModal(false);
              setShowCopyModal(true);
            }}
            className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all duration-200 shadow-lg"
          >
            <Share2 className="h-4 w-4 mr-2" />
            Share Results
          </Button>
          <LeaderboardSubmit
            gameId={gameId}
            difficulty={difficulty}
            matchName={game}
            solved={gameStats.solved}
            totalAttempts={gameStats.totalAttempts}
            failed={gameStats.failed}
            isComplete={gameStats.isGameComplete}
          />
        </DialogContent>
      </Dialog>

      <LeaderboardModal
        open={showLeaderboard}
        onOpenChange={setShowLeaderboard}
      />
    </div>
  )
}
