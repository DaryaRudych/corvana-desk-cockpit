import { day, mt } from '../lib/format'
import type { CounterOption } from '../semantic/metrics'

/** The terms the trader is working on for the selected enquiry. Every live figure is query() at these terms. */
export interface Terms {
  premium: number
  quantity: number
  deliveryDate: string
  paymentDays: number
  letterOfCredit: boolean
}

export type Mode = 'review' | 'counter' | 'decline'

export const termsParams = (enquiryId: string, t: Terms) => ({ enquiryId, premium: t.premium, quantity: t.quantity, letterOfCredit: t.letterOfCredit })

export function optionLabel(o: CounterOption, fullQty: number): string {
  switch (o.kind) {
    case 'quantity':
      return `Reduce to ${mt(o.quantityMt)}`
    case 'letter_of_credit':
      return `Full ${mt(fullQty)} with letter of credit`
    case 'delivery_date':
      return `Deliver ${day(o.deliveryDate)} (${o.bargeName.replace('Corvana ', '')})`
  }
}

/** Applies a suggested counter option to the trader's terms. */
export function applyOption(t: Terms, o: CounterOption, fullQty: number): Terms {
  switch (o.kind) {
    case 'quantity':
      return { ...t, quantity: o.quantityMt, letterOfCredit: false }
    case 'letter_of_credit':
      return { ...t, quantity: fullQty, letterOfCredit: true }
    case 'delivery_date':
      return { ...t, deliveryDate: o.deliveryDate }
  }
}
