// "Definitions & access": the metric catalog, the permission rules and how the AI is kept
// accurate, all read from the same registry and permission code the cockpit runs on.
import { useEffect, useRef } from 'react'
import { METRIC_CATALOG, businessUnitName, describeAccess, type MetricMeta, type UserContext } from '../semantic/query'
import { ChevronIcon, LockIcon } from './Icons'
import { CertifiedBadge } from './MetricCard'
import { Pill } from './ui'

export type DrawerTab = 'catalog' | 'access' | 'ai'
const TABS: { id: DrawerTab; label: string }[] = [
  { id: 'catalog', label: 'Metric catalog' },
  { id: 'access', label: 'Who sees what' },
  { id: 'ai', label: 'How AI stays accurate' },
]

function CatalogRow({ m, focused }: { m: MetricMeta; focused: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'center' })
  }, [focused])
  return (
    <details ref={ref} open={focused || undefined} className={`group border-b border-zinc-100 last:border-0 ${focused ? '-mx-3 rounded-lg bg-indigo-50/60 px-3' : ''}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 py-2.5 [&::-webkit-details-marker]:hidden">
        <ChevronIcon className="size-3 shrink-0 text-zinc-400 transition-transform group-open:rotate-90" />
        <span className="min-w-0 flex-1">
          <span className="font-medium text-zinc-900">{m.name}</span>
          {m.kind === 'dataset' && <span className="ml-1.5 text-[11px] text-zinc-400">dataset</span>}
          {!m.visibleTo.includes('trader') && (
            <span className="ml-1.5 inline-flex items-center gap-0.5 text-[11px] text-zinc-400">
              <LockIcon className="size-2.5" /> compliance only
            </span>
          )}
        </span>
        <span className="shrink-0 text-xs text-zinc-500">{m.owner}</span>
        <CertifiedBadge m={m} />
      </summary>
      <div className="mb-3 ml-5 rounded-xl bg-zinc-50 px-3 py-2.5 text-xs leading-relaxed text-zinc-700">
        <p>{m.definition}</p>
        <code className="mt-1.5 block font-mono text-[11px] text-zinc-600">{m.formula}</code>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {m.sourceTables.map((t) => (
            <span key={t} className="rounded bg-white px-1.5 py-px font-mono text-[10px] text-zinc-500">
              {t}
            </span>
          ))}
        </div>
      </div>
    </details>
  )
}

function Catalog({ user, focus }: { user: UserContext; focus?: string }) {
  const groups = [
    { title: 'Group', note: 'Shared definitions every business unit inherits', items: METRIC_CATALOG.filter((m) => m.scope === 'group') },
    { title: businessUnitName(user.businessUnit), note: 'Desk-level definitions built on the group model', items: METRIC_CATALOG.filter((m) => m.scope === 'bu') },
  ]
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.title}>
          <div className="mb-1 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-zinc-900">{g.title}</h3>
            <span className="text-[11px] text-zinc-400">{g.items.length} definitions</span>
          </div>
          <p className="mb-1 text-xs text-zinc-500">{g.note}</p>
          <div className="rounded-xl border border-zinc-100 px-3">
            {g.items.map((m) => (
              <CatalogRow key={m.id} m={m} focused={m.id === focus} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function Access({ user }: { user: UserContext }) {
  const a = describeAccess(user)
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl bg-zinc-50 px-3 py-2.5">
        <div className="text-[11px] text-zinc-500">Viewing as</div>
        <div className="inline-flex items-center gap-1.5 font-semibold text-zinc-900">
          <LockIcon className="size-3 text-zinc-400" /> {a.viewer}
        </div>
      </div>
      <section>
        <h3 className="mb-1.5 text-sm font-semibold text-zinc-900">Row-level: by business unit</h3>
        <ul className="flex list-disc flex-col gap-1.5 pl-4 text-zinc-700">
          {a.rowLevel.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-1.5 text-sm font-semibold text-zinc-900">Object-level: by role</h3>
        <ul className="flex list-disc flex-col gap-1.5 pl-4 text-zinc-700">
          {a.objectLevel.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-1.5 text-sm font-semibold text-zinc-900">Tables in your view</h3>
        <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-100 px-3 text-xs">
          {a.tables.map((t) => (
            <div key={t.table} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="text-zinc-800">{t.label}</span>
                <span className="ml-1.5 font-mono text-[10px] text-zinc-400">{t.table}</span>
              </span>
              <Pill tone={t.owner === 'Group' ? 'neutral' : 'accent'} className="shrink-0">
                {t.rule}
              </Pill>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

const AI_RULES = [
  {
    title: 'It never invents a number.',
    body: 'Every figure the AI shows is the result of a governed metric, fetched through the same query layer as this screen, and cited with a clickable metric chip. Questions it has no metric for get "I can only answer from governed metrics", not a guess.',
  },
  {
    title: 'It sees only what you see.',
    body: "The AI asks with your user context, so row-level and object-level rules apply before it reads anything. Ask about another BU's deals and the permission layer refuses, in the same words as the restricted line on screen.",
  },
  {
    title: 'It suggests; people decide.',
    body: 'No AI on compliance screening, credit limits, final price and terms, or sending. On a compliance flag it only says "refer to compliance". Drafts are built from the terms you set, and nothing is sent until you click Send.',
  },
]

function HowAi() {
  return (
    <ol className="flex flex-col gap-3">
      {AI_RULES.map((r, i) => (
        <li key={r.title} className="flex gap-3 rounded-xl bg-zinc-50 p-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">{i + 1}</span>
          <span>
            <span className="block font-semibold text-zinc-900">{r.title}</span>
            <span className="mt-0.5 block leading-relaxed text-zinc-600">{r.body}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

export function GovernanceDrawer({
  user,
  tab,
  focus,
  onTab,
  onClose,
}: {
  user: UserContext
  tab: DrawerTab
  /** Metric id to open and scroll to in the catalog. */
  focus?: string
  onTab: (t: DrawerTab) => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 animate-[fade-in_200ms_ease-out] bg-zinc-900/20" onClick={onClose} />
      <aside
        role="dialog"
        aria-label="Definitions and access"
        className="absolute inset-y-0 right-0 flex w-[560px] animate-[slide-in_200ms_ease-out] flex-col bg-white shadow-[-8px_0_32px_rgba(16,24,40,0.12)]"
      >
        <header className="flex items-start justify-between px-6 pt-5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Definitions &amp; access</h2>
            <p className="text-xs text-zinc-500">How every figure on this screen is defined, who is allowed to see which data, and how the AI uses both.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-xl leading-none text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
            ×
          </button>
        </header>
        <nav className="mx-6 mt-4 flex gap-1 rounded-full bg-zinc-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTab(t.id)}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${tab === t.id ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {tab === 'catalog' && <Catalog user={user} focus={focus} />}
          {tab === 'access' && <Access user={user} />}
          {tab === 'ai' && <HowAi />}
        </div>
      </aside>
    </div>
  )
}
