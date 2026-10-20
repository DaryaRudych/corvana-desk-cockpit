// AI moment 2: "Ask about this enquiry". One thread component, three trial placements
// (inline under the cards, docked right panel, slide-over drawer). History is kept per
// enquiry for the session by the App, whichever placement is active.
import { useEffect, useRef, useState } from 'react'
import { SUGGESTED_QUESTIONS, type Answer } from '../ai/ask'
import { usdMt } from '../lib/format'
import { AiMark, BasedOn, MetricChip, Segments } from './ai'
import { LockIcon } from './Icons'
import { CARD } from './ui'

export interface Turn {
  question: string
  answer: Answer
}
export type AskPlacement = 'inline' | 'dock' | 'drawer'

type Chart = NonNullable<Answer['chart']>

function Bars({ points }: { points: Extract<Chart, { kind: 'bars' }>['points'] }) {
  const max = Math.max(...points.flatMap((p) => [p.value ?? 0, p.reference])) * 1.15
  const W = 46
  const H = 90
  return (
    <svg viewBox={`0 0 ${points.length * W} ${H + 18}`} className="h-[108px] w-full max-w-[420px]" role="img" aria-label="Premium by month">
      {points.map((p, i) => {
        const x = i * W
        const h = ((p.value ?? 0) / max) * H
        const ref = H - (p.reference / max) * H
        return (
          <g key={p.label}>
            {p.value !== null && <rect x={x + 12} y={H - h} width={22} height={h} rx={4} className="fill-indigo-500" />}
            {p.value !== null && (
              <text x={x + 23} y={H - h - 3} textAnchor="middle" className="num fill-zinc-700 text-[9px] font-semibold">
                {usdMt(p.value)}
              </text>
            )}
            <line x1={x + 6} x2={x + 40} y1={ref} y2={ref} strokeWidth={1.5} strokeDasharray="3 2" className="stroke-zinc-400" />
            <text x={x + 23} y={H + 13} textAnchor="middle" className="fill-zinc-500 text-[10px]">
              {p.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function Line({ points }: { points: Extract<Chart, { kind: 'line' }>['points'] }) {
  const vals = points.map((p) => p.value)
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const W = 420
  const H = 80
  const x = (i: number) => (i / (points.length - 1)) * (W - 50)
  const y = (v: number) => 6 + (1 - (v - lo) / (hi - lo || 1)) * (H - 12)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const last = points.at(-1)!
  return (
    <svg viewBox={`0 0 ${W} ${H + 16}`} className="h-[96px] w-full max-w-[420px]" role="img" aria-label="Benchmark, 30 days">
      <path d={d} fill="none" strokeWidth={2} className="stroke-indigo-500" />
      <circle cx={x(points.length - 1)} cy={y(last.value)} r={3} className="fill-indigo-600" />
      <text x={x(points.length - 1) + 6} y={y(last.value) + 3} className="num fill-zinc-700 text-[10px] font-semibold">
        {usdMt(last.value)}
      </text>
      <text x={0} y={H + 14} className="fill-zinc-400 text-[10px]">
        {points[0].label.slice(5)}
      </text>
      <text x={W - 50} y={H + 14} textAnchor="end" className="fill-zinc-400 text-[10px]">
        {last.label.slice(5)}
      </text>
      <text x={W - 2} y={y(hi) + 3} textAnchor="end" className="num fill-zinc-400 text-[9px]">
        hi {usdMt(hi)}
      </text>
      <text x={W - 2} y={y(lo) + 3} textAnchor="end" className="num fill-zinc-400 text-[9px]">
        lo {usdMt(lo)}
      </text>
    </svg>
  )
}

function AnswerView({ a }: { a: Answer }) {
  return (
    <div className="flex gap-2.5">
      {a.kind === 'refusal' ? <LockIcon className="mt-1 size-3.5 shrink-0 text-zinc-400" /> : <AiMark className="mt-1 size-3.5" />}
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <p className="text-[13.5px] leading-relaxed text-zinc-800">
          <Segments parts={a.text} />
        </p>
        {a.chart && (
          <div className="flex flex-col gap-1">
            {a.chart.kind === 'bars' ? <Bars points={a.chart.points} /> : <Line points={a.chart.points} />}
            {a.chart.kind === 'bars' && (
              <div className="flex gap-3 text-[11px] text-zinc-500">
                <span className="inline-flex items-center gap-1">
                  <i className="inline-block size-2 rounded-sm bg-indigo-500" /> customer
                </span>
                <span className="inline-flex items-center gap-1">
                  <i className="inline-block h-0 w-3 border-t-2 border-dashed border-zinc-400" /> desk average
                </span>
              </div>
            )}
          </div>
        )}
        {a.table && (
          <table className="num w-full text-xs">
            <thead>
              <tr className="text-zinc-400">
                {a.table.columns.map((c, i) => (
                  <th key={c} className={`pb-1 font-medium ${a.table!.align?.[i] === 'right' ? 'text-right' : 'text-left'}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {a.table.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} className={`py-1.5 text-zinc-800 ${a.table!.align?.[ci] === 'right' ? 'text-right' : ''}`}>
                      {typeof cell === 'string' ? cell : <MetricChip c={cell} />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <BasedOn results={a.basedOn} />
      </div>
    </div>
  )
}

/** The conversation for one enquiry: history, suggested questions and the input. */
export function AskThread({ thread, onAsk, fill }: { thread: Turn[]; onAsk: (q: string) => void; fill?: boolean }) {
  const [text, setText] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [thread.length])
  const submit = (q: string) => {
    if (!q.trim()) return
    onAsk(q.trim())
    setText('')
  }
  const asked = new Set(thread.map((t) => t.question))
  const pills = SUGGESTED_QUESTIONS.filter((q) => !asked.has(q))

  return (
    <div className={`flex min-h-0 flex-col gap-3 ${fill ? 'flex-1' : ''}`}>
      <div ref={scroller} className={`flex min-h-0 flex-col gap-4 overflow-y-auto ${fill ? 'flex-1' : 'max-h-[300px]'} ${thread.length ? '' : 'hidden'}`}>
        {thread.map((t, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="self-end rounded-2xl rounded-br-md bg-zinc-100 px-3 py-1.5 text-[13px] text-zinc-800">{t.question}</div>
            <AnswerView a={t.answer} />
          </div>
        ))}
      </div>
      {!thread.length && <p className="text-xs text-zinc-500">Answers come from governed metrics only, for this customer and grade. History is kept for this enquiry.</p>}
      {pills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pills.map((q) => (
            <button key={q} type="button" onClick={() => submit(q)} className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:border-indigo-300 hover:text-indigo-700">
              {q}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={(ev) => {
          ev.preventDefault()
          submit(text)
        }}
        className="flex gap-2"
      >
        <input
          value={text}
          onChange={(ev) => setText(ev.target.value)}
          placeholder="Ask about this enquiry…"
          className="min-w-0 flex-1 rounded-full border border-zinc-200 bg-white px-4 py-2 text-[13px] text-zinc-900 focus:border-indigo-400 focus:outline-none"
        />
        <button type="submit" disabled={!text.trim()} className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
          Ask
        </button>
      </form>
    </div>
  )
}

function Title({ customer }: { customer: string }) {
  return (
    <div className="flex items-center gap-2">
      <AiMark />
      <h2 className="text-sm font-semibold text-zinc-900">Ask about this enquiry</h2>
      <span className="truncate text-[11px] text-zinc-400">{customer}</span>
    </div>
  )
}

/** Placement A: inline card under the panels; the thread scrolls inside a fixed height. */
export function AskInline({ customer, thread, onAsk }: { customer: string; thread: Turn[]; onAsk: (q: string) => void }) {
  return (
    <section className={`flex flex-col gap-3 px-5 py-4 ${CARD}`}>
      <Title customer={customer} />
      <AskThread thread={thread} onAsk={onAsk} />
    </section>
  )
}

/** Placement B: a docked column on the right of the enquiry screen, collapsible to a rail. */
export function AskDock({ customer, thread, onAsk }: { customer: string; thread: Turn[]; onAsk: (q: string) => void }) {
  const [open, setOpen] = useState(true)
  if (!open) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center gap-2 border-l border-zinc-200 bg-white pt-4">
        <button type="button" onClick={() => setOpen(true)} title="Ask about this enquiry" className="rounded-full p-2 hover:bg-indigo-50">
          <AiMark className="size-5" />
        </button>
        {thread.length > 0 && <span className="num rounded-full bg-indigo-50 px-1.5 text-[10px] font-semibold text-indigo-700">{thread.length}</span>}
      </aside>
    )
  }
  return (
    <aside className="flex w-[380px] shrink-0 flex-col gap-3 border-l border-zinc-200 bg-white px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <Title customer={customer} />
        <button type="button" onClick={() => setOpen(false)} title="Collapse" className="rounded-full px-1.5 text-lg leading-none text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
          ›
        </button>
      </div>
      <AskThread thread={thread} onAsk={onAsk} fill />
    </aside>
  )
}

/** Placement C: a slide-over drawer, opened on demand. */
export function AskDrawer({ customer, thread, onAsk, onClose }: { customer: string; thread: Turn[]; onAsk: (q: string) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 animate-[fade-in_200ms_ease-out] bg-zinc-900/10" onClick={onClose} />
      <aside role="dialog" aria-label="Ask about this enquiry" className="absolute inset-y-0 right-0 flex w-[460px] animate-[slide-in_200ms_ease-out] flex-col gap-3 bg-white px-5 py-5 shadow-[-8px_0_32px_rgba(16,24,40,0.12)]">
        <div className="flex items-start justify-between gap-2">
          <Title customer={customer} />
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full px-1.5 text-xl leading-none text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
            ×
          </button>
        </div>
        <AskThread thread={thread} onAsk={onAsk} fill />
      </aside>
    </div>
  )
}

/** Opens the drawer placement: a quiet button with the AI mark and the thread length. */
export function AskButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700 hover:border-indigo-300 hover:text-indigo-700">
      <AiMark className="size-3" /> Ask
      {count > 0 && <span className="num rounded-full bg-indigo-50 px-1.5 text-[10px] font-semibold text-indigo-700">{count}</span>}
    </button>
  )
}
