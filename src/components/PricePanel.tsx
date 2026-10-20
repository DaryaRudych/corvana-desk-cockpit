import { usd, usdMt } from '../lib/format'
import type { ValueOf } from '../semantic/metrics'
import { query, type QueryResult, type UserContext } from '../semantic/query'
import { termsParams, type Terms } from './terms'
import { Card, Hero, List, ListRow, MetricValue, Tile, type Verdict } from './ui'

type WinRange = ValueOf<'win_range_similar'>

const MIN = 0
const MAX = 25
const STEP = 0.5
const THUMB = 18 // px; the track is inset by half a thumb so marks line up with the thumb centre

/**
 * Quote builder: the premium slider. Its track shows the win range on similar deals
 * (won p25–p75 band, lowest lost premium, n) and a tick at the suggested premium.
 */
function PremiumSlider({ w, suggested, value, onChange }: { w: WinRange | null; suggested: number; value: number; onChange: (v: number) => void }) {
  const x = (v: number) => `${((Math.min(Math.max(v, MIN), MAX) - MIN) / (MAX - MIN)) * 100}%`
  return (
    <div>
      <div className="relative">
        <div className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-zinc-200" style={{ left: THUMB / 2, right: THUMB / 2 }}>
          {w?.wonP25 != null && w.wonP75 != null && (
            <div className="absolute inset-y-0 rounded-full bg-emerald-300" style={{ left: x(w.wonP25), width: `calc(${x(w.wonP75)} - ${x(w.wonP25)})` }} />
          )}
          {w?.lowestLost != null && <div className="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 rounded bg-red-400" style={{ left: x(w.lowestLost) }} />}
          <div className="absolute -top-1.5 h-[18px] w-0.5 -translate-x-1/2 rounded bg-indigo-300" style={{ left: x(suggested) }} title={`Suggested ${usdMt(suggested)}`} />
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
      </div>
      <div className="num mt-1 flex justify-between text-[10px] text-zinc-400">
        <span>${MIN}</span>
        <span>${MAX}</span>
      </div>
      {w && (
        <div className="num mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-zinc-500">
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-1.5 w-3 rounded-full bg-emerald-300" /> won {w.wonP25 != null ? `${usdMt(w.wonP25)}–${usdMt(w.wonP75!)}` : '—'}
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2.5 w-0.5 rounded bg-red-400" /> lowest lost {w.lowestLost != null ? usdMt(w.lowestLost) : '—'}
          </span>
          <span>n = {w.n} similar quotes</span>
        </div>
      )}
    </div>
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
    </span>
  )
}

const VS = ({ children }: { children: string }) => <span className="mx-1 font-normal text-zinc-400">{children}</span>

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
  const custPrem = query('customer_avg_premium', p, user)
  const deskPrem = query('desk_avg_premium', p, user)
  const deals = query('customer_deal_count', p, user)
  const custClaim = query('customer_claim_share', p, user)
  const deskClaim = query('desk_claim_share', p, user)
  const win = query('win_range_similar', p, user)
  const breakdown = query('suggested_premium_breakdown', p, user).value
  const suggested = query('suggested_premium', p, user)
  const price = query('quoted_price', live, user)
  const margin = query('expected_deal_margin', live, user)
  const marginMt = query('expected_margin_per_mt', live, user)
  const claimRatio = custClaim.value !== null && deskClaim.value ? custClaim.value / deskClaim.value : null
  const thinMargin = (marginMt.value ?? 0) < 3
  const offSuggestion = suggested.value !== null && terms.premium !== suggested.value
  const diff = suggested.value === null ? 0 : terms.premium - suggested.value

  const verdict: Verdict = thinMargin ? { tone: 'warn', label: 'Margin under $3/mt' } : { tone: 'accent', label: `${usdMt(suggested.value ?? 0)}/mt suggested` }

  return (
    <Card title="Pricing & Margin" verdict={verdict}>
      <Hero
        label="Suggested premium"
        tone="accent"
        caption={
          breakdown && (
            <span className="num">
              {breakdown.baseSource === 'customer' ? 'Customer avg' : 'Desk avg'} {usdMt(breakdown.base)}
              {breakdown.claimAdj > 0 && <span className="text-amber-600"> + ${breakdown.claimAdj} claims</span>}
              {breakdown.dpdAdj > 0 && <span className="text-amber-600"> + ${breakdown.dpdAdj} late payment</span>}
            </span>
          )
        }
      >
        <MetricValue r={suggested} format={(v: number) => usdMt(v)} />
        <span className="ml-1 text-sm font-medium text-zinc-400">/mt</span>
      </Hero>

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
          <PremiumSlider w={win.value} suggested={suggested.value ?? 0} value={terms.premium} onChange={onPremium} />
        ) : (
          <p className="mt-1 text-[11px] text-zinc-500">Response sent; terms are locked.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Tile label="Quoted price">
          <MetricValue r={price} format={(v: number) => `${usdMt(v)}/mt`} />
        </Tile>
        <Tile label="Expected margin" sub={<MetricValue r={marginMt} />} subTone={thinMargin ? 'warn' : 'neutral'}>
          <MetricValue r={margin} format={(v: number) => usd(v)} className={thinMargin ? 'text-amber-600' : ''} />
        </Tile>
      </div>

      <List>
        {benchmarkRow}
        <ListRow label="Our cost">
          <MetricValue r={cost} format={(v: number) => usdMt(v)} />
        </ListRow>
        <ListRow label="Avg premium" hint={<>customer vs desk · {deals.value ?? 0} deals</>}>
          <MetricValue r={custPrem} format={(v: number) => usdMt(v)} />
          <VS>vs</VS>
          <MetricValue r={deskPrem} format={(v: number) => usdMt(v)} className="font-normal text-zinc-500" />
        </ListRow>
        <ListRow label="Claim share" hint="customer vs desk">
          <MetricValue r={custClaim} className={claimRatio !== null && claimRatio > 2 ? 'text-amber-600' : ''} />
          <VS>vs</VS>
          <MetricValue r={deskClaim} className="font-normal text-zinc-500" />
        </ListRow>
      </List>
    </Card>
  )
}
