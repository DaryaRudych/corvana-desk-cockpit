import { signedUsdMt, usdMt } from '../lib/format'
import type { ValueOf } from '../semantic/metrics'
import { query, type UserContext } from '../semantic/query'
import { MetricValue, Panel, Pill, Row, SectionLabel, type Verdict } from './ui'

type WinRange = ValueOf<'win_range_similar'>

/** Premium axis with the won p25–p75 band, the lowest lost premium and the suggested premium. Stage 5 turns this into the slider track. */
export function WinRangeBar({ w, suggested }: { w: WinRange; suggested: number | null }) {
  const lo = 0
  const hi = 22
  const x = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`
  return (
    <div className="relative mt-5 mb-6 h-2 rounded-full bg-zinc-100">
      {w.wonP25 !== null && w.wonP75 !== null && (
        <div className="absolute inset-y-0 rounded-full bg-emerald-200" style={{ left: x(w.wonP25), width: `calc(${x(w.wonP75)} - ${x(w.wonP25)})` }} />
      )}
      {w.lowestLost !== null && (
        <div className="absolute -top-1 h-4 w-px bg-red-500" style={{ left: x(w.lowestLost) }}>
          <span className="num absolute top-4 left-1/2 -translate-x-1/2 text-[10px] whitespace-nowrap text-red-600">lost ${w.lowestLost}</span>
        </div>
      )}
      {suggested !== null && (
        <div className="absolute -top-1 size-4 -translate-x-1/2 rounded-full border-2 border-white bg-indigo-600 shadow" style={{ left: x(suggested) }}>
          <span className="num absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] font-semibold whitespace-nowrap text-indigo-700">${suggested}</span>
        </div>
      )}
    </div>
  )
}

export function PricePanel({ enquiryId, user }: { enquiryId: string; user: UserContext }) {
  const p = { enquiryId }
  const blocked = query('compliance_check', p, user).value === 'FLAG'
  const grade = query('enquiry_details', p, user).value?.gradeName
  const bench = query('benchmark_price', p, user)
  const delta = query('benchmark_delta', p, user)
  const cost = query('our_cost', p, user)

  if (blocked) {
    return (
      <Panel step={3} title="What price?" subtitle="Premium and the evidence" verdict={{ tone: 'neutral', label: 'No price' }}>
        <Row label={`Benchmark, ${grade}`}>
          <MetricValue r={bench} />
        </Row>
        <p className="rounded bg-zinc-50 p-2 text-xs text-zinc-500">No price: this enquiry is blocked pending a compliance referral.</p>
      </Panel>
    )
  }

  const custPrem = query('customer_avg_premium', p, user)
  const deskPrem = query('desk_avg_premium', p, user)
  const deals = query('customer_deal_count', p, user)
  const custClaim = query('customer_claim_share', p, user)
  const deskClaim = query('desk_claim_share', p, user)
  const win = query('win_range_similar', p, user)
  const breakdown = query('suggested_premium_breakdown', p, user).value
  const suggested = query('suggested_premium', p, user)
  const price = query('quoted_price', p, user)
  const margin = query('expected_deal_margin', p, user)
  const marginMt = query('expected_margin_per_mt', p, user)
  const claimRatio = custClaim.value !== null && deskClaim.value ? custClaim.value / deskClaim.value : null
  const w = win.value

  const thinMargin = (marginMt.value ?? 0) < 3
  const verdict: Verdict = thinMargin
    ? { tone: 'warn', label: 'Margin under $3/mt' }
    : { tone: 'accent', label: `Suggest ${usdMt(suggested.value ?? 0)}` }

  return (
    <Panel step={3} title="What price?" subtitle="Premium and the evidence" verdict={verdict}>
      <div className="rounded-md bg-indigo-50 px-3 py-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-zinc-600">Suggested premium</span>
          <MetricValue r={suggested} className="text-2xl font-semibold text-indigo-700" />
        </div>
        {breakdown && (
          <div className="mt-1 flex flex-wrap justify-end gap-1">
            <Pill tone="neutral">
              {breakdown.baseSource === 'customer' ? 'customer avg' : 'desk avg'} {usdMt(breakdown.base)}
            </Pill>
            {breakdown.claimAdj > 0 && <Pill tone="warn">+${breakdown.claimAdj} claims</Pill>}
            {breakdown.dpdAdj > 0 && <Pill tone="warn">+${breakdown.dpdAdj} late payment</Pill>}
          </div>
        )}
        <div className="mt-2 flex flex-col gap-0.5 border-t border-indigo-100 pt-2">
          <Row label="Quoted price">
            <MetricValue r={price} className="font-medium" />
          </Row>
          <Row label="Expected margin">
            <MetricValue r={margin} className={`font-medium ${thinMargin ? 'text-amber-700' : ''}`} />{' '}
            <span className="text-xs text-zinc-400">
              (<MetricValue r={marginMt} />)
            </span>
          </Row>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <SectionLabel>Market</SectionLabel>
        <Row label={`Benchmark, ${grade}`}>
          <MetricValue r={bench} />
          <MetricValue r={delta} format={(v: number) => signedUsdMt(v)} className={`ml-1.5 text-xs ${(delta.value ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-600'}`} />
        </Row>
        <Row label="Our cost">
          <MetricValue r={cost} />
        </Row>
      </div>

      <div className="flex flex-col gap-1 border-t border-zinc-100 pt-3">
        <SectionLabel>Customer vs desk, 12 months</SectionLabel>
        <Row label="Avg premium">
          <MetricValue r={custPrem} format={(v: number) => usdMt(v)} /> <span className="text-zinc-400">vs</span> <MetricValue r={deskPrem} format={(v: number) => usdMt(v)} />
        </Row>
        <Row label="Claim share">
          <MetricValue r={custClaim} /> <span className="text-zinc-400">vs</span> <MetricValue r={deskClaim} />
          {claimRatio !== null && claimRatio > 2 && <span className="ml-1 text-xs text-amber-700">({claimRatio.toFixed(1)}×)</span>}
        </Row>
        <Row sub label="Customer deals">
          <MetricValue r={deals} />
        </Row>
      </div>

      {w && (
        <div className="border-t border-zinc-100 pt-3">
          <div className="flex items-baseline justify-between">
            <SectionLabel>Win range, similar deals</SectionLabel>
            <span className="num text-xs text-zinc-400">n = {w.n}</span>
          </div>
          <WinRangeBar w={w} suggested={suggested.value} />
          <div className="num flex flex-wrap justify-between gap-x-3 text-xs text-zinc-500">
            <span>
              Won p25–p75: {w.wonP25 !== null ? `${usdMt(w.wonP25)}–${usdMt(w.wonP75!)}` : '—'} ({w.nWon})
            </span>
            <span>Lowest lost: {w.lowestLost !== null ? usdMt(w.lowestLost) : '—'}</span>
          </div>
        </div>
      )}
    </Panel>
  )
}
