"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Check, Copy, FileDown, Search, SlidersHorizontal } from "lucide-react"
import QUESTIONS from "@/data/ilk10/questions.json"
import type { Ilk10Question, Ilk10QuestionStatus } from "@/types/ilk10"

type StatusFilter = Ilk10QuestionStatus | "all"

const STORAGE_KEY = "ilk10-question-review-statuses"
const QUESTIONS_LIST = QUESTIONS as Ilk10Question[]
const STATUSES: Ilk10QuestionStatus[] = ["live", "draft", "retired"]

function getInitialStatuses(): Record<string, Ilk10QuestionStatus> {
  return Object.fromEntries(
    QUESTIONS_LIST.map((question) => [question.id, question.status ?? "live"])
  )
}

function getSourceFamily(question: Ilk10Question): string {
  if (/^Research verified/i.test(question.sourceLabel)) return "research"
  if (/fbref/i.test(question.sourceLabel)) return "fbref"
  if (/transfermarkt/i.test(question.sourceLabel)) return "transfermarkt"
  if (/wikipedia/i.test(question.sourceLabel)) return "wikipedia"
  if (/user curated|hand-curated|manual/i.test(`${question.sourceLabel} ${question.note ?? ""}`)) return "manual"
  return "other"
}

function statusClass(status: Ilk10QuestionStatus) {
  switch (status) {
    case "live":
      return "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
    case "draft":
      return "border-amber-400/40 bg-amber-500/15 text-amber-100"
    case "retired":
      return "border-rose-400/40 bg-rose-500/15 text-rose-100"
  }
}

function getExportPayload(statuses: Record<string, Ilk10QuestionStatus>): Ilk10Question[] {
  return QUESTIONS_LIST.map((question) => ({
    ...question,
    status: statuses[question.id] ?? question.status ?? "live",
  }))
}

function getQuestionWarnings(question: Ilk10Question): string[] {
  const warnings: string[] = []
  const answers = question.answers ?? []

  if (answers.length !== 10) warnings.push(`${answers.length} answers`)

  const allCapsAnswers = answers.filter((answer) =>
    /^[A-ZÇĞİÖŞÜ]{3,}$/.test(answer.displayValue ?? answer.value)
  )
  if (allCapsAnswers.length > 0) warnings.push(`${allCapsAnswers.length} uppercase/surname answers`)

  const statFormulaAnswers = answers.filter((answer) =>
    /^\d+\s*[GA]\s*(\+|=)/.test(answer.displayValue ?? answer.value)
  )
  if (statFormulaAnswers.length > 0) warnings.push(`${statFormulaAnswers.length} stat answers`)

  if (/2025-26|devam eden/i.test(`${question.id} ${question.prompt} ${question.shortLabel}`)) {
    warnings.push("ongoing season")
  }

  return warnings
}

export function Ilk10QuestionReviewPage() {
  const [statuses, setStatuses] = useState<Record<string, Ilk10QuestionStatus>>(getInitialStatuses)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [sourceFilter, setSourceFilter] = useState("all")
  const [copied, setCopied] = useState(false)
  const [exportHref, setExportHref] = useState("#")

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (!saved) return
      const parsed = JSON.parse(saved) as Record<string, Ilk10QuestionStatus>
      setStatuses({ ...getInitialStatuses(), ...parsed })
    } catch {
      // Ignore local review-state errors.
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(statuses))
    } catch {
      // Ignore local review-state errors.
    }
  }, [statuses])

  const sourceFamilies = useMemo(
    () => Array.from(new Set(QUESTIONS_LIST.map(getSourceFamily))).sort(),
    []
  )

  const counts = useMemo(() => {
    const next: Record<Ilk10QuestionStatus, number> = { live: 0, draft: 0, retired: 0 }
    for (const question of QUESTIONS_LIST) {
      next[statuses[question.id] ?? "live"] += 1
    }
    return next
  }, [statuses])

  const warningCount = useMemo(
    () => QUESTIONS_LIST.filter((question) => getQuestionWarnings(question).length > 0).length,
    []
  )

  const filteredQuestions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR")
    return QUESTIONS_LIST.filter((question) => {
      const status = statuses[question.id] ?? "live"
      if (statusFilter !== "all" && status !== statusFilter) return false
      if (sourceFilter !== "all" && getSourceFamily(question) !== sourceFilter) return false
      if (!normalizedQuery) return true

      const searchable = [
        question.id,
        question.shortLabel,
        question.prompt,
        question.entityType,
        question.category,
        question.sourceLabel,
        question.note ?? "",
        ...question.answers.map((answer) => answer.value),
      ].join(" ").toLocaleLowerCase("tr-TR")

      return searchable.includes(normalizedQuery)
    })
  }, [query, sourceFilter, statusFilter, statuses])

  const exportText = useMemo(
    () => `${JSON.stringify(getExportPayload(statuses), null, 2)}\n`,
    [statuses]
  )

  useEffect(() => {
    const objectUrl = URL.createObjectURL(new Blob([exportText], { type: "application/json" }))
    setExportHref(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [exportText])

  const updateStatus = (questionId: string, status: Ilk10QuestionStatus) => {
    setStatuses((current) => ({ ...current, [questionId]: status }))
  }

  const copyExport = async () => {
    await navigator.clipboard.writeText(exportText)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <main className="min-h-screen bg-[#111315] text-slate-100">
      <div className="border-b border-white/10 bg-[#17191c]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight">İlk10 Question Review</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">
                Canonical JSON editor for live/draft/retired status decisions.
              </p>
            </div>
            <div className="grid grid-cols-3 overflow-hidden rounded border border-white/10 bg-black/20 text-center">
              {STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(statusFilter === status ? "all" : status)}
                  className={`px-4 py-2 text-xs font-bold uppercase tracking-wide ${
                    statusFilter === status ? statusClass(status) : "text-slate-300 hover:bg-white/5"
                  }`}
                >
                  {status} {counts[status]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 md:flex-row">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded border border-white/10 bg-black/20 px-3 py-2">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search questions, answers, ids, notes"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-600"
              />
            </label>
            <label className="flex items-center gap-2 rounded border border-white/10 bg-black/20 px-3 py-2">
              <SlidersHorizontal className="h-4 w-4 text-slate-500" />
              <select
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value)}
                className="bg-transparent text-sm outline-none"
              >
                <option value="all">all sources</option>
                {sourceFamilies.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setStatuses(getInitialStatuses())}
              className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/5"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={copyExport}
              className="inline-flex items-center justify-center gap-2 rounded border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-sm font-bold text-emerald-100 hover:bg-emerald-500/25"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              Copy JSON
            </button>
            <a
              href={exportHref}
              download="questions.json"
              className="inline-flex items-center justify-center gap-2 rounded border border-sky-400/30 bg-sky-500/15 px-3 py-2 text-sm font-bold text-sky-100 hover:bg-sky-500/25"
            >
              <FileDown className="h-4 w-4" />
              Export
            </a>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-400">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              Showing {filteredQuestions.length} of {QUESTIONS_LIST.length}
            </span>
            <span className="inline-flex items-center gap-1 rounded border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-100">
              <AlertTriangle className="h-3.5 w-3.5" />
              {warningCount} flagged
            </span>
          </div>
          <span className="text-xs text-slate-500">Changes are local until you copy or export JSON.</span>
        </div>
        <div className="space-y-2">
          {filteredQuestions.map((question) => {
            const status = statuses[question.id] ?? "live"
            const warnings = getQuestionWarnings(question)
            return (
              <article
                key={question.id}
                className="rounded border border-white/10 bg-[#15171a] p-3 shadow-sm shadow-black/20 hover:border-white/20 hover:bg-[#1b1e22]"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="break-words text-sm font-black text-white">{question.shortLabel}</h2>
                      <span className="rounded bg-black/30 px-2 py-0.5 text-[11px] text-slate-400">
                        {question.id}
                      </span>
                      <span className={`rounded border px-2 py-0.5 text-[11px] font-bold uppercase ${statusClass(status)}`}>
                        {status}
                      </span>
                      {warnings.map((warning) => (
                        <span
                          key={warning}
                          className="inline-flex items-center gap-1 rounded border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-100"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {warning}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-sm leading-5 text-slate-300">{question.prompt}</p>
                  </div>
                  <div className="grid w-full grid-cols-3 overflow-hidden rounded border border-white/10 bg-black/20 sm:w-[270px]">
                    {STATUSES.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => updateStatus(question.id, option)}
                        className={`px-2 py-2 text-center text-xs font-bold uppercase ${
                          status === option ? statusClass(option) : "text-slate-500 hover:bg-white/5"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                <ol className="mt-3 grid gap-1.5 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-5">
                  {question.answers.map((answer, index) => (
                    <li key={`${question.id}-${index}`} className="min-w-0 rounded bg-black/20 px-2 py-1">
                      <span className="mr-1 text-slate-600">{index + 1}.</span>
                      <span className="break-words">{answer.displayValue ?? answer.value}</span>
                      {answer.scoreLabel ? <span className="ml-1 text-slate-600">· {answer.scoreLabel}</span> : null}
                    </li>
                  ))}
                </ol>

                <div className="mt-3 grid gap-2 text-xs text-slate-400 md:grid-cols-[minmax(0,1fr)_180px]">
                  <div className="min-w-0 rounded border border-white/10 bg-black/10 px-2 py-2">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-300">{getSourceFamily(question)}</span>
                      <span className="text-slate-600">{question.entityType}</span>
                      <span className="text-slate-600">{question.category}</span>
                    </div>
                    <div className="break-words text-slate-500">{question.sourceLabel}</div>
                  </div>
                  {question.note ? (
                    <div className="rounded border border-white/10 bg-black/10 px-2 py-2 text-slate-500">
                      {question.note}
                    </div>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </main>
  )
}
