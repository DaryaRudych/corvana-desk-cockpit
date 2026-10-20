// AI moment 3 host: review the terms and the AI-drafted message, edit, then Send. Nothing leaves
// the browser: Send only records the response for this session.
import { useEffect, useState, type ReactNode } from 'react'
import { draftMessage } from '../ai/draft'
import { day, mt, usdMt } from '../lib/format'
import { submitResponse, type TraderResponse } from '../semantic/actions'
import { query, type UserContext } from '../semantic/query'
import { AiMark, BasedOn } from './ai'
import { CARD } from './ui'

const TITLES = { quote: 'Send quote', counter: 'Send counter-offer', decline: 'Send decline' } as const

function Term({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5">
      <span className="text-zinc-500">{label}</span>
      <span className="num text-right font-medium text-zinc-900">{children}</span>
    </div>
  )
}

export function DraftMessageModal({ response, user, onCancel, onSent }: { response: TraderResponse; user: UserContext; onCancel: () => void; onSent: (summary: string) => void }) {
  const [draft] = useState(() => draftMessage(response, user))
  const [message, setMessage] = useState(draft.text)
  const [error, setError] = useState<string | null>(null)
  const e = query('enquiry_details', { enquiryId: response.enquiryId }, user).value!
  const price = response.kind === 'decline' ? null : query('quoted_price', { enquiryId: response.enquiryId, premium: response.premium }, user).value

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onCancel()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const send = () => {
    try {
      submitResponse(response, user)
      const what = response.kind === 'quote' ? 'Quote' : response.kind === 'counter' ? 'Counter-offer' : 'Decline'
      onSent(`${what} sent to ${e.customerName}.`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-6">
      <div className="absolute inset-0 animate-[fade-in_150ms_ease-out] bg-zinc-900/30" onClick={onCancel} />
      <div role="dialog" aria-label={TITLES[response.kind]} className={`relative flex w-[560px] max-w-full flex-col ${CARD} shadow-[0_16px_48px_rgba(16,24,40,0.24)]`}>
        <header className="px-6 pt-5">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900">{TITLES[response.kind]}</h2>
          <p className="text-xs text-zinc-500">
            To {e.customerName} · {e.vesselName} · {e.enquiry_id}
          </p>
        </header>

        <div className="flex flex-col gap-4 px-6 py-4">
          <div className="divide-y divide-zinc-100 rounded-xl bg-zinc-50 px-3 text-[13px]">
            {response.kind === 'decline' ? (
              <Term label="Reason (internal)">{response.reason}</Term>
            ) : (
              <>
                <Term label="Premium">{usdMt(response.premium)}/mt</Term>
                <Term label="Price">{price !== null ? `${usdMt(price)}/mt` : '—'}</Term>
                <Term label="Quantity">
                  {mt(response.quantity)} {e.gradeName}
                </Term>
                {response.kind === 'counter' ? (
                  <>
                    <Term label="Delivery">{day(response.deliveryDate)}</Term>
                    <Term label="Payment">{response.letterOfCredit ? 'Letter of credit required' : `${response.paymentDays} days`}</Term>
                  </>
                ) : (
                  <>
                    <Term label="Delivery window">
                      {day(e.window_start)}
                      {e.window_end !== e.window_start && ` – ${day(e.window_end)}`}
                    </Term>
                    <Term label="Payment">{e.paymentTermsDays} days</Term>
                  </>
                )}
              </>
            )}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2 text-xs text-zinc-500">
              <AiMark className="size-3" /> Message to the customer, drafted from the terms above. Edit before sending.
              {message !== draft.text && (
                <button type="button" onClick={() => setMessage(draft.text)} className="ml-auto font-medium text-indigo-600 hover:text-indigo-800">
                  Restore draft
                </button>
              )}
            </span>
            <textarea
              value={message}
              onChange={(ev) => setMessage(ev.target.value)}
              rows={11}
              className="resize-none rounded-xl border border-zinc-200 px-3 py-2.5 text-[13px] leading-relaxed text-zinc-900 focus:border-indigo-400 focus:outline-none"
            />
          </label>
          <BasedOn results={draft.basedOn.map((c) => c.r)} />
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        </div>

        <footer className="flex items-center gap-2 border-t border-zinc-100 px-6 py-4">
          <span className="text-[11px] text-zinc-400">Nothing is sent automatically. Demo: Send records the response here only.</span>
          <button type="button" onClick={onCancel} className="ml-auto rounded-full bg-zinc-100 px-5 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-200">
            Back
          </button>
          <button type="button" onClick={send} className="rounded-full bg-indigo-600 px-6 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            Send
          </button>
        </footer>
      </div>
    </div>
  )
}
