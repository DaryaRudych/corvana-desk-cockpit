// Raw, unfiltered tables. Only permissions.ts may import this module:
// everything else reads data through query(), which applies permissions first.
import dimBusinessUnit from '../data/dim_business_unit.json'
import dimDesk from '../data/dim_desk.json'
import dimCustomer from '../data/dim_customer.json'
import dimVessel from '../data/dim_vessel.json'
import dimGrade from '../data/dim_grade.json'
import fctMarketPrice from '../data/fct_market_price.json'
import aggCustomerExposure from '../data/agg_customer_exposure.json'
import dimBarge from '../data/dim_barge.json'
import fctEnquiry from '../data/fct_enquiry.json'
import fctDeal from '../data/fct_deal.json'
import fctDelivery from '../data/fct_delivery.json'
import fctInvoice from '../data/fct_invoice.json'
import fctBargeSchedule from '../data/fct_barge_schedule.json'
import fctStock from '../data/fct_stock.json'
import meta from '../data/meta.json'
import type { EnquiryRow, SnapshotMeta, Tables } from './schema'

const rows = <T>(json: unknown) => json as T[]

export const WAREHOUSE: Readonly<Tables> = {
  dim_business_unit: rows(dimBusinessUnit),
  dim_desk: rows(dimDesk),
  dim_customer: rows(dimCustomer),
  dim_vessel: rows(dimVessel),
  dim_grade: rows(dimGrade),
  fct_market_price: rows(fctMarketPrice),
  agg_customer_exposure: rows(aggCustomerExposure),
  dim_barge: rows(dimBarge),
  fct_enquiry: rows(fctEnquiry),
  fct_deal: rows(fctDeal),
  fct_delivery: rows(fctDelivery),
  fct_invoice: rows(fctInvoice),
  fct_barge_schedule: rows(fctBargeSchedule),
  fct_stock: rows(fctStock),
}

export const SNAPSHOT = meta as SnapshotMeta

// ── Session writes (no backend: lives until reload). Only permissions.ts calls updateEnquiry. ──
let version = 0
const listeners = new Set<() => void>()
export const getDataVersion = () => version
export function subscribeToData(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export function updateEnquiry(enquiryId: string, patch: Partial<EnquiryRow>): void {
  const rows = WAREHOUSE.fct_enquiry
  const i = rows.findIndex((e) => e.enquiry_id === enquiryId)
  rows[i] = { ...rows[i], ...patch }
  version++
  listeners.forEach((l) => l())
}
