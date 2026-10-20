// Shared rendering for AI output: the AI mark, text with metric chips, and the "Based on" line.
import { Fragment, useState } from 'react'
import { isChip, type Chip, type Segment } from '../ai/types'
import { METRIC_CATALOG, type QueryResult } from '../semantic/query'
import { useMetricCard } from './metricCardContext'
import { MetricValue } from './ui'

const NAMES = new Map(METRIC_CATALOG.map((m) => [m.id, m.name]))

/** The only AI label: a small sparkle. */
export function AiMark({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`shrink-0 text-indigo-500 ${className}`} fill="currentColor" role="img" aria-label="AI-generated from governed metrics">
      <title>AI-generated from governed metrics</title>
      <path d="M8 0l1.8 5.2L15 7l-5.2 1.8L8 14l-1.8-5.2L1 7l5.2-1.8z" />
      <path d="M13 10.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" opacity=".6" />
    </svg>
  )
}

/** A governed value inside AI text: reads as text, a faint dotted underline marks it as clickable. */
export function MetricChip({ c }: { c: Chip }) {
  return (
    <MetricValue
      r={c.r}
      format={c.label !== undefined ? () => c.label! : c.format}
      className="font-medium text-zinc-900 underline decoration-zinc-300 decoration-dotted underline-offset-[3px] hover:decoration-indigo-500"
    />
  )
}

export function Segments({ parts }: { parts: Segment[] }) {
  return (
    <>
      {parts.map((s, i) => (
        <Fragment key={i}>{isChip(s) ? <MetricChip c={s} /> : s}</Fragment>
      ))}
    </>
  )
}

/** "Based on" the metrics the AI read: a quiet "Sources (n)" toggle; each name opens its definition. */
export function BasedOn({ results }: { results: QueryResult<unknown>[] }) {
  const open = useMetricCard()
  const [shown, setShown] = useState(false)
  if (!results.length) return null
  if (!shown) {
    return (
      <button type="button" onClick={() => setShown(true)} className="self-start text-xs text-zinc-400 hover:text-zinc-700">
        Sources ({results.length})
      </button>
    )
  }
  return (
    <p className="text-xs leading-relaxed text-zinc-400">
      Based on{' '}
      {results.map((r, i) => (
        <Fragment key={r.metricId}>
          {i > 0 && ' · '}
          <button type="button" onClick={(e) => open?.(r, e.currentTarget)} className="text-zinc-500 hover:text-indigo-700 hover:underline">
            {NAMES.get(r.metricId) ?? r.metricId}
          </button>
        </Fragment>
      ))}{' '}
      <button type="button" onClick={() => setShown(false)} className="text-zinc-400 hover:text-zinc-700">
        · hide
      </button>
    </p>
  )
}
