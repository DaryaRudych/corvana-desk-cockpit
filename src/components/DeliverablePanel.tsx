import { dateTime, day, dayOfMonth, hourOfDay, mt, weekdayLetter } from '../lib/format'
import type { ValueOf } from '../semantic/metrics'
import { query, type UserContext } from '../semantic/query'
import { AlertIcon } from './Icons'
import { Card, MetricValue, Tile, type Verdict } from './ui'

type Timeline = ValueOf<'barge_timeline'>

const LABEL_W = 66
const COL_W = 30
const ROW_H = 40
const HEAD_H = 44

/** Barge × day grid (one delivery per barge per day): grey = booked, green = free day, indigo band = requested window, line = vessel ETA. */
function BargeTimeline({ t }: { t: Timeline }) {
  const width = LABEL_W + t.days.length * COL_W
  const height = HEAD_H + Math.max(1, t.barges.length) * ROW_H + 16
  const x = (date: string, hour = 0) => LABEL_W + (t.days.indexOf(date) + hour / 24) * COL_W
  const winX = x(t.windowStart)
  const winW = x(t.windowEnd) + COL_W - winX
  const etaDay = t.vesselEta.slice(0, 10)
  const etaVisible = t.days.includes(etaDay)
  const etaX = etaVisible ? x(etaDay, hourOfDay(t.vesselEta)) : etaDay < t.days[0] ? LABEL_W : width
  const late = t.etaAfterWindowStart

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Barge timeline">
      <rect x={winX} y={0} width={winW} height={height - 14} rx={6} className="fill-indigo-50" />
      <text x={winX + winW / 2} y={11} textAnchor="middle" className="fill-indigo-600 text-[9px] font-semibold tracking-wide">
        WINDOW
      </text>
      {t.days.map((d) => (
        <g key={d}>
          <text x={x(d) + COL_W / 2} y={25} textAnchor="middle" className="fill-zinc-400 text-[9px]">
            {weekdayLetter(d)}
          </text>
          <text x={x(d) + COL_W / 2} y={37} textAnchor="middle" className="num fill-zinc-700 text-[11px] font-semibold">
            {dayOfMonth(d)}
          </text>
        </g>
      ))}
      {t.barges.map((b, i) => {
        const y = HEAD_H + i * ROW_H
        return (
          <g key={b.bargeId}>
            <text x={0} y={y + 18} className="fill-zinc-800 text-[11px] font-semibold">
              {b.bargeName.replace('Corvana ', '')}
            </text>
            <text x={0} y={y + 30} className="num fill-zinc-400 text-[9px]">
              {mt(b.capacityMt)}
            </text>
            {b.freeDays.map((d) => (
              <rect key={d} x={x(d) + 2} y={y + 4} width={COL_W - 4} height={ROW_H - 8} rx={5} className="fill-emerald-100" />
            ))}
            {b.slots.map((s) => (
              <rect key={s.slotId} x={x(s.start.slice(0, 10)) + 2} y={y + 4} width={COL_W - 4} height={ROW_H - 8} rx={5} className="fill-zinc-300">
                <title>
                  Booked {dateTime(s.start)}–{s.end.slice(11, 16)} ({s.dealId})
                </title>
              </rect>
            ))}
          </g>
        )
      })}
      <line x1={etaX} x2={etaX} y1={HEAD_H - 2} y2={height - 14} strokeWidth={1.5} strokeDasharray="3 2" className={late ? 'stroke-amber-600' : 'stroke-zinc-600'} />
      <text x={Math.max(LABEL_W, Math.min(etaX, width - 30))} y={height - 3} textAnchor={etaX > width - 30 ? 'end' : 'middle'} className={`text-[9px] font-semibold ${late ? 'fill-amber-600' : 'fill-zinc-600'}`}>
        ETA {t.vesselEta.slice(11, 16)}
      </text>
    </svg>
  )
}

export function DeliverablePanel({ enquiryId, user }: { enquiryId: string; user: UserContext }) {
  const p = { enquiryId }
  const timeline = query('barge_timeline', p, user)
  const available = query('barge_available_in_window', p, user)
  const stock = query('stock_for_grade', p, user)
  const details = query('enquiry_details', p, user).value
  const t = timeline.value
  const qty = details?.quantity_mt ?? 0
  const stockOk = (stock.value ?? 0) >= qty

  const verdict: Verdict = !stockOk
    ? { tone: 'bad', label: 'Short of stock' }
    : !available.value
      ? { tone: 'warn', label: 'No barge in window' }
      : t?.etaAfterWindowStart
        ? { tone: 'warn', label: 'Barge free · ETA late' }
        : { tone: 'ok', label: 'Barge available' }

  return (
    <Card step={2} title="Can we deliver?" subtitle="Barges, vessel ETA and stock" verdict={verdict}>
      {t && t.barges.length > 0 ? (
        <div>
          <div className="mb-1 flex items-baseline justify-between text-[11px] text-zinc-400">
            <span>
              Barges for {details?.gradeName} ≥ {mt(qty)}
            </span>
            <span className="flex gap-3">
              <span className="inline-flex items-center gap-1">
                <i className="inline-block size-2 rounded-sm bg-zinc-300" /> booked
              </span>
              <span className="inline-flex items-center gap-1">
                <i className="inline-block size-2 rounded-sm bg-emerald-200" /> free
              </span>
            </span>
          </div>
          <BargeTimeline t={t} />
        </div>
      ) : (
        <p className="rounded-xl bg-zinc-50 p-3 text-xs text-zinc-500">No barge on this desk supports {details?.gradeName} at this quantity.</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Tile label={`${details?.gradeName ?? ''} in stock`} sub={`needs ${mt(qty)}`} subTone={stockOk ? 'neutral' : 'bad'}>
          <MetricValue r={stock} className={stockOk ? '' : 'text-red-600'} />
        </Tile>
        <Tile
          label="Vessel ETA"
          sub={t && `${t.vesselEta.slice(11, 16)} · ${t.etaAfterWindowStart ? 'after window opens' : 'in time for window'}`}
          subTone={t?.etaAfterWindowStart ? 'warn' : 'neutral'}
        >
          <span className={`inline-flex items-center gap-1 ${t?.etaAfterWindowStart ? 'text-amber-600' : ''}`}>
            {t ? day(t.vesselEta.slice(0, 10)) : '—'}
            {t?.etaAfterWindowStart && <AlertIcon className="size-3" />}
          </span>
        </Tile>
      </div>
    </Card>
  )
}
