import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { ActionBar } from './components/ActionBar'
import { DeliverablePanel } from './components/DeliverablePanel'
import { EnquiryHeader } from './components/EnquiryHeader'
import { GovernanceDrawer, type DrawerTab } from './components/GovernanceDrawer'
import { LockIcon } from './components/Icons'
import { MetricCardProvider } from './components/MetricCard'
import { PricePanel } from './components/PricePanel'
import { Queue } from './components/Queue'
import { SafePanel } from './components/SafePanel'
import { dateTime } from './lib/format'
import { AS_OF, TRADER, query, userLabel } from './semantic/query'

function Placeholder({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-2.5 text-xs text-zinc-500">
      <span className="mr-2 font-semibold text-zinc-600">{label}</span>
      {children}
    </div>
  )
}

export default function App() {
  const user = TRADER
  const queue = useMemo(() => query('open_enquiries', {}, user).value ?? [], [user])
  const [selectedId, setSelectedId] = useState<string | null>(queue[0]?.enquiryId ?? null)
  const move = selectedId ? query('suggested_move', { enquiryId: selectedId }, user).value : null
  const [drawer, setDrawer] = useState<DrawerTab | null>(null)
  const closeDrawer = useCallback(() => setDrawer(null), [])

  return (
    <MetricCardProvider user={user}>
      <div className="flex h-full flex-col">
        <header className="flex h-12 shrink-0 items-center gap-4 border-b border-zinc-800 bg-zinc-900 px-4 text-zinc-100">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded bg-indigo-500 text-xs font-bold">C</span>
            <span className="font-semibold tracking-tight">Corvana Desk Cockpit</span>
          </div>
          <span className="num text-xs text-zinc-400">Data as of {dateTime(AS_OF)} (desk time)</span>
          <button
            type="button"
            onClick={() => setDrawer('access')}
            title="Who sees what"
            className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1 text-xs hover:bg-zinc-700"
          >
            <span className="text-zinc-400">Viewing as:</span> {userLabel(user)}
            <LockIcon className="size-3 text-zinc-400" />
          </button>
          <button type="button" onClick={() => setDrawer('catalog')} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-zinc-900 hover:bg-zinc-200">
            Definitions &amp; access
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <Queue rows={queue} selectedId={selectedId} onSelect={setSelectedId} />
          <main className="min-w-0 flex-1 overflow-y-auto">
            {selectedId ? (
              <div key={selectedId} className="mx-auto flex max-w-[1240px] flex-col gap-4 p-5">
                <EnquiryHeader enquiryId={selectedId} user={user} />
                <Placeholder label="AI enquiry brief">
                  Arrives in stage 6. Rule-based suggested move for this enquiry: <b className="text-zinc-700">{move?.move}</b>
                </Placeholder>
                <div className="grid grid-cols-3 items-stretch gap-4">
                  <SafePanel enquiryId={selectedId} user={user} />
                  <DeliverablePanel enquiryId={selectedId} user={user} />
                  <PricePanel enquiryId={selectedId} user={user} />
                </div>
                <Placeholder label="Ask about this enquiry">Arrives in stage 6.</Placeholder>
                <ActionBar enquiryId={selectedId} user={user} />
              </div>
            ) : (
              <p className="p-8 text-zinc-500">No open enquiries.</p>
            )}
          </main>
        </div>
        {drawer && <GovernanceDrawer user={user} tab={drawer} onTab={setDrawer} onClose={closeDrawer} />}
      </div>
    </MetricCardProvider>
  )
}
