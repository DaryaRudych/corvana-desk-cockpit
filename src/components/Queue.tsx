import { duration, mt, usdCompact } from '../lib/format'
import type { ValueOf } from '../semantic/metrics'
import { Pill } from './ui'

export type QueueRow = ValueOf<'open_enquiries'>[number]

const BLOCKER_TONE = { Compliance: 'bad', Credit: 'warn', 'No barge': 'warn' } as const

export function Queue({ rows, selectedId, onSelect }: { rows: QueueRow[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <aside className="flex min-h-0 w-[340px] shrink-0 flex-col border-r border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-3 pt-3 pb-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">
            Open enquiries <span className="num ml-1 rounded-full bg-zinc-100 px-1.5 py-px text-[11px] font-semibold text-zinc-600">{rows.length}</span>
          </h2>
          <span className="text-[11px] text-zinc-400" title="Sorted by time to quote due; enquiries blocked by a compliance flag go last. Credit and No-barge badges are issues to counter, not blocks.">by due time · compliance blocks last</span>
        </div>
        <div className="mt-2 grid grid-cols-[64px_1fr_auto] gap-x-2 text-[10px] font-medium text-zinc-400">
          <span>Due in</span>
          <span>Customer · enquiry</span>
          <span className="text-right" title="Expected margin at the suggested premium">Exp. value</span>
        </div>
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto">
        {rows.map((r, i) => {
          const selected = r.enquiryId === selectedId
          const blocked = r.move === 'BLOCKED'
          const urgent = r.minutesToDue < 60
          // Make the sort visible: compliance-blocked enquiries form their own group at the bottom.
          const firstBlocked = blocked && rows[i - 1]?.move !== 'BLOCKED'
          const blockedCount = rows.filter((x) => x.move === 'BLOCKED').length
          return (
            <li key={r.enquiryId}>
              {firstBlocked && (
                <div className="sticky top-0 border-y border-red-100 bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-700">
                  Blocked by compliance ({blockedCount}): listed last, whatever their due time
                </div>
              )}
              <button
                type="button"
                onClick={() => onSelect(r.enquiryId)}
                className={`grid w-full grid-cols-[64px_1fr_auto] gap-x-2 border-b border-l-2 border-b-zinc-100 px-3 py-2 text-left transition-colors ${
                  selected ? 'border-l-indigo-600 bg-indigo-50/60' : 'border-l-transparent hover:bg-zinc-50'
                } ${blocked && !selected ? 'opacity-60' : ''}`}
              >
                <span className={`num pt-px text-xs font-semibold ${urgent ? 'text-red-600' : 'text-zinc-700'}`}>{duration(r.minutesToDue)}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-zinc-900">{r.customerName}</span>
                  <span className="num block truncate text-xs text-zinc-500">
                    {mt(r.quantityMt)} {r.gradeName} · {r.vesselName}
                  </span>
                </span>
                <span className={`num pt-px text-right text-xs ${r.expectedValue < 0 && !blocked ? 'text-red-600' : 'text-zinc-600'}`}>{blocked ? '—' : usdCompact(r.expectedValue)}</span>
                {r.blockers.length > 0 && (
                  <span className="col-start-2 col-end-4 mt-1 flex gap-1">
                    {r.blockers.map((b) => (
                      <Pill key={b} tone={BLOCKER_TONE[b]}>
                        {b === 'Compliance' ? 'Blocked · Compliance' : b}
                      </Pill>
                    ))}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}
