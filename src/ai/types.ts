// Shapes the AI functions return. Text is a list of segments: plain strings, or a governed
// value straight from query() that the UI renders as a clickable metric chip. The AI never
// writes a number into a string itself.
import type { QueryResult } from '../semantic/query'

export interface Chip {
  r: QueryResult<unknown>
  /** Optional display override, still opening the same metric card (e.g. a date from a dataset). */
  label?: string
  format?: (v: never) => string
}
export type Segment = string | Chip

export const chip = (r: QueryResult<unknown>, opts: Omit<Chip, 'r'> = {}): Chip => ({ r, ...opts })
export const isChip = (s: Segment): s is Chip => typeof s !== 'string'

/** Distinct metrics a piece of AI output read, for its "Based on:" line. */
export function basedOn(...parts: (Segment[] | Chip[] | undefined)[]): QueryResult<unknown>[] {
  const seen = new Map<string, QueryResult<unknown>>()
  for (const part of parts) for (const s of part ?? []) if (isChip(s) && !seen.has(s.r.metricId)) seen.set(s.r.metricId, s.r)
  return [...seen.values()]
}
