import { useCallback, useState, useSyncExternalStore } from 'react'
import { ask } from './ai/ask'
import { AskDock, AskDrawer, type AskPlacement, type Turn } from './components/AskBox'
import { EnquiryWorkspace } from './components/EnquiryWorkspace'
import { GovernanceDrawer, type DrawerTab } from './components/GovernanceDrawer'
import { LockIcon } from './components/Icons'
import { MetricCardProvider } from './components/MetricCard'
import { Queue } from './components/Queue'
import { Toast } from './components/Toast'
import { dateTime } from './lib/format'
import { AS_OF, TRADER, getDataVersion, query, subscribeToData, userLabel } from './semantic/query'

// Temporary: lets the author compare Ask placements before one is chosen (?ask=inline|dock|drawer).
const PLACEMENT_KEY = 'corvana.askPlacement'
const PLACEMENTS: AskPlacement[] = ['inline', 'dock', 'drawer']
function initialPlacement(): AskPlacement {
  const fromUrl = new URLSearchParams(window.location.search).get('ask')
  if (PLACEMENTS.includes(fromUrl as AskPlacement)) return fromUrl as AskPlacement
  try {
    const saved = localStorage.getItem(PLACEMENT_KEY)
    if (PLACEMENTS.includes(saved as AskPlacement)) return saved as AskPlacement
  } catch {
    /* storage unavailable */
  }
  return 'inline'
}

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
  const [askPlacement, setAskPlacement] = useState<AskPlacement>(initialPlacement)
  const choosePlacement = (p: AskPlacement) => {
    setAskPlacement(p)
    try {
      localStorage.setItem(PLACEMENT_KEY, p)
    } catch {
      /* storage unavailable: keep for this page only */
    }
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
          <div className="ml-6 flex items-center gap-1.5 text-[11px] text-zinc-500" title="Temporary: compare Ask placements">
            Ask layout
            <span className="flex rounded-full bg-zinc-800 p-0.5">
              {PLACEMENTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => choosePlacement(p)}
                  className={`rounded-full px-2.5 py-0.5 capitalize ${askPlacement === p ? 'bg-zinc-100 font-semibold text-zinc-900' : 'text-zinc-400 hover:text-zinc-100'}`}
                >
                  {p}
                </button>
              ))}
            </span>
          </div>
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
                askPlacement={askPlacement}
                thread={thread}
                onAsk={onAsk}
                onOpenAsk={() => setAskDrawerOpen(true)}
              />
            ) : (
              <p className="p-8 text-zinc-500">No open enquiries.</p>
            )}
          </main>
          {askPlacement === 'dock' && selectedId && <AskDock customer={customer} thread={thread} onAsk={onAsk} />}
        </div>
        {askPlacement === 'drawer' && askDrawerOpen && selectedId && <AskDrawer customer={customer} thread={thread} onAsk={onAsk} onClose={closeAskDrawer} />}
        {toast && <Toast message={toast} onDone={clearToast} />}
        {drawer && <GovernanceDrawer user={user} tab={drawer} onTab={setDrawer} onClose={closeDrawer} />}
      </div>
    </MetricCardProvider>
  )
}
