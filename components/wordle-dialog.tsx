"use client"

import { useCallback, useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { WordleKeyboard } from "@/components/wordle-keyboard"
import { WordleGrid } from "@/components/wordle-grid"
import type { PlayerData, PlayerState } from "@/types/game"
import { normalizePlayerName, normalizeKeyInput } from "@/lib/utils"

interface WordleDialogProps {
  player: PlayerData | null
  state?: PlayerState
  open: boolean
  onOpenChange: (open: boolean) => void
  onGuessComplete: (playerId: number, guesses: string[], isComplete: boolean) => void
}

export function WordleDialog({ 
  player, 
  state,
  open, 
  onOpenChange, 
  onGuessComplete 
}: WordleDialogProps) {
  const [currentGuess, setCurrentGuess] = useState("")
  const [guesses, setGuesses] = useState<string[]>([])
  const [isCelebrating, setIsCelebrating] = useState(false)
  const closeTimeoutRef = useRef<number | null>(null)

  // Compute normalized name once for consistent use
  const normalizedName = player ? normalizePlayerName(player.name) : ""
  const isSolved = !!state?.isComplete || guesses.includes(normalizedName)

  // Swipe-down-to-dismiss state for mobile bottom sheet
  const [dragOffset, setDragOffset] = useState(0)
  const dragStartY = useRef<number | null>(null)
  const isDragging = useRef(false)
  const DISMISS_THRESHOLD = 100 // px to drag before auto-dismissing

  const handleTouchStart = useCallback((e: ReactTouchEvent) => {
    // Only initiate drag from the handle area (top ~40px)
    const touch = e.touches[0]
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    if (touch.clientY - rect.top > 48) return
    dragStartY.current = touch.clientY
    isDragging.current = false
  }, [])

  const handleTouchMove = useCallback((e: ReactTouchEvent) => {
    if (dragStartY.current === null) return
    const delta = e.touches[0].clientY - dragStartY.current
    if (delta > 0) {
      isDragging.current = true
      setDragOffset(delta)
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (dragStartY.current === null) return
    if (dragOffset > DISMISS_THRESHOLD) {
      // Dismiss
      dragStartY.current = null
      setDragOffset(0)
      if (player && guesses.length > 0 && !isSolved) {
        onGuessComplete(player.id, guesses, false)
      }
      onOpenChange(false)
    } else {
      // Snap back
      setDragOffset(0)
    }
    dragStartY.current = null
    isDragging.current = false
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragOffset, player, guesses, isSolved, onGuessComplete, onOpenChange])

  const MAX_GUESSES = 8
  // Game is over if solved OR max guesses reached (check both state and local guesses for race safety)
  const isGameOver = isSolved || guesses.length >= MAX_GUESSES || (state?.guesses?.length ?? 0) >= MAX_GUESSES
  const remainingGuesses = MAX_GUESSES - guesses.length

  const clearCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    if (open && player) {
      // Only reset when dialog initially opens, not when state updates during celebration
      if (!isCelebrating) {
        clearCloseTimeout()
        setCurrentGuess("")
        setGuesses(state?.guesses || [])
      }
    }
    if (!open) {
      clearCloseTimeout()
      setIsCelebrating(false)
      setDragOffset(0)
    }
  }, [open, player, state, clearCloseTimeout, isCelebrating])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open || !player || isGameOver || isCelebrating) return
  
      if (e.key === "Enter") {
        if (currentGuess.length === normalizedName.length) {
          const newGuesses = [...guesses, currentGuess]
          setGuesses(newGuesses)
          setCurrentGuess("")
  
          const isComplete = currentGuess === normalizedName
          if (isComplete || newGuesses.length >= MAX_GUESSES) {
            onGuessComplete(player.id, newGuesses, isComplete)
            if (isComplete) {
              setIsCelebrating(true)
              clearCloseTimeout()
              closeTimeoutRef.current = window.setTimeout(() => {
                onOpenChange(false)
              }, 1000)
            }
          }
        }
      } else if (e.key === "Backspace") {
        setCurrentGuess(prev => prev.slice(0, -1))
      } else {
        const letter = normalizeKeyInput(e.key)
        if (letter && currentGuess.length < normalizedName.length) {
          setCurrentGuess(prev => prev + letter)
        }
      }
    }
  
    const cleanup = () => window.removeEventListener("keydown", handleKeyDown)
  
    if (open && player && !isGameOver) {
      window.addEventListener("keydown", handleKeyDown)
    }
  
    return cleanup
  }, [open, player, isGameOver, isCelebrating, currentGuess, guesses, normalizedName, onGuessComplete, onOpenChange, clearCloseTimeout])

  const handleClose = (nextOpen: boolean) => {
    if (nextOpen) return
    clearCloseTimeout()

    if (player && guesses.length > 0 && !isSolved) {
      onGuessComplete(player.id, guesses, false)
    }
    onOpenChange(false)
  }

  // Handler for on-screen keyboard - uses normalized name consistently
  const handleKeyPress = (key: string) => {
    if (isGameOver || isCelebrating) return
    
    if (key === "Enter") {
      if (currentGuess.length === normalizedName.length) {
        const newGuesses = [...guesses, currentGuess]
        setGuesses(newGuesses)
        setCurrentGuess("")

        const isComplete = currentGuess === normalizedName
        if (isComplete || newGuesses.length >= MAX_GUESSES) {
          onGuessComplete(player!.id, newGuesses, isComplete)
          if (isComplete) {
            setIsCelebrating(true)
            clearCloseTimeout()
            closeTimeoutRef.current = window.setTimeout(() => {
              onOpenChange(false)
            }, 1000)
          }
        }
      }
    } else if (key === "Backspace") {
      setCurrentGuess(prev => prev.slice(0, -1))
    } else {
      const letter = normalizeKeyInput(key)
      if (letter && currentGuess.length < normalizedName.length) {
        setCurrentGuess(prev => prev + letter)
      }
    }
  }

  if (!player) return null

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: dragOffset > 0
            ? `translateY(${dragOffset}px)`
            : undefined,
          transition: isDragging.current ? 'none' : 'transform 0.2s ease-out',
        }}
        className="
        font-mono glass text-white overflow-hidden
        /* Mobile: bottom-sheet anchored to bottom, full width */
        fixed left-0 right-0 bottom-0 top-auto translate-x-0 translate-y-0
        w-full max-w-none rounded-t-2xl rounded-b-none
        p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]
        max-h-[94dvh]
        /* Desktop: centered dialog */
        sm:left-[50%] sm:right-auto sm:bottom-auto sm:top-[50%]
        sm:translate-x-[-50%] sm:translate-y-[-50%]
        sm:w-[90vw] sm:max-w-lg sm:rounded-2xl
        sm:p-4 sm:max-h-[92dvh]
        /* Override radix slide-in animations for mobile bottom-sheet */
        data-[state=open]:!slide-in-from-bottom-full
        data-[state=closed]:!slide-out-to-bottom-full
        sm:data-[state=open]:!slide-in-from-bottom-0
        sm:data-[state=closed]:!slide-out-to-bottom-0
      ">
        {/* Drag handle for mobile bottom sheet — swipe down to dismiss */}
        <div className="flex justify-center pt-1 pb-2 sm:hidden cursor-grab active:cursor-grabbing" aria-hidden="true">
          <div className="w-10 h-1 rounded-full bg-white/25" />
        </div>

        <div className="flex flex-col gap-2 sm:gap-4 min-h-0">
          {/* Attempt counter */}
          {!isGameOver && (
            <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 flex-shrink-0">
              <span className="font-bold text-white text-sm">{remainingGuesses}</span>
              <span>/ {MAX_GUESSES} hak kaldı</span>
            </div>
          )}

          {/* Grid section - stable layout, no dynamic resizing */}
          <div className="w-full min-h-0 overflow-y-auto flex-shrink" style={{ overscrollBehavior: 'contain' }}>
            <WordleGrid
              word={player.name}
              guesses={guesses}
              currentGuess={currentGuess}
              maxGuesses={MAX_GUESSES}
            />
          </div>

          {guesses.length >= MAX_GUESSES && !state?.isComplete && (
            <div className="text-red-400 font-bold text-sm text-center bg-red-500/10 py-1.5 rounded-xl border border-red-500/20 break-words flex-shrink-0">
              Doğru cevap: {player.name}
            </div>
          )}

          {/* Keyboard section - pinned to bottom, never scrolls away */}
          <div className="w-full flex-shrink-0">
            <WordleKeyboard
              word={player.name}
              guesses={guesses}
              onKeyPress={handleKeyPress}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
