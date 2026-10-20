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
  BLOCKED: { label: 'Refer to compliance', color: 'text-red-700', dot: 'bg-red-500' },
}

/**
 * AI moment 1: the enquiry brief, shown as the "AI summary" under the evidence and
 * directly above the actions, so the trader reads the data first and the synthesis second.
 */
export function EnquiryBrief({ enquiryId, user, aside }: { enquiryId: string; user: UserContext; aside?: ReactNode }) {
  const brief = enquiryBrief(enquiryId, user)
  const e = query('enquiry_details', { enquiryId }, user).value
  if (!brief || !e) return null
  const sent = e.status !== 'open'
  const m = MOVE_TEXT[brief.move]

  return (
    <section className={`flex flex-col gap-2.5 px-5 py-4 ${CARD}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <AiMark className="size-4" /> AI summary
        </h2>
        {aside}
      </div>
      <p className={`text-[14px] leading-relaxed ${sent ? 'text-zinc-500' : 'text-zinc-800'}`}>
        {brief.sentences.map((s, i) => (
          <span key={i}>
            <Segments parts={s} />{' '}
          </span>
        ))}
      </p>
      <div className="flex flex-wrap items-baseline gap-x-3 text-[13px]">
        <span className="text-zinc-500">{sent ? 'Recommended before sending:' : 'Recommended action:'}</span>
        <span className={`inline-flex items-center gap-1.5 font-semibold ${m.color}`}>
          <span className={`size-2 rounded-full ${m.dot}`} />
          {m.label}
        </span>
        {sent && (
          <span className="text-emerald-700">
            · Response sent: {e.status}
            {e.quoted_premium_usd_mt !== null && <span className="num"> at {usdMt(e.quoted_premium_usd_mt)}/mt</span>}
          </span>
        )}
      </div>
      <BasedOn results={brief.basedOn} />
    </section>
  )
}
