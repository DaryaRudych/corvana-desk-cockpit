// The enquiry screen. Owns the terms the trader is working on, so the slider, the counter form
// and both cards read the same live terms through query().
import { useState, type ReactNode } from 'react'
import type { TraderResponse } from '../semantic/actions'
import { query, type UserContext } from '../semantic/query'
import { ActionBar } from './ActionBar'
import { DeliverablePanel } from './DeliverablePanel'
import { DraftMessageModal } from './DraftMessageModal'
import { EnquiryHeader } from './EnquiryHeader'
import { PricePanel } from './PricePanel'
import { SafePanel } from './SafePanel'
import { applyOption, type Mode, type Terms } from './terms'

function Placeholder({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-2.5 text-xs text-zinc-500">
      <span className="mr-2 font-semibold text-zinc-600">{label}</span>
      {children}
    </div>
  )
}

export function EnquiryWorkspace({ enquiryId, user, onSent }: { enquiryId: string; user: UserContext; onSent: (message: string) => void }) {
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
      <Placeholder label="AI enquiry brief">
        Arrives in stage 6. Rule-based suggested move for this enquiry: <b className="text-zinc-700">{move?.move}</b>
      </Placeholder>
      <div className="grid grid-cols-3 items-stretch gap-4">
        <SafePanel enquiryId={enquiryId} user={user} terms={terms} />
        <DeliverablePanel enquiryId={enquiryId} user={user} />
        <PricePanel enquiryId={enquiryId} user={user} terms={terms} editable={open} onPremium={(premium) => setTerms({ ...terms, premium })} />
      </div>
      <Placeholder label="Ask about this enquiry">Arrives in stage 6.</Placeholder>
      <ActionBar enquiryId={enquiryId} user={user} mode={mode} terms={terms} setTerms={setTerms} onMode={changeMode} onReview={setDraft} />
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
