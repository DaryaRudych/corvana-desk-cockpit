// The enquiry screen. Owns the terms the trader is working on, so the slider, the counter form
// and both cards read the same live terms through query().
import { useState } from 'react'
import type { TraderResponse } from '../semantic/actions'
import { query, type UserContext } from '../semantic/query'
import { ActionBar } from './ActionBar'
import { AskButton, AskInline, type AskPlacement, type Turn } from './AskBox'
import { DeliverablePanel } from './DeliverablePanel'
import { DraftMessageModal } from './DraftMessageModal'
import { EnquiryBrief } from './EnquiryBrief'
import { EnquiryHeader } from './EnquiryHeader'
import { PricePanel } from './PricePanel'
import { SafePanel } from './SafePanel'
import { applyOption, type Mode, type Terms } from './terms'

export function EnquiryWorkspace({
  enquiryId,
  user,
  onSent,
  askPlacement,
  thread,
  onAsk,
  onOpenAsk,
}: {
  enquiryId: string
  user: UserContext
  onSent: (message: string) => void
  askPlacement: AskPlacement
  thread: Turn[]
  onAsk: (q: string) => void
  onOpenAsk: () => void
}) {
  const e = query('enquiry_details', { enquiryId }, user).value!
  const move = query('suggested_move', { enquiryId }, user).value
  const suggestedPremium = query('suggested_premium', { enquiryId }, user).value ?? 0

  // Defaults: the customer's own terms at the suggested premium (or what was sent, once answered).
  const base: Terms = {
    premium: e.quoted_premium_usd_mt ?? move?.premium ?? suggestedPremium,
    quantity: e.quantity_mt,
    deliveryDate: e.window_start,
    paymentDays: e.paymentTermsDays,
    letterOfCredit: false,
  }
  const [terms, setTerms] = useState<Terms>(base)
  const [mode, setMode] = useState<Mode>('review')
  const [draft, setDraft] = useState<TraderResponse | null>(null)
  const open = e.status === 'open'

  const changeMode = (m: Mode) => {
    if (m === 'counter') {
      // Prefill from the suggested move's first counter option.
      const first = move?.move === 'COUNTER' ? move.counterOptions[0] : undefined
      setTerms(first ? applyOption(terms, first, e.quantity_mt) : terms)
    } else {
      setTerms({ ...base, premium: terms.premium })
    }
    setMode(m)
  }

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-4 p-5">
      <EnquiryHeader enquiryId={enquiryId} user={user} />
      <EnquiryBrief enquiryId={enquiryId} user={user} aside={askPlacement === 'drawer' && <AskButton count={thread.length} onClick={onOpenAsk} />} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(270px,1fr))] items-stretch gap-4">
        <SafePanel enquiryId={enquiryId} user={user} terms={terms} />
        <DeliverablePanel enquiryId={enquiryId} user={user} />
        <PricePanel enquiryId={enquiryId} user={user} terms={terms} editable={open} onPremium={(premium) => setTerms({ ...terms, premium })} />
      </div>
      {askPlacement === 'inline' && <AskInline customer={e.customerName} thread={thread} onAsk={onAsk} />}
      {/* The compact action row stays in reach while scrolling; the taller counter/decline forms sit in the flow. */}
      <div className={mode === 'review' ? 'sticky bottom-0 z-10 -mx-5 -mb-5 bg-gradient-to-t from-[#f2f3f5] from-70% px-5 pt-3 pb-5' : ''}>
        <ActionBar enquiryId={enquiryId} user={user} mode={mode} terms={terms} setTerms={setTerms} onMode={changeMode} onReview={setDraft} />
      </div>
      {draft && (
        <DraftMessageModal
          response={draft}
          user={user}
          onCancel={() => setDraft(null)}
          onSent={(msg) => {
            setDraft(null)
            setMode('review')
            onSent(msg)
          }}
        />
      )}
    </div>
  )
}
