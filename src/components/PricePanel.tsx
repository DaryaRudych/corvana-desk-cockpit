// Pricing & Margin: the governed suggested-premium RULE (not AI), the trader's premium, and what
// the deal earns. Each figure appears once; ⓘ tooltips explain a figure without repeating it.
import { useEffect, useRef, useState } from 'react'
import { mt, usdCompact, usdMt } from '../lib/format'
import type { ValueOf } from '../semantic/metrics'
import { query, type QueryResult, type UserContext } from '../semantic/query'
import { useOpenDefinition } from './governanceContext'
import { termsParams, type Terms } from './terms'
import { Card, InfoTip, List, ListRow, MetricValue, Tile } from './ui'

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
  const bd = query('suggested_premium_breakdown', p, user).value!
  const suggested = query('suggested_premium', p, user)
  const custPrem = query('customer_avg_premium', p, user)
  const deals = query('customer_deal_count', p, user)
  const cost = query('our_cost', p, user)
  const barging = query('barging_cost_per_mt', p, user)
  const price = query('quoted_price', live, user)
  const margin = query('expected_deal_margin', live, user)
  const marginMt = query('expected_margin_per_mt', live, user)
  const thinMargin = (marginMt.value ?? 0) < 3
  const atSuggestion = suggested.value === null || terms.premium === suggested.value
  const diff = suggested.value === null ? 0 : terms.premium - suggested.value
  const dash = (v: number) => (v ? signed(v) : '—')

  // Each figure has one home: suggestion + rule at the top, the trader's premium on the
  // slider, price and margin in the tiles. Tooltips explain a figure without repeating it.
  return (
    <Card title="Pricing & Margin">
      {/* The suggestion (a governed rule, not AI): its one place in the card. */}
      <div>
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          Suggested premium
          <InfoTip label="How the suggested premium is built" below>
            <span className="mb-1.5 block font-semibold">Rule: how the suggestion is built</span>
            <span className="num grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
              <span className="text-zinc-300">
                {bd.baseSource === 'customer' ? 'Customer 12-month avg' : 'Desk avg (< 5 customer deals)'} · {deals.value ?? 0} deals
              </span>
              <span>{plain(bd.base)}</span>
              <span className="text-zinc-300">Claims</span>
              <span>{dash(bd.claimAdj)}</span>
              <span className="text-zinc-300">Late payment</span>
              <span>{dash(bd.dpdAdj)}</span>
              <span className="text-zinc-300">Rounding to $0.50</span>
              <span>{dash(bd.rounding)}</span>
            </span>
            <span className="mt-1.5 block text-[11px] text-zinc-400">+$2 if claim share is over 2× the desk’s; +$1 if average days past due is over 3.</span>
          </InfoTip>
        </div>
        <div className="text-[28px] leading-tight font-semibold tracking-tight text-indigo-600">
          <MetricValue r={suggested} format={(v: number) => usdMt(v)} />
          <span className="ml-0.5 text-sm font-medium text-zinc-400">/mt</span>
        </div>
      </div>

      {/* The trader's premium: the decision input. */}
      <div className="rounded-xl bg-zinc-50 px-3 pt-2.5 pb-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-zinc-500">Your premium</span>
          {atSuggestion ? (
            <span className="text-xs text-zinc-500">at suggestion</span>
          ) : (
            <span className="num">
              <span className="text-[15px] font-semibold text-zinc-900">{usdMt(terms.premium)}</span>
              <span className="text-xs text-zinc-400">/mt</span>
              {editable && (
                <button type="button" onClick={() => onPremium(suggested.value!)} className="ml-2 text-[11px] font-medium text-indigo-600 hover:text-indigo-800">
                  {diff > 0 ? '+' : '−'}${Math.abs(diff).toFixed(2)} · reset
                </button>
              )}
            </span>
          )}
        </div>
        {editable ? (
          <PremiumSlider w={win.value} customerAvg={custPrem.value} value={terms.premium} onChange={onPremium} />
        ) : (
          <p className="mt-1 text-[11px] text-zinc-500">Response sent; terms are locked.</p>
        )}
      </div>

      {/* What the deal earns at that premium; pinned to the card's foot. */}
      <div className="mt-auto grid grid-cols-2 gap-2">
        <Tile
          label="Quoted price"
          sub={
            <span className="num whitespace-nowrap">
              <MetricValue r={bench} format={(v: number) => plain(v)} /> {grade} <Delta r={delta} />
            </span>
          }
        >
          <MetricValue r={price} format={(v: number) => `${usdMt(v)}/mt`} />
        </Tile>
        <div className="min-w-0 rounded-xl bg-zinc-50 px-3 py-2.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => openDefinition('expected_deal_margin')}
              className="text-[11px] text-zinc-500 underline decoration-zinc-300 decoration-dotted underline-offset-2 hover:text-indigo-700 hover:decoration-indigo-400"
            >
              Expected margin
            </button>
            <InfoTip label="How the margin is built" align="right">
              <span className="mb-1.5 block font-semibold">Quoted price, less:</span>
              <span className="num grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
                <span className="text-zinc-300">Our stock cost</span>
                <span>{cost.value !== null ? `−${plain(cost.value)}` : '—'}</span>
                <span className="text-zinc-300">Barging, desk 12-month avg</span>
                <span>{barging.value !== null ? `−${plain(barging.value)}` : '—'}</span>
              </span>
              <span className="mt-1.5 block text-[11px] text-zinc-400">= margin per tonne, × {mt(terms.quantity)}. Below $3/mt the suggested move is Decline.</span>
            </InfoTip>
          </div>
          <div className="num mt-0.5 text-[15px] font-semibold text-zinc-900">
            <MetricValue r={margin} format={(v: number) => usdCompact(v)} className={thinMargin ? 'text-amber-600' : ''} />
          </div>
          <div className={`mt-0.5 text-[11px] ${thinMargin ? 'text-amber-600' : 'text-zinc-500'}`}>
            <MetricValue r={marginMt} format={(v: number) => `${usdMt(v)}/mt`} />
            {thinMargin && ' · under $3 floor'}
          </div>
        </div>
      </div>
    </Card>
  )
}
