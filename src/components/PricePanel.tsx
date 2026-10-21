// Pricing & Margin: the governed suggested-premium RULE (not AI), the trader's premium, and what
// the deal earns. Compact by default (numbers over words); the build-up and the economics
// waterfall open on demand. Rule thresholds live in tooltips and the definitions panel only.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { mt, usdCompact, usdMt } from '../lib/format'
import type { ValueOf } from '../semantic/metrics'
import { query, type QueryResult, type UserContext } from '../semantic/query'
import { useOpenDefinition } from './governanceContext'
import { ChevronIcon } from './Icons'
import { termsParams, type Terms } from './terms'
import { Card, InfoTip, List, ListRow, MetricValue, Tile, type Verdict } from './ui'

type WinRange = ValueOf<'win_range_similar'>

const MIN = 0
const MAX = 25
const STEP = 0.5
const THUMB = 18 // px; the track is inset by half a thumb so marks line up with the thumb centre

const plain = (v: number) => usdMt(v) // "$13.33"
const signed = (v: number) => `${v < 0 ? '−' : '+'}$${Math.abs(v).toFixed(2)}`

// ───────────────────────────── slider ─────────────────────────────

type Mark = { key: string; at: number; label: string; color: string }

/**
 * Labels under the track, at their x-positions, stacked into rows when they would collide.
 * Widths are estimated (10px font) so layout needs no second render pass.
 */
function placeLabels(marks: Mark[], trackPx: number) {
  const rows: number[] = [] // right edge of the last label in each row
  return [...marks]
    .sort((a, b) => a.at - b.at)
    .map((m) => {
      const w = m.label.length * 5.4 + 6
      const center = ((m.at - MIN) / (MAX - MIN)) * trackPx
      const left = Math.min(Math.max(center - w / 2, 0), Math.max(0, trackPx - w))
      let row = rows.findIndex((right) => left > right + 4)
      if (row === -1) row = rows.length
      rows[row] = left + w
      return { ...m, left, row }
    })
}

function PremiumSlider({
  w,
  customerAvg,
  value,
  onChange,
}: {
  w: WinRange | null
  customerAvg: number | null
  value: number
  onChange: (v: number) => void
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const [trackPx, setTrackPx] = useState(240)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setTrackPx(entry.contentRect.width - THUMB))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const x = (v: number) => `${((Math.min(Math.max(v, MIN), MAX) - MIN) / (MAX - MIN)) * 100}%`
  const marks: Mark[] = []
  if (w?.lowestLost != null) marks.push({ key: 'lost', at: w.lowestLost, label: `lost ${plain(w.lowestLost)}`, color: 'text-red-500' })
  if (w?.wonP25 != null && w.wonP75 != null)
    marks.push({ key: 'won', at: (w.wonP25 + w.wonP75) / 2, label: `won p25–75 ${plain(w.wonP25)}–${w.wonP75.toFixed(2)}`, color: 'text-emerald-600' })
  if (customerAvg !== null) marks.push({ key: 'cust', at: customerAvg, label: `cust. avg ${plain(customerAvg)}`, color: 'text-zinc-600' })
  const placed = placeLabels(marks, trackPx)
  const rowCount = Math.max(1, ...placed.map((p) => p.row + 1))

  return (
    <div ref={wrap}>
      <div className="relative">
        {/* track + won band (under the thumb) */}
        <div className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-zinc-200" style={{ left: THUMB / 2, right: THUMB / 2 }}>
          {w?.wonP25 != null && w.wonP75 != null && (
            <div className="absolute inset-y-0 rounded-full bg-emerald-300" style={{ left: x(w.wonP25), width: `calc(${x(w.wonP75)} - ${x(w.wonP25)})` }} />
          )}
        </div>
        <input
          type="range"
          min={MIN}
          max={MAX}
          step={STEP}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Your premium, $/mt"
          className="premium-slider relative"
        />
        {/* ticks drawn ABOVE the thumb so they stay visible when it sits on them */}
        <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: THUMB / 2, right: THUMB / 2 }}>
          {w?.lowestLost != null && <div className="absolute top-0.5 bottom-0.5 w-0.5 -translate-x-1/2 rounded bg-red-500" style={{ left: x(w.lowestLost) }} />}
          {customerAvg !== null && <div className="absolute top-0 bottom-0 -translate-x-1/2 border-l-2 border-dashed border-zinc-600" style={{ left: x(customerAvg) }} />}
        </div>
      </div>
      {/* labels under the track at their positions */}
      <div className="num relative mt-0.5 text-[10px]" style={{ marginLeft: THUMB / 2, marginRight: THUMB / 2, height: rowCount * 14 }}>
        {placed.map((p) => (
          <span key={p.key} className={`absolute whitespace-nowrap ${p.color}`} style={{ left: p.left, top: p.row * 14 }}>
            {p.label}
          </span>
        ))}
      </div>
      <div className="num mt-1 flex items-center justify-between text-[10px] text-zinc-400">
        <span>${MIN}</span>
        {w && (
          <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
            {w.n} similar quotes
            <InfoTip label="Which quotes count as similar">
              {w.scope.gradeName}, {w.scope.qtyFrom.toLocaleString('en-US')}–{w.scope.qtyTo.toLocaleString('en-US')} mt, last {w.scope.months} months, {w.scope.customers}.
            </InfoTip>
          </span>
        )}
        <span>${MAX}</span>
      </div>
    </div>
  )
}

// ───────────────────────────── small pieces ─────────────────────────────

function Toggle({ label, open, onClick }: { label: string; open: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open} className="inline-flex items-center gap-1 self-start text-xs font-medium text-indigo-600 hover:text-indigo-800">
      {label}
      <ChevronIcon className={`size-3 transition-transform ${open ? 'rotate-90' : ''}`} />
    </button>
  )
}

/** Day-on-day change, number only: ▲3.50 green / ▼2.50 red. */
function Delta({ r }: { r: QueryResult<number> }) {
  const v = r.value ?? 0
  return (
    <span className={v > 0 ? 'text-emerald-600' : v < 0 ? 'text-red-600' : 'text-zinc-500'} title="Benchmark change vs yesterday">
      <span aria-hidden="true">{v > 0 ? '▲' : v < 0 ? '▼' : '■'}</span>
      <MetricValue r={r} format={(n: number) => Math.abs(n).toFixed(2)} />
    </span>
  )
}

function Row({ label, context, children, strong }: { label: ReactNode; context?: ReactNode; children: ReactNode; strong?: boolean }) {
  return (
    <tr className={strong ? 'border-t border-zinc-200 font-semibold text-zinc-900' : ''}>
      <td className="py-1 pr-2">{label}</td>
      <td className="num py-1 pr-2 text-right">{children}</td>
      <td className="py-1 text-[11px] text-zinc-400">{context}</td>
    </tr>
  )
}

// ───────────────────────────── card ─────────────────────────────

export function PricePanel({
  enquiryId,
  user,
  terms,
  editable,
  onPremium,
}: {
  enquiryId: string
  user: UserContext
  terms: Terms
  editable: boolean
  onPremium: (premium: number) => void
}) {
  const openDefinition = useOpenDefinition()
  const [showBuild, setShowBuild] = useState(false)
  const [showEconomics, setShowEconomics] = useState(false)
  const p = { enquiryId }
  const blocked = query('compliance_check', p, user).value === 'FLAG'
  const grade = query('enquiry_details', p, user).value?.gradeName
  const bench = query('benchmark_price', p, user)
  const delta = query('benchmark_delta', p, user)

  if (blocked) {
    return (
      <Card title="Pricing & Margin" verdict={{ tone: 'neutral', label: 'No price' }}>
        <div className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-500">No price: this enquiry is blocked pending a compliance referral.</div>
        <List>
          <ListRow label={`Benchmark ${grade ?? ''}`}>
            <MetricValue r={bench} format={(v: number) => `${usdMt(v)}/mt`} /> <Delta r={delta} />
          </ListRow>
        </List>
      </Card>
    )
  }

  const live = termsParams(enquiryId, terms)
  const win = query('win_range_similar', p, user)
  const b = query('suggested_premium_breakdown', p, user)
  const bd = b.value!
  const suggested = query('suggested_premium', p, user)
  const custPrem = query('customer_avg_premium', p, user)
  const deskPrem = query('desk_avg_premium', p, user)
  const deals = query('customer_deal_count', p, user)
  const custClaim = query('customer_claim_share', p, user)
  const deskClaim = query('desk_claim_share', p, user)
  const dpd = query('days_past_due', p, user)
  const cost = query('our_cost', p, user)
  const barging = query('barging_cost_per_mt', p, user)
  const price = query('quoted_price', live, user)
  const margin = query('expected_deal_margin', live, user)
  const marginMt = query('expected_margin_per_mt', live, user)
  const thinMargin = (marginMt.value ?? 0) < 3
  const offSuggestion = suggested.value !== null && terms.premium !== suggested.value
  const diff = suggested.value === null ? 0 : terms.premium - suggested.value
  const fromCustomer = bd.baseSource === 'customer'
  const base = fromCustomer ? custPrem : deskPrem

  // One-line build-up from the rule: only non-zero components.
  const parts: { r: QueryResult<unknown>; text: string }[] = [{ r: base, text: `${plain(bd.base)} ${fromCustomer ? 'cust. avg' : 'desk avg'}` }]
  if (bd.claimAdj) parts.push({ r: b, text: `${plain(bd.claimAdj)} claims` })
  if (bd.dpdAdj) parts.push({ r: b, text: `${plain(bd.dpdAdj)} late pay` })
  if (bd.rounding) parts.push({ r: b, text: `${signed(bd.rounding).replace('+', '')} rounding` })

  const verdict: Verdict | undefined = thinMargin ? { tone: 'warn', label: 'Margin under $3/mt' } : undefined

  return (
    <Card title="Pricing & Margin" verdict={verdict}>
      {/* B. Suggested premium (rule) */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          Suggested premium
          <button
            type="button"
            onClick={() => openDefinition('suggested_premium')}
            title="Open the rule's definition"
            className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-1.5 py-px text-[10px] font-semibold text-zinc-600 hover:border-indigo-300 hover:text-indigo-700"
          >
            rule <span className="flex size-3 items-center justify-center rounded-full border border-current text-[8px]">i</span>
          </button>
        </div>
        <div className="text-[28px] leading-tight font-semibold tracking-tight text-indigo-600">
          <MetricValue r={suggested} format={(v: number) => usdMt(v)} />
          <span className="ml-0.5 text-sm font-medium text-zinc-400">/mt</span>
        </div>
        <div className="num text-xs text-zinc-500">
          {parts.map((part, i) => (
            <span key={part.text}>
              {i > 0 && ' + '}
              <MetricValue r={part.r} format={() => part.text} />
            </span>
          ))}
          {!bd.claimAdj && !bd.dpdAdj && ' · no adjustments'}
        </div>
        <Toggle label="How it's built" open={showBuild} onClick={() => setShowBuild(!showBuild)} />
        {showBuild && (
          <table className="mt-1 w-full text-xs text-zinc-600">
            <tbody>
              <Row
                label={`${fromCustomer ? 'Cust. avg' : 'Desk avg'} · ${deals.value ?? 0} deals`}
                context={
                  fromCustomer && (
                    <>
                      desk <MetricValue r={deskPrem} format={(v: number) => plain(v)} />
                    </>
                  )
                }
              >
                <MetricValue r={base} format={(v: number) => plain(v)} />
              </Row>
              <Row
                label="Claims"
                context={
                  <span className="inline-flex items-center gap-1">
                    <MetricValue r={custClaim} /> vs <MetricValue r={deskClaim} />
                    <InfoTip>+$2 when the customer’s claim share is more than 2× the desk’s (last 12 months).</InfoTip>
                  </span>
                }
              >
                {bd.claimAdj ? <MetricValue r={b} format={() => signed(bd.claimAdj)} className="text-amber-600" /> : <span className="text-zinc-400">—</span>}
              </Row>
              <Row
                label="Late pay"
                context={
                  <span className="inline-flex items-center gap-1">
                    <MetricValue r={dpd} format={(v: number) => `${v.toFixed(1)} days`} />
                    <InfoTip>+$1 when the customer’s average days past due is more than 3 (invoices due in the last 12 months).</InfoTip>
                  </span>
                }
              >
                {bd.dpdAdj ? <MetricValue r={b} format={() => signed(bd.dpdAdj)} className="text-amber-600" /> : <span className="text-zinc-400">—</span>}
              </Row>
              <Row label="Rounding to $0.50">
                <MetricValue r={b} format={() => signed(bd.rounding)} />
              </Row>
              <Row label="Suggested" strong>
                <MetricValue r={suggested} format={(v: number) => plain(v)} className="text-indigo-700" />
              </Row>
            </tbody>
          </table>
        )}
      </div>

      {/* C. Premium slider */}
      <div className="rounded-xl bg-zinc-50 px-3 pt-2.5 pb-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-zinc-500">Your premium</span>
          <span className="num">
            <span className="text-[15px] font-semibold text-zinc-900">{usdMt(terms.premium)}</span>
            <span className="text-xs text-zinc-400">/mt</span>
            {offSuggestion && editable && (
              <button type="button" onClick={() => onPremium(suggested.value!)} className="ml-2 text-[11px] font-medium text-indigo-600 hover:text-indigo-800">
                {diff > 0 ? '+' : '−'}${Math.abs(diff).toFixed(2)} · reset
              </button>
            )}
          </span>
        </div>
        {editable ? (
          <PremiumSlider w={win.value} customerAvg={custPrem.value} value={terms.premium} onChange={onPremium} />
        ) : (
          <p className="mt-1 text-[11px] text-zinc-500">Response sent; terms are locked.</p>
        )}
      </div>

      {/* D. KPI tiles, live with the slider */}
      <div className="grid grid-cols-2 gap-2">
        <Tile
          label="Quoted price"
          sub={
            <span className="num text-[10.5px] tracking-tight whitespace-nowrap">
              <MetricValue r={bench} format={(v: number) => plain(v)} /> <Delta r={delta} /> + {terms.premium.toFixed(2)}
            </span>
          }
        >
          <MetricValue r={price} format={(v: number) => `${usdMt(v)}/mt`} />
        </Tile>
        <div className="min-w-0 rounded-xl bg-zinc-50 px-3 py-2.5">
          <button
            type="button"
            onClick={() => openDefinition('expected_deal_margin')}
            className="text-[11px] text-zinc-500 underline decoration-zinc-300 decoration-dotted underline-offset-2 hover:text-indigo-700 hover:decoration-indigo-400"
          >
            Expected margin
          </button>
          <div className="num mt-0.5 text-[15px] font-semibold text-zinc-900">
            <MetricValue r={margin} format={(v: number) => usdCompact(v)} className={thinMargin ? 'text-amber-600' : ''} />
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            <MetricValue r={marginMt} format={(v: number) => `${usdMt(v)}/mt`} className={thinMargin ? 'text-amber-600' : ''} />
          </div>
        </div>
      </div>

      {/* E. Deal economics waterfall */}
      <Toggle label="Deal economics" open={showEconomics} onClick={() => setShowEconomics(!showEconomics)} />
      {showEconomics && (
        <table className="-mt-1 w-full text-xs text-zinc-600">
          <tbody>
            <Row label={`Benchmark ${grade ?? ''}`} context={<Delta r={delta} />}>
              <MetricValue r={bench} format={(v: number) => plain(v)} />
            </Row>
            <Row label="+ Your premium">{plain(terms.premium)}</Row>
            <Row label="= Quoted price" strong>
              <MetricValue r={price} format={(v: number) => plain(v)} />
            </Row>
            <Row label="− Our cost">
              <MetricValue r={cost} format={(v: number) => plain(v)} />
            </Row>
            <Row label="− Barging" context="desk 12-mo avg">
              <MetricValue r={barging} format={(v: number) => plain(v)} />
            </Row>
            <Row label="= Margin / mt" strong>
              <MetricValue r={marginMt} format={(v: number) => plain(v)} />
            </Row>
            <Row label={`× ${mt(terms.quantity)}`} strong>
              <MetricValue r={margin} format={(v: number) => usdCompact(v)} />
            </Row>
          </tbody>
        </table>
      )}
    </Card>
  )
}
