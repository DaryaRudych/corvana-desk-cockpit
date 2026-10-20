import { query, type UserContext } from '../semantic/query'

const BUTTON = 'rounded-md px-5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40'

export function ActionBar({ enquiryId, user }: { enquiryId: string; user: UserContext }) {
  const blocked = query('compliance_check', { enquiryId }, user).value === 'FLAG'
  return (
    <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2">
      <button type="button" disabled className={`${BUTTON} bg-indigo-600 text-white`}>
        Quote
      </button>
      <button type="button" disabled className={`${BUTTON} border border-zinc-300 bg-white text-zinc-800`}>
        Counter
      </button>
      <button type="button" disabled className={`${BUTTON} border border-zinc-300 bg-white text-zinc-800`}>
        Decline
      </button>
      <span className="ml-auto text-xs text-zinc-400">
        {blocked ? 'Actions disabled: refer to compliance.' : 'Quote, counter and decline arrive in stage 5.'}
      </span>
    </div>
  )
}
