import { signedUsdMt, usdMt } from '../lib/format'
import type { ValueOf } from '../semantic/metrics'
import { query, type UserContext } from '../semantic/query'
import { MetricValue, Panel, Pill, Row } from './ui'

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
      <Panel step={3} title="Price">
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

  return (
    <Panel step={3} title="Price">
      <div className="flex flex-col gap-1">
        <Row label={`Benchmark, ${grade}`}>
          <MetricValue r={bench} />
          <MetricValue r={delta} format={(v: number) => signedUsdMt(v)} className={`ml-1.5 text-xs ${(delta.value ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-600'}`} />
        </Row>
        <Row label="Our cost">
          <MetricValue r={cost} />
        </Row>
      </div>

      <div className="flex flex-col gap-1 border-t border-zinc-100 pt-3">
        <Row label="Avg premium">
          <MetricValue r={custPrem} format={(v: number) => usdMt(v)} /> <span className="text-zinc-400">vs desk</span>{' '}
          <MetricValue r={deskPrem} format={(v: number) => usdMt(v)} />
        </Row>
        <Row sub label="Customer deals, 12m">
          <MetricValue r={deals} />
        </Row>
        <Row label="Claim share">
          <MetricValue r={custClaim} /> <span className="text-zinc-400">vs desk</span> <MetricValue r={deskClaim} />
        </Row>
        {claimRatio !== null && claimRatio > 2 && (
          <Row sub label="Ratio">
            <span className="text-amber-700">{claimRatio.toFixed(1)}× desk</span>
          </Row>
        )}
      </div>

      {w && (
        <div className="border-t border-zinc-100 pt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-zinc-600">Win range, similar deals</span>
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

      <div className="flex flex-col gap-1 rounded border border-indigo-100 bg-indigo-50/50 p-2">
        <Row label={<span className="font-medium text-zinc-800">Suggested premium</span>}>
          <MetricValue r={suggested} className="font-semibold text-indigo-700" />
        </Row>
        {breakdown && (
          <div className="flex flex-wrap gap-1 text-[11px]">
            <Pill tone="neutral">
              {breakdown.baseSource === 'customer' ? 'customer avg' : 'desk avg'} {usdMt(breakdown.base)}
            </Pill>
            {breakdown.claimAdj > 0 && <Pill tone="warn">+${breakdown.claimAdj} claims</Pill>}
            {breakdown.dpdAdj > 0 && <Pill tone="warn">+${breakdown.dpdAdj} late payment</Pill>}
          </div>
        )}
        <Row label="Quoted price">
          <MetricValue r={price} />
        </Row>
        <Row label="Expected margin">
          <MetricValue r={margin} /> <span className="text-xs text-zinc-400">(<MetricValue r={marginMt} />)</span>
        </Row>
      </div>
      <p className="text-[11px] text-zinc-400">Quote builder (premium slider) arrives in stage 5.</p>
    </Panel>
  )
}
