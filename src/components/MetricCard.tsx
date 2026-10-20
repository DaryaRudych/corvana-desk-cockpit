// "Where definitions live": clicking any governed number opens this card with the
// metric's definition, formula, owner, certification and lineage from the registry.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { dateTime, formatValue, longDate } from '../lib/format'
import { METRIC_CATALOG, type MetricMeta, type QueryResult, type UserContext } from '../semantic/query'
import { LockIcon } from './Icons'
import { MetricCardContext, scopeLabel } from './metricCardContext'
import { Pill } from './ui'

const META = new Map(METRIC_CATALOG.map((m) => [m.id, m]))
const WIDTH = 360
const GAP = 8
const HIDDEN: CSSProperties = { width: WIDTH, left: 0, top: 0, visibility: 'hidden' }

export function CertifiedBadge({ m }: { m: MetricMeta }) {
  return m.certified ? (
    <Pill tone="ok" className="shrink-0 whitespace-nowrap">✓ Certified {m.certifiedOn ? longDate(m.certifiedOn) : ''}</Pill>
  ) : (
    <Pill tone="warn" className="shrink-0 whitespace-nowrap">Not certified</Pill>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2 py-1.5">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-zinc-900">{children}</dd>
    </div>
  )
}

function Card({ r, user, anchor, onClose }: { r: QueryResult<unknown>; user: UserContext; anchor: DOMRect; onClose: () => void }) {
  const m = META.get(r.metricId)!
  const ref = useRef<HTMLDivElement>(null)

  // Place below the value; flip above if it would run off the bottom; keep inside the viewport horizontally.
  useLayoutEffect(() => {
    const el = ref.current!
    const left = Math.min(Math.max(GAP, anchor.left), window.innerWidth - WIDTH - GAP)
    const below = anchor.bottom + GAP
    const top = below + el.offsetHeight > window.innerHeight - GAP ? Math.max(GAP, anchor.top - GAP - el.offsetHeight) : below
    Object.assign(el.style, { left: `${left}px`, top: `${top}px`, visibility: 'visible' })
  }, [anchor])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  const withheld = r.value === null && r.restricted
  const valueText = m.kind === 'dataset' ? 'Governed dataset' : formatValue(m.unit, r.value)

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${m.name} definition`}
      style={HIDDEN}
      className="fixed z-50 rounded-2xl bg-white p-4 text-[13px] shadow-[0_8px_32px_rgba(16,24,40,0.16),0_1px_3px_rgba(16,24,40,0.08)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] leading-snug font-semibold text-zinc-900">{m.name}</h3>
          <div className="mt-0.5 font-mono text-[11px] text-zinc-400">{m.id}</div>
        </div>
        <CertifiedBadge m={m} />
      </div>

      <div className="mt-3 rounded-xl bg-zinc-50 px-3 py-2">
        <div className="text-[11px] text-zinc-500">{withheld ? 'Value' : `Value · as of ${dateTime(r.asOf)}`}</div>
        {withheld ? (
          <div className="mt-0.5 inline-flex items-center gap-1.5 font-semibold text-zinc-500">
            <LockIcon /> Restricted
          </div>
        ) : (
          <div className="num mt-0.5 text-lg font-semibold text-zinc-900">{valueText}</div>
        )}
        {r.restricted && <p className="mt-1 text-xs text-zinc-500">{r.restricted}</p>}
      </div>

      <p className="mt-3 leading-relaxed text-zinc-700">{m.definition}</p>
      <code className="mt-2 block rounded-lg bg-zinc-50 px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-700">{m.formula}</code>

      <dl className="mt-2 divide-y divide-zinc-100 text-xs">
        <Field label="Owner">{m.owner}</Field>
        <Field label="Scope">{scopeLabel(m, user)}</Field>
        <Field label="Visible to">{m.visibleTo.map((r) => r[0].toUpperCase() + r.slice(1)).join(', ')}</Field>
        <Field label="Source tables">
          <span className="flex flex-wrap gap-1">
            {m.sourceTables.map((t) => (
              <span key={t} className="rounded bg-zinc-100 px-1.5 py-px font-mono text-[10px] text-zinc-600">
                {t}
              </span>
            ))}
          </span>
        </Field>
      </dl>
    </div>
  )
}

/** Provides the single metric-card popover for the whole app. */
export function MetricCardProvider({ user, children }: { user: UserContext; children: ReactNode }) {
  const [state, setState] = useState<{ r: QueryResult<unknown>; anchor: DOMRect } | null>(null)
  const open = useCallback((r: QueryResult<unknown>, el: HTMLElement) => setState({ r, anchor: el.getBoundingClientRect() }), [])
  const close = useCallback(() => setState(null), [])

  return (
    <MetricCardContext.Provider value={open}>
      {children}
      {state && <Card key={`${state.r.metricId}-${state.anchor.top}-${state.anchor.left}`} r={state.r} user={user} anchor={state.anchor} onClose={close} />}
    </MetricCardContext.Provider>
  )
}
