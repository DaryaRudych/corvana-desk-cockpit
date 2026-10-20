import { enquiryBrief } from '../ai/brief'
import type { Move } from '../semantic/metrics'
import type { UserContext } from '../semantic/query'
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
  if (!brief) return null
  return (
    <section className={`flex gap-5 px-5 py-4 ${CARD}`}>
      <div className="flex w-36 shrink-0 flex-col items-start gap-2 border-r border-zinc-100 pr-5">
        <AiBadge label="AI brief" />
        <div className="text-[11px] text-zinc-500">Suggested move</div>
        <span className={`rounded-lg px-3 py-1 text-base font-bold tracking-wide ${MOVE_STYLE[brief.move]}`}>{brief.move}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
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
