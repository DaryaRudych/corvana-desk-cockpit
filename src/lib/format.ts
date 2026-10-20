// Display formatting. Fixed locale so the demo renders identically everywhere.
// Timestamps are desk-local ISO strings (+08:00); we read their parts directly
// instead of converting through the browser's time zone.
import type { Unit } from '../semantic/metrics'

const MINUS = '−'
const sign = (v: number) => (v < 0 ? MINUS : '')
const int = (v: number) => Math.round(v).toLocaleString('en-US')

export function usd(v: number): string {
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${sign(v)}$${(a / 1_000_000).toFixed(2)}M`
  if (a >= 10_000) return `${sign(v)}$${Math.round(a / 1_000)}k`
  return `${sign(v)}$${int(a)}`
}
export const usdMt = (v: number) => `${sign(v)}$${Math.abs(v).toFixed(2)}`
export const mt = (v: number) => `${int(v)} mt`
export const pct = (v: number, digits = 2) => `${(v * 100).toFixed(digits)}%`
export const signedUsdMt = (v: number) => `${v > 0 ? '+' : v < 0 ? MINUS : '±'}$${Math.abs(v).toFixed(2)}`

export function duration(minutes: number): string {
  if (minutes < 0) return `overdue ${duration(-minutes)}`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `${h}h ${m}m` : `${m}m`
}

export function formatValue(unit: Unit, v: unknown): string {
  if (v === null || v === undefined) return '—'
  switch (unit) {
    case 'usd':
      return usd(v as number)
    case 'usd_mt':
      return `${usdMt(v as number)}/mt`
    case 'mt':
      return mt(v as number)
    case 'minutes':
      return duration(v as number)
    case 'days':
      return `${(v as number).toFixed(1)} days`
    case 'ratio':
      return pct(v as number)
    case 'count':
      return int(v as number)
    case 'flag':
      return v ? 'Yes' : 'No'
    default:
      return String(v)
  }
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const parts = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`)
  return { wd: WEEKDAYS[d.getUTCDay()], d: d.getUTCDate(), m: MONTHS[d.getUTCMonth()], y: d.getUTCFullYear() }
}
/** '2026-10-25' → 'Sun 25 Oct' (fixed names, so every browser renders the same) */
export const day = (date: string) => {
  const p = parts(date)
  return `${p.wd} ${p.d} ${p.m}`
}
/** '2026-09-01' → '1 Sep 2026' */
export const longDate = (date: string) => {
  const p = parts(date)
  return `${p.d} ${p.m} ${p.y}`
}
/** '2026-10-25' → '25' */
export const dayOfMonth = (date: string) => String(Number(date.slice(8, 10)))
/** '2026-10-25' → 'S' */
export const weekdayLetter = (date: string) => day(date).slice(0, 2)
/** Window '2026-10-25'..'2026-10-26' → 'Sun 25 – Mon 26 Oct' */
export function dateRange(from: string, to: string): string {
  if (from === to) return day(from)
  const a = day(from)
  const b = day(to)
  return a.slice(-3) === b.slice(-3) ? `${a.slice(0, -4)} – ${b}` : `${a} – ${b}`
}
/** Desk-local ISO timestamp → 'Sat 24 Oct 22:00' */
export const dateTime = (iso: string) => `${day(iso.slice(0, 10))} ${iso.slice(11, 16)}`
/** Hours into the day (desk-local) of an ISO timestamp. */
export const hourOfDay = (iso: string) => Number(iso.slice(11, 13)) + Number(iso.slice(14, 16)) / 60
