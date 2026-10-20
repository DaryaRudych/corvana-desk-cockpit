import { useState } from 'react'
import { businessUnitName, query, type QueryResult, type UserContext } from '../semantic/query'
import { AlertIcon, ChevronIcon } from './Icons'
import { Card, DetailRestricted, Hero, List, ListRow, MetricValue, Tile, type Verdict } from './ui'

function Check({ label, r }: { label: string; r: QueryResult<'PASS' | 'FLAG'> }) {
  const flag = r.value === 'FLAG'
  return (
    <Tile label={label}>
      <span className={`inline-flex items-center gap-1.5 ${flag ? 'text-red-600' : 'text-emerald-600'}`}>
        <span className={`size-2 rounded-full ${flag ? 'bg-red-500' : 'bg-emerald-500'}`} />
        {flag ? 'Flag' : r.value === 'PASS' ? 'Pass' : '—'}
      </span>
    </Tile>
  )
}

export function SafePanel({ enquiryId, user }: { enquiryId: string; user: UserContext }) {
  const [open, setOpen] = useState(false)
  const p = { enquiryId }
  const kyc = query('kyc_status', p, user)
  const screening = query('vessel_screening_status', p, user)
  const kycDetail = query('kyc_detail', p, user)
  const screeningDetail = query('vessel_screening_detail', p, user)
  const blocked = query('compliance_check', p, user).value === 'FLAG'

  const after = query('credit_headroom_after_deal', p, user)
  const before = query('credit_headroom_before_deal', p, user)
  const limit = query('group_credit_limit', p, user)
  const exposure = query('group_exposure', p, user)
  const own = query('exposure_own_bu', p, user)
  const other = query('exposure_other_bus', p, user)
  const dpd = query('days_past_due', p, user)
  const negative = (after.value ?? 0) < 0

  const verdict: Verdict = blocked
    ? { tone: 'bad', label: 'Blocked: compliance' }
    : negative
      ? { tone: 'bad', label: 'Over credit limit' }
      : { tone: 'ok', label: 'Clear to trade' }

  return (
    <Card title="Compliance & Credit" verdict={verdict}>
      <div className="grid grid-cols-2 gap-2">
        <Check label="Customer KYC" r={kyc} />
        <Check label="Vessel screening" r={screening} />
      </div>
      {(kycDetail.value || screeningDetail.value) && (
        <div className="flex flex-col gap-1 text-xs text-zinc-500">
          {kycDetail.value && <p>KYC: {kycDetail.value}</p>}
          {screeningDetail.value && <p>Screening: {screeningDetail.value}</p>}
        </div>
      )}

      {blocked ? (
        <div className="flex gap-2.5 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            <b>Refer to compliance.</b> A compliance check is flagged, so this enquiry can't be priced or answered from the cockpit.
          </span>
        </div>
      ) : (
        <>
          <Hero
            label="Credit headroom after this deal"
            tone={negative ? 'bad' : 'ok'}
            caption={
              <>
                Group limit <MetricValue r={limit} className="font-medium text-zinc-700" />
                {negative && ' · this deal breaches it'}
              </>
            }
          >
            <MetricValue r={after} />
          </Hero>

          <List>
            <ListRow label="Group exposure today">
              <MetricValue r={exposure} />
            </ListRow>
            <ListRow label="Headroom before this deal">
              <MetricValue r={before} />
            </ListRow>
          </List>

          <div>
            <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800">
              <ChevronIcon className={`size-3 transition-transform ${open ? 'rotate-90' : ''}`} />
              {open ? 'Hide exposure breakdown' : 'Show exposure breakdown'}
            </button>
            {open && (
              <div className="mt-2 rounded-xl bg-zinc-50 px-3 py-1">
                <List>
                  <ListRow label={`${businessUnitName(user.businessUnit)} (own BU)`}>
                    <MetricValue r={own} />
                  </ListRow>
                  <ListRow label="Other BUs" hint={other.restricted && <DetailRestricted message={other.restricted} />}>
                    <MetricValue r={other} />
                  </ListRow>
                  <ListRow label="Avg days past due, 12m">
                    <MetricValue r={dpd} className={(dpd.value ?? 0) > 3 ? 'text-amber-600' : ''} />
                  </ListRow>
                </List>
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  )
}
