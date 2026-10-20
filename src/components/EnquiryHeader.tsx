import { dateRange, dateTime, duration, mt } from '../lib/format'
import { query, type UserContext } from '../semantic/query'
import { AlertIcon } from './Icons'
import { CARD, Fact, MetricValue } from './ui'

export function EnquiryHeader({ enquiryId, user }: { enquiryId: string; user: UserContext }) {
  const p = { enquiryId }
  const e = query('enquiry_details', p, user).value
  const due = query('time_to_quote_due', p, user)
  const etaLate = query('vessel_eta_after_window', p, user)
  if (!e) return null
  const urgent = (due.value ?? 0) < 60

  return (
    <header className={`flex overflow-hidden ${CARD}`}>
      <div className="min-w-0 flex-1 px-5 py-4">
        {/* Who and what */}
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-900">{e.customerName}</h1>
          <span className="num shrink-0 text-xs text-zinc-400">
            {e.enquiry_id} · received {dateTime(e.received_at)}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-zinc-500">
          <span className="font-medium text-zinc-700">{e.vesselName}</span> · {e.vesselType} · <span className="num">IMO {e.vessel_id}</span> · {e.parentGroup} ·{' '}
          {e.paymentTermsDays}-day terms
        </p>

        {/* The ask */}
        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 border-t border-zinc-100 pt-3">
          <Fact label="Grade">{e.gradeName}</Fact>
          <Fact label="Quantity">{mt(e.quantity_mt)}</Fact>
          <Fact label="Delivery window">{dateRange(e.window_start, e.window_end)}</Fact>
          <Fact label="Vessel ETA">
            <span className={`inline-flex items-center gap-1 ${etaLate.value ? 'text-amber-700' : ''}`}>
              {dateTime(e.vessel_eta)}
              {etaLate.value && <AlertIcon className="size-3" />}
            </span>
          </Fact>
          <Fact label="Port">{e.port}</Fact>
        </div>
      </div>

      {/* Deadline, or the response once sent */}
      {e.status === 'open' ? (
        <div className={`flex w-40 shrink-0 flex-col items-center justify-center ${urgent ? 'bg-red-50 text-red-600' : 'bg-zinc-50 text-zinc-800'}`}>
          <div className="text-xs opacity-70">Quote due in</div>
          <MetricValue r={due} className="text-[28px] font-semibold tracking-tight" format={(m: number) => duration(m)} />
        </div>
      ) : (
        <div className="flex w-40 shrink-0 flex-col items-center justify-center bg-emerald-50 text-emerald-700">
          <div className="text-xs opacity-70">Response sent</div>
          <div className="text-xl font-semibold capitalize">{e.status}</div>
        </div>
      )}
    </header>
  )
}
