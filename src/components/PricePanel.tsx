import { useState } from 'react'
import { formatValue, mt, usd, usdCompact, usdMt } from '../lib/format'
import type { ValueOf } from '../semantic/metrics'
import { query, type QueryResult, type UserContext } from '../semantic/query'
import { termsParams, type Terms } from './terms'
import { ChevronIcon } from './Icons'
import { Card, Hero, InfoTip, List, ListRow, MetricValue, Tile, type Verdict } from './ui'

type WinRange = ValueOf<'win_range_similar'>

const MIN = 0
const MAX = 25
const STEP = 0.5
const THUMB = 18 // px; the track is inset by half a thumb so marks line up with the thumb centre

/**
 * Quote builder: the premium slider. Its track shows the win range on similar deals
 * (won p25–p75 band, lowest lost premium, n) and a tick at the suggested premium.
 */
function PremiumSlider({
  w,
  suggested,
  customerAvg,
  value,
  onChange,
}: {
  w: WinRange | null
  suggested: number
  customerAvg: number | null
  value: number
  onChange: (v: number) => void
}) {
  const x = (v: number) => `${((Math.min(Math.max(v, MIN), MAX) - MIN) / (MAX - MIN)) * 100}%`
  return (
    <div>
      <div className="relative">
        <div className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-zinc-200" style={{ left: THUMB / 2, right: THUMB / 2 }}>
          {w?.wonP25 != null && w.wonP75 != null && (
            <div className="absolute inset-y-0 rounded-full bg-emerald-300" style={{ left: x(w.wonP25), width: `calc(${x(w.wonP75)} - ${x(w.wonP25)})` }} />
          )}
          <div className="absolute -top-1.5 h-[18px] w-0.5 -translate-x-1/2 rounded bg-indigo-300" style={{ left: x(suggested) }} />
        </div>
        <input
          type="range"
          min={MIN}
          max={MAX}
          step={STEP}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Premium, $/mt"
          className="premium-slider relative"
        />
        {/* Reference ticks drawn ABOVE the thumb, and taller than it, so they stay visible when it sits on them. */}
        <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: THUMB / 2, right: THUMB / 2 }}>
          {w?.lowestLost != null && <div className="absolute top-0.5 bottom-0.5 w-0.5 -translate-x-1/2 rounded bg-red-500" style={{ left: x(w.lowestLost) }} />}
          {customerAvg !== null && <div className="absolute -top-1 -bottom-1 -translate-x-1/2 border-l-2 border-dashed border-zinc-700" style={{ left: x(customerAvg) }} />}
        </div>
      </div>
      <div className="num mt-1 flex justify-between text-[10px] text-zinc-400">
        <span>${MIN}</span>
        <span>${MAX}</span>
      </div>
      {w && (
        <div className="mt-1.5 flex flex-col gap-1 text-[11px] text-zinc-500">
          <div className="num flex flex-wrap gap-x-3 gap-y-0.5">
            <span className="inline-flex items-center gap-1">
              <i className="inline-block h-1.5 w-3 rounded-full bg-emerald-300" /> won p25–p75 {w.wonP25 != null ? `${usdMt(w.wonP25)}–${usdMt(w.wonP75!)}` : '—'}
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="inline-block h-2.5 w-0.5 rounded bg-red-400" /> lowest lost {w.lowestLost != null ? usdMt(w.lowestLost) : '—'}
            </span>
            {customerAvg !== null && (
              <span className="inline-flex items-center gap-1">
                <i className="inline-block h-2.5 border-l-2 border-dashed border-zinc-700" /> this customer’s avg {usdMt(customerAvg)}
              </span>
            )}
          </div>
          <span className="num inline-flex items-center gap-1 text-zinc-400">
            n = {w.n} similar quotes
            <InfoTip label="Which quotes count as similar">
              {w.scope.gradeName}, {w.scope.qtyFrom.toLocaleString('en-US')}–{w.scope.qtyTo.toLocaleString('en-US')} mt, last {w.scope.months} months, {w.scope.customers}.
            </InfoTip>
          </span>
        </div>
      )}
    </div>
  )
}

/** One line of the build-up tooltip: label, grey context underneath, value on the right. */
function TipRow({ label, hint, value, strong }: { label: string; hint?: string; value: string; strong?: boolean }) {
  return (
    <span className={`flex items-baseline justify-between gap-4 py-1.5 first:pt-0 last:pb-0 ${strong ? 'font-semibold' : ''}`}>
      <span>
        <span className={strong ? 'text-white' : 'text-zinc-200'}>{label}</span>
        {hint && <span className="block text-[11px] font-normal text-zinc-400">{hint}</span>}
      </span>
      <span className="text-white">{value}</span>
    </span>
  )
}

/** Day-on-day change: ▲ green, ▼ red, flat grey. */
function DeltaChip({ r }: { r: QueryResult<number> }) {
  const v = r.value ?? 0
  const style = v > 0 ? 'bg-emerald-50 text-emerald-600' : v < 0 ? 'bg-red-50 text-red-600' : 'bg-zinc-100 text-zinc-500'
  return (
    <span className={`ml-2 inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[11px] font-semibold ${style}`} title="Change vs yesterday">
      <span aria-hidden="true">{v > 0 ? '▲' : v < 0 ? '▼' : '■'}</span>
      <MetricValue r={r} format={(n: number) => usdMt(Math.abs(n))} />
      <span className="font-normal opacity-80">vs yesterday</span>
    </span>
  )
}

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
  const [showMath, setShowMath] = useState(false)
  const p = { enquiryId }
  const blocked = query('compliance_check', p, user).value === 'FLAG'
  const grade = query('enquiry_details', p, user).value?.gradeName
  const bench = query('benchmark_price', p, user)
  const delta = query('benchmark_delta', p, user)
  const cost = query('our_cost', p, user)
  const benchmarkRow = (
    <ListRow label={`Benchmark ${grade ?? ''}`}>
      <MetricValue r={bench} format={(v: number) => usdMt(v)} />
      <DeltaChip r={delta} />
    </ListRow>
  )

  if (blocked) {
    return (
      <Card title="Pricing & Margin" verdict={{ tone: 'neutral', label: 'No price' }}>
        <div className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-500">No price: this enquiry is blocked pending a compliance referral.</div>
        <List>{benchmarkRow}</List>
      </Card>
    )
  }

  const live = termsParams(enquiryId, terms)
  const win = query('win_range_similar', p, user)
  const b = query('suggested_premium_breakdown', p, user)
  const bd = b.value
  const suggested = query('suggested_premium', p, user)
  const custPrem = query('customer_avg_premium', p, user)
  const deskPrem = query('desk_avg_premium', p, user)
  const deals = query('customer_deal_count', p, user)
  const custClaim = query('customer_claim_share', p, user)
  const deskClaim = query('desk_claim_share', p, user)
  const dpd = query('days_past_due', p, user)
  const price = query('quoted_price', live, user)
  const barging = query('barging_cost_per_mt', p, user)
  const margin = query('expected_deal_margin', live, user)
  const marginMt = query('expected_margin_per_mt', live, user)
  const thinMargin = (marginMt.value ?? 0) < 3
  const offSuggestion = suggested.value !== null && terms.premium !== suggested.value
  const diff = suggested.value === null ? 0 : terms.premium - suggested.value
  const fromCustomer = bd?.baseSource === 'customer'
  const adj = (v: number) => `${v < 0 ? '−' : '+'}$${Math.abs(v).toFixed(2)}`

  // Same pattern as the other cards: a rule-driven verdict (governed flag), amber below the desk floor.
  const aboveFloor = query('margin_above_floor', live, user).value !== false
  const verdict: Verdict = aboveFloor ? { tone: 'ok', label: 'Margin above floor' } : { tone: 'warn', label: 'Margin below floor' }

  return (
    <Card title="Pricing & Margin" verdict={verdict}>
      <Hero
        tone="accent"
        label={
          <>
            Suggested premium
            {bd && (
              <InfoTip label="How the suggested premium is built" below wide>
                <span className="mb-2 block font-semibold">How the suggestion is built</span>
                <span className="num flex flex-col divide-y divide-zinc-700/70">
                  <TipRow
                    label={fromCustomer ? 'Customer 12-month average' : 'Desk average (customer has < 5 deals)'}
                    hint={`${deals.value ?? 0} deals with this customer · desk average ${deskPrem.value !== null ? usdMt(deskPrem.value) : '—'}`}
                    value={usdMt(bd.base)}
                  />
                  <TipRow
                    label="Claims adjustment"
                    hint={`claim share ${formatValue('ratio', custClaim.value)} vs desk ${formatValue('ratio', deskClaim.value)}; +$2 above 2× desk`}
                    value={adj(bd.claimAdj)}
                  />
                  <TipRow label="Late-payment adjustment" hint={`avg ${formatValue('days', dpd.value)} past due; +$1 above 3 days`} value={adj(bd.dpdAdj)} />
                  <TipRow label="Rounded to nearest $0.50" value={adj(bd.rounding)} />
                  <TipRow label="Suggested premium" value={`${usdMt(bd.value)}/mt`} strong />
                </span>
              </InfoTip>
            )}
          </>
        }
      >
        <MetricValue r={suggested} format={(v: number) => usdMt(v)} />
        <span className="ml-1 text-sm font-medium text-zinc-400">/mt</span>
      </Hero>

      {/* How the rule builds the suggestion; every line is a governed value. */}

      {/* Quote builder */}
      <div className="rounded-xl bg-zinc-50 px-3 pt-2.5 pb-3">
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
          <PremiumSlider w={win.value} suggested={suggested.value ?? 0} customerAvg={custPrem.value} value={terms.premium} onChange={onPremium} />
        ) : (
          <p className="mt-1 text-[11px] text-zinc-500">Response sent; terms are locked.</p>
        )}
      </div>

      {/* Deal economics at your premium: price − cost − barging = margin. */}
      {/* The two outcomes, prominent; the arithmetic behind them on demand. */}
      <div className="grid grid-cols-2 gap-2">
        <Tile
          label="Quoted price"
          sub={
            <span className="num whitespace-nowrap">
              <MetricValue r={bench} format={(v: number) => usdMt(v)} /> {grade} benchmark
            </span>
          }
        >
          <MetricValue r={price} format={(v: number) => `${usdMt(v)}/mt`} />
        </Tile>
        <Tile label="Expected margin" sub={<MetricValue r={marginMt} format={(v: number) => `${usdMt(v)}/mt${thinMargin ? ' · under $3 floor' : ''}`} />} subTone={thinMargin ? 'warn' : 'neutral'}>
          <MetricValue r={margin} format={(v: number) => usdCompact(v)} className={thinMargin ? 'text-amber-600' : ''} />
        </Tile>
      </div>
      <div className="-mt-1">
        <button
          type="button"
          onClick={() => setShowMath(!showMath)}
          aria-expanded={showMath}
          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
        >
          <ChevronIcon className={`size-3 transition-transform ${showMath ? 'rotate-90' : ''}`} />
          How margin is built
        </button>
        {showMath && (
          <div className="mt-2">
        <List>
          {benchmarkRow}
          {/* Operators sit with the numbers, so the column reads as the sum. */}
          <ListRow label="Your premium">
            <span className="num">+{usdMt(terms.premium)}</span>
          </ListRow>
          <ListRow label={<span className="font-medium text-zinc-900">Quoted price</span>}>
            <MetricValue r={price} format={(v: number) => `= ${usdMt(v)}/mt`} />
          </ListRow>
          <ListRow label="Our cost">
            <MetricValue r={cost} format={(v: number) => `−${usdMt(v)}`} />
          </ListRow>
          <ListRow label="Barging" hint="desk 12-month average">
            <MetricValue r={barging} format={(v: number) => `−${usdMt(v)}`} />
          </ListRow>
          <ListRow label={<span className="font-medium text-zinc-900">Margin per tonne</span>}>
            <MetricValue r={marginMt} format={(v: number) => `= ${usdMt(v)}/mt`} className={thinMargin ? 'text-amber-600' : ''} />
          </ListRow>
          <ListRow label={<span className="font-medium text-zinc-900">Expected margin</span>} hint={`× ${mt(terms.quantity)}`}>
            <MetricValue r={margin} format={(v: number) => usd(v)} className={`text-[15px] ${thinMargin ? 'text-amber-600' : ''}`} />
          </ListRow>
        </List>
          </div>
        )}
      </div>
    </Card>
  )
}
