import { useState } from 'react'
import { query, type UserContext } from '../semantic/query'
import { AlertIcon, ChevronIcon } from './Icons'
import { DetailRestricted, MetricValue, Panel, Pill, Row } from './ui'

function StatusPill({ status }: { status: string | null }) {
  if (status === null) return <span className="text-zinc-400">—</span>
  return <Pill tone={status === 'PASS' ? 'ok' : 'bad'}>{status}</Pill>
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

  return (
    <Panel step={1} title="Safe?">
      <div className="flex flex-col gap-1.5">
        <Row label="Customer KYC">
          <StatusPill status={kyc.value} />
        </Row>
        {kycDetail.value && <p className="text-xs text-zinc-500">{kycDetail.value}</p>}
        <Row label="Vessel screening">
          <StatusPill status={screening.value} />
        </Row>
        {screeningDetail.value && <p className="text-xs text-zinc-500">{screeningDetail.value}</p>}
      </div>

      {blocked ? (
        <div className="flex gap-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          <AlertIcon className="mt-px size-3.5 shrink-0" />
          <span>
            <b>Refer to compliance.</b> A compliance check is flagged, so this enquiry can't be priced or answered from the cockpit.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 border-t border-zinc-100 pt-3">
          <div className="text-xs text-zinc-500">Credit headroom after this deal</div>
          <MetricValue r={after} className={`text-xl font-semibold ${negative ? 'text-red-600' : 'text-emerald-700'}`} />
          {negative && <Pill tone="bad" className="self-start">Breaches group credit limit</Pill>}
          <button type="button" onClick={() => setOpen(!open)} className="mt-1 inline-flex items-center gap-1 self-start text-xs font-medium text-indigo-700 hover:text-indigo-900">
            <ChevronIcon className={`size-3 transition-transform ${open ? 'rotate-90' : ''}`} />
            {open ? 'Hide breakdown' : 'Show breakdown'}
          </button>
          {open && (
            <div className="flex flex-col gap-1 rounded bg-zinc-50 p-2 text-xs">
              <Row label="Group credit limit">
                <MetricValue r={limit} />
              </Row>
              <Row label="Group exposure">
                <MetricValue r={exposure} />
              </Row>
              <Row sub label="↳ Asia Bunkering (own BU)">
                <MetricValue r={own} />
              </Row>
              <Row
                sub
                label={
                  <span className="flex flex-col">
                    ↳ Other BUs
                    {other.restricted && <DetailRestricted message={other.restricted} />}
                  </span>
                }
              >
                <MetricValue r={other} />
              </Row>
              <Row label="Headroom before this deal">
                <MetricValue r={before} />
              </Row>
              <Row label="Avg days past due (12m)">
                <MetricValue r={dpd} className={(dpd.value ?? 0) > 3 ? 'text-amber-700' : ''} />
              </Row>
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}
