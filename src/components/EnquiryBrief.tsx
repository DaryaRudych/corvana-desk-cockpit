import type { ReactNode } from 'react'
import { enquiryBrief } from '../ai/brief'
import { usdMt } from '../lib/format'
import type { Move } from '../semantic/metrics'
import { query, type UserContext } from '../semantic/query'
import { AiMark, BasedOn, Segments } from './ai'
import { CARD } from './ui'

const MOVE_TEXT: Record<Move, { label: string; color: string; dot: string }> = {
  QUOTE: { label: 'Quote', color: 'text-emerald-700', dot: 'bg-emerald-500' },
  COUNTER: { label: 'Counter', color: 'text-amber-700', dot: 'bg-amber-500' },
  DECLINE: { label: 'Decline', color: 'text-zinc-700', dot: 'bg-zinc-500' },
  BLOCKED: { label: 'Blocked', color: 'text-red-700', dot: 'bg-red-500' },
}

/** AI moment 1: the enquiry brief at the top of the enquiry screen. */
export function EnquiryBrief({ enquiryId, user, aside }: { enquiryId: string; user: UserContext; aside?: ReactNode }) {
  const brief = enquiryBrief(enquiryId, user)
  const e = query('enquiry_details', { enquiryId }, user).value
  if (!brief || !e) return null
  const sent = e.status !== 'open'
  const m = MOVE_TEXT[brief.move]

  return (
    <section className={`flex gap-3 px-5 py-4 ${CARD}`}>
      <AiMark className="mt-0.5 size-4" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[13px] text-zinc-500">
            {sent ? 'Suggested before sending: ' : 'Suggested: '}
            <span className={`inline-flex items-center gap-1.5 font-semibold ${m.color}`}>
              <span className={`size-1.5 rounded-full ${m.dot}`} />
              {m.label}
            </span>
            {sent && (
              <span className="ml-2 text-emerald-700">
                · Response sent: {e.status}
                {e.quoted_premium_usd_mt !== null && <span className="num"> at {usdMt(e.quoted_premium_usd_mt)}/mt</span>}
              </span>
            )}
          </div>
          {aside}
        </div>
        <p className={`text-[14px] leading-relaxed ${sent ? 'text-zinc-500' : 'text-zinc-800'}`}>
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
