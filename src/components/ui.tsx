// Shared presentational pieces: panel shell, rows, status pills, metric values.
import type { ReactNode } from 'react'
import { formatValue } from '../lib/format'
import { METRIC_CATALOG, type QueryResult } from '../semantic/query'
import { LockIcon } from './Icons'

export function Panel({ step, title, children, className = '' }: { step?: number; title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col rounded-md border border-zinc-200 bg-white ${className}`}>
      <h2 className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">
        {step !== undefined && <span className="flex size-4 items-center justify-center rounded-full bg-zinc-800 text-[10px] text-white">{step}</span>}
        {title}
      </h2>
      <div className="flex flex-1 flex-col gap-3 p-3">{children}</div>
    </section>
  )
}

export function Row({ label, children, sub }: { label: ReactNode; children: ReactNode; sub?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${sub ? 'pl-3 text-zinc-500' : ''}`}>
      <span className={sub ? '' : 'text-zinc-600'}>{label}</span>
      <span className="num text-right">{children}</span>
    </div>
  )
}

type Tone = 'ok' | 'warn' | 'bad' | 'neutral' | 'accent'
const TONES: Record<Tone, string> = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  warn: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  bad: 'bg-red-50 text-red-700 ring-red-600/20',
  neutral: 'bg-zinc-100 text-zinc-600 ring-zinc-500/15',
  accent: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
}
export function Pill({ tone, children, className = '' }: { tone: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded px-1.5 py-px text-[11px] font-semibold ring-1 ring-inset ${TONES[tone]} ${className}`}>{children}</span>
}

const UNITS = new Map(METRIC_CATALOG.map((m) => [m.id, m.unit]))

/**
 * Renders a governed number exactly as query() returned it.
 * Withheld values show a lock and the reason; nothing is computed here.
 */
export function MetricValue({ r, className = '', format }: { r: QueryResult<unknown>; className?: string; format?: (v: never) => string }) {
  if (r.value === null && r.restricted) {
    return (
      <span className={`inline-flex items-center gap-1 text-zinc-400 ${className}`} title={r.restricted}>
        <LockIcon /> Restricted
      </span>
    )
  }
  const text = format && r.value !== null ? format(r.value as never) : formatValue(UNITS.get(r.metricId)!, r.value)
  return <span className={`num ${className}`}>{text}</span>
}

/** "detail restricted" marker for totals whose underlying rows belong to other BUs. */
export function DetailRestricted({ message }: { message: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400" title={message}>
      <LockIcon className="size-2.5" /> detail restricted
    </span>
  )
}
