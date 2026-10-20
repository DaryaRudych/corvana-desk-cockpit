import { enquiryBrief } from '../ai/brief'
import type { Move } from '../semantic/metrics'
import { usdMt } from '../lib/format'
import { query, type UserContext } from '../semantic/query'
import { AiBadge, BasedOn, Segments } from './ai'
import { CARD } from './ui'

const MOVE_STYLE: Record<Move, string> = {
  QUOTE: 'bg-emerald-600 text-white',
  COUNTER: 'bg-amber-500 text-white',
  DECLINE: 'bg-zinc-700 text-white',
  BLOCKED: 'bg-red-600 text-white',
}

/** AI moment 1: the enquiry brief at the top of the enquiry screen. */
export function EnquiryBrief({ enquiryId, user }: { enquiryId: string; user: UserContext }) {
  const brief = enquiryBrief(enquiryId, user)
  const e = query('enquiry_details', { enquiryId }, user).value
  if (!brief || !e) return null
  const sent = e.status !== 'open'
  return (
    <section className={`flex gap-5 px-5 py-4 ${CARD} ${sent ? 'opacity-70' : ''}`}>
      <div className="flex w-36 shrink-0 flex-col items-start gap-2 border-r border-zinc-100 pr-5">
        <AiBadge label="AI brief" />
        <div className="text-[11px] text-zinc-500">{sent ? 'Suggested before sending' : 'Suggested move'}</div>
        <span className={`rounded-lg px-3 py-1 text-base font-bold tracking-wide ${MOVE_STYLE[brief.move]}`}>{brief.move}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
        {sent && (
          <p className="text-[13px] font-medium text-emerald-700">
            Response sent: {e.status}
            {e.quoted_premium_usd_mt !== null && <span className="num"> at {usdMt(e.quoted_premium_usd_mt)}/mt</span>}. The brief below is what was suggested.
          </p>
        )}
        <p className="text-[14px] leading-relaxed text-zinc-800">
          {brief.sentences.map((s, i) => (
            <span key={i}>
              <Segments parts={s} />{' '}
            </span>
          ))}
        </p>
        <BasedOn results={brief.basedOn} />
      </div>
    </section>
  )
}
