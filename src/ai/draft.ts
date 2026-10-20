// AI moment 3: the draft message to the customer. Built only from the terms the trader set
// (the AI never chooses terms) plus governed enquiry details. Plain text, editable before Send.
// A decline never reveals the internal reason (credit, compliance) to the customer.
import { dateRange, day, mt, usdMt } from '../lib/format'
import type { TraderResponse } from '../semantic/actions'
import { businessUnitName, query, type UserContext } from '../semantic/query'
import { chip, type Chip } from './types'

export interface Draft {
  text: string
  basedOn: Chip[]
}

export function draftMessage(r: TraderResponse, user: UserContext): Draft {
  const p = { enquiryId: r.enquiryId }
  const details = query('enquiry_details', p, user)
  const e = details.value!
  const sign = `Kind regards,\nTrading desk, Corvana ${businessUnitName(user.businessUnit)}`
  const greeting = `Dear ${e.customerName} team,`
  const ref = `your enquiry for ${e.vesselName} (${mt(e.quantity_mt)} ${e.gradeName}, ${e.port}, ${dateRange(e.window_start, e.window_end)})`

  if (r.kind === 'decline') {
    return {
      text: `${greeting}\n\nThank you for ${ref}. Unfortunately we are not able to offer on this occasion.\n\nWe appreciate you thinking of us and look forward to supporting your next call at the port.\n\n${sign}`,
      basedOn: [chip(details)],
    }
  }

  const price = query('quoted_price', { ...p, premium: r.premium }, user)
  const bench = query('benchmark_price', p, user)
  const priceText = `USD ${usdMt(price.value!).slice(1)}/mt (${e.gradeName} benchmark + USD ${usdMt(r.premium).slice(1)})`

  if (r.kind === 'quote') {
    return {
      text: `${greeting}\n\nThank you for ${ref}.\n\nWe are pleased to offer ${mt(r.quantity)} ${e.gradeName} at ${priceText}, delivered by barge at ${e.port} within ${dateRange(e.window_start, e.window_end)}. Payment ${e.paymentTermsDays} days from delivery.\n\nThe offer is subject to final confirmation of barge nomination. Please confirm at your earliest convenience.\n\n${sign}`,
      basedOn: [chip(price), chip(bench), chip(details)],
    }
  }

  const changes: string[] = []
  if (r.quantity !== e.quantity_mt) changes.push(`a quantity of ${mt(r.quantity)} instead of ${mt(e.quantity_mt)}`)
  if (r.deliveryDate < e.window_start || r.deliveryDate > e.window_end) changes.push(`delivery on ${day(r.deliveryDate)}`)
  const payment = r.letterOfCredit ? 'payment secured by a letter of credit' : `payment ${r.paymentDays} days from delivery`
  if (r.letterOfCredit || r.paymentDays !== e.paymentTermsDays) changes.push(payment)
  const lead = changes.length ? `we can offer the following, with ${changes.join(', ')}:` : 'we can offer the following:'

  return {
    text: `${greeting}\n\nThank you for ${ref}. We are not able to confirm it exactly as requested, but ${lead}\n\n- Quantity: ${mt(r.quantity)} ${e.gradeName}\n- Price: ${priceText}\n- Delivery: ${day(r.deliveryDate)}, by barge at ${e.port}\n- Payment: ${r.letterOfCredit ? 'letter of credit' : `${r.paymentDays} days from delivery`}\n\nPlease let us know if this works for you and we will confirm the barge nomination.\n\n${sign}`,
    basedOn: [chip(price), chip(bench), chip(details)],
  }
}
