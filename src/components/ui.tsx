// Shared presentational pieces. Visual language: soft-grey canvas, white rounded cards
// without borders, one big figure per card, grey tiles for paired facts, hairline lists.
import type { ReactNode } from 'react'
import { formatValue } from '../lib/format'
import { METRIC_CATALOG, type QueryResult } from '../semantic/query'
import { LockIcon } from './Icons'
import { useMetricCard } from './metricCardContext'

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral' | 'accent'
export interface Verdict {
  tone: Tone
  label: string
}

export const CARD = 'rounded-2xl bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.05)]'

/** Decision card: a title and its one-line answer as a status pill. Same frame for every card. */
export function Card({ title, verdict, verdictInfo, children }: { title: string; verdict?: Verdict; verdictInfo?: ReactNode; children: ReactNode }) {
  return (
    <section className={`flex flex-col ${CARD}`}>
      <header className="flex flex-col items-start gap-1.5 px-5 pt-4">
        <h2 className="text-base leading-snug font-semibold tracking-tight whitespace-nowrap text-zinc-900">{title}</h2>
        {verdict && (
          <span className="inline-flex items-center gap-1.5">
            <Pill tone={verdict.tone} className="whitespace-nowrap">
              {verdict.label}
            </Pill>
            {verdictInfo}
          </span>
        )}
      </header>
      <div className="flex flex-1 flex-col gap-4 px-5 pt-4 pb-5">{children}</div>
    </section>
  )
}

const HERO_TONE: Record<Tone, string> = {
  ok: 'text-emerald-600',
  warn: 'text-amber-600',
  bad: 'text-red-600',
  neutral: 'text-zinc-900',
  accent: 'text-indigo-600',
}
/** The one figure a card leads with. */
export function Hero({ label, tone = 'neutral', caption, children }: { label: string; tone?: Tone; caption?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`text-[28px] leading-tight font-semibold tracking-tight ${HERO_TONE[tone]}`}>{children}</div>
      {caption && <div className="mt-0.5 text-xs text-zinc-500">{caption}</div>}
    </div>
  )
}

/** Soft grey tile for a pair of side-by-side facts. */
export function Tile({ label, children, sub, subTone = 'neutral' }: { label: string; children: ReactNode; sub?: ReactNode; subTone?: Tone }) {
  const subColor = subTone === 'neutral' ? 'text-zinc-500' : HERO_TONE[subTone]
  return (
    <div className="min-w-0 rounded-xl bg-zinc-50 px-3 py-2.5">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className="num mt-0.5 text-[15px] font-semibold text-zinc-900">{children}</div>
      {sub && <div className={`mt-0.5 text-[11px] ${subColor}`}>{sub}</div>}
    </div>
  )
}

/** Hairline-separated label/value list. */
export function List({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div>
      {title && <h3 className="mb-1 text-[11px] font-medium text-zinc-400">{title}</h3>}
      <div className="divide-y divide-zinc-100">{children}</div>
    </div>
  )
}
export function ListRow({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-zinc-500">
        {label}
        {hint && <span className="block text-[11px] text-zinc-400">{hint}</span>}
      </span>
      <span className="num text-right font-medium text-zinc-900">{children}</span>
    </div>
  )
}

/** Small uppercase label over a value, for the enquiry fact strip. */
export function Fact({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-[11px] text-zinc-400">{label}</div>
      <div className="num text-sm font-semibold text-zinc-900">{children}</div>
    </div>
  )
}

const TONES: Record<Tone, string> = {
  ok: 'bg-emerald-50 text-emerald-700',
  warn: 'bg-amber-50 text-amber-700',
  bad: 'bg-red-50 text-red-600',
  neutral: 'bg-zinc-100 text-zinc-600',
  accent: 'bg-indigo-50 text-indigo-700',
}
export function Pill({ tone, children, className = '' }: { tone: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TONES[tone]} ${className}`}>{children}</span>
}

const UNITS = new Map(METRIC_CATALOG.map((m) => [m.id, m.unit]))

/**
 * Renders a governed number exactly as query() returned it, as a button that opens
 * the metric card. Withheld values show a lock; nothing is computed here.
 */
export function MetricValue({ r, className = '', format }: { r: QueryResult<unknown>; className?: string; format?: (v: never) => string }) {
  const openCard = useMetricCard()
  const withheld = r.value === null && r.restricted
  const text = withheld ? 'Restricted' : format && r.value !== null ? format(r.value as never) : formatValue(UNITS.get(r.metricId)!, r.value)
  const look = withheld ? `inline-flex items-center gap-1 text-zinc-400 ${className}` : `num ${className}`
  if (!openCard) return <span className={look}>{text}</span>
  return (
    <button
      type="button"
      onClick={(e) => openCard(r, e.currentTarget)}
      title={withheld ? r.restricted : 'Show definition'}
      className={`${look} cursor-pointer rounded-[3px] decoration-indigo-300 decoration-dotted underline-offset-[3px] hover:underline focus-visible:outline-2 focus-visible:outline-indigo-500`}
    >
      {withheld && <LockIcon />}
      {text}
    </button>
  )
}

/** "detail restricted" marker for totals whose underlying rows belong to other BUs. */
export function DetailRestricted({ message }: { message: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400" title={message}>
      <LockIcon className="size-2.5" /> detail restricted
    </span>
  )
}

/** ⓘ with a hover/focus tooltip. Rule thresholds and scopes live here, not inline. */
export function InfoTip({ children, label = 'More information', below = false, align = 'center' }: { children: ReactNode; label?: string; below?: boolean; align?: 'center' | 'left' | 'right' }) {
  return (
    <span className="group relative inline-flex align-middle">
      <span tabIndex={0} aria-label={label} className="flex size-3.5 cursor-help items-center justify-center rounded-full border border-zinc-300 text-[9px] font-bold text-zinc-400 group-hover:border-zinc-500 group-hover:text-zinc-600 focus:outline-none">
        i
      </span>
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-30 w-60 rounded-lg ${below ? 'top-5' : 'bottom-5'} ${align === 'left' ? 'left-0' : align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'} bg-zinc-900 px-3 py-2 text-left text-xs leading-snug font-normal text-white opacity-0 shadow-lg transition-opacity group-focus-within:opacity-100 group-hover:opacity-100`}
      >
        {children}
      </span>
    </span>
  )
}
