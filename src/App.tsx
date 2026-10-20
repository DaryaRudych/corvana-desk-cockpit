import { useCallback, useState, useSyncExternalStore } from 'react'
import { ask } from './ai/ask'
import { AskDrawer, type Turn } from './components/AskBox'
import { EnquiryWorkspace } from './components/EnquiryWorkspace'
import { GovernanceDrawer, type DrawerTab } from './components/GovernanceDrawer'
import { LockIcon } from './components/Icons'
import { MetricCardProvider } from './components/MetricCard'
import { Queue } from './components/Queue'
import { Toast } from './components/Toast'
import { dateTime } from './lib/format'
import { AS_OF, TRADER, getDataVersion, query, subscribeToData, userLabel } from './semantic/query'

export default function App() {
  const user = TRADER
  // Re-render (and re-rank the queue) whenever a response is recorded.
  useSyncExternalStore(subscribeToData, getDataVersion)
  const queue = query('open_enquiries', {}, user).value ?? []
  const [selectedId, setSelectedId] = useState<string | null>(queue[0]?.enquiryId ?? null)
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])
  const [drawer, setDrawer] = useState<DrawerTab | null>(null)
  const closeDrawer = useCallback(() => setDrawer(null), [])

  // Ask: one thread per enquiry, kept for the session.
  const [threads, setThreads] = useState<Record<string, Turn[]>>({})
  const thread = selectedId ? (threads[selectedId] ?? []) : []
  const onAsk = (question: string) => {
    if (!selectedId) return
    const turn = { question, answer: ask(question, selectedId, user) }
    setThreads((t) => ({ ...t, [selectedId]: [...(t[selectedId] ?? []), turn] }))
  }
  const [askDrawerOpen, setAskDrawerOpen] = useState(false)
  const closeAskDrawer = useCallback(() => setAskDrawerOpen(false), [])
  const customer = selectedId ? (query('enquiry_details', { enquiryId: selectedId }, user).value?.customerName ?? '') : ''

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
              <EnquiryWorkspace
                key={selectedId}
                enquiryId={selectedId}
                user={user}
                onSent={setToast}
                askCount={thread.length}
                onOpenAsk={() => setAskDrawerOpen(true)}
              />
            ) : (
              <p className="p-8 text-zinc-500">No open enquiries.</p>
            )}
          </main>
        </div>
        {askDrawerOpen && selectedId && <AskDrawer customer={customer} thread={thread} onAsk={onAsk} onClose={closeAskDrawer} />}
        {toast && <Toast message={toast} onDone={clearToast} />}
        {drawer && <GovernanceDrawer user={user} tab={drawer} onTab={setDrawer} onClose={closeDrawer} />}
      </div>
    </MetricCardProvider>
  )
}
