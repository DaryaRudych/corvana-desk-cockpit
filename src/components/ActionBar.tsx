import { useState, type ReactNode } from 'react'
import { day, mt, usdMt } from '../lib/format'
import { DECLINE_REASONS, type DeclineReason, type TraderResponse } from '../semantic/actions'
import type { Move, SuggestedMove } from '../semantic/metrics'
import { query, type UserContext } from '../semantic/query'
import { applyOption, optionLabel, termsParams, type Mode, type Terms } from './terms'
import { CARD, MetricValue, Pill } from './ui'

// Pills: solid primary, thin-outlined alternatives (clearly clickable, not flat boxes).
const BUTTON =
  'relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-6 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:pointer-events-none disabled:opacity-40'
const PRIMARY = `${BUTTON} bg-indigo-600 text-white shadow-[0_2px_8px_rgba(79,70,229,0.28)] hover:bg-indigo-700`
const OUTLINE = `${BUTTON} border border-zinc-300 bg-white text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50`
const SECONDARY = 'shrink-0 rounded-full px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
const INPUT = 'num rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 focus:border-indigo-400 focus:outline-none'

const MOVE_REASON_TO_DECLINE: Record<SuggestedMove['reason'], DeclineReason> = {
  compliance: 'compliance',
  credit: 'credit',
  capacity: 'no capacity',
  stock: 'no capacity',
  margin: 'price',
  clear: 'price',
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-zinc-500">{label}</span>
      {children}
    </label>
  )
}

function Readout({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-zinc-50 px-3 py-2">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className="text-[15px] font-semibold text-zinc-900">{children}</div>
    </div>
  )
}

function CounterForm({
  enquiryId,
  user,
  move,
  terms,
  setTerms,
  onCancel,
  onReview,
}: {
  enquiryId: string
  user: UserContext
  move: SuggestedMove | null
  terms: Terms
  setTerms: (t: Terms) => void
  onCancel: () => void
  onReview: () => void
}) {
  const e = query('enquiry_details', { enquiryId }, user).value!
  const timeline = query('barge_timeline', { enquiryId }, user).value
  const live = termsParams(enquiryId, terms)
  const after = query('credit_headroom_after_deal', live, user)
  const margin = query('expected_deal_margin', live, user)
  const options = move?.move === 'COUNTER' ? move.counterOptions : []
  const termsNote = options.find((o) => o.kind === 'payment_terms')
  const dates = timeline ? timeline.days.filter((d) => d >= e.window_start) : [e.window_start]
  const freeOn = (d: string) => (timeline ? timeline.barges.some((b) => b.freeDays.includes(d)) : false)
  const tooSmall = terms.quantity < 300

  return (
    <div className="flex flex-col gap-4">
      {options.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] text-zinc-500">Suggested counter options</div>
          <div className="flex flex-wrap gap-2">
            {options.map((o, i) => (
              <button
                key={o.kind}
                type="button"
                onClick={() => setTerms(applyOption(terms, o, e.quantity_mt))}
                className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
              >
                {i + 1}. {optionLabel(o, e.quantity_mt)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-[1fr_1fr_1.3fr_1fr_1fr] items-end gap-3">
        <Field label="Quantity, mt">
          <input
            type="number"
            min={0}
            step={50}
            value={terms.quantity}
            onChange={(ev) => setTerms({ ...terms, quantity: Number(ev.target.value) })}
            className={`${INPUT} ${tooSmall ? 'border-red-300' : ''}`}
          />
        </Field>
        <Field label="Delivery date">
          <select value={terms.deliveryDate} onChange={(ev) => setTerms({ ...terms, deliveryDate: ev.target.value })} className={INPUT}>
            {dates.map((d) => (
              <option key={d} value={d}>
                {day(d)}
                {freeOn(d) ? ' · barge free' : ' · no barge'}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Payment">
          <span className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={5}
              value={terms.paymentDays}
              disabled={terms.letterOfCredit}
              onChange={(ev) => setTerms({ ...terms, paymentDays: Number(ev.target.value) })}
              className={`${INPUT} w-16 disabled:bg-zinc-50 disabled:text-zinc-400`}
            />
            <span className="text-xs text-zinc-500">days</span>
            <label className="ml-1 flex items-center gap-1.5 text-xs text-zinc-700">
              <input type="checkbox" checked={terms.letterOfCredit} onChange={(ev) => setTerms({ ...terms, letterOfCredit: ev.target.checked })} className="accent-indigo-600" />
              Letter of credit
            </label>
          </span>
        </Field>
        <Readout label="Headroom after">
          <MetricValue r={after} className={(after.value ?? 0) < 0 ? 'text-red-600' : 'text-emerald-600'} />
        </Readout>
        <Readout label="Expected margin">
          <MetricValue r={margin} />
        </Readout>
      </div>

      {termsNote?.kind === 'payment_terms' && terms.paymentDays < e.paymentTermsDays && !terms.letterOfCredit && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Shorter terms: {termsNote.note}
        </p>
      )}
      {tooSmall && <p className="text-xs text-red-600">Minimum quantity is 300 mt.</p>}
      {!freeOn(terms.deliveryDate) && <p className="text-xs text-amber-700">No compatible barge is free on {day(terms.deliveryDate)}.</p>}

      <div className="flex items-center gap-2">
        <button type="button" onClick={onReview} disabled={tooSmall} className={PRIMARY}>
          Review counter
        </button>
        <button type="button" onClick={onCancel} className={SECONDARY}>
          Cancel
        </button>
        <span className="num ml-auto text-xs text-zinc-500">
          {usdMt(terms.premium)}/mt · {mt(terms.quantity)} · {day(terms.deliveryDate)} · {terms.letterOfCredit ? 'letter of credit' : `${terms.paymentDays}-day terms`}
        </span>
      </div>
    </div>
  )
}

function DeclineForm({ initial, onCancel, onReview }: { initial: DeclineReason; onCancel: () => void; onReview: (r: DeclineReason) => void }) {
  const [reason, setReason] = useState<DeclineReason>(initial)
  return (
    <div className="flex items-end gap-3">
      <Field label="Reason for declining">
        <select value={reason} onChange={(ev) => setReason(ev.target.value as DeclineReason)} className={`${INPUT} w-56`}>
          {DECLINE_REASONS.map((r) => (
            <option key={r} value={r}>
              {r[0].toUpperCase() + r.slice(1)}
            </option>
          ))}
        </select>
      </Field>
      <span className="group relative mb-2 inline-flex">
        <span className="flex size-4 cursor-help items-center justify-center rounded-full bg-zinc-200 text-[10px] font-bold text-zinc-600">i</span>
        <span className="pointer-events-none absolute bottom-6 left-1/2 w-64 -translate-x-1/2 rounded-lg bg-zinc-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
          Decline reasons feed the desk's win-rate data: they're how the win range on similar deals separates price losses from capacity or credit.
        </span>
      </span>
      <button type="button" onClick={() => onReview(reason)} className={PRIMARY}>
        Review decline
      </button>
      <button type="button" onClick={onCancel} className={SECONDARY}>
        Cancel
      </button>
    </div>
  )
}

const SENT_LABEL = { quoted: 'Quoted', countered: 'Countered', declined: 'Declined' } as const

export function ActionBar({
  enquiryId,
  user,
  mode,
  terms,
  setTerms,
  onMode,
  onReview,
}: {
  enquiryId: string
  user: UserContext
  mode: Mode
  terms: Terms
  setTerms: (t: Terms) => void
  onMode: (m: Mode) => void
  onReview: (r: TraderResponse) => void
}) {
  const e = query('enquiry_details', { enquiryId }, user).value!
  const move = query('suggested_move', { enquiryId }, user).value
  const blocked = move?.move === 'BLOCKED'
  // The AI recommends the action, not the price: the badge sits on the button's edge, apart from its label.
  // The rule recommends a move at its suggested premium. Once the trader prices elsewhere, the
  // recommendation no longer applies, so the badge only shows at that premium (Decline is price-free).
  const atRulePrice = move?.premium == null || terms.premium === move.premium
  const recTag = (m: Move) =>
    move?.move === m &&
    atRulePrice && (
      <span className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-2 py-px text-[9px] font-bold tracking-wide text-white uppercase shadow-sm ring-2 ring-white">
        Recommended
      </span>
    )

  if (e.status !== 'open') {
    return (
      <div className={`flex items-center gap-3 px-5 py-4 ${CARD}`}>
        <Pill tone={e.status === 'declined' ? 'neutral' : 'ok'}>{SENT_LABEL[e.status]}</Pill>
        <span className="text-sm text-zinc-600">
          Response sent to {e.customerName}
          {e.quoted_premium_usd_mt !== null && <span className="num"> at {usdMt(e.quoted_premium_usd_mt)}/mt</span>}
          {e.decline_reason && <> · reason: {e.decline_reason}</>}. Removed from the open queue.
        </span>
      </div>
    )
  }

  return (
    <div className={`px-5 py-4 ${CARD} shadow-[0_4px_24px_rgba(16,24,40,0.10)]`}>
      {mode === 'review' && (
        <div className="flex items-center gap-2 pt-1.5">
          <button
            type="button"
            disabled={blocked}
            onClick={() => onReview({ kind: 'quote', enquiryId, premium: terms.premium, quantity: e.quantity_mt })}
            className={PRIMARY}
          >
            {blocked ? 'Quote' : `Quote at ${usdMt(terms.premium)}`}
            {recTag('QUOTE')}
          </button>
          <button type="button" disabled={blocked} onClick={() => onMode('counter')} className={OUTLINE}>
            Counter
            {recTag('COUNTER')}
          </button>
          <button type="button" disabled={blocked} onClick={() => onMode('decline')} className={OUTLINE}>
            Decline
            {recTag('DECLINE')}
          </button>
          <span className="ml-auto min-w-0 text-right text-xs text-zinc-400">
            {blocked ? 'Refer to compliance. No price and no response from the cockpit.' : 'Nothing is sent until you review the message and click Send.'}
          </span>
        </div>
      )}
      {mode === 'counter' && (
        <CounterForm
          enquiryId={enquiryId}
          user={user}
          move={move}
          terms={terms}
          setTerms={setTerms}
          onCancel={() => onMode('review')}
          onReview={() =>
            onReview({
              kind: 'counter',
              enquiryId,
              premium: terms.premium,
              quantity: terms.quantity,
              deliveryDate: terms.deliveryDate,
              paymentDays: terms.paymentDays,
              letterOfCredit: terms.letterOfCredit,
            })
          }
        />
      )}
      {mode === 'decline' && (
        <DeclineForm
          initial={move ? MOVE_REASON_TO_DECLINE[move.reason] : 'price'}
          onCancel={() => onMode('review')}
          onReview={(reason) => onReview({ kind: 'decline', enquiryId, reason })}
        />
      )}
    </div>
  )
}
