import { dateRange, dateTime, duration, mt } from '../lib/format'
import { query, type UserContext } from '../semantic/query'
import { AlertIcon } from './Icons'
import { MetricValue, Pill } from './ui'

export function EnquiryHeader({ enquiryId, user }: { enquiryId: string; user: UserContext }) {
  const p = { enquiryId }
  const e = query('enquiry_details', p, user).value
  const due = query('time_to_quote_due', p, user)
  const etaLate = query('vessel_eta_after_window', p, user)
  if (!e) return null
  const urgent = (due.value ?? 0) < 60

  return (
    <header className="flex items-start justify-between gap-6 rounded-md border border-zinc-200 bg-white px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 text-base">
          <span className="font-semibold text-zinc-900">{e.vesselName}</span>
          <span className="num text-xs text-zinc-400">IMO {e.vessel_id}</span>
          <span className="text-zinc-300">·</span>
          <span className="font-semibold">{e.gradeName}</span>
          <span className="text-zinc-300">·</span>
          <span className="num font-semibold">{mt(e.quantity_mt)}</span>
          <span className="text-zinc-300">·</span>
          <span>{dateRange(e.window_start, e.window_end)}</span>
          <span className="text-zinc-300">·</span>
          <span className="font-semibold">{e.customerName}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span>{e.port}</span>
          <span className="inline-flex items-center gap-1">
            ETA {dateTime(e.vessel_eta)}
            {etaLate.value && (
              <Pill tone="warn">
                <AlertIcon className="size-2.5" /> after window start
              </Pill>
            )}
          </span>
          <span>{e.vesselType}</span>
          <span>
            {e.parentGroup} · {e.paymentTermsDays}-day terms
          </span>
          <span className="num text-zinc-400">
            {e.enquiry_id} · received {dateTime(e.received_at)}
          </span>
        </div>
      </div>
      <div className={`shrink-0 rounded-md px-3 py-1.5 text-right ${urgent ? 'bg-red-50 text-red-700' : 'bg-zinc-50 text-zinc-700'}`}>
        <div className="text-[11px] tracking-wide uppercase opacity-70">Quote due in</div>
        <MetricValue r={due} className="text-lg font-semibold" format={(m: number) => duration(m)} />
      </div>
    </header>
  )
}
