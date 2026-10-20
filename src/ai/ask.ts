// AI moment 2: "Ask about this enquiry". Free text is matched to a small set of supported
// intents, each answered from governed metrics only, scoped to this enquiry's customer and grade.
// Questions about another business unit are sent to query() for that BU, so the refusal comes
// from the permission layer, in the same words as the restricted line on screen.
import { day, mt, signedUsdMt, usdMt } from '../lib/format'
import { listBusinessUnits, query, type QueryResult, type UserContext } from '../semantic/query'
import { basedOn, chip, type Chip, type Segment } from './types'

export type Cell = string | Chip
export interface Answer {
  kind: 'answer' | 'refusal' | 'unsupported'
  text: Segment[]
  table?: { columns: string[]; rows: Cell[][]; align?: ('left' | 'right')[] }
  chart?: { kind: 'bars'; points: { label: string; value: number | null; reference: number }[] } | { kind: 'line'; points: { label: string; value: number }[] }
  basedOn: QueryResult<unknown>[]
}

export const SUGGESTED_QUESTIONS = ['Why this suggested premium?', 'What premium did Rotterdam get from this customer?', 'Last 5 deals with this customer']

const perMt = (v: number) => `${usdMt(v)}/mt`
const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w))

function answer(text: Segment[], extra: Partial<Answer> = {}, alsoRead: QueryResult<unknown>[] = []): Answer {
  return { kind: 'answer', text, ...extra, basedOn: basedOn(text, alsoRead.map((r) => chip(r)), extra.table?.rows.flat().filter((c): c is Chip => typeof c !== 'string')) }
}

export function ask(question: string, enquiryId: string, user: UserContext): Answer {
  const q = question.toLowerCase()
  const p = { enquiryId }
  const e = query('enquiry_details', p, user).value
  if (!e) return { kind: 'refusal', text: [query('enquiry_details', p, user).restricted ?? 'Enquiry not available.'], basedOn: [] }

  // 1. Another business unit or desk → let the permission layer decide.
  const other = listBusinessUnits().find((b) => b.id !== user.businessUnit && (q.includes(b.name.toLowerCase()) || q.includes(b.name.split(' ')[0].toLowerCase())))
  if (other || has(q, 'other bu', 'other business unit', 'other desk', 'another desk')) {
    const target = other?.id ?? listBusinessUnits().find((b) => b.id !== user.businessUnit)!.id
    const r = query('customer_avg_premium', { enquiryId, businessUnit: target }, user)
    return { kind: 'refusal', text: [r.restricted ?? 'Not available.'], basedOn: [] }
  }

  const blocked = query('compliance_check', p, user).value === 'FLAG'

  // Forecasts and what-ifs: there is no governed metric for the future, so no answer.
  const forecast = has(q, 'will ', 'next week', 'next month', 'tomorrow', 'forecast', 'predict', 'expect', 'going to', 'chance', 'probability', 'likely')

  const pricing = has(q, 'premium', 'price', 'margin', 'quote')
  if (blocked && pricing) {
    return { kind: 'refusal', text: ['This enquiry is flagged by compliance (', chip(query('compliance_check', p, user)), '), so there is no price to discuss. Refer to compliance.'], basedOn: [] }
  }

  if (forecast) return unsupported(enquiryId, user, blocked)

  // 2. Why this suggested premium
  if ((has(q, 'why') && has(q, 'premium', 'price')) || has(q, 'suggested premium', 'how is the premium', 'premium built')) {
    const b = query('suggested_premium_breakdown', p, user)
    const v = b.value!
    const text: Segment[] =
      v.baseSource === 'customer'
        ? ['It starts from the customer’s 12-month average premium, ', chip(query('customer_avg_premium', p, user), { format: perMt }), ' over ', chip(query('customer_deal_count', p, user)), ' deals.']
        : ['The customer has fewer than 5 deals (', chip(query('customer_deal_count', p, user)), '), so it starts from the desk average, ', chip(query('desk_avg_premium', p, user), { format: perMt }), '.']
    if (v.claimAdj > 0) text.push(` +$${v.claimAdj} for claims: their claim share is `, chip(query('customer_claim_share', p, user)), ' against the desk’s ', chip(query('desk_claim_share', p, user)), ', more than twice as high.')
    if (v.dpdAdj > 0) text.push(` +$${v.dpdAdj} for late payment: they pay `, chip(query('days_past_due', p, user)), ' late on average, more than 3.')
    if (v.claimAdj === 0 && v.dpdAdj === 0) text.push(' No claims or late-payment adjustment applies.')
    text.push(' Rounded to $0.50: ', chip(query('suggested_premium', p, user), { format: perMt }), '.')
    return answer(text, {}, [b])
  }

  // 3. Benchmark trend
  if (has(q, 'benchmark', 'market', 'vlsfo', 'hsfo', 'mgo', 'price trend')) {
    const r = query('benchmark_trend_30d', p, user)
    const pts = r.value ?? []
    return answer(
      [`${e.gradeName} benchmark over the last 30 days. Today `, chip(query('benchmark_price', p, user), { format: perMt }), ', change vs yesterday ', chip(query('benchmark_delta', p, user), { format: (v: number) => `${signedUsdMt(v)}/mt` }), '.'],
      { chart: { kind: 'line', points: pts.map((x) => ({ label: x.date, value: x.benchmarkUsdMt })) } },
      [r],
    )
  }

  // 4. Customer premium trend by month
  if (has(q, 'premium') && has(q, 'trend', 'monthly', 'by month', 'over time', 'history', '12 months')) {
    const r = query('customer_premium_trend', p, user)
    const rows = r.value ?? []
    return answer(
      [`${e.customerName}'s average premium by month over the last 12 months, against the desk average. Current 12-month average: `, chip(query('customer_avg_premium', p, user), { format: perMt }), '.'],
      {
        chart: { kind: 'bars', points: rows.map((x) => ({ label: x.month.slice(5), value: x.customerAvgPremium, reference: x.deskAvgPremium })) },
        table: {
          columns: ['Month', 'Deals', 'Customer', 'Desk'],
          align: ['left', 'right', 'right', 'right'],
          rows: rows.map((x) => [x.month, String(x.customerDeals), x.customerAvgPremium === null ? '—' : usdMt(x.customerAvgPremium), usdMt(x.deskAvgPremium)]),
        },
      },
      [r],
    )
  }

  // 5. Last deals
  if (has(q, 'last', 'recent', 'previous', 'deals with')) {
    const r = query('customer_recent_deals', p, user)
    const rows = r.value ?? []
    return answer(
      [`${e.customerName}'s `, chip(r, { label: String(rows.length) }), ' most recent deals with this desk.'],
      {
        table: {
          columns: ['Delivery', 'Grade', 'Quantity', 'Premium', 'Status'],
          align: ['left', 'left', 'right', 'right', 'left'],
          rows: rows.map((d) => [day(d.deliveryDate), d.gradeName, mt(d.quantityMt), usdMt(d.premiumUsdMt), d.status]),
        },
      },
      [r],
    )
  }

  // 6. Claims
  if (has(q, 'claim', 'dispute', 'quantity short')) {
    const r = query('customer_claim_history', p, user)
    const v = r.value!
    return answer(
      [chip(r, { label: String(v.claims.length) }), ' quantity claims on ', chip(r, { label: String(v.deliveries) }), ' deliveries in the last 12 months. Claim share ', chip(query('customer_claim_share', p, user)), ' against the desk’s ', chip(query('desk_claim_share', p, user)), '.'],
      {
        table: {
          columns: ['Delivered', 'Delivered qty', 'Claimed qty', 'Claim value'],
          align: ['left', 'right', 'right', 'right'],
          rows: v.claims.map((c) => [day(c.deliveredOn), mt(c.deliveredQtyMt), mt(c.claimQtyMt), `$${Math.round(c.claimAmountUsd).toLocaleString('en-US')}`]),
        },
      },
      [r],
    )
  }

  // 7. Credit exposure
  if (has(q, 'credit', 'exposure', 'headroom', 'limit', 'owe')) {
    const other = query('exposure_other_bus', p, user)
    return answer(['Group credit limit ', chip(query('group_credit_limit', p, user)), ', group exposure ', chip(query('group_exposure', p, user)), ', headroom before this deal ', chip(query('credit_headroom_before_deal', p, user)), '.'], {
      table: {
        columns: ['Exposure', 'Amount'],
        align: ['left', 'right'],
        rows: [
          ['Own BU', chip(query('exposure_own_bu', p, user))],
          ['Other BUs (detail restricted)', chip(other)],
          ['Avg days past due', chip(query('days_past_due', p, user))],
        ],
      },
    })
  }

  // Anything else: no guessing.
  return unsupported(enquiryId, user, blocked)
}

function unsupported(enquiryId: string, user: UserContext, blocked: boolean): Answer {
  const p = { enquiryId }
  const related = blocked
    ? [chip(query('compliance_check', p, user))]
    : [chip(query('suggested_premium', p, user), { label: 'Suggested premium' }), chip(query('credit_headroom_after_deal', p, user), { label: 'Credit headroom' }), chip(query('benchmark_price', p, user), { label: 'Benchmark' })]
  const text: Segment[] = ['I can only answer from governed metrics. Related: ']
  related.forEach((c, i) => text.push(...(i ? [', ', c] : [c])))
  text.push('.')
  return { kind: 'unsupported', text, basedOn: [] }
}
