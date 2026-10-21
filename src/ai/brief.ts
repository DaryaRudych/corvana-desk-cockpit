// AI moment 1: the enquiry brief. 1–3 short sentences plus the suggested move.
// Deterministic templates over query() results: it explains the rule's outcome, it never
// computes a number, and on a compliance flag it only says "refer to compliance".
// Kept deliberately lean: the decisive figures inline, the supporting ones in "Based on".
import { day, mt, usdMt } from '../lib/format'
import type { Move } from '../semantic/metrics'
import { query, type UserContext } from '../semantic/query'
import { basedOn, chip, type Segment } from './types'

export interface Brief {
  move: Move
  sentences: Segment[][]
  basedOn: ReturnType<typeof basedOn>
}

const perMt = (v: number) => `${usdMt(v)}/mt`

/** The rule's build-up in words, every figure a chip: base + adjustments, then rounding. */
function premiumBuildUp(p: { enquiryId: string }, user: UserContext): Segment[] {
  const bR = query('suggested_premium_breakdown', p, user)
  const b = bR.value!
  const fromCustomer = b.baseSource === 'customer'
  const parts: Segment[] = [
    fromCustomer ? 'the customer’s 12-month average of ' : 'the desk average of ',
    chip(query(fromCustomer ? 'customer_avg_premium' : 'desk_avg_premium', p, user), { format: perMt }),
  ]
  if (b.claimAdj) parts.push(' + ', chip(bR, { label: `$${b.claimAdj}` }), ' for claims')
  if (b.dpdAdj) parts.push(' + ', chip(bR, { label: `$${b.dpdAdj}` }), ' for late payment')
  if (!b.claimAdj && !b.dpdAdj) parts.push(', with no claims or late-payment adjustment')
  if (b.rounding) parts.push(', rounded to the nearest $0.50')
  return parts
}

export function enquiryBrief(enquiryId: string, user: UserContext): Brief | null {
  const p = { enquiryId }
  const moveR = query('suggested_move', p, user)
  const details = query('enquiry_details', p, user)
  const move = moveR.value
  const e = details.value
  if (!move || !e) return null

  const sentences: Segment[][] = []
  const support = [chip(moveR)] // read by the rule, cited in "Based on" rather than inline

  if (move.move === 'BLOCKED') {
    sentences.push([chip(query('compliance_check', p, user), { label: 'Compliance flag' }), ' on this enquiry. Refer to compliance.'])
    return { move: move.move, sentences, basedOn: basedOn(...sentences) }
  }

  const premium = chip(query('suggested_premium', p, user), { format: perMt })

  if (move.move === 'COUNTER' && move.reason === 'credit') {
    support.push(chip(query('days_past_due', p, user)), chip(query('customer_claim_share', p, user)), chip(query('desk_claim_share', p, user)))
    sentences.push(['The premium is ', premium, ': ', ...premiumBuildUp(p, user), '.'])
    sentences.push([
      'But credit is the reason to counter: the full ',
      chip(details, { label: mt(e.quantity_mt) }),
      ' would leave ',
      chip(query('credit_headroom_after_deal', p, user)),
      ' of group credit.',
    ])
    const reduce = move.counterOptions.some((o) => o.kind === 'quantity')
    const lc = move.counterOptions.some((o) => o.kind === 'letter_of_credit')
    sentences.push([
      'Offer ',
      ...(reduce ? [chip(query('max_quantity_within_credit', p, user))] : []),
      reduce && lc ? ', or the full quantity against a letter of credit.' : lc ? 'the full quantity against a letter of credit.' : '.',
    ])
  } else if (move.move === 'COUNTER' && move.reason === 'capacity') {
    const date = move.counterOptions.find((o) => o.kind === 'delivery_date')
    const qty = move.counterOptions.find((o) => o.kind === 'quantity')
    sentences.push([chip(query('barge_available_in_window', p, user), { label: 'No barge is free' }), ' in the requested window.'])
    if (date?.kind === 'delivery_date') {
      sentences.push(['Counter with ', chip(moveR, { label: `${date.bargeName.replace('Corvana ', '')} on ${day(date.deliveryDate)}` }), ', after the vessel arrives, at ', premium, '.'])
    } else if (qty?.kind === 'quantity') {
      sentences.push(['Counter with ', chip(moveR, { label: mt(qty.quantityMt) }), ', which a free barge can carry.'])
    }
  } else if (move.move === 'COUNTER' && move.reason === 'stock') {
    const qty = move.counterOptions.find((o) => o.kind === 'quantity')
    sentences.push(['Stock is ', chip(query('stock_for_grade', p, user)), ', short of the ', chip(details, { label: mt(e.quantity_mt) }), ' requested.'])
    if (qty?.kind === 'quantity') sentences.push(['Counter with ', chip(moveR, { label: mt(qty.quantityMt) }), ' at ', premium, '.'])
  } else if (move.move === 'DECLINE' && move.reason === 'margin') {
    sentences.push(['At ', premium, ' the margin would be ', chip(query('expected_margin_per_mt', p, user), { format: perMt }), ', under the $3/mt floor. Decline on price.'])
  } else if (move.move === 'DECLINE') {
    sentences.push([chip(query('barge_available_in_window', p, user), { label: 'No barge or stock' }), ' in the window or the three days after. Decline: no capacity.'])
  } else {
    // QUOTE
    const fromCustomer = query('suggested_premium_breakdown', p, user).value?.baseSource === 'customer'
    support.push(chip(query(fromCustomer ? 'desk_avg_premium' : 'customer_deal_count', p, user)))
    sentences.push([
      chip(query('compliance_check', p, user), { label: 'Compliance passes' }),
      ', ',
      chip(query('barge_available_in_window', p, user), { label: 'a barge is free' }),
      ' and ',
      chip(query('credit_headroom_after_deal', p, user), { label: 'credit holds' }),
      '.',
    ])
    sentences.push(['Quote at ', premium, ': ', ...premiumBuildUp(p, user), '.'])
    // Say so when the customer's own history prices above the desk's won band on similar quotes.
    const winR = query('win_range_similar', p, user)
    const sugg = query('suggested_premium', p, user).value
    if (fromCustomer && winR.value?.wonP75 != null && sugg !== null && sugg > winR.value.wonP75) {
      sentences.push(['That is above the desk’s won range on similar quotes (up to ', chip(winR, { label: perMt(winR.value.wonP75) }), '), in line with what this customer pays.'])
    }
    sentences.push(['Expected margin ', chip(query('expected_deal_margin', p, user)), ' after our cost and barging.'])
  }

  return { move: move.move, sentences, basedOn: basedOn(...sentences, support) }
}
