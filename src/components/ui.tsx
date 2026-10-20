// Shared presentational pieces: panel shell, rows, status pills, metric values.
import type { ReactNode } from 'react'
import { formatValue } from '../lib/format'
import { METRIC_CATALOG, type QueryResult } from '../semantic/query'
import { LockIcon } from './Icons'

export interface Verdict {
  tone: Tone
  label: string
}
const EDGE: Record<Tone, string> = {
  ok: 'border-t-emerald-500',
  warn: 'border-t-amber-500',
  bad: 'border-t-red-500',
  neutral: 'border-t-zinc-300',
  accent: 'border-t-indigo-500',
}

/** Decision panel: a question as the title, what it covers underneath, and its one-line answer as a status pill. */
export function Panel({ step, title, subtitle, verdict, children }: { step: number; title: string; subtitle: string; verdict: Verdict; children: ReactNode }) {
  return (
    <section className={`flex flex-col rounded-lg border border-t-[3px] border-zinc-200 bg-white shadow-sm ${EDGE[verdict.tone]}`}>
      <header className="border-b border-zinc-100 px-4 pt-3 pb-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-semibold text-white">{step}</span>
            <h2 className="text-[15px] leading-tight font-semibold whitespace-nowrap text-zinc-900">{title}</h2>
          </div>
          <Pill tone={verdict.tone} className="shrink-0 px-2 py-0.5 text-xs whitespace-nowrap">
            {verdict.label}
          </Pill>
        </div>
        <p className="mt-0.5 pl-[30px] text-xs text-zinc-500">{subtitle}</p>
      </header>
      <div className="flex flex-1 flex-col gap-3 px-4 py-3">{children}</div>
    </section>
  )
}

/** Small uppercase label over a value, for fact strips. */
export function Fact({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">{label}</div>
      <div className="num text-sm font-medium text-zinc-900">{children}</div>
    </div>
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

/** Sub-heading inside a panel. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">{children}</h3>
}
