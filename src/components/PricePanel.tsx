import { signedUsdMt, usd, usdMt } from '../lib/format'
import type { ValueOf } from '../semantic/metrics'
import { query, type UserContext } from '../semantic/query'
import { Card, Hero, List, ListRow, MetricValue, Tile, type Verdict } from './ui'

type WinRange = ValueOf<'win_range_similar'>

/** Premium axis with the won p25–p75 band, the lowest lost premium and the suggested premium. Stage 5 turns this into the slider track. */
export function WinRangeBar({ w, suggested }: { w: WinRange; suggested: number | null }) {
  const lo = 0
  const hi = 22
  const x = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`
  return (
    <div className="relative mt-6 mb-6 h-1.5 rounded-full bg-zinc-100">
      {w.wonP25 !== null && w.wonP75 !== null && (
        <div className="absolute inset-y-0 rounded-full bg-emerald-300" style={{ left: x(w.wonP25), width: `calc(${x(w.wonP75)} - ${x(w.wonP25)})` }} />
      )}
      {w.lowestLost !== null && (
        <div className="absolute -top-1 h-3.5 w-0.5 rounded bg-red-400" style={{ left: x(w.lowestLost) }}>
          <span className="num absolute top-4 left-1/2 -translate-x-1/2 text-[10px] whitespace-nowrap text-red-500">lost {usdMt(w.lowestLost)}</span>
        </div>
      )}
      {suggested !== null && (
        <div className="absolute -top-[5px] size-4 -translate-x-1/2 rounded-full border-[3px] border-white bg-indigo-600 shadow" style={{ left: x(suggested) }}>
          <span className="num absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] font-semibold whitespace-nowrap text-indigo-600">{usdMt(suggested)}</span>
        </div>
      )}
    </div>
  )
}

const VS = ({ children }: { children: string }) => <span className="mx-1 font-normal text-zinc-400">{children}</span>

export function PricePanel({ enquiryId, user }: { enquiryId: string; user: UserContext }) {
  const p = { enquiryId }
  const blocked = query('compliance_check', p, user).value === 'FLAG'
  const grade = query('enquiry_details', p, user).value?.gradeName
  const bench = query('benchmark_price', p, user)
  const delta = query('benchmark_delta', p, user)
  const cost = query('our_cost', p, user)
  const benchmarkRow = (
    <ListRow label={`Benchmark ${grade ?? ''}`}>
      <MetricValue r={bench} format={(v: number) => usdMt(v)} />
      <MetricValue r={delta} format={(v: number) => signedUsdMt(v)} className={`ml-1.5 text-xs ${(delta.value ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`} />
    </ListRow>
  )

  if (blocked) {
    return (
      <Card step={3} title="What price?" subtitle="Suggested premium and the evidence" verdict={{ tone: 'neutral', label: 'No price' }}>
        <div className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-500">No price: this enquiry is blocked pending a compliance referral.</div>
        <List>{benchmarkRow}</List>
      </Card>
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
  const thinMargin = (marginMt.value ?? 0) < 3
  const w = win.value

  const verdict: Verdict = thinMargin ? { tone: 'warn', label: 'Margin under $3/mt' } : { tone: 'accent', label: `${usdMt(suggested.value ?? 0)}/mt` }

  return (
    <Card step={3} title="What price?" subtitle="Suggested premium and the evidence" verdict={verdict}>
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

      {w && (
        <div>
          <div className="flex items-baseline justify-between">
            <h3 className="text-[11px] font-medium text-zinc-400">Win range on similar deals</h3>
            <span className="num text-[11px] text-zinc-400">n = {w.n}</span>
          </div>
          <WinRangeBar w={w} suggested={suggested.value} />
          <div className="num text-[11px] text-zinc-500">
            Won {w.wonP25 !== null ? `${usdMt(w.wonP25)}–${usdMt(w.wonP75!)}` : '—'} (p25–p75 of {w.nWon} wins)
          </div>
        </div>
      )}
    </Card>
  )
}
