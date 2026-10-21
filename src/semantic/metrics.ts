// Metric registry: one definition per metric, with owner, certification and lineage
// (BUILD_INSTRUCTIONS §4.1 and §6). Compute functions only ever receive the user's
// permission-scoped tables; they never import data themselves.
import type { Role, UserContext } from './permissions'
import type { DealRow, DeliveryRow, EnquiryRow, GradeId, TableName, Tables } from './schema'

// ───────────────────────────── types ─────────────────────────────

export type Unit = 'usd' | 'usd_mt' | 'mt' | 'days' | 'minutes' | 'ratio' | 'count' | 'status' | 'flag' | 'text' | 'dataset'

export interface BaseParams {
  /** Ask for another BU's data explicitly; query() refuses unless it is the user's own BU. */
  businessUnit?: string
}
export interface EnquiryParams extends BaseParams {
  enquiryId: string
}
/** Terms the trader is editing (quote builder / counter form). Defaults: suggested premium, enquiry quantity. */
export interface TermsParams extends EnquiryParams {
  premium?: number
  quantity?: number
  /** Deal secured by a letter of credit: the bank carries the payment risk, so it uses no customer credit. */
  letterOfCredit?: boolean
}

export interface ComputeCtx {
  user: UserContext
  t: Tables
  now: Date
  today: string
}

export interface MetricDef<P extends BaseParams, V> {
  id: string
  name: string
  definition: string
  formula: string
  owner: string
  certified: boolean
  certifiedOn: string | null
  sourceTables: TableName[]
  scope: 'group' | 'bu'
  visibleTo: Role[]
  unit: Unit
  /** 'dataset' = a governed table/series rather than a single number (timeline, win range, queue…). */
  kind: 'metric' | 'dataset'
  /** The total is visible but the rows behind it belong to other BUs. */
  detailRestricted?: boolean
  compute: (ctx: ComputeCtx, params: P) => V
}

const defineMetric = <P extends BaseParams, V>(m: MetricDef<P, V>) => m

/** Thrown when a metric is asked about a row outside the user's scope (e.g. another BU's enquiry). */
export class NotInScopeError extends Error {
  readonly enquiryId: string
  constructor(enquiryId: string) {
    super(`Enquiry ${enquiryId} is outside the user's scope`)
    this.enquiryId = enquiryId
  }
}

export type Move = 'QUOTE' | 'COUNTER' | 'DECLINE' | 'BLOCKED'
export type CounterOption =
  | { kind: 'quantity'; quantityMt: number }
  | { kind: 'letter_of_credit'; quantityMt: number }
  | { kind: 'payment_terms'; paymentDays: number; note: string }
  | { kind: 'delivery_date'; deliveryDate: string; bargeName: string }
export interface SuggestedMove {
  move: Move
  reason: 'compliance' | 'credit' | 'capacity' | 'stock' | 'margin' | 'clear'
  /** null for BLOCKED and DECLINE: no price is offered. */
  premium: number | null
  counterOptions: CounterOption[]
  /** Metric ids the rule read, for "Based on:" chips. */
  basedOn: string[]
}

// ───────────────────────────── rule constants ─────────────────────────────

const LOOKBACK_DAYS = 365 // "12 months"
const WIN_RANGE_DAYS = 183 // "last 6 months"
const MIN_CUSTOMER_DEALS = 5
const CLAIM_ADJ_USD = 2
const DPD_ADJ_USD = 1
const MIN_MARGIN_USD_MT = 3
const MARGIN_WATCH_BAND = 3 // amber band above the floor
const COUNTER_DATE_DAYS = 3
const MIN_QTY_MT = 300
const QTY_STEP_MT = 50
const SHORT_TERMS_DAYS = 15

// ───────────────────────────── helpers ─────────────────────────────

const DAY_MS = 86_400_000
const isoDay = (s: string) => s.slice(0, 10)
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
const diffDays = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : null)
const round2 = (x: number) => Math.round(x * 100) / 100
const roundTo = (x: number, step: number) => Math.round(x / step) * step
const floorTo = (x: number, step: number) => Math.floor(x / step) * step
function quantile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null
  const i = (sorted.length - 1) * p
  const lo = Math.floor(i)
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (i - lo)
}

function enquiryOf(ctx: ComputeCtx, enquiryId: string): EnquiryRow {
  const e = ctx.t.fct_enquiry.find((x) => x.enquiry_id === enquiryId)
  if (!e) throw new NotInScopeError(enquiryId)
  return e
}
const customerOf = (ctx: ComputeCtx, id: string) => ctx.t.dim_customer.find((c) => c.customer_id === id)!
const vesselOf = (ctx: ComputeCtx, id: string) => ctx.t.dim_vessel.find((v) => v.vessel_id === id)!
const gradeName = (ctx: ComputeCtx, id: GradeId) => ctx.t.dim_grade.find((g) => g.grade_id === id)!.grade_name

function benchmarkOn(ctx: ComputeCtx, grade: GradeId, date: string): number {
  let best: { date: string; v: number } | null = null
  for (const r of ctx.t.fct_market_price) {
    if (r.grade_id === grade && r.date <= date && (!best || r.date > best.date)) best = { date: r.date, v: r.benchmark_usd_mt }
  }
  return best!.v
}
const benchmarkToday = (ctx: ComputeCtx, grade: GradeId) => benchmarkOn(ctx, grade, ctx.today)

function latestStock(ctx: ComputeCtx, deskId: string, grade: GradeId) {
  return ctx.t.fct_stock.filter((s) => s.desk_id === deskId && s.grade_id === grade && s.date <= ctx.today).sort((a, b) => b.date.localeCompare(a.date))[0]
}

function deals12m(ctx: ComputeCtx, deskId: string, customerId?: string): DealRow[] {
  const from = addDays(ctx.today, -LOOKBACK_DAYS)
  return ctx.t.fct_deal.filter((d) => d.desk_id === deskId && d.delivery_date > from && (!customerId || d.customer_id === customerId))
}
function deliveriesOf(ctx: ComputeCtx, deals: DealRow[]): DeliveryRow[] {
  const ids = new Set(deals.map((d) => d.deal_id))
  const from = addDays(ctx.today, -LOOKBACK_DAYS)
  return ctx.t.fct_delivery.filter((x) => ids.has(x.deal_id) && isoDay(x.delivered_at) > from)
}
const avgPremium = (deals: DealRow[]) => avg(deals.map((d) => d.premium_usd_mt))
function claimShare(deliveries: DeliveryRow[]): number | null {
  const delivered = sum(deliveries.map((x) => x.delivered_qty_mt))
  return delivered ? sum(deliveries.map((x) => x.claim_qty_mt)) / delivered : null
}

function daysPastDue(ctx: ComputeCtx, customerId: string): number | null {
  const from = addDays(ctx.today, -LOOKBACK_DAYS)
  const invoices = ctx.t.fct_invoice.filter((i) => i.customer_id === customerId && i.due_date <= ctx.today && i.due_date > from)
  return avg(invoices.map((i) => Math.max(0, diffDays(i.due_date, i.paid_date ?? ctx.today))))
}

function premiumBreakdown(ctx: ComputeCtx, e: EnquiryRow) {
  const custDeals = deals12m(ctx, e.desk_id, e.customer_id)
  const deskDeals = deals12m(ctx, e.desk_id)
  const customerAvg = avgPremium(custDeals)
  const deskAvg = avgPremium(deskDeals)!
  const useCustomer = custDeals.length >= MIN_CUSTOMER_DEALS && customerAvg !== null
  const customerClaim = claimShare(deliveriesOf(ctx, custDeals))
  const deskClaim = claimShare(deliveriesOf(ctx, deskDeals))
  const dpd = daysPastDue(ctx, e.customer_id)
  const claimAdj = customerClaim !== null && deskClaim !== null && customerClaim > 2 * deskClaim ? CLAIM_ADJ_USD : 0
  const dpdAdj = dpd !== null && dpd > 3 ? DPD_ADJ_USD : 0
  const base = useCustomer ? customerAvg! : deskAvg
  return {
    baseSource: useCustomer ? ('customer' as const) : ('desk' as const),
    base: round2(base),
    customerAvg: customerAvg === null ? null : round2(customerAvg),
    customerDeals: custDeals.length,
    deskAvg: round2(deskAvg),
    customerClaimShare: customerClaim,
    deskClaimShare: deskClaim,
    claimAdj,
    daysPastDue: dpd === null ? null : round2(dpd),
    dpdAdj,
    beforeRounding: round2(base + claimAdj + dpdAdj),
    /** The rule's last step: round to the nearest $0.50. Shown so the build-up adds up on screen. */
    rounding: round2(roundTo(base + claimAdj + dpdAdj, 0.5) - (base + claimAdj + dpdAdj)),
    value: roundTo(base + claimAdj + dpdAdj, 0.5),
  }
}
const suggestedPremium = (ctx: ComputeCtx, e: EnquiryRow) => premiumBreakdown(ctx, e).value

const creditLimit = (ctx: ComputeCtx, customerId: string) => customerOf(ctx, customerId).credit_limit_usd
function groupExposure(ctx: ComputeCtx, customerId: string): number {
  const rows = ctx.t.agg_customer_exposure.filter((r) => r.customer_id === customerId && r.as_of_date <= ctx.today)
  return rows.sort((a, b) => b.as_of_date.localeCompare(a.as_of_date))[0]?.group_exposure_usd ?? 0
}
function ownBuExposure(ctx: ComputeCtx, customerId: string): number {
  const delivered = new Set(ctx.t.fct_delivery.map((x) => x.deal_id))
  const deals = ctx.t.fct_deal.filter((d) => d.customer_id === customerId)
  const undelivered = sum(deals.filter((d) => !delivered.has(d.deal_id)).map((d) => d.quantity_mt * d.price_usd_mt))
  const unpaid = sum(
    ctx.t.fct_invoice.filter((i) => i.customer_id === customerId && (i.paid_date === null || i.paid_date > ctx.today)).map((i) => i.amount_usd),
  )
  return round2(undelivered + unpaid)
}
const headroomBefore = (ctx: ComputeCtx, customerId: string) => round2(creditLimit(ctx, customerId) - groupExposure(ctx, customerId))

/** Resolve the terms being evaluated: explicit params, else suggested premium and enquiry quantity. */
function terms(ctx: ComputeCtx, p: TermsParams) {
  const e = enquiryOf(ctx, p.enquiryId)
  const premium = p.premium ?? suggestedPremium(ctx, e)
  const quantity = p.quantity ?? e.quantity_mt
  return { e, premium, quantity, price: round2(benchmarkToday(ctx, e.grade_id) + premium) }
}
/** What the customer owes for this deal from delivery until payment: the whole invoice, not the premium. */
const dealCreditUse = (ctx: ComputeCtx, p: TermsParams) => {
  const { quantity, price } = terms(ctx, p)
  return p.letterOfCredit ? 0 : round2(quantity * price)
}
const headroomAfter = (ctx: ComputeCtx, p: TermsParams) => {
  const { e } = terms(ctx, p)
  return round2(headroomBefore(ctx, e.customer_id) - dealCreditUse(ctx, p))
}

function bargingPerMt(ctx: ComputeCtx, deskId: string): number {
  const ds = deals12m(ctx, deskId)
  return sum(ds.map((d) => d.barging_cost_usd)) / sum(ds.map((d) => d.quantity_mt))
}
const ourCost = (ctx: ComputeCtx, e: EnquiryRow) => latestStock(ctx, e.desk_id, e.grade_id).avg_cost_usd_mt
function expectedMargin(ctx: ComputeCtx, p: TermsParams): number {
  const { e, quantity, price } = terms(ctx, p)
  return round2((price - ourCost(ctx, e)) * quantity - bargingPerMt(ctx, e.desk_id) * quantity)
}

// Barge availability: one delivery per barge per day, so a barge is free on a day with no slot.
function bookedDays(ctx: ComputeCtx, bargeId: string): Set<string> {
  return new Set(ctx.t.fct_barge_schedule.filter((s) => s.barge_id === bargeId).map((s) => isoDay(s.slot_start)))
}
const compatibleBarges = (ctx: ComputeCtx, e: EnquiryRow, qty: number) =>
  ctx.t.dim_barge.filter((b) => b.desk_id === e.desk_id && b.grades_supported.includes(e.grade_id) && b.capacity_mt >= qty)
const freeBargesOn = (ctx: ComputeCtx, e: EnquiryRow, day: string, qty: number) =>
  compatibleBarges(ctx, e, qty).filter((b) => !bookedDays(ctx, b.barge_id).has(day))
function windowDays(e: EnquiryRow): string[] {
  const days: string[] = []
  for (let d = e.window_start; d <= e.window_end; d = addDays(d, 1)) days.push(d)
  return days
}
const bargeAvailableInWindow = (ctx: ComputeCtx, e: EnquiryRow, qty = e.quantity_mt) => windowDays(e).some((d) => freeBargesOn(ctx, e, d, qty).length > 0)
const etaAfterWindowStart = (e: EnquiryRow) => isoDay(e.vessel_eta) > e.window_start

function complianceStatus(ctx: ComputeCtx, e: EnquiryRow) {
  const kyc = customerOf(ctx, e.customer_id).kyc_status
  const screening = vesselOf(ctx, e.vessel_id).screening_status
  return { kyc, screening, overall: kyc === 'FLAG' || screening === 'FLAG' ? ('FLAG' as const) : ('PASS' as const) }
}

function suggestedMove(ctx: ComputeCtx, e: EnquiryRow): SuggestedMove {
  // 1. Compliance
  if (complianceStatus(ctx, e).overall === 'FLAG') {
    return { move: 'BLOCKED', reason: 'compliance', premium: null, counterOptions: [], basedOn: ['compliance_check'] }
  }
  const premium = suggestedPremium(ctx, e)
  const price = benchmarkToday(ctx, e.grade_id) + premium

  // 2. Credit
  if (headroomAfter(ctx, { enquiryId: e.enquiry_id, premium }) < 0) {
    const maxQty = Math.max(0, floorTo(headroomBefore(ctx, e.customer_id) / price, QTY_STEP_MT))
    const counterOptions: CounterOption[] = []
    if (maxQty >= MIN_QTY_MT) counterOptions.push({ kind: 'quantity', quantityMt: maxQty })
    counterOptions.push({ kind: 'letter_of_credit', quantityMt: e.quantity_mt })
    counterOptions.push({
      kind: 'payment_terms',
      paymentDays: SHORT_TERMS_DAYS,
      note: "Frees credit sooner but doesn't fix the breach on delivery day; combine with a smaller quantity or a letter of credit.",
    })
    return {
      move: 'COUNTER',
      reason: 'credit',
      premium,
      counterOptions,
      basedOn: ['credit_headroom_after_deal', 'max_quantity_within_credit', 'suggested_premium'],
    }
  }

  // 3. Deliverability
  const stock = latestStock(ctx, e.desk_id, e.grade_id).stock_mt
  const hasBarge = bargeAvailableInWindow(ctx, e)
  if (stock < e.quantity_mt || !hasBarge) {
    const basedOn = ['barge_available_in_window', 'stock_for_grade', 'barge_timeline']
    if (stock >= e.quantity_mt) {
      for (let i = 1; i <= COUNTER_DATE_DAYS; i++) {
        const day = addDays(e.window_end, i)
        const free = freeBargesOn(ctx, e, day, e.quantity_mt)
        if (day >= isoDay(e.vessel_eta) && free.length) {
          return { move: 'COUNTER', reason: 'capacity', premium, counterOptions: [{ kind: 'delivery_date', deliveryDate: day, bargeName: free[0].barge_name }], basedOn }
        }
      }
    }
    // Smaller quantity: what stock allows and the largest barge free in the window can carry.
    const freeCap = Math.max(0, ...windowDays(e).flatMap((d) => freeBargesOn(ctx, e, d, MIN_QTY_MT).map((b) => b.capacity_mt)))
    const smaller = floorTo(Math.min(stock, freeCap, e.quantity_mt - QTY_STEP_MT), QTY_STEP_MT)
    if (smaller >= MIN_QTY_MT) {
      return { move: 'COUNTER', reason: stock < e.quantity_mt ? 'stock' : 'capacity', premium, counterOptions: [{ kind: 'quantity', quantityMt: smaller }], basedOn }
    }
    return { move: 'DECLINE', reason: stock < e.quantity_mt ? 'stock' : 'capacity', premium: null, counterOptions: [], basedOn }
  }

  // 4. Margin
  if (expectedMargin(ctx, { enquiryId: e.enquiry_id, premium }) / e.quantity_mt < MIN_MARGIN_USD_MT) {
    return { move: 'DECLINE', reason: 'margin', premium: null, counterOptions: [], basedOn: ['expected_margin_per_mt', 'suggested_premium'] }
  }

  // 5. Quote
  return { move: 'QUOTE', reason: 'clear', premium, counterOptions: [], basedOn: ['suggested_premium', 'expected_deal_margin', 'credit_headroom_after_deal'] }
}

export type Blocker = 'Compliance' | 'Credit' | 'No barge'

function queueRow(ctx: ComputeCtx, e: EnquiryRow) {
  const move = suggestedMove(ctx, e)
  const blockers: Blocker[] = []
  if (move.move === 'BLOCKED') blockers.push('Compliance')
  else {
    if (headroomAfter(ctx, { enquiryId: e.enquiry_id }) < 0) blockers.push('Credit')
    if (!bargeAvailableInWindow(ctx, e)) blockers.push('No barge')
  }
  return {
    enquiryId: e.enquiry_id,
    customerName: customerOf(ctx, e.customer_id).customer_name,
    vesselName: vesselOf(ctx, e.vessel_id).vessel_name,
    gradeName: gradeName(ctx, e.grade_id),
    quantityMt: e.quantity_mt,
    windowStart: e.window_start,
    windowEnd: e.window_end,
    minutesToDue: minutesToDue(ctx, e),
    expectedValue: expectedMargin(ctx, { enquiryId: e.enquiry_id }),
    move: move.move,
    blockers,
  }
}
const minutesToDue = (ctx: ComputeCtx, e: EnquiryRow) => Math.round((Date.parse(e.quote_due_at) - ctx.now.getTime()) / 60_000)

// ───────────────────────────── registry ─────────────────────────────

const TRADER_AND_COMPLIANCE: Role[] = ['trader', 'compliance']

export const METRICS = {
  // ── Queue / header ──
  time_to_quote_due: defineMetric({
    id: 'time_to_quote_due',
    name: 'Time to quote due',
    definition: 'How long the trader has left to answer the customer before the quote deadline.',
    formula: 'quote_due_at − now',
    owner: 'Desk',
    certified: true,
    certifiedOn: '2026-09-15',
    sourceTables: ['fct_enquiry'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'minutes',
    kind: 'metric',
    compute: (ctx, p: EnquiryParams) => minutesToDue(ctx, enquiryOf(ctx, p.enquiryId)),
  }),
  expected_deal_value: defineMetric({
    id: 'expected_deal_value',
    name: 'Expected deal value',
    definition: 'Expected margin on the full enquiry quantity if quoted at the suggested premium. Used to rank the queue.',
    formula: '(benchmark + suggested premium − our cost) × quantity − barging cost',
    owner: 'Desk head',
    certified: true,
    certifiedOn: '2026-09-15',
    sourceTables: ['fct_enquiry', 'fct_market_price', 'fct_stock', 'fct_deal'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'usd',
    kind: 'metric',
    compute: (ctx, p: EnquiryParams) => expectedMargin(ctx, { enquiryId: p.enquiryId }),
  }),
  open_enquiries: defineMetric({
    id: 'open_enquiries',
    name: 'Open enquiries queue',
    definition: "Today's open enquiries, ranked. Blocked enquiries go last; the rest by time to quote due, ties to the higher expected value.",
    formula: 'sort(blocked last, time_to_quote_due ↑, expected_deal_value ↓)',
    owner: 'Desk',
    certified: true,
    certifiedOn: '2026-09-15',
    sourceTables: ['fct_enquiry', 'dim_customer', 'dim_vessel', 'fct_barge_schedule'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'dataset',
    kind: 'dataset',
    compute: (ctx) =>
      ctx.t.fct_enquiry
        .filter((e) => e.status === 'open')
        .map((e) => queueRow(ctx, e))
        .sort(
          (a, b) =>
            Number(a.move === 'BLOCKED') - Number(b.move === 'BLOCKED') || a.minutesToDue - b.minutesToDue || b.expectedValue - a.expectedValue,
        ),
  }),
  enquiry_details: defineMetric({
    id: 'enquiry_details',
    name: 'Enquiry details',
    definition: 'The structured enquiry: customer, vessel, grade, quantity, port, delivery window and ETA.',
    formula: 'fct_enquiry ⨝ dim_customer ⨝ dim_vessel ⨝ dim_grade',
    owner: 'Desk',
    certified: true,
    certifiedOn: '2026-09-15',
    sourceTables: ['fct_enquiry', 'dim_customer', 'dim_vessel', 'dim_grade'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'dataset',
    kind: 'dataset',
    compute: (ctx, p: EnquiryParams) => {
      const e = enquiryOf(ctx, p.enquiryId)
      const c = customerOf(ctx, e.customer_id)
      const v = vesselOf(ctx, e.vessel_id)
      return {
        ...e,
        customerName: c.customer_name,
        parentGroup: c.parent_group,
        paymentTermsDays: c.payment_terms_days,
        vesselName: v.vessel_name,
        vesselType: v.vessel_type,
        gradeName: gradeName(ctx, e.grade_id),
      }
    },
  }),

  // ── Safe? ──
  kyc_status: defineMetric({
    id: 'kyc_status',
    name: 'Customer KYC',
    definition: "Group compliance's KYC result for the customer. The cockpit shows the result, never the decision logic.",
    formula: 'dim_customer.kyc_status',
    owner: 'Group compliance',
    certified: true,
    certifiedOn: '2026-08-01',
    sourceTables: ['dim_customer'],
    scope: 'group',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'status',
    kind: 'metric',
    compute: (ctx, p: EnquiryParams) => complianceStatus(ctx, enquiryOf(ctx, p.enquiryId)).kyc,
  }),
  vessel_screening_status: defineMetric({
    id: 'vessel_screening_status',
    name: 'Vessel sanctions screening',
    definition: "Group compliance's sanctions screening result for the vessel.",
    formula: 'dim_vessel.screening_status',
    owner: 'Group compliance',
    certified: true,
    certifiedOn: '2026-08-01',
    sourceTables: ['dim_vessel'],
    scope: 'group',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'status',
    kind: 'metric',
    compute: (ctx, p: EnquiryParams) => complianceStatus(ctx, enquiryOf(ctx, p.enquiryId)).screening,
  }),
  compliance_check: defineMetric({
    id: 'compliance_check',
    name: 'KYC & vessel screening',
    definition: 'FLAG if either the customer KYC or the vessel screening is flagged, otherwise PASS. A FLAG blocks the enquiry.',
    formula: 'FLAG if kyc_status = FLAG or screening_status = FLAG, else PASS',
    owner: 'Group compliance',
    certified: true,
    certifiedOn: '2026-08-01',
    sourceTables: ['dim_customer', 'dim_vessel'],
    scope: 'group',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'status',
    kind: 'metric',
    compute: (ctx, p: EnquiryParams) => complianceStatus(ctx, enquiryOf(ctx, p.enquiryId)).overall,
  }),
  kyc_detail: defineMetric({
    id: 'kyc_detail',
    name: 'KYC detail',
    definition: 'Due-diligence notes behind the KYC result.',
    formula: 'dim_customer.kyc_detail',
    owner: 'Group compliance',
    certified: true,
    certifiedOn: '2026-08-01',
    sourceTables: ['dim_customer'],
    scope: 'group',
    visibleTo: ['compliance'],
    unit: 'text',
    kind: 'metric',
    compute: (ctx, p: EnquiryParams) => customerOf(ctx, enquiryOf(ctx, p.enquiryId).customer_id).kyc_detail,
  }),
  vessel_screening_detail: defineMetric({
    id: 'vessel_screening_detail',
    name: 'Vessel screening detail',
    definition: 'Case notes behind the vessel screening result.',
    formula: 'dim_vessel.screening_detail',
    owner: 'Group compliance',
    certified: true,
    certifiedOn: '2026-08-01',
    sourceTables: ['dim_vessel'],
    scope: 'group',
    visibleTo: ['compliance'],
    unit: 'text',
    kind: 'metric',
    compute: (ctx, p: EnquiryParams) => vesselOf(ctx, enquiryOf(ctx, p.enquiryId).vessel_id).screening_detail,
  }),
  group_credit_limit: defineMetric({
    id: 'group_credit_limit',
    name: 'Group credit limit',
    definition: 'The credit limit for this counterparty across all Corvana business units.',
    formula: 'dim_customer.credit_limit_usd',
    owner: 'Credit',
    certified: true,
    certifiedOn: '2026-09-01',
    sourceTables: ['dim_customer'],
    scope: 'group',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'usd',
    kind: 'metric',
    compute: (ctx, p: EnquiryParams) => creditLimit(ctx, enquiryOf(ctx, p.enquiryId).customer_id),
  }),
  group_exposure: defineMetric({
    id: 'group_exposure',
    name: 'Group exposure',
    definition: 'Unpaid invoices plus contracted-not-delivered deals with this counterparty, summed across all business units.',
    formula: 'agg_customer_exposure.group_exposure_usd (latest as_of_date)',
    owner: 'Credit',
    certified: true,
    certifiedOn: '2026-09-01',
    sourceTables: ['agg_customer_exposure'],
    scope: 'group',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'usd',
    kind: 'metric',
    compute: (ctx, p: EnquiryParams) => groupExposure(ctx, enquiryOf(ctx, p.enquiryId).customer_id),
  }),
  exposure_own_bu: defineMetric({
    id: 'exposure_own_bu',
    name: 'Exposure, own BU',
    definition: "Unpaid invoices plus contracted-not-delivered deals with this counterparty in the user's business unit.",
    formula: 'Σ unpaid fct_invoice.amount_usd + Σ undelivered fct_deal (quantity_mt × price_usd_mt), own BU',
    owner: 'Credit',
    certified: true,
    certifiedOn: '2026-09-01',
    sourceTables: ['fct_invoice', 'fct_deal', 'fct_delivery'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'usd',
    kind: 'metric',
    compute: (ctx, p: EnquiryParams) => ownBuExposure(ctx, enquiryOf(ctx, p.enquiryId).customer_id),
  }),
  exposure_other_bus: defineMetric({
    id: 'exposure_other_bus',
    name: 'Exposure, other BUs',
    definition: "Group exposure minus the user's own-BU exposure. The total is visible; the deals behind it are not.",
    formula: 'group_exposure − exposure_own_bu',
    owner: 'Credit',
    certified: true,
    certifiedOn: '2026-09-01',
    sourceTables: ['agg_customer_exposure', 'fct_invoice', 'fct_deal'],
    scope: 'group',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'usd',
    kind: 'metric',
    detailRestricted: true,
    compute: (ctx, p: EnquiryParams) => {
      const c = enquiryOf(ctx, p.enquiryId).customer_id
      return round2(groupExposure(ctx, c) - ownBuExposure(ctx, c))
    },
  }),
  days_past_due: defineMetric({
    id: 'days_past_due',
    name: 'Average days past due',
    definition: 'How late this customer pays on average, over invoices due in the last 12 months. Early payment counts as 0.',
    formula: 'avg(max(0, (paid_date or today) − due_date)), invoices due in the last 12 months',
    owner: 'Credit',
    certified: true,
    certifiedOn: '2026-09-01',
    sourceTables: ['fct_invoice'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'days',
    kind: 'metric',
    compute: (ctx, p: EnquiryParams) => {
      const d = daysPastDue(ctx, enquiryOf(ctx, p.enquiryId).customer_id)
      return d === null ? null : round2(d)
    },
  }),
  credit_headroom_before_deal: defineMetric({
    id: 'credit_headroom_before_deal',
    name: 'Credit headroom before this deal',
    definition: 'How much group credit is left for this counterparty today.',
    formula: 'group credit limit − group exposure',
    owner: 'Credit',
    certified: true,
    certifiedOn: '2026-09-01',
    sourceTables: ['dim_customer', 'agg_customer_exposure'],
    scope: 'group',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'usd',
    kind: 'metric',
    compute: (ctx, p: EnquiryParams) => headroomBefore(ctx, enquiryOf(ctx, p.enquiryId).customer_id),
  }),
  deal_credit_use: defineMetric({
    id: 'deal_credit_use',
    name: 'Credit used by this deal',
    definition:
      'What the customer will owe for this deal from delivery until they pay (payment terms, typically 30 days): the whole invoice, quantity × quoted price, not just the premium. Under a letter of credit the bank carries it, so it uses no customer credit.',
    formula: 'quantity × (benchmark + premium); 0 under a letter of credit',
    owner: 'Credit',
    certified: true,
    certifiedOn: '2026-09-01',
    sourceTables: ['fct_market_price'],
    scope: 'group',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'usd',
    kind: 'metric',
    compute: (ctx, p: TermsParams) => dealCreditUse(ctx, p),
  }),
  credit_headroom_after_deal: defineMetric({
    id: 'credit_headroom_after_deal',
    name: 'Credit headroom after this deal',
    definition:
      'Group credit left once this deal is delivered and invoiced, before the customer pays. Negative means the deal breaches the limit. A deal secured by a letter of credit uses no customer credit.',
    formula: 'group credit limit − group exposure − credit used by this deal (quantity × quoted price)',
    owner: 'Credit',
    certified: true,
    certifiedOn: '2026-09-01',
    sourceTables: ['dim_customer', 'agg_customer_exposure', 'fct_market_price'],
    scope: 'group',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'usd',
    kind: 'metric',
    compute: (ctx, p: TermsParams) => headroomAfter(ctx, p),
  }),
  max_quantity_within_credit: defineMetric({
    id: 'max_quantity_within_credit',
    name: 'Maximum quantity within credit',
    definition: 'The largest quantity that fits in the remaining group credit at this price, rounded down to 50 mt.',
    formula: 'floor((credit headroom before deal) ÷ (benchmark + premium), 50 mt)',
    owner: 'Credit',
    certified: true,
    certifiedOn: '2026-09-01',
    sourceTables: ['dim_customer', 'agg_customer_exposure', 'fct_market_price'],
    scope: 'group',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'mt',
    kind: 'metric',
    compute: (ctx, p: TermsParams) => {
      const { e, price } = terms(ctx, p)
      return Math.max(0, floorTo(headroomBefore(ctx, e.customer_id) / price, QTY_STEP_MT))
    },
  }),

  // ── Deliverable? ──
  barge_timeline: defineMetric({
    id: 'barge_timeline',
    name: 'Barge timeline',
    definition:
      'Barges that support the grade and can carry the quantity, with their booked slots from 3 days before to 3 days after the delivery window. Flags a vessel ETA after the window start.',
    formula: 'dim_barge (grade ∈ grades_supported, capacity_mt ≥ quantity) ⨝ fct_barge_schedule, window ± 3 days',
    owner: 'Scheduler',
    certified: true,
    certifiedOn: '2026-09-10',
    sourceTables: ['dim_barge', 'fct_barge_schedule', 'fct_enquiry'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'dataset',
    kind: 'dataset',
    compute: (ctx, p: EnquiryParams) => {
      const e = enquiryOf(ctx, p.enquiryId)
      const from = addDays(e.window_start, -3)
      const to = addDays(e.window_end, 3)
      const days: string[] = []
      for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
      return {
        from,
        to,
        days,
        windowStart: e.window_start,
        windowEnd: e.window_end,
        vesselEta: e.vessel_eta,
        etaAfterWindowStart: etaAfterWindowStart(e),
        barges: compatibleBarges(ctx, e, e.quantity_mt).map((b) => {
          const booked = bookedDays(ctx, b.barge_id)
          return {
            bargeId: b.barge_id,
            bargeName: b.barge_name,
            capacityMt: b.capacity_mt,
            slots: ctx.t.fct_barge_schedule
              .filter((s) => s.barge_id === b.barge_id && isoDay(s.slot_start) >= from && isoDay(s.slot_start) <= to)
              .map((s) => ({ slotId: s.slot_id, start: s.slot_start, end: s.slot_end, dealId: s.deal_id })),
            freeDays: days.filter((d) => !booked.has(d)),
          }
        }),
      }
    },
  }),
  barge_available_in_window: defineMetric({
    id: 'barge_available_in_window',
    name: 'Barge available in window',
    definition: 'True if at least one compatible barge has a free day inside the delivery window.',
    formula: '∃ day ∈ window, barge (grade, capacity ≥ quantity) with no booked slot that day',
    owner: 'Scheduler',
    certified: true,
    certifiedOn: '2026-09-10',
    sourceTables: ['dim_barge', 'fct_barge_schedule'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'flag',
    kind: 'metric',
    compute: (ctx, p: EnquiryParams) => bargeAvailableInWindow(ctx, enquiryOf(ctx, p.enquiryId)),
  }),
  vessel_eta_after_window: defineMetric({
    id: 'vessel_eta_after_window',
    name: 'Vessel ETA after window start',
    definition: 'True if the vessel is expected to arrive after the first day of the delivery window.',
    formula: 'date(vessel_eta) > window_start',
    owner: 'Scheduler',
    certified: true,
    certifiedOn: '2026-09-10',
    sourceTables: ['fct_enquiry'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'flag',
    kind: 'metric',
    compute: (ctx, p: EnquiryParams) => etaAfterWindowStart(enquiryOf(ctx, p.enquiryId)),
  }),
  stock_for_grade: defineMetric({
    id: 'stock_for_grade',
    name: 'Stock for grade',
    definition: "The desk's latest stock of the enquiry's grade.",
    formula: 'fct_stock.stock_mt (latest date, desk, grade)',
    owner: 'Scheduler',
    certified: true,
    certifiedOn: '2026-09-10',
    sourceTables: ['fct_stock'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'mt',
    kind: 'metric',
    compute: (ctx, p: EnquiryParams) => {
      const e = enquiryOf(ctx, p.enquiryId)
      return latestStock(ctx, e.desk_id, e.grade_id).stock_mt
    },
  }),

  // ── Price? ──
  benchmark_price: defineMetric({
    id: 'benchmark_price',
    name: 'Benchmark price',
    definition: "Today's licensed benchmark price for the grade.",
    formula: 'fct_market_price.benchmark_usd_mt (today, grade)',
    owner: 'Group market data',
    certified: true,
    certifiedOn: '2026-07-01',
    sourceTables: ['fct_market_price'],
    scope: 'group',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'usd_mt',
    kind: 'metric',
    compute: (ctx, p: EnquiryParams) => benchmarkToday(ctx, enquiryOf(ctx, p.enquiryId).grade_id),
  }),
  benchmark_delta: defineMetric({
    id: 'benchmark_delta',
    name: 'Benchmark change vs yesterday',
    definition: "Today's benchmark minus yesterday's, for the grade.",
    formula: 'benchmark(today) − benchmark(yesterday)',
    owner: 'Group market data',
    certified: true,
    certifiedOn: '2026-07-01',
    sourceTables: ['fct_market_price'],
    scope: 'group',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'usd_mt',
    kind: 'metric',
    compute: (ctx, p: EnquiryParams) => {
      const g = enquiryOf(ctx, p.enquiryId).grade_id
      return round2(benchmarkToday(ctx, g) - benchmarkOn(ctx, g, addDays(ctx.today, -1)))
    },
  }),
  benchmark_trend_30d: defineMetric({
    id: 'benchmark_trend_30d',
    name: 'Benchmark trend, 30 days',
    definition: 'Daily benchmark price for the grade over the last 30 days.',
    formula: 'fct_market_price (grade, today − 30 … today)',
    owner: 'Group market data',
    certified: true,
    certifiedOn: '2026-07-01',
    sourceTables: ['fct_market_price'],
    scope: 'group',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'dataset',
    kind: 'dataset',
    compute: (ctx, p: EnquiryParams) => {
      const g = enquiryOf(ctx, p.enquiryId).grade_id
      const from = addDays(ctx.today, -30)
      return ctx.t.fct_market_price
        .filter((r) => r.grade_id === g && r.date >= from && r.date <= ctx.today)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((r) => ({ date: r.date, benchmarkUsdMt: r.benchmark_usd_mt }))
    },
  }),
  our_cost: defineMetric({
    id: 'our_cost',
    name: 'Our cost',
    definition: 'Weighted average cost of the desk’s stock of this grade.',
    formula: 'fct_stock.avg_cost_usd_mt (latest date, desk, grade)',
    owner: 'Desk head',
    certified: true,
    certifiedOn: '2026-09-15',
    sourceTables: ['fct_stock'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'usd_mt',
    kind: 'metric',
    compute: (ctx, p: EnquiryParams) => ourCost(ctx, enquiryOf(ctx, p.enquiryId)),
  }),
  customer_avg_premium: defineMetric({
    id: 'customer_avg_premium',
    name: 'Customer average premium',
    definition: 'Average premium over benchmark on this customer’s deals with the desk in the last 12 months.',
    formula: 'avg(fct_deal.premium_usd_mt), customer, last 12 months',
    owner: 'Desk head',
    certified: true,
    certifiedOn: '2026-09-15',
    sourceTables: ['fct_deal'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'usd_mt',
    kind: 'metric',
    compute: (ctx, p: EnquiryParams) => premiumBreakdown(ctx, enquiryOf(ctx, p.enquiryId)).customerAvg,
  }),
  customer_deal_count: defineMetric({
    id: 'customer_deal_count',
    name: 'Customer deals, 12 months',
    definition: 'Number of deals with this customer in the last 12 months. Under 5, the desk average premium is used instead.',
    formula: 'count(fct_deal), customer, last 12 months',
    owner: 'Desk head',
    certified: true,
    certifiedOn: '2026-09-15',
    sourceTables: ['fct_deal'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'count',
    kind: 'metric',
    compute: (ctx, p: EnquiryParams) => premiumBreakdown(ctx, enquiryOf(ctx, p.enquiryId)).customerDeals,
  }),
  desk_avg_premium: defineMetric({
    id: 'desk_avg_premium',
    name: 'Desk average premium',
    definition: 'Average premium over benchmark across all the desk’s deals in the last 12 months.',
    formula: 'avg(fct_deal.premium_usd_mt), desk, last 12 months',
    owner: 'Desk head',
    certified: true,
    certifiedOn: '2026-09-15',
    sourceTables: ['fct_deal'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'usd_mt',
    kind: 'metric',
    compute: (ctx, p: EnquiryParams) => premiumBreakdown(ctx, enquiryOf(ctx, p.enquiryId)).deskAvg,
  }),
  customer_claim_share: defineMetric({
    id: 'customer_claim_share',
    name: 'Customer claim share',
    definition: 'Share of delivered quantity this customer raised quantity claims on, last 12 months.',
    formula: 'Σ claim_qty_mt ÷ Σ delivered_qty_mt, customer, last 12 months',
    owner: 'Desk head',
    certified: true,
    certifiedOn: '2026-09-15',
    sourceTables: ['fct_delivery', 'fct_deal'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'ratio',
    kind: 'metric',
    compute: (ctx, p: EnquiryParams) => premiumBreakdown(ctx, enquiryOf(ctx, p.enquiryId)).customerClaimShare,
  }),
  desk_claim_share: defineMetric({
    id: 'desk_claim_share',
    name: 'Desk claim share',
    definition: 'Share of delivered quantity under quantity claims across the desk, last 12 months.',
    formula: 'Σ claim_qty_mt ÷ Σ delivered_qty_mt, desk, last 12 months',
    owner: 'Desk head',
    certified: true,
    certifiedOn: '2026-09-15',
    sourceTables: ['fct_delivery', 'fct_deal'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'ratio',
    kind: 'metric',
    compute: (ctx, p: EnquiryParams) => premiumBreakdown(ctx, enquiryOf(ctx, p.enquiryId)).deskClaimShare,
  }),
  win_range_similar: defineMetric({
    id: 'win_range_similar',
    name: 'Win range on similar deals',
    definition:
      'Premiums the desk quoted in the last 6 months on the same grade and a quantity within ±50%: the won range (25th–75th percentile), the lowest premium that still lost, and the sample size n.',
    formula: 'fct_enquiry (action = quote, same grade, quantity ±50%, last 6 months): p25/p75 of won premiums, min of lost premiums, n',
    owner: 'Desk head',
    certified: true,
    certifiedOn: '2026-09-15',
    sourceTables: ['fct_enquiry'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'dataset',
    kind: 'dataset',
    compute: (ctx, p: EnquiryParams) => {
      const e = enquiryOf(ctx, p.enquiryId)
      const from = addDays(ctx.today, -WIN_RANGE_DAYS)
      const similar = ctx.t.fct_enquiry.filter(
        (x) =>
          x.enquiry_id !== e.enquiry_id &&
          x.desk_id === e.desk_id &&
          x.grade_id === e.grade_id &&
          x.action === 'quote' &&
          x.outcome !== 'open' &&
          x.quoted_premium_usd_mt !== null &&
          isoDay(x.received_at) >= from &&
          x.quantity_mt >= e.quantity_mt * 0.5 &&
          x.quantity_mt <= e.quantity_mt * 1.5,
      )
      const won = similar.filter((x) => x.outcome === 'won').map((x) => x.quoted_premium_usd_mt!).sort((a, b) => a - b)
      const lost = similar.filter((x) => x.outcome === 'lost').map((x) => x.quoted_premium_usd_mt!)
      const q = (v: number | null) => (v === null ? null : round2(v))
      return {
        wonP25: q(quantile(won, 0.25)),
        wonP75: q(quantile(won, 0.75)),
        lowestLost: lost.length ? Math.min(...lost) : null,
        scope: { gradeName: gradeName(ctx, e.grade_id), qtyFrom: Math.round(e.quantity_mt * 0.5), qtyTo: Math.round(e.quantity_mt * 1.5), months: 6, customers: 'all desk customers' as const },
        n: similar.length,
        nWon: won.length,
        nLost: lost.length,
      }
    },
  }),
  suggested_premium: defineMetric({
    id: 'suggested_premium',
    name: 'Suggested premium',
    definition:
      "Start from the customer's 12-month average premium (desk average if fewer than 5 deals); add $2 if their claim share is over 2× the desk's; add $1 if they pay more than 3 days late on average; round to $0.50.",
    formula: 'base premium + $2 if claim share > 2× desk + $1 if days past due > 3, then rounded to the nearest $0.50',
    owner: 'Desk head',
    certified: true,
    certifiedOn: '2026-09-15',
    sourceTables: ['fct_deal', 'fct_delivery', 'fct_invoice'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'usd_mt',
    kind: 'metric',
    compute: (ctx, p: EnquiryParams) => suggestedPremium(ctx, enquiryOf(ctx, p.enquiryId)),
  }),
  suggested_premium_breakdown: defineMetric({
    id: 'suggested_premium_breakdown',
    name: 'Suggested premium breakdown',
    definition: 'Each step of the suggested premium rule with the inputs it used.',
    formula: 'base (customer or desk average) + claim adjustment + days-past-due adjustment',
    owner: 'Desk head',
    certified: true,
    certifiedOn: '2026-09-15',
    sourceTables: ['fct_deal', 'fct_delivery', 'fct_invoice'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'dataset',
    kind: 'dataset',
    compute: (ctx, p: EnquiryParams) => premiumBreakdown(ctx, enquiryOf(ctx, p.enquiryId)),
  }),
  quoted_price: defineMetric({
    id: 'quoted_price',
    name: 'Quoted price',
    definition: 'The all-in price per tonne the customer would pay at this premium.',
    formula: 'benchmark + premium',
    owner: 'Desk head',
    certified: true,
    certifiedOn: '2026-09-15',
    sourceTables: ['fct_market_price'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'usd_mt',
    kind: 'metric',
    compute: (ctx, p: TermsParams) => terms(ctx, p).price,
  }),
  barging_cost_per_mt: defineMetric({
    id: 'barging_cost_per_mt',
    name: 'Barging cost per tonne',
    definition: 'Estimated cost of delivering by barge: the desk’s average barging cost per tonne over its deals in the last 12 months.',
    formula: 'Σ fct_deal.barging_cost_usd ÷ Σ fct_deal.quantity_mt, desk, last 12 months',
    owner: 'Desk head',
    certified: true,
    certifiedOn: '2026-09-15',
    sourceTables: ['fct_deal'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'usd_mt',
    kind: 'metric',
    compute: (ctx, p: EnquiryParams) => round2(bargingPerMt(ctx, enquiryOf(ctx, p.enquiryId).desk_id)),
  }),
  expected_deal_margin: defineMetric({
    id: 'expected_deal_margin',
    name: 'Expected deal margin',
    definition: 'Margin on this deal at these terms: quoted price minus our stock cost minus barging, per tonne, times the quantity.',
    formula: '(quoted price − our cost − barging cost per tonne) × quantity',
    owner: 'Desk head',
    certified: true,
    certifiedOn: '2026-09-15',
    sourceTables: ['fct_market_price', 'fct_stock', 'fct_deal'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'usd',
    kind: 'metric',
    compute: (ctx, p: TermsParams) => expectedMargin(ctx, p),
  }),
  expected_margin_per_mt: defineMetric({
    id: 'expected_margin_per_mt',
    name: 'Expected margin per tonne',
    definition: 'Quoted price minus our cost minus barging, per tonne. Below $3/mt the suggested move is DECLINE.',
    formula: 'quoted price − our cost − barging cost per tonne',
    owner: 'Desk head',
    certified: true,
    certifiedOn: '2026-09-15',
    sourceTables: ['fct_market_price', 'fct_stock', 'fct_deal'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'usd_mt',
    kind: 'metric',
    compute: (ctx, p: TermsParams) => round2(expectedMargin(ctx, p) / terms(ctx, p).quantity),
  }),
  margin_vs_floor: defineMetric({
    id: 'margin_vs_floor',
    name: 'Margin vs desk floor',
    definition:
      'Where the expected margin per tonne at these terms sits against the desk’s $3/mt minimum: below the floor (the suggested move is Decline), near it (within $3 above), or above it.',
    formula: 'margin per tonne < $3 → below · $3 to < $6 → near · ≥ $6 → above',
    owner: 'Desk head',
    certified: true,
    certifiedOn: '2026-09-15',
    sourceTables: ['fct_market_price', 'fct_stock', 'fct_deal'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'status',
    kind: 'metric',
    compute: (ctx, p: TermsParams): 'below' | 'near' | 'above' => {
      const m = expectedMargin(ctx, p) / terms(ctx, p).quantity
      return m < MIN_MARGIN_USD_MT ? 'below' : m < MIN_MARGIN_USD_MT + MARGIN_WATCH_BAND ? 'near' : 'above'
    },
  }),
  suggested_move: defineMetric({
    id: 'suggested_move',
    name: 'Suggested move',
    definition:
      'First matching rule: compliance FLAG → BLOCKED; headroom after deal < 0 → COUNTER (max quantity, letter of credit or shorter terms); no barge or not enough stock → COUNTER (later date or smaller quantity) or DECLINE; margin < $3/mt → DECLINE; otherwise QUOTE at the suggested premium.',
    formula: 'compliance → credit → deliverability → margin → quote',
    owner: 'Desk head',
    certified: true,
    certifiedOn: '2026-09-15',
    sourceTables: ['dim_customer', 'dim_vessel', 'agg_customer_exposure', 'fct_barge_schedule', 'fct_stock', 'fct_deal'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'dataset',
    kind: 'dataset',
    compute: (ctx, p: EnquiryParams) => suggestedMove(ctx, enquiryOf(ctx, p.enquiryId)),
  }),

  // ── Ask about this enquiry (governed datasets the AI answers from) ──
  customer_premium_trend: defineMetric({
    id: 'customer_premium_trend',
    name: 'Customer premium trend',
    definition: "Monthly average premium on this customer's deals over the last 12 months, with the desk average for reference.",
    formula: 'avg(fct_deal.premium_usd_mt) by delivery month, customer vs desk, last 12 months',
    owner: 'Desk head',
    certified: true,
    certifiedOn: '2026-09-15',
    sourceTables: ['fct_deal'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'dataset',
    kind: 'dataset',
    compute: (ctx, p: EnquiryParams) => {
      const e = enquiryOf(ctx, p.enquiryId)
      const desk = deals12m(ctx, e.desk_id)
      const months = [...new Set(desk.map((d) => d.delivery_date.slice(0, 7)))].sort()
      return months
        .map((month) => {
          const inMonth = desk.filter((d) => d.delivery_date.startsWith(month))
          const cust = inMonth.filter((d) => d.customer_id === e.customer_id)
          const c = avgPremium(cust)
          return { month, customerAvgPremium: c === null ? null : round2(c), customerDeals: cust.length, deskAvgPremium: round2(avgPremium(inMonth)!) }
        })
        .filter((r) => r.customerDeals > 0)
    },
  }),
  customer_recent_deals: defineMetric({
    id: 'customer_recent_deals',
    name: 'Recent deals with customer',
    definition: "The customer's five most recent deals with the desk, by delivery date.",
    formula: 'fct_deal (customer, desk) order by delivery_date desc limit 5',
    owner: 'Desk head',
    certified: true,
    certifiedOn: '2026-09-15',
    sourceTables: ['fct_deal', 'fct_delivery', 'dim_grade'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'dataset',
    kind: 'dataset',
    compute: (ctx, p: EnquiryParams) => {
      const e = enquiryOf(ctx, p.enquiryId)
      const delivered = new Set(ctx.t.fct_delivery.map((x) => x.deal_id))
      return ctx.t.fct_deal
        .filter((d) => d.desk_id === e.desk_id && d.customer_id === e.customer_id)
        .sort((a, b) => b.delivery_date.localeCompare(a.delivery_date))
        .slice(0, 5)
        .map((d) => ({
          dealId: d.deal_id,
          deliveryDate: d.delivery_date,
          gradeName: gradeName(ctx, d.grade_id),
          quantityMt: d.quantity_mt,
          premiumUsdMt: d.premium_usd_mt,
          priceUsdMt: d.price_usd_mt,
          status: delivered.has(d.deal_id) ? ('delivered' as const) : ('contracted' as const),
        }))
    },
  }),
  customer_claim_history: defineMetric({
    id: 'customer_claim_history',
    name: 'Customer claim history',
    definition: "Quantity claims this customer raised on the desk's deliveries in the last 12 months.",
    formula: 'fct_delivery (claim_flag, customer, last 12 months)',
    owner: 'Desk head',
    certified: true,
    certifiedOn: '2026-09-15',
    sourceTables: ['fct_delivery', 'fct_deal'],
    scope: 'bu',
    visibleTo: TRADER_AND_COMPLIANCE,
    unit: 'dataset',
    kind: 'dataset',
    compute: (ctx, p: EnquiryParams) => {
      const e = enquiryOf(ctx, p.enquiryId)
      const deliveries = deliveriesOf(ctx, deals12m(ctx, e.desk_id, e.customer_id))
      const claims = deliveries
        .filter((x) => x.claim_flag)
        .sort((a, b) => b.delivered_at.localeCompare(a.delivered_at))
        .map((x) => ({ deliveryId: x.delivery_id, deliveredOn: isoDay(x.delivered_at), deliveredQtyMt: x.delivered_qty_mt, claimQtyMt: x.claim_qty_mt, claimAmountUsd: x.claim_amount_usd }))
      return { deliveries: deliveries.length, claims }
    },
  }),
}

export type MetricId = keyof typeof METRICS
export type ParamsOf<K extends MetricId> = Parameters<(typeof METRICS)[K]['compute']>[1]
export type ValueOf<K extends MetricId> = ReturnType<(typeof METRICS)[K]['compute']>

/** Metadata only (no compute): for metric cards and the governance drawer. */
export type MetricMeta = Omit<MetricDef<BaseParams, unknown>, 'compute'>
export const METRIC_CATALOG: MetricMeta[] = Object.values(METRICS).map(({ compute: _compute, ...meta }) => meta)
