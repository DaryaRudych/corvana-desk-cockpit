// Shared rendering for AI output: the AI badge, text with metric chips, and the "Based on:" line.
import { Fragment } from 'react'
import { isChip, type Chip, type Segment } from '../ai/types'
import { METRIC_CATALOG, type QueryResult } from '../semantic/query'
import { useMetricCard } from './metricCardContext'
import { MetricValue } from './ui'

const NAMES = new Map(METRIC_CATALOG.map((m) => [m.id, m.name]))

export function AiBadge({ label = 'AI' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white">
      <svg viewBox="0 0 16 16" className="size-2.5" fill="currentColor" aria-hidden="true">
        <path d="M8 0l1.8 5.2L15 7l-5.2 1.8L8 14l-1.8-5.2L1 7l5.2-1.8z" />
      </svg>
      {label}
    </span>
  )
}

/** A governed value inside AI text: same value, same card, styled as a chip. */
export function MetricChip({ c }: { c: Chip }) {
  return (
    <span className="mx-0.5 inline-flex rounded-md bg-indigo-50 px-1.5 py-px align-baseline font-semibold text-indigo-700 ring-1 ring-indigo-100 ring-inset">
      <MetricValue r={c.r} format={c.label !== undefined ? () => c.label! : c.format} />
    </span>
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

/** "Based on:" the metrics the AI read; each opens its definition. */
export function BasedOn({ results }: { results: QueryResult<unknown>[] }) {
  const open = useMetricCard()
  if (!results.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1 text-[11px] text-zinc-500">
      <span>Based on:</span>
      {results.map((r) => (
        <button
          key={r.metricId}
          type="button"
          onClick={(e) => open?.(r, e.currentTarget)}
          className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600 hover:bg-indigo-50 hover:text-indigo-700"
        >
          {NAMES.get(r.metricId) ?? r.metricId}
        </button>
      ))}
    </div>
  )
}
