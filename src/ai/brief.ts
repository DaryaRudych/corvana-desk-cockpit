// AI moment 1: the enquiry brief. 1–3 sentences plus the suggested move.
// Deterministic templates over query() results: it explains the rule's outcome, it never
// computes a number, and on a compliance flag it only says "refer to compliance".
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

export function enquiryBrief(enquiryId: string, user: UserContext): Brief | null {
  const p = { enquiryId }
  const moveR = query('suggested_move', p, user)
  const e = query('enquiry_details', p, user).value
  const move = moveR.value
  if (!move || !e) return null

  const sentences: Segment[][] = []

  if (move.move === 'BLOCKED') {
    sentences.push(['A compliance check on this enquiry is ', chip(query('compliance_check', p, user)), '.'])
    sentences.push(['Refer to compliance.'])
    return { move: move.move, sentences, basedOn: basedOn(...sentences) }
  }

  const premium = query('suggested_premium', p, user)
  const qty = query('enquiry_details', p, user)
  const qtyChip = chip(qty, { label: mt(e.quantity_mt) })

  if (move.move === 'COUNTER' && move.reason === 'credit') {
    const b = query('suggested_premium_breakdown', p, user).value
    const dpd = query('days_past_due', p, user)
    const custClaim = query('customer_claim_share', p, user)
    const deskClaim = query('desk_claim_share', p, user)
    const lc = move.counterOptions.some((o) => o.kind === 'letter_of_credit')
    const reduce = move.counterOptions.find((o) => o.kind === 'quantity')

    if (b && (b.claimAdj > 0 || b.dpdAdj > 0)) {
      const why: Segment[] = [`${e.customerName} `]
      if (b.dpdAdj > 0) why.push('pays ', chip(dpd), ' late on average')
      if (b.dpdAdj > 0 && b.claimAdj > 0) why.push(' and ')
      if (b.claimAdj > 0) why.push('claims on ', chip(custClaim), ' of deliveries against the desk’s ', chip(deskClaim))
      why.push(', so the suggested premium carries ', b.dpdAdj > 0 && b.claimAdj > 0 ? 'both adjustments' : 'an adjustment', ': ', chip(premium, { format: perMt }), '.')
      sentences.push(why)
    }
    sentences.push([
      'But credit headroom is the reason to counter: at the full ',
      qtyChip,
      ' the deal leaves ',
      chip(query('credit_headroom_after_deal', p, user)),
      ' of group credit.',
    ])
    const close: Segment[] = ['Counter with ']
    if (reduce?.kind === 'quantity') close.push(chip(query('max_quantity_within_credit', p, user)))
    if (reduce && lc) close.push(', or ')
    if (lc) close.push('the full quantity against a letter of credit')
    close.push('.')
    sentences.push(close)
  } else if (move.move === 'COUNTER' && move.reason === 'capacity') {
    const date = move.counterOptions.find((o) => o.kind === 'delivery_date')
    const qtyOpt = move.counterOptions.find((o) => o.kind === 'quantity')
    sentences.push(['No compatible barge is free in the requested window (', chip(query('barge_available_in_window', p, user), { label: 'none free' }), ').'])
    if (date?.kind === 'delivery_date') {
      sentences.push([
        date.bargeName.replace('Corvana ', ''),
        ' is free on ',
        chip(moveR, { label: day(date.deliveryDate) }),
        ' and the vessel is due ',
        chip(qty, { label: day(e.vessel_eta.slice(0, 10)) }),
        ', so it can wait.',
      ])
      sentences.push(['Counter with the later date at ', chip(premium, { format: perMt }), '.'])
    } else if (qtyOpt?.kind === 'quantity') {
      sentences.push(['Counter with a smaller quantity of ', chip(moveR, { label: mt(qtyOpt.quantityMt) }), ' that a free barge can carry.'])
    }
  } else if (move.move === 'COUNTER' && move.reason === 'stock') {
    const qtyOpt = move.counterOptions.find((o) => o.kind === 'quantity')
    sentences.push([`${e.gradeName} stock is `, chip(query('stock_for_grade', p, user)), ', short of the ', qtyChip, ' requested.'])
    if (qtyOpt?.kind === 'quantity') sentences.push(['Counter with ', chip(moveR, { label: mt(qtyOpt.quantityMt) }), ' at ', chip(premium, { format: perMt }), '.'])
  } else if (move.move === 'DECLINE' && move.reason === 'margin') {
    sentences.push([
      'At the suggested premium of ',
      chip(premium, { format: perMt }),
      ' the expected margin is ',
      chip(query('expected_margin_per_mt', p, user), { format: perMt }),
      ', under the desk’s $3/mt floor.',
    ])
    sentences.push(['Decline; reason: price.'])
  } else if (move.move === 'DECLINE') {
    sentences.push(['No compatible barge or stock is available in the window or the three days after it (', chip(query('barge_available_in_window', p, user), { label: 'none free' }), ').'])
    sentences.push(['Decline; reason: no capacity.'])
  } else {
    // QUOTE
    sentences.push([
      'Compliance checks ',
      chip(query('compliance_check', p, user)),
      ', a barge is free in the window and headroom after the deal is ',
      chip(query('credit_headroom_after_deal', p, user)),
      '.',
    ])
    sentences.push([
      'Quote at ',
      chip(premium, { format: perMt }),
      ', in line with the customer’s 12-month average of ',
      chip(query('customer_avg_premium', p, user), { format: perMt }),
      ' (desk ',
      chip(query('desk_avg_premium', p, user), { format: perMt }),
      '); expected margin ',
      chip(query('expected_deal_margin', p, user)),
      '.',
    ])
  }

  return { move: move.move, sentences, basedOn: basedOn([chip(moveR)], ...sentences) }
}
