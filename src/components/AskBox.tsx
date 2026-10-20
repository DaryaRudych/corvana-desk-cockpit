import { useState } from 'react'
import { ask, SUGGESTED_QUESTIONS, type Answer } from '../ai/ask'
import { usdMt } from '../lib/format'
import type { UserContext } from '../semantic/query'
import { AiBadge, BasedOn, MetricChip, Segments } from './ai'
import { LockIcon } from './Icons'
import { CARD } from './ui'

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

function AnswerView({ question, a }: { question: string; a: Answer }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-zinc-50 px-4 py-3">
      <div className="text-xs text-zinc-500">“{question}”</div>
      <p className={`flex gap-2 text-[14px] leading-relaxed ${a.kind === 'refusal' ? 'text-zinc-700' : 'text-zinc-800'}`}>
        {a.kind === 'refusal' && <LockIcon className="mt-1 size-3.5 shrink-0 text-zinc-400" />}
        <span>
          <Segments parts={a.text} />
        </span>
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
        <table className="num w-full max-w-[560px] text-xs">
          <thead>
            <tr className="text-zinc-400">
              {a.table.columns.map((c, i) => (
                <th key={c} className={`pb-1 font-medium ${a.table!.align?.[i] === 'right' ? 'text-right' : 'text-left'}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200/70">
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
  )
}

/** AI moment 2: inline "Ask about this enquiry" (not a chat sidebar). */
export function AskBox({ enquiryId, user }: { enquiryId: string; user: UserContext }) {
  const [text, setText] = useState('')
  const [last, setLast] = useState<{ question: string; answer: Answer } | null>(null)
  const submit = (q: string) => {
    const question = q.trim()
    if (!question) return
    setLast({ question, answer: ask(question, enquiryId, user) })
    setText('')
  }

  return (
    <section className={`flex flex-col gap-3 px-5 py-4 ${CARD}`}>
      <div className="flex items-center gap-2">
        <AiBadge label="Ask" />
        <h2 className="text-sm font-semibold text-zinc-900">Ask about this enquiry</h2>
        <span className="text-[11px] text-zinc-400">Answers from governed metrics only, for this customer and grade.</span>
      </div>
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
          placeholder="e.g. How has this customer’s premium moved over the last 12 months?"
          className="flex-1 rounded-full border border-zinc-200 bg-white px-4 py-2 text-[13px] text-zinc-900 focus:border-indigo-400 focus:outline-none"
        />
        <button type="submit" className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40" disabled={!text.trim()}>
          Ask
        </button>
      </form>
      <div className="flex flex-wrap gap-2">
        {SUGGESTED_QUESTIONS.map((q) => (
          <button key={q} type="button" onClick={() => submit(q)} className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700 hover:border-indigo-300 hover:text-indigo-700">
            {q}
          </button>
        ))}
      </div>
      {last && <AnswerView question={last.question} a={last.answer} />}
    </section>
  )
}
