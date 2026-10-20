import { query, type UserContext } from '../semantic/query'
import { CARD } from './ui'

const BUTTON = 'rounded-full px-6 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40'

export function ActionBar({ enquiryId, user }: { enquiryId: string; user: UserContext }) {
  const blocked = query('compliance_check', { enquiryId }, user).value === 'FLAG'
  return (
    <div className={`flex items-center gap-2 px-4 py-3 ${CARD}`}>
      <button type="button" disabled className={`${BUTTON} bg-indigo-600 text-white`}>
        Quote
      </button>
      <button type="button" disabled className={`${BUTTON} bg-zinc-100 text-zinc-800`}>
        Counter
      </button>
      <button type="button" disabled className={`${BUTTON} bg-zinc-100 text-zinc-800`}>
        Decline
      </button>
      <span className="ml-auto text-xs text-zinc-400">
        {blocked ? 'Actions disabled: refer to compliance.' : 'Quote, counter and decline arrive in stage 5.'}
      </span>
    </div>
  )
}
