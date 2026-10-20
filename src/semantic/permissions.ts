// User context + row-level and object-level rules (BUILD_INSTRUCTIONS §4.2).
// This is the only module that touches the raw warehouse.
import type { EnquiryRow, TableName, Tables } from './schema'
import { WAREHOUSE, getDataVersion, updateEnquiry } from './warehouse'

export type Role = 'trader' | 'compliance'

export interface UserContext {
  user: string
  role: Role
  businessUnit: string
}

export const TRADER: UserContext = { user: 'Trader', role: 'trader', businessUnit: 'BU_ASIA_BUNKERING' }
// For the optional role switcher (stretch); object-level rules already handle it.
export const COMPLIANCE_OFFICER: UserContext = { user: 'Compliance officer', role: 'compliance', businessUnit: 'BU_ASIA_BUNKERING' }

export const GROUP_TABLES: TableName[] = [
  'dim_business_unit',
  'dim_desk',
  'dim_customer',
  'dim_vessel',
  'dim_grade',
  'fct_market_price',
  'agg_customer_exposure',
]
export const BU_TABLES: TableName[] = [
  'dim_barge',
  'fct_enquiry',
  'fct_deal',
  'fct_delivery',
  'fct_invoice',
  'fct_barge_schedule',
  'fct_stock',
]

export function businessUnitName(businessUnitId: string): string {
  return WAREHOUSE.dim_business_unit.find((b) => b.business_unit_id === businessUnitId)?.business_unit_name ?? businessUnitId
}

/** "Trader · Asia Bunkering" */
export const userLabel = (ctx: UserContext) => `${ctx.user} · ${businessUnitName(ctx.businessUnit)}`

/** One wording for every row-level refusal: the headroom breakdown and the AI use the same sentence. */
export function restrictedMessage(ownerBusinessUnitIds: string[], ctx: UserContext): string {
  const owners = ownerBusinessUnitIds.map(businessUnitName).join(' and ')
  return `That data belongs to ${owners} and isn't available to ${userLabel(ctx)}.`
}

/** Org structure is group-shared: every user may know which business units exist. */
export const listBusinessUnits = () => WAREHOUSE.dim_business_unit.map((b) => ({ id: b.business_unit_id, name: b.business_unit_name }))

export const otherBusinessUnits = (ctx: UserContext) =>
  WAREHOUSE.dim_business_unit.map((b) => b.business_unit_id).filter((id) => id !== ctx.businessUnit)

/** Which BU owns an enquiry. Used only to word a refusal; it reveals no row data. */
export function ownerOfEnquiry(enquiryId: string): string | undefined {
  const e = WAREHOUSE.fct_enquiry.find((x) => x.enquiry_id === enquiryId)
  return e && WAREHOUSE.dim_desk.find((d) => d.desk_id === e.desk_id)?.business_unit_id
}

const cache = new Map<string, Tables>()

/**
 * The user's view of the warehouse:
 *  - row-level: every BU-owned table filtered to the user's BU (via desk → BU) before any metric computes;
 *  - object-level: only compliance sees KYC and screening detail; others see PASS / FLAG.
 */
export function scopedTables(ctx: UserContext): Tables {
  const cacheKey = `${ctx.role}|${ctx.businessUnit}|${getDataVersion()}`
  const hit = cache.get(cacheKey)
  if (hit) return hit

  const w = WAREHOUSE
  const desks = new Set(w.dim_desk.filter((d) => d.business_unit_id === ctx.businessUnit).map((d) => d.desk_id))
  const deals = w.fct_deal.filter((d) => desks.has(d.desk_id))
  const dealIds = new Set(deals.map((d) => d.deal_id))
  const barges = w.dim_barge.filter((b) => desks.has(b.desk_id))
  const bargeIds = new Set(barges.map((b) => b.barge_id))
  const seesDetail = ctx.role === 'compliance'

  const view: Tables = {
    dim_business_unit: w.dim_business_unit,
    dim_desk: w.dim_desk,
    dim_customer: seesDetail ? w.dim_customer : w.dim_customer.map((c) => ({ ...c, kyc_detail: null })),
    dim_vessel: seesDetail ? w.dim_vessel : w.dim_vessel.map((v) => ({ ...v, screening_detail: null })),
    dim_grade: w.dim_grade,
    fct_market_price: w.fct_market_price,
    agg_customer_exposure: w.agg_customer_exposure, // group aggregate, no BU column: total only
    dim_barge: barges,
    fct_enquiry: w.fct_enquiry.filter((e) => desks.has(e.desk_id)),
    fct_deal: deals,
    fct_delivery: w.fct_delivery.filter((d) => dealIds.has(d.deal_id)),
    fct_invoice: w.fct_invoice.filter((i) => desks.has(i.desk_id)),
    fct_barge_schedule: w.fct_barge_schedule.filter((s) => bargeIds.has(s.barge_id)),
    fct_stock: w.fct_stock.filter((s) => desks.has(s.desk_id)),
  }
  cache.set(cacheKey, view)
  return view
}

/** The trader's response to an enquiry. Same row-level rule as reads: only enquiries in the user's BU. */
export function writeEnquiryResponse(ctx: UserContext, enquiryId: string, patch: Pick<EnquiryRow, 'status' | 'action' | 'quoted_premium_usd_mt' | 'decline_reason'>) {
  if (!scopedTables(ctx).fct_enquiry.some((e) => e.enquiry_id === enquiryId)) {
    const owner = ownerOfEnquiry(enquiryId)
    throw new Error(owner ? restrictedMessage([owner], ctx) : `Enquiry ${enquiryId} not found.`)
  }
  cache.clear()
  updateEnquiry(enquiryId, patch)
}

const TABLE_LABELS: Record<TableName, string> = {
  dim_business_unit: 'Business units',
  dim_desk: 'Desks',
  dim_customer: 'Customers (incl. group credit limit, KYC)',
  dim_vessel: 'Vessels (incl. sanctions screening)',
  dim_grade: 'Fuel grades',
  fct_market_price: 'Benchmark prices',
  agg_customer_exposure: 'Group exposure (total per customer)',
  dim_barge: 'Barges',
  fct_enquiry: 'Enquiries and quotes',
  fct_deal: 'Deals',
  fct_delivery: 'Deliveries and claims',
  fct_invoice: 'Invoices',
  fct_barge_schedule: 'Barge schedule',
  fct_stock: 'Stock and cost',
}

/**
 * The rules above in plain language, for the "Who sees what" view.
 * Built from the same table lists and role checks that scopedTables() enforces.
 */
export function describeAccess(ctx: UserContext) {
  const bu = businessUnitName(ctx.businessUnit)
  const others = otherBusinessUnits(ctx).map(businessUnitName).join(', ')
  const seesDetail = ctx.role === 'compliance'
  return {
    viewer: userLabel(ctx),
    tables: [
      ...GROUP_TABLES.map((t) => ({ table: t, label: TABLE_LABELS[t], owner: 'Group' as const, rule: t === 'agg_customer_exposure' ? 'Total only, no BU breakdown' : 'Shared with all BUs' })),
      ...BU_TABLES.map((t) => ({ table: t, label: TABLE_LABELS[t], owner: 'BU' as const, rule: `${bu} rows only` })),
    ],
    rowLevel: [
      `Business-unit data (enquiries, deals, deliveries, invoices, barges, schedules, stock) is filtered to ${bu} before any metric is computed. ${others} rows never reach this view, the cockpit or the AI.`,
      'Group data (customers, vessels, grades, benchmark prices, org structure) is shared across all business units: one counterparty master, one price feed.',
      `Group exposure is a pre-aggregated total with no BU column. You see the total and your own BU's share; the deals behind other BUs' exposure are "detail restricted".`,
    ],
    objectLevel: [
      seesDetail
        ? 'As Compliance you see KYC and sanctions-screening case detail as well as the PASS / FLAG result.'
        : 'Traders see KYC and vessel sanctions screening as PASS / FLAG only. Case detail is visible to Compliance.',
      'Every metric lists the roles that may see it. A metric outside your role returns "restricted" instead of a value, for the screen and the AI alike.',
    ],
  }
}
