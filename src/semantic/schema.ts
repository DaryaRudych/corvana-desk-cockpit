// Row types for the gold-layer tables in src/data (see the Data Model doc).

export type GradeId = 'GRD_VLSFO' | 'GRD_HSFO' | 'GRD_MGO'
export type ComplianceStatus = 'PASS' | 'FLAG'
export type EnquiryStatus = 'open' | 'quoted' | 'countered' | 'declined'
export type EnquiryAction = 'quote' | 'counter' | 'decline'
export type EnquiryOutcome = 'won' | 'lost' | 'open'

export interface BusinessUnitRow {
  business_unit_id: string
  business_unit_name: string
}
export interface DeskRow {
  desk_id: string
  desk_name: string
  region: string
  business_unit_id: string
}
export interface CustomerRow {
  customer_id: string
  customer_name: string
  parent_group: string
  credit_limit_usd: number
  payment_terms_days: number
  kyc_status: ComplianceStatus
  kyc_detail: string | null // null when hidden by object-level permissions
}
export interface VesselRow {
  vessel_id: string
  vessel_name: string
  vessel_type: string
  owner_customer_id: string
  screening_status: ComplianceStatus
  screening_detail: string | null // null when hidden by object-level permissions
}
export interface GradeRow {
  grade_id: GradeId
  grade_name: string
}
export interface MarketPriceRow {
  date: string
  grade_id: GradeId
  benchmark_usd_mt: number
}
export interface CustomerExposureRow {
  customer_id: string
  as_of_date: string
  group_exposure_usd: number
}
export interface BargeRow {
  barge_id: string
  desk_id: string
  barge_name: string
  capacity_mt: number
  grades_supported: GradeId[]
}
export interface EnquiryRow {
  enquiry_id: string
  desk_id: string
  customer_id: string
  vessel_id: string
  grade_id: GradeId
  port: string
  quantity_mt: number
  window_start: string
  window_end: string
  vessel_eta: string
  received_at: string
  quote_due_at: string
  status: EnquiryStatus
  action: EnquiryAction | null
  quoted_premium_usd_mt: number | null
  outcome: EnquiryOutcome
  decline_reason: string | null
}
export interface DealRow {
  deal_id: string
  enquiry_id: string
  desk_id: string
  customer_id: string
  grade_id: GradeId
  quantity_mt: number
  price_usd_mt: number
  premium_usd_mt: number
  cost_usd_mt: number
  barging_cost_usd: number
  delivery_date: string
}
export interface DeliveryRow {
  delivery_id: string
  deal_id: string
  barge_id: string
  delivered_qty_mt: number
  delivered_at: string
  claim_flag: boolean
  claim_qty_mt: number
  claim_amount_usd: number
}
export interface InvoiceRow {
  invoice_id: string
  deal_id: string
  desk_id: string
  customer_id: string
  amount_usd: number
  due_date: string
  paid_date: string | null
}
export interface BargeSlotRow {
  slot_id: string
  barge_id: string
  slot_start: string
  slot_end: string
  deal_id: string
}
export interface StockRow {
  date: string
  desk_id: string
  grade_id: GradeId
  stock_mt: number
  avg_cost_usd_mt: number
}

export interface Tables {
  // Group-shared
  dim_business_unit: BusinessUnitRow[]
  dim_desk: DeskRow[]
  dim_customer: CustomerRow[]
  dim_vessel: VesselRow[]
  dim_grade: GradeRow[]
  fct_market_price: MarketPriceRow[]
  agg_customer_exposure: CustomerExposureRow[]
  // BU-owned
  dim_barge: BargeRow[]
  fct_enquiry: EnquiryRow[]
  fct_deal: DealRow[]
  fct_delivery: DeliveryRow[]
  fct_invoice: InvoiceRow[]
  fct_barge_schedule: BargeSlotRow[]
  fct_stock: StockRow[]
}
export type TableName = keyof Tables

export interface SnapshotMeta {
  seed: number
  /** Frozen demo clock, desk-local ISO timestamp. */
  now: string
  timezone: string
  scenarios: Record<'S1' | 'S2' | 'S3' | 'S4', string>
}
