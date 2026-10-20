// The ONLY way the UI changes data: the trader's response to an enquiry.
// Same user context and permission layer as reads, plus the rules a response must obey.
import { writeEnquiryResponse, type UserContext } from './permissions'
import { query } from './query'

export const DECLINE_REASONS = ['price', 'credit', 'compliance', 'no capacity', 'other'] as const
export type DeclineReason = (typeof DECLINE_REASONS)[number]

export type TraderResponse =
  | { kind: 'quote'; enquiryId: string; premium: number; quantity: number }
  | { kind: 'counter'; enquiryId: string; premium: number; quantity: number; deliveryDate: string; paymentDays: number; letterOfCredit: boolean }
  | { kind: 'decline'; enquiryId: string; reason: DeclineReason }

const STATUS = { quote: 'quoted', counter: 'countered', decline: 'declined' } as const

/** Records the response for this session. Throws with a user-facing message if it isn't allowed. */
export function submitResponse(r: TraderResponse, user: UserContext): void {
  const details = query('enquiry_details', { enquiryId: r.enquiryId }, user)
  if (!details.value) throw new Error(details.restricted ?? 'Enquiry not found.')
  if (details.value.status !== 'open') throw new Error(`This enquiry was already ${details.value.status}.`)
  if (query('compliance_check', { enquiryId: r.enquiryId }, user).value === 'FLAG') {
    throw new Error('Refer to compliance: the cockpit sends no response on a flagged enquiry.')
  }
  if (r.kind !== 'decline' && (r.premium < 0 || r.quantity <= 0)) throw new Error('Premium and quantity must be positive.')

  writeEnquiryResponse(user, r.enquiryId, {
    status: STATUS[r.kind],
    action: r.kind,
    quoted_premium_usd_mt: r.kind === 'decline' ? null : r.premium,
    decline_reason: r.kind === 'decline' ? r.reason : null,
  })
}
