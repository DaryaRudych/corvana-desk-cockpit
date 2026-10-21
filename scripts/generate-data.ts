/**
 * Seeded synthetic data generator for the Corvana Desk Cockpit.
 *
 *   npm run generate-data   →   src/data/*.json
 *
 * Same seed → byte-identical output. Every customer, vessel, barge, IMO number
 * and port is fictional. Times are desk-local (Asia Hub, UTC+08:00) and the demo
 * clock is frozen at DEMO "now" (see meta.json), so the queue is identical on
 * every run.
 *
 * The four demo scenarios (S1–S4 in BUILD_INSTRUCTIONS §7) are seeded on top of
 * random history, then the S1 figures are tuned and asserted at the end.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ───────────────────────────── config ─────────────────────────────

const SEED = 20261020
const TODAY_UTC = Date.UTC(2026, 9, 20) // 2026-10-20, desk-local date of "today"
const TZ = '+08:00'
const NOW_MIN = 9 * 60 // demo clock: 09:00 desk time
const HISTORY_DAYS = 182 // ~6 months

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data')

// ───────────────────────────── rng + helpers ─────────────────────────────

let rngState = SEED
function rand(): number {
  // mulberry32
  rngState = (rngState + 0x6d2b79f5) | 0
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const randInt = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))
const uniform = (lo: number, hi: number) => lo + rand() * (hi - lo)
function normal(mean = 0, sd = 1): number {
  const u = 1 - rand()
  const v = rand()
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]
function weightedPick<T>(xs: readonly T[], weight: (x: T) => number): T {
  const total = xs.reduce((s, x) => s + weight(x), 0)
  let r = rand() * total
  for (const x of xs) {
    r -= weight(x)
    if (r <= 0) return x
  }
  return xs[xs.length - 1]
}
function shuffle<T>(xs: readonly T[]): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const roundTo = (x: number, step: number) => Math.round(x / step) * step
const round2 = (x: number) => Math.round(x * 100) / 100
const round1 = (x: number) => Math.round(x * 10) / 10
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0)
const pad = (n: number, w = 2) => String(n).padStart(w, '0')

/** Day offset from today → YYYY-MM-DD (desk-local). */
const dayStr = (d: number) => new Date(TODAY_UTC + d * 86_400_000).toISOString().slice(0, 10)
/** Minutes from today 00:00 desk time → ISO timestamp with desk offset. */
function ts(min: number): string {
  const d = Math.floor(min / 1440)
  const m = min - d * 1440
  return `${dayStr(d)}T${pad(Math.floor(m / 60))}:${pad(m % 60)}:00${TZ}`
}
const dayOf = (min: number) => Math.floor(min / 1440)

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Seed check failed: ${msg}`)
}

// ───────────────────────────── reference data ─────────────────────────────

type GradeId = 'GRD_VLSFO' | 'GRD_HSFO' | 'GRD_MGO'

interface GradeCfg {
  id: GradeId
  name: string
  today: number
  yesterday?: number
  lo: number
  hi: number
  mix: number
}

const GRADES: GradeCfg[] = [
  { id: 'GRD_VLSFO', name: 'VLSFO', today: 605, yesterday: 601.5, lo: 560, hi: 640, mix: 0.55 },
  { id: 'GRD_HSFO', name: 'HSFO', today: 466.5, lo: 430, hi: 500, mix: 0.25 },
  { id: 'GRD_MGO', name: 'MGO', today: 748.25, lo: 700, hi: 790, mix: 0.2 },
]

interface DeskCfg {
  id: string
  name: string
  region: string
  bu: string
  code: string
  ports: string[]
  stockBase: Record<GradeId, number>
  historyN: number
  openN: number
}

const ASIA: DeskCfg = {
  id: 'DESK_ASIA_HUB',
  name: 'Asia Hub Bunkering Desk',
  region: 'Asia',
  bu: 'BU_ASIA_BUNKERING',
  code: 'AH',
  ports: ['Asia Hub — Eastern Anchorage', 'Asia Hub — Western Anchorage'],
  stockBase: { GRD_VLSFO: 14000, GRD_HSFO: 7000, GRD_MGO: 5000 },
  historyN: 1200,
  openN: 36, // + 4 scenario enquiries = 40 open today
}
const RTM: DeskCfg = {
  id: 'DESK_ROTTERDAM',
  name: 'Rotterdam Bunkering Desk',
  region: 'Europe',
  bu: 'BU_ROTTERDAM_BUNKERING',
  code: 'RB',
  // Port is fictional on purpose (no real port names); only the BU name comes from the brief.
  ports: ['North Sea Hub — Outer Anchorage'],
  stockBase: { GRD_VLSFO: 9000, GRD_HSFO: 5000, GRD_MGO: 3500 },
  historyN: 420,
  openN: 12,
}
const DESKS = [ASIA, RTM]

const BUSINESS_UNITS = [
  { business_unit_id: 'BU_ASIA_BUNKERING', business_unit_name: 'Asia Bunkering' },
  { business_unit_id: 'BU_ROTTERDAM_BUNKERING', business_unit_name: 'Rotterdam Bunkering' },
]

interface Barge {
  barge_id: string
  desk_id: string
  barge_name: string
  capacity_mt: number
  grades_supported: GradeId[]
}

const BARGES: Barge[] = [
  { barge_id: 'BRG-AH-1', desk_id: ASIA.id, barge_name: 'Corvana Tern', capacity_mt: 5000, grades_supported: ['GRD_VLSFO', 'GRD_HSFO'] },
  { barge_id: 'BRG-AH-2', desk_id: ASIA.id, barge_name: 'Corvana Plover', capacity_mt: 3500, grades_supported: ['GRD_VLSFO', 'GRD_MGO'] },
  { barge_id: 'BRG-AH-3', desk_id: ASIA.id, barge_name: 'Corvana Gannet', capacity_mt: 3000, grades_supported: ['GRD_VLSFO', 'GRD_HSFO'] },
  { barge_id: 'BRG-AH-4', desk_id: ASIA.id, barge_name: 'Corvana Petrel', capacity_mt: 2500, grades_supported: ['GRD_MGO'] },
  { barge_id: 'BRG-AH-5', desk_id: ASIA.id, barge_name: 'Corvana Skua', capacity_mt: 2000, grades_supported: ['GRD_VLSFO'] },
  { barge_id: 'BRG-AH-6', desk_id: ASIA.id, barge_name: 'Corvana Auk', capacity_mt: 1200, grades_supported: ['GRD_VLSFO', 'GRD_MGO'] },
  { barge_id: 'BRG-RB-1', desk_id: RTM.id, barge_name: 'Corvana Fulmar', capacity_mt: 4500, grades_supported: ['GRD_VLSFO', 'GRD_HSFO'] },
  { barge_id: 'BRG-RB-2', desk_id: RTM.id, barge_name: 'Corvana Shag', capacity_mt: 3000, grades_supported: ['GRD_VLSFO', 'GRD_MGO'] },
  { barge_id: 'BRG-RB-3', desk_id: RTM.id, barge_name: 'Corvana Eider', capacity_mt: 2500, grades_supported: ['GRD_VLSFO', 'GRD_HSFO'] },
  { barge_id: 'BRG-RB-4', desk_id: RTM.id, barge_name: 'Corvana Murre', capacity_mt: 1500, grades_supported: ['GRD_MGO'] },
]

// [customer_name, parent_group]. First four are the S1–S4 scenario customers.
const CUSTOMER_NAMES: [string, string][] = [
  ['Brannock Shipping', 'Brannock Holdings'], // S1
  ['Saltmarsh Bulk', 'Saltmarsh Group'], // S2
  ['Quillon Marine', 'Quillon Marine'], // S3
  ['Halbrook Lines', 'Halbrook Group'], // S4
  ['Tidewell Carriers', 'Tidewell Group'],
  ['Orrin & Vale Tankers', 'Orrin & Vale'],
  ['Fennick Maritime', 'Fennick Maritime'],
  ['Lowmere Shipping', 'Halbrook Group'],
  ['Corrigan Reef Carriers', 'Corrigan Reef'],
  ['Ashgrove Tankers', 'Tidewell Group'],
  ['Pellucid Lines', 'Pellucid Lines'],
  ['Marrow Point Shipping', 'Marrow Point'],
  ['Veldmoor Maritime', 'Veldmoor'],
  ['Ironsand Bulk', 'Saltmarsh Group'],
  ['Greywater Carriers', 'Greywater'],
  ['Tallis Bay Shipping', 'Tallis Bay'],
  ['Kettlewick Lines', 'Kettlewick'],
  ['Sabledown Marine', 'Sabledown'],
  ['Carrick Fold Tankers', 'Orrin & Vale'],
  ['Wendmoor Shipping', 'Wendmoor'],
  ['Hollis Strand Bulk', 'Hollis Strand'],
  ['Ombrel Line', 'Ombrel'],
  ['Penhallow Carriers', 'Penhallow'],
  ['Ruskin Tide Maritime', 'Ruskin Tide'],
  ['Quarrelhead Shipping', 'Quarrelhead'],
  ['Elsmere Marine', 'Fennick Maritime'],
  ['Drummond Sallow Bulk', 'Drummond Sallow'],
  ['Thistlecombe Tankers', 'Thistlecombe'],
  ['Harrowell Carriers', 'Harrowell'],
  ['Morwenna Shipping', 'Morwenna'],
]

const VESSEL_SUFFIXES = ['Venture', 'Pride', 'Spirit', 'Dawn', 'Horizon', 'Endeavour', 'Crest', 'Harmony', 'Voyager', 'Resolve', 'Tide', 'Lantern']
const VESSEL_TYPES = ['Container ship', 'Bulk carrier', 'Product tanker', 'Crude tanker', 'Car carrier', 'General cargo']
const DECLINE_REASONS = ['price', 'credit', 'compliance', 'no capacity', 'other'] as const
const DECLINE_WEIGHTS: Record<(typeof DECLINE_REASONS)[number], number> = { price: 0.3, credit: 0.25, compliance: 0.05, 'no capacity': 0.25, other: 0.15 }

// ───────────────────────────── market + stock ─────────────────────────────

const PRICE_FROM = -HISTORY_DAYS - 30
const STOCK_FROM = -HISTORY_DAYS - 10

const bench: Record<GradeId, Map<number, number>> = { GRD_VLSFO: new Map(), GRD_HSFO: new Map(), GRD_MGO: new Map() }
for (const g of GRADES) {
  // Walk backwards from today's anchor. Gentle up-drift over the last two weeks keeps
  // today's inventory cost a few dollars under benchmark (plausible desk margins).
  const mid = (g.lo + g.hi) / 2
  let p = g.today
  bench[g.id].set(0, p)
  for (let d = 0; d > PRICE_FROM; d--) {
    if (d === 0 && g.yesterday !== undefined) p = g.yesterday
    else {
      const drift = d > -15 ? -0.4 : (mid - p) * 0.03
      p = clamp(roundTo(p + drift + normal(0, d > -15 ? 2 : 3), 0.25), g.lo + 2, g.hi - 2)
    }
    bench[g.id].set(d - 1, p)
  }
}
const benchOn = (g: GradeId, d: number) => bench[g].get(d)!

const stockCost = new Map<string, number>() // `${desk}|${grade}|${day}` → avg cost
const stockRows: Record<string, unknown>[] = []
for (const desk of DESKS) {
  for (const g of GRADES) {
    const base = desk.stockBase[g.id]
    let s = base
    for (let d = STOCK_FROM; d <= 0; d++) {
      s = clamp(roundTo(s + normal(0, base * 0.04), 10), base * 0.6, base * 1.4)
      // Stock cost tracks the benchmark at about −$2/mt, so the premium is effectively the margin:
      // a careless low quote loses money (today's cost is exactly benchmark − $2).
      const cost = d === 0 ? round2(benchOn(g.id, 0) - 2) : round2(benchOn(g.id, d) - 2 + normal(0, 0.4))
      stockCost.set(`${desk.id}|${g.id}|${d}`, cost)
      stockRows.push({ date: dayStr(d), desk_id: desk.id, grade_id: g.id, stock_mt: s, avg_cost_usd_mt: cost })
    }
  }
}

// ───────────────────────────── customers + vessels ─────────────────────────────

interface Customer {
  id: string
  name: string
  parent: string
  weight: number
  basePremium: number
  rtmPremiumOffset: number
  lateMean: number
  claimProb: number
  terms: number
  tradesRtm: boolean
  vessels: Vessel[]
  creditLimit: number
}
interface Vessel {
  id: string
  name: string
  type: string
  owner: string
  screening: 'PASS' | 'FLAG'
  detail: string
}

/** 7-digit number shaped like an IMO but with a deliberately wrong check digit, so it can't be a real ship. */
function fakeImo(used: Set<string>): string {
  for (;;) {
    const d = [9, ...Array.from({ length: 5 }, () => randInt(0, 9))]
    const check = (d[0] * 7 + d[1] * 6 + d[2] * 5 + d[3] * 4 + d[4] * 3 + d[5] * 2) % 10
    const wrong = (check + randInt(1, 9)) % 10
    const imo = [...d, wrong].join('')
    if (!used.has(imo)) {
      used.add(imo)
      return imo
    }
  }
}

const usedImo = new Set<string>()
const LATE_PAYERS = new Set([9, 17, 24])
const customers: Customer[] = CUSTOMER_NAMES.map(([name, parent], i) => {
  const c: Customer = {
    id: `CUS-${pad(i + 1, 3)}`,
    name,
    parent,
    weight: uniform(0.6, 1.25),
    basePremium: roundTo(clamp(normal(9, 1.3), 6.5, 12), 0.5),
    rtmPremiumOffset: roundTo(uniform(2, 5), 0.5),
    lateMean: LATE_PAYERS.has(i) ? randInt(5, 7) : pick([0, 0, 1, 1, 1, 2, 2]),
    claimProb: 0.045,
    terms: pick([30, 30, 30, 30, 30, 30, 30, 15]),
    tradesRtm: rand() < 0.4,
    vessels: [],
    creditLimit: 0,
  }
  const suffixes = shuffle(VESSEL_SUFFIXES).slice(0, 2)
  c.vessels = suffixes.map((s) => ({
    id: fakeImo(usedImo),
    name: `${name.split(' ')[0]} ${s}`,
    type: pick(VESSEL_TYPES),
    owner: c.id,
    screening: 'PASS' as const,
    detail: '',
  }))
  return c
})

const [S1C, S2C, S3C, S4C] = customers
Object.assign(S1C, { weight: 0.75, basePremium: 10, lateMean: 4, claimProb: 0.05, terms: 30, tradesRtm: false, rtmPremiumOffset: 6 })
Object.assign(S2C, { basePremium: 11, lateMean: 1, tradesRtm: false })
Object.assign(S3C, { basePremium: 9, lateMean: 1, tradesRtm: false })
Object.assign(S4C, { weight: 0.6, basePremium: 14, lateMean: 0, claimProb: 0, terms: 30, tradesRtm: false, rtmPremiumOffset: 3 })
const SCENARIO_CUSTOMERS = new Set([S1C.id, S2C.id, S3C.id, S4C.id])

const S3_VESSEL = S3C.vessels[0]
S3_VESSEL.screening = 'FLAG'
for (const c of customers) {
  for (const v of c.vessels) {
    if (v.screening === 'PASS') v.detail = `No matches against group sanctions lists. Last screened ${dayStr(-randInt(1, 30))}.`
  }
}
S3_VESSEL.detail =
  'Possible match: the registered manager shares a director with an entity on a group sanctions list. ' +
  `Case GC-2026-0417 opened by Group Compliance on ${dayStr(-2)}; under review.`

const tradableVessels = (c: Customer) => c.vessels.filter((v) => v.screening === 'PASS')

// ───────────────────────────── transactional drafts ─────────────────────────────

type Action = 'quote' | 'counter' | 'decline'
interface Enq {
  desk: DeskCfg
  customer: Customer
  vessel: Vessel
  grade: GradeId
  port: string
  qty: number
  winStart: number
  winEnd: number
  etaMin: number
  recMin: number
  dueMin: number
  status: 'open' | 'quoted' | 'countered' | 'declined'
  action: Action | null
  premium: number | null
  outcome: 'won' | 'lost' | 'open'
  reason: string | null
  id?: string
}
interface Deal {
  enq: Enq
  desk: DeskCfg
  customer: Customer
  grade: GradeId
  qty: number
  premium: number
  benchAtContract: number
  price: number
  cost: number
  barging: number
  day: number
  barge: Barge
  slotStart: number
  slotEnd: number
  delivery: Delivery | null
  invoice: Invoice | null
  id?: string
}
interface Delivery {
  deal: Deal
  qty: number
  atMin: number
  claimQty: number
}
interface Invoice {
  deal: Deal
  dueDay: number
  paidDay: number | null
}

const enquiries: Enq[] = []
const deals: Deal[] = []
const booked = new Map<string, Deal>() // `${barge}|${day}` → deal (one delivery per barge per day)
const reserved = new Set<string>() // slots kept free for the demo scenarios
const key = (bargeId: string, day: number) => `${bargeId}|${day}`

function findSlot(desk: DeskCfg, grade: GradeId, qty: number, days: number[]): { barge: Barge; day: number } | null {
  for (const day of days) {
    for (const barge of shuffle(BARGES.filter((b) => b.desk_id === desk.id))) {
      const k = key(barge.barge_id, day)
      if (barge.grades_supported.includes(grade) && barge.capacity_mt >= qty && !booked.has(k) && !reserved.has(k)) return { barge, day }
    }
  }
  return null
}

function closeAsWon(enq: Enq, action: 'quote' | 'counter', premium: number, qty: number, barge: Barge, day: number, priceOverride?: number): Deal {
  enq.action = action
  enq.status = action === 'quote' ? 'quoted' : 'countered'
  enq.premium = premium
  enq.outcome = 'won'
  const recDay = dayOf(enq.recMin)
  const b = benchOn(enq.grade, recDay)
  const price = priceOverride ?? round2(b + premium)
  const slotStart = day * 1440 + randInt(6, 12) * 60
  const deal: Deal = {
    enq,
    desk: enq.desk,
    customer: enq.customer,
    grade: enq.grade,
    qty,
    premium: round2(price - b),
    benchAtContract: b,
    price,
    cost: stockCost.get(`${enq.desk.id}|${enq.grade}|${recDay}`)!,
    barging: round2(qty * uniform(1.5, 3)),
    day,
    barge,
    slotStart,
    slotEnd: slotStart + (4 + Math.ceil(qty / 500)) * 60,
    delivery: null,
    invoice: null,
  }
  booked.set(key(barge.barge_id, day), deal)
  deals.push(deal)
  if (day < 0) {
    // Delivered: delivery + invoice.
    const delivered = round1(qty * uniform(0.985, 1.005))
    const claim = rand() < enq.customer.claimProb ? round1(delivered * uniform(0.005, 0.03)) : 0
    deal.delivery = { deal, qty: delivered, atMin: deal.slotEnd, claimQty: claim }
    const dueDay = day + enq.customer.terms
    const paid = dueDay + clamp(Math.round(normal(enq.customer.lateMean, 1.5)), -3, 15)
    deal.invoice = { deal, dueDay, paidDay: paid < 0 ? paid : null }
  }
  return deal
}

function closeAsDeclined(enq: Enq, reason: string): void {
  enq.action = 'decline'
  enq.status = 'declined'
  enq.premium = null
  enq.outcome = 'lost'
  enq.reason = reason
}

function pickGrade(): GradeId {
  return weightedPick(GRADES, (g) => g.mix).id
}
const pickQty = () => roundTo(300 + 2700 * rand() ** 1.6, 50)

function newEnquiry(desk: DeskCfg, customer: Customer, recMin: number, opts: Partial<Enq> = {}): Enq {
  const recDay = dayOf(recMin)
  const winStart = opts.winStart ?? recDay + randInt(2, 10)
  const winEnd = opts.winEnd ?? winStart + randInt(0, 2)
  const lateEta = rand() < 0.08
  const etaMin = lateEta ? (winStart + 1) * 1440 + randInt(6, 18) * 60 : (winStart - randInt(0, 1)) * 1440 + randInt(0, 22) * 60
  const enq: Enq = {
    desk,
    customer,
    vessel: pick(tradableVessels(customer)),
    grade: pickGrade(),
    port: pick(desk.ports),
    qty: pickQty(),
    winStart,
    winEnd,
    etaMin,
    recMin,
    dueMin: recMin + randInt(3 * 60, 5 * 60),
    status: 'open',
    action: null,
    premium: null,
    outcome: 'open',
    reason: null,
    ...opts,
  }
  enquiries.push(enq)
  return enq
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

// ───────────────────────────── scenario slot reservations ─────────────────────────────

// Scenario windows (day offsets from today).
const S1_WIN = [5, 6] as const
const S2_DAY = 4
const S4_WIN = [3, 4] as const

// S2: both HSFO-capable barges (Tern, Gannet) booked on D and D+1, Tern also on D+2; Gannet free on D+2.
const S2_MUST_BOOK: [string, number][] = [
  ['BRG-AH-1', S2_DAY],
  ['BRG-AH-3', S2_DAY],
  ['BRG-AH-1', S2_DAY + 1],
  ['BRG-AH-3', S2_DAY + 1],
  ['BRG-AH-1', S2_DAY + 2],
]
reserved.add(key('BRG-AH-3', S2_DAY + 2))
// S1 and S4 must have a barge free in their windows.
reserved.add(key('BRG-AH-2', S1_WIN[0]))
reserved.add(key('BRG-AH-5', S4_WIN[0]))

// ───────────────────────────── history ─────────────────────────────

function generateHistory(desk: DeskCfg, pool: Customer[]): void {
  const drafts: Enq[] = []
  for (let i = 0; i < desk.historyN; i++) {
    const c = weightedPick(pool, (x) => x.weight)
    const recMin = randInt(-HISTORY_DAYS, -1) * 1440 + randInt(6 * 60, 18 * 60)
    drafts.push(newEnquiry(desk, c, recMin))
  }
  drafts.sort((a, b) => a.recMin - b.recMin)
  for (const enq of drafts) {
    if (rand() < 0.18) {
      closeAsDeclined(enq, weightedPick(DECLINE_REASONS, (r) => DECLINE_WEIGHTS[r]))
      continue
    }
    const action: 'quote' | 'counter' = rand() < 0.8 ? 'quote' : 'counter'
    const base = enq.customer.basePremium + (desk === RTM ? enq.customer.rtmPremiumOffset : 0)
    const sizeAdj = enq.qty < 800 ? 1 : enq.qty > 2000 ? -1 : 0
    // Customers accept up to roughly their usual premium; above it, wins fall off quickly.
    // Losses therefore sit mostly above the won band, so "lowest lost" is a real price signal.
    const premium = clamp(roundTo(base + sizeAdj + normal(0, 1.6), 0.5), 3, 20)
    const winP = (1 / (1 + Math.exp((premium - (base + sizeAdj + 0.8)) / 0.45))) * (action === 'counter' ? 0.8 : 1)
    if (rand() >= winP) {
      enq.action = action
      enq.status = action === 'quote' ? 'quoted' : 'countered'
      enq.premium = premium
      enq.outcome = 'lost'
      continue
    }
    const qty = action === 'counter' ? Math.max(300, roundTo(enq.qty * 0.75, 50)) : enq.qty
    const slot = findSlot(desk, enq.grade, qty, range(enq.winStart, enq.winEnd))
    if (!slot) {
      closeAsDeclined(enq, 'no capacity')
      continue
    }
    closeAsWon(enq, action, premium, qty, slot.barge, slot.day)
  }
}

const genericPool = customers.filter((c) => c !== S3C) // S3's flagged vessel never trades in history
generateHistory(ASIA, genericPool)
generateHistory(
  RTM,
  customers.filter((c) => c.tradesRtm),
)

// S1 also trades with Rotterdam, at different (higher) premiums — the data the AI must refuse to reveal.
for (let i = 0; i < 8; i++) {
  const recMin = randInt(-175, -75) * 1440 + randInt(7 * 60, 17 * 60)
  const enq = newEnquiry(RTM, S1C, recMin, { grade: i % 3 === 2 ? 'GRD_HSFO' : 'GRD_VLSFO', qty: roundTo(uniform(700, 1800), 50) })
  const premium = clamp(roundTo(normal(S1C.basePremium + S1C.rtmPremiumOffset, 1.2), 0.5), 3, 20)
  if (i === 7) {
    enq.action = 'quote'
    enq.status = 'quoted'
    enq.premium = premium + 1.5
    enq.outcome = 'lost'
    continue
  }
  const slot = findSlot(RTM, enq.grade, enq.qty, range(enq.winStart, enq.winEnd + 3))
  assert(slot !== null, 'S1 Rotterdam history needs a barge')
  closeAsWon(enq, 'quote', premium, enq.qty, slot!.barge, slot!.day)
}

// S2 fillers: make sure the required barge-days are booked by real deals.
for (const [bargeId, day] of S2_MUST_BOOK) {
  if (booked.has(key(bargeId, day))) continue
  const barge = BARGES.find((b) => b.barge_id === bargeId)!
  const c = pick(customers.filter((x) => !SCENARIO_CUSTOMERS.has(x.id)))
  const recMin = randInt(-7, -2) * 1440 + randInt(7 * 60, 17 * 60)
  const winStart = day - randInt(0, 1)
  const enq = newEnquiry(ASIA, c, recMin, {
    grade: pick(['GRD_HSFO', 'GRD_VLSFO'] as GradeId[]),
    qty: roundTo(uniform(600, 2500), 50),
    winStart,
    winEnd: Math.max(day, winStart + randInt(0, 2)),
  })
  closeAsWon(enq, 'quote', clamp(roundTo(normal(c.basePremium, 1.5), 0.5), 3, 20), enq.qty, barge, day)
}

// ───────────────────────────── metric helpers (mirror the brief's rules) ─────────────────────────────

const deskDeals = (desk: DeskCfg) => deals.filter((d) => d.desk === desk)
const custDeals = (desk: DeskCfg, c: Customer) => deskDeals(desk).filter((d) => d.customer === c)
const invoiceAmount = (inv: Invoice) => round2(inv.deal.delivery!.qty * inv.deal.price)

function exposure(desk: DeskCfg, c: Customer): number {
  let e = 0
  for (const d of custDeals(desk, c)) {
    if (!d.delivery) e += d.qty * d.price // contracted, not delivered
    else if (d.invoice && d.invoice.paidDay === null) e += invoiceAmount(d.invoice) // unpaid invoice
  }
  return round2(e)
}
function avgDaysPastDue(desk: DeskCfg, c: Customer): number {
  const dpd = custDeals(desk, c)
    .map((d) => d.invoice)
    .filter((i): i is Invoice => i !== null && i.dueDay <= 0 && i.dueDay > -365)
    .map((i) => Math.max(0, (i.paidDay ?? 0) - i.dueDay))
  return mean(dpd)
}
function claimShare(ds: Deal[]): number {
  const del = ds.map((d) => d.delivery).filter((x): x is Delivery => x !== null)
  return sum(del.map((x) => x.claimQty)) / sum(del.map((x) => x.qty))
}
const avgPremium = (ds: Deal[]) => mean(ds.map((d) => d.premium))
const groupExposure = (c: Customer) => round2(exposure(ASIA, c) + exposure(RTM, c))

// ───────────────────────────── today's open enquiries ─────────────────────────────

// A vessel sends one enquiry a day (two at most, for different grades), across both desks.
const openGradesByVessel = new Map<string, GradeId[]>()
function generateOpen(desk: DeskCfg, pool: Customer[]): void {
  for (let i = 0; i < desk.openN; i++) {
    const dueMin = NOW_MIN + randInt(150, 600)
    const recMin = Math.min(NOW_MIN - randInt(5, 60), dueMin - randInt(4 * 60, 8 * 60))
    const pairs = pool.flatMap((c) => tradableVessels(c).map((v) => ({ c, v })))
    const fresh = pairs.filter((x) => !openGradesByVessel.has(x.v.id))
    const second = pairs.filter((x) => openGradesByVessel.get(x.v.id)?.length === 1)
    const { c, v } = fresh.length ? pick(fresh) : pick(second)
    const used = openGradesByVessel.get(v.id) ?? []
    const grade = weightedPick(
      GRADES.filter((g) => !used.includes(g.id)),
      (g) => g.mix,
    ).id
    openGradesByVessel.set(v.id, [...used, grade])
    newEnquiry(desk, c, recMin, { dueMin, vessel: v, grade })
  }
}
// Keep customers already near a $10M limit out of today's queue, so S1 stays the credit story.
generateOpen(
  ASIA,
  customers.filter((c) => !SCENARIO_CUSTOMERS.has(c.id) && groupExposure(c) < 6_000_000),
)
generateOpen(
  RTM,
  customers.filter((c) => c.tradesRtm),
)

// Scenario enquiries (BUILD_INSTRUCTIONS §7).
const S1 = newEnquiry(ASIA, S1C, NOW_MIN - 110, {
  vessel: S1C.vessels[0],
  grade: 'GRD_VLSFO',
  qty: 1500,
  port: ASIA.ports[0],
  winStart: S1_WIN[0],
  winEnd: S1_WIN[1],
  etaMin: (S1_WIN[0] - 1) * 1440 + 22 * 60,
  dueMin: NOW_MIN + 130, // 2h 10m
})
const S2 = newEnquiry(ASIA, S2C, NOW_MIN - 75, {
  vessel: S2C.vessels[0],
  grade: 'GRD_HSFO',
  qty: 800,
  port: ASIA.ports[1],
  winStart: S2_DAY,
  winEnd: S2_DAY,
  etaMin: (S2_DAY - 1) * 1440 + 18 * 60,
  dueMin: NOW_MIN + 165, // 2h 45m
})
const S3 = newEnquiry(ASIA, S3C, NOW_MIN - 140, {
  vessel: S3_VESSEL,
  grade: 'GRD_MGO',
  qty: 2000,
  port: ASIA.ports[0],
  winStart: 6,
  winEnd: 7,
  etaMin: 5 * 1440 + 20 * 60,
  dueMin: NOW_MIN + 95, // urgent, but blocked → sorts last anyway
})
const S4 = newEnquiry(ASIA, S4C, NOW_MIN - 185, {
  vessel: S4C.vessels[0],
  grade: 'GRD_VLSFO',
  qty: 1200,
  port: ASIA.ports[1],
  winStart: S4_WIN[0],
  winEnd: S4_WIN[1],
  etaMin: (S4_WIN[0] - 1) * 1440 + 21 * 60,
  dueMin: NOW_MIN + 55, // under 1h → red in the queue
})

// ───────────────────────────── S1 tuning ─────────────────────────────

// (a) Days past due ≈ 4. Only shift invoices paid well in the past, so they stay paid.
{
  const invs = custDeals(ASIA, S1C)
    .map((d) => d.invoice)
    .filter((i): i is Invoice => i !== null && i.paidDay !== null && i.paidDay <= -10)
  assert(invs.length > 0, 'S1 needs paid invoices to tune DPD')
  const tol = 0.5 / Math.max(1, custDeals(ASIA, S1C).filter((d) => d.invoice && d.invoice.dueDay <= 0).length)
  for (let guard = 0; guard < 500; guard++) {
    const m = avgDaysPastDue(ASIA, S1C)
    if (Math.abs(m - 4) <= tol) break
    const inv = invs[guard % invs.length]
    if (m < 4 && inv.paidDay! + 1 <= -2) inv.paidDay = inv.paidDay! + 1
    if (m > 4 && inv.paidDay! - 1 >= inv.dueDay - 3) inv.paidDay = inv.paidDay! - 1
  }
}

// (b) Claim share exactly 3× the desk average (desk average includes S1 itself).
{
  const s1Del = custDeals(ASIA, S1C)
    .map((d) => d.delivery)
    .filter((x): x is Delivery => x !== null)
  for (const x of s1Del) x.claimQty = 0
  const others = deskDeals(ASIA)
    .filter((d) => d.customer !== S1C)
    .map((d) => d.delivery)
    .filter((x): x is Delivery => x !== null)
  const Co = sum(others.map((x) => x.claimQty))
  const Do = sum(others.map((x) => x.qty))
  const Ds = sum(s1Del.map((x) => x.qty))
  const Cs = (3 * Ds * Co) / (Do - 2 * Ds)
  const claimed = s1Del.slice(0, 3)
  const shares = [0.45, 0.35, 0.2]
  claimed.forEach((x, i) => (x.claimQty = round1(Cs * shares[i])))
}

// (c) Group exposure: $3.92M Asia + $0.40M Rotterdam, balanced with contracted-not-delivered deals.
function balanceExposure(c: Customer, desk: DeskCfg, target: number, recDays: [number, number], deliveryDays: number[]): void {
  let gap = round2(target - exposure(desk, c))
  assert(gap >= 370_000, `${desk.code} ${c.name} exposure from history is too close to target (gap ${gap})`)
  const base = c.basePremium + (desk === RTM ? c.rtmPremiumOffset : 0)
  const usedDays = new Set<number>()
  const premiums = range(-8, 8).map((k) => base + k * 0.25) // $0.25 steps around the customer's usual premium
  const qtys = range(6, 50).map((k) => k * 50) // 300–2,500 mt in round 50 mt steps

  const book = (qty: number, premium: number, recMin: number, vessel: Vessel) => {
    const slot = findSlot(desk, 'GRD_VLSFO', qty, shuffle(deliveryDays.filter((d) => !usedDays.has(d))))
    assert(slot !== null, `${desk.code} ${c.name} balancing deal needs a barge`)
    usedDays.add(slot!.day)
    const enq = newEnquiry(desk, c, recMin, { vessel, grade: 'GRD_VLSFO', qty, winStart: slot!.day, winEnd: slot!.day + 1 })
    closeAsWon(enq, 'quote', premium, qty, slot!.barge, slot!.day)
    gap = round2(gap - qty * round2(benchOn('GRD_VLSFO', dayOf(recMin)) + premium))
  }
  const rec = () => randInt(recDays[0], recDays[1]) * 1440 + randInt(8 * 60, 16 * 60)

  // Large gaps: one ordinary round deal first.
  while (gap > 2_600_000) {
    const r = rec()
    book(roundTo(uniform(1_200, 1_800), 50), roundTo(base, 0.25), r, pick(c.vessels))
  }
  // Last two deals: round quantities and premiums whose combined value lands on the target.
  const r1 = rec()
  const r2 = rec()
  const b1 = benchOn('GRD_VLSFO', dayOf(r1))
  const b2 = benchOn('GRD_VLSFO', dayOf(r2))
  let best = { d: Infinity, q1: 0, p1: 0, q2: 0, p2: 0 }
  for (const q1 of qtys)
    for (const p1 of premiums) {
      const v1 = q1 * round2(b1 + p1)
      if (v1 >= gap) break
      for (const q2 of qtys) {
        if (q2 === q1) continue // two different-looking orders
        for (const p2 of premiums) {
          const d = Math.abs(gap - v1 - q2 * round2(b2 + p2))
          if (d < best.d) best = { d, q1, p1, q2, p2 }
        }
      }
    }
  book(best.q1, best.p1, r1, c.vessels[0])
  book(best.q2, best.p2, r2, c.vessels[1])
}
balanceExposure(S1C, ASIA, 3_920_000, [-6, -2], [1, 2, 3, 7, 8, 9])
balanceExposure(S1C, RTM, 400_000, [-5, -3], [2, 3, 4])
// S4 (the queue's first enquiry) also trades with Rotterdam, so its restricted "other BUs" line
// carries a real amount: own BU $5.21M + other BUs $2.40M = $7.61M group exposure.
balanceExposure(S4C, ASIA, 5_210_000, [-6, -2], [1, 2, 5, 6, 8])
balanceExposure(S4C, RTM, 2_400_000, [-6, -2], [1, 2, 3, 4, 5, 6])

// (d) S1 average premium = $10.00 so the suggested premium is exactly $13.00. Touch paid deals only.
{
  const ds = custDeals(ASIA, S1C)
  const adjustable = ds.filter((d) => d.invoice?.paidDay != null)
  let steps = Math.round((10 * ds.length - sum(ds.map((d) => d.premium))) / 0.5)
  for (let i = 0; steps !== 0 && i < 1000; i++) {
    const d = adjustable[i % adjustable.length]
    const next = d.premium + Math.sign(steps) * 0.5
    if (next < 3 || next > 20) continue
    d.premium = next
    d.price = round2(d.benchAtContract + next)
    d.enq.premium = next
    steps -= Math.sign(steps)
  }
}

// ───────────────────────────── credit limits ─────────────────────────────

for (const c of customers) {
  if (c === S1C) {
    c.creditLimit = 5_000_000
    continue
  }
  const openValues = enquiries
    .filter((e) => e.customer === c && e.status === 'open')
    .map((e) => e.qty * (benchOn(e.grade, 0) + c.basePremium + 4))
  const need = (groupExposure(c) + Math.max(0, ...openValues)) * 1.2
  const limit = roundTo(uniform(1_000_000, 10_000_000), 500_000)
  c.creditLimit = Math.min(10_000_000, limit >= need ? limit : Math.ceil(need / 500_000) * 500_000)
}

// ───────────────────────────── seed checks ─────────────────────────────

const deskClaim = claimShare(deskDeals(ASIA))
const deskPrem = avgPremium(deskDeals(ASIA))
const suggestedPremium = (c: Customer) => {
  const ds = custDeals(ASIA, c)
  let p = ds.length < 5 ? deskPrem : avgPremium(ds)
  if (claimShare(ds) > 2 * deskClaim) p += 2
  if (avgDaysPastDue(ASIA, c) > 3) p += 1
  return roundTo(p, 0.5)
}
const latestCost = (g: GradeId) => stockCost.get(`${ASIA.id}|${g}|0`)!
const deskBargingPerMt = sum(deskDeals(ASIA).map((d) => d.barging)) / sum(deskDeals(ASIA).map((d) => d.qty))
const marginPerMt = (e: Enq, premium: number) => benchOn(e.grade, 0) + premium - latestCost(e.grade) - deskBargingPerMt
const freeBarges = (e: Enq, day: number) =>
  BARGES.filter((b) => b.desk_id === ASIA.id && b.grades_supported.includes(e.grade) && b.capacity_mt >= e.qty && !booked.has(key(b.barge_id, day)))

const s1Prem = suggestedPremium(S1C)
const s1Price = benchOn('GRD_VLSFO', 0) + s1Prem
const s1Asia = exposure(ASIA, S1C)
const s1Rtm = exposure(RTM, S1C)
const s1Headroom = S1C.creditLimit - s1Asia - s1Rtm
const s1Checks = {
  benchmark: benchOn('GRD_VLSFO', 0),
  benchmarkYesterday: benchOn('GRD_VLSFO', -1),
  avgPremium: round2(avgPremium(custDeals(ASIA, S1C))),
  deals: custDeals(ASIA, S1C).length,
  claimRatio: round2(claimShare(custDeals(ASIA, S1C)) / deskClaim),
  dpd: round2(avgDaysPastDue(ASIA, S1C)),
  suggestedPremium: s1Prem,
  price: s1Price,
  exposureAsia: s1Asia,
  exposureRtm: s1Rtm,
  headroomBefore: round2(s1Headroom),
  dealValue: 1500 * s1Price,
  headroomAfter: round2(s1Headroom - 1500 * s1Price),
  maxQty: Math.floor(s1Headroom / s1Price),
  marginPerMt: round2(marginPerMt(S1, s1Prem)),
  freeBargesInWindow: S1_WIN.map((d) => freeBarges(S1, d).length),
}
assert(s1Checks.benchmark === 605, 'VLSFO benchmark today = 605')
assert(s1Checks.deals >= 5, 'S1 needs ≥5 Asia deals')
assert(Math.abs(s1Checks.avgPremium - 10) < 0.25, `S1 avg premium ≈ 10 (got ${s1Checks.avgPremium})`)
assert(Math.abs(s1Checks.claimRatio - 3) < 0.15, `S1 claim share ≈ 3× desk (got ${s1Checks.claimRatio})`)
assert(s1Checks.dpd > 3 && s1Checks.dpd < 5, `S1 DPD ≈ 4 (got ${s1Checks.dpd})`)
assert(s1Prem === 13, `S1 suggested premium = 13 (got ${s1Prem})`)
assert(Math.abs(s1Asia - 3_920_000) < 500, `S1 Asia exposure = 3.92M (got ${s1Asia})`)
assert(Math.abs(s1Rtm - 400_000) < 500, `S1 Rotterdam exposure = 0.40M (got ${s1Rtm})`)
assert(s1Checks.maxQty === 1100, `S1 max quantity = 1100 (got ${s1Checks.maxQty})`)
assert(s1Checks.marginPerMt >= 3, 'S1 margin ≥ $3/mt')
assert(s1Checks.freeBargesInWindow.some((n) => n > 0), 'S1 has a free barge in window')

const s2Free = range(S2_DAY - 3, S2_DAY + 3).map((d) => ({ day: dayStr(d), free: freeBarges(S2, d).map((b) => b.barge_name) }))
assert(freeBarges(S2, S2_DAY).length === 0, 'S2: no HSFO barge on requested day')
assert(freeBarges(S2, S2_DAY + 1).length === 0, 'S2: no HSFO barge on D+1')
assert(freeBarges(S2, S2_DAY + 2).length === 1, 'S2: exactly one HSFO barge free on D+2')
assert(groupExposure(S2C) + 800 * (benchOn('GRD_HSFO', 0) + suggestedPremium(S2C)) < S2C.creditLimit, 'S2 credit fine')
assert(marginPerMt(S2, suggestedPremium(S2C)) >= 3, `S2 margin ≥ $3/mt (got ${round2(marginPerMt(S2, suggestedPremium(S2C)))})`)

const s4Prem = suggestedPremium(S4C)
assert(avgPremium(custDeals(ASIA, S4C)) > deskPrem + 2, 'S4 premium well above desk average')
assert(s4Prem === roundTo(avgPremium(custDeals(ASIA, S4C)), 0.5), 'S4 has no premium adjustments')
assert(custDeals(ASIA, S4C).length >= 5, 'S4 needs ≥5 deals')
assert(groupExposure(S4C) + 1200 * (605 + s4Prem) < S4C.creditLimit, 'S4 credit fine')
assert(S4_WIN.some((d) => freeBarges(S4, d).length > 0), 'S4 has a free barge')
assert(marginPerMt(S4, s4Prem) >= 3, 'S4 margin ≥ $3/mt')

assert(S3_VESSEL.screening === 'FLAG', 'S3 vessel flagged')
assert(Math.abs(exposure(ASIA, S4C) - 5_210_000) < 500 && Math.abs(exposure(RTM, S4C) - 2_400_000) < 500, `S4 exposure split $5.21M + $2.40M (got ${exposure(ASIA, S4C)} + ${exposure(RTM, S4C)})`)

// ───────────────────────────── assign ids ─────────────────────────────

for (const desk of DESKS) {
  enquiries
    .filter((e) => e.desk === desk)
    .sort((a, b) => a.recMin - b.recMin)
    .forEach((e, i) => (e.id = `ENQ-${desk.code}-${pad(i + 1, 5)}`))
  deskDeals(desk)
    .sort((a, b) => a.enq.recMin - b.enq.recMin)
    .forEach((d, i) => (d.id = `DL-${desk.code}-${pad(i + 1, 5)}`))
}

// ───────────────────────────── rows ─────────────────────────────

const sortedDeals = [...deals].sort((a, b) => a.id!.localeCompare(b.id!))

const tables: Record<string, unknown[]> = {
  dim_business_unit: BUSINESS_UNITS,
  dim_desk: DESKS.map((d) => ({ desk_id: d.id, desk_name: d.name, region: d.region, business_unit_id: d.bu })),
  dim_customer: customers.map((c) => ({
    customer_id: c.id,
    customer_name: c.name,
    parent_group: c.parent,
    credit_limit_usd: c.creditLimit,
    payment_terms_days: c.terms,
    kyc_status: 'PASS',
    kyc_detail: `Standard due diligence completed ${dayStr(-randInt(30, 300))}; beneficial owners verified; no adverse media.`,
  })),
  dim_vessel: customers.flatMap((c) =>
    c.vessels.map((v) => ({
      vessel_id: v.id,
      vessel_name: v.name,
      vessel_type: v.type,
      owner_customer_id: v.owner,
      screening_status: v.screening,
      screening_detail: v.detail,
    })),
  ),
  dim_grade: GRADES.map((g) => ({ grade_id: g.id, grade_name: g.name })),
  dim_barge: BARGES,
  fct_market_price: GRADES.flatMap((g) =>
    range(PRICE_FROM, 0).map((d) => ({ date: dayStr(d), grade_id: g.id, benchmark_usd_mt: benchOn(g.id, d) })),
  ),
  agg_customer_exposure: customers.map((c) => ({ customer_id: c.id, as_of_date: dayStr(0), group_exposure_usd: groupExposure(c) })),
  fct_enquiry: [...enquiries]
    .sort((a, b) => a.id!.localeCompare(b.id!))
    .map((e) => ({
      enquiry_id: e.id,
      desk_id: e.desk.id,
      customer_id: e.customer.id,
      vessel_id: e.vessel.id,
      grade_id: e.grade,
      port: e.port,
      quantity_mt: e.qty,
      window_start: dayStr(e.winStart),
      window_end: dayStr(e.winEnd),
      vessel_eta: ts(e.etaMin),
      received_at: ts(e.recMin),
      quote_due_at: ts(e.dueMin),
      status: e.status,
      action: e.action,
      quoted_premium_usd_mt: e.premium,
      outcome: e.outcome,
      decline_reason: e.reason,
    })),
  fct_deal: sortedDeals.map((d) => ({
    deal_id: d.id,
    enquiry_id: d.enq.id,
    desk_id: d.desk.id,
    customer_id: d.customer.id,
    grade_id: d.grade,
    quantity_mt: d.qty,
    price_usd_mt: d.price,
    premium_usd_mt: d.premium,
    cost_usd_mt: d.cost,
    barging_cost_usd: d.barging,
    delivery_date: dayStr(d.day),
  })),
  fct_delivery: sortedDeals
    .filter((d) => d.delivery)
    .map((d, i) => ({
      delivery_id: `DV-${d.desk.code}-${pad(i + 1, 5)}`,
      deal_id: d.id,
      barge_id: d.barge.barge_id,
      delivered_qty_mt: d.delivery!.qty,
      delivered_at: ts(d.delivery!.atMin),
      claim_flag: d.delivery!.claimQty > 0,
      claim_qty_mt: d.delivery!.claimQty,
      claim_amount_usd: round2(d.delivery!.claimQty * d.price),
    })),
  fct_invoice: sortedDeals
    .filter((d) => d.invoice)
    .map((d, i) => ({
      invoice_id: `INV-${d.desk.code}-${pad(i + 1, 5)}`,
      deal_id: d.id,
      desk_id: d.desk.id,
      customer_id: d.customer.id,
      amount_usd: invoiceAmount(d.invoice!),
      due_date: dayStr(d.invoice!.dueDay),
      paid_date: d.invoice!.paidDay === null ? null : dayStr(d.invoice!.paidDay),
    })),
  fct_barge_schedule: sortedDeals.map((d, i) => ({
    slot_id: `SL-${pad(i + 1, 5)}`,
    barge_id: d.barge.barge_id,
    slot_start: ts(d.slotStart),
    slot_end: ts(d.slotEnd),
    deal_id: d.id,
  })),
  fct_stock: stockRows,
}

// ───────────────────────────── write ─────────────────────────────

mkdirSync(OUT_DIR, { recursive: true })
const write = (name: string, data: unknown) => {
  const body = Array.isArray(data) ? `[\n${data.map((r) => JSON.stringify(r)).join(',\n')}\n]\n` : `${JSON.stringify(data, null, 2)}\n`
  writeFileSync(join(OUT_DIR, `${name}.json`), body)
}
for (const [name, rows] of Object.entries(tables)) write(name, rows)
write('meta', {
  seed: SEED,
  now: ts(NOW_MIN),
  timezone: TZ,
  note: 'Demo clock is frozen at `now`. Scenario ids are for docs/tests only; the app must not special-case them.',
  scenarios: { S1: S1.id, S2: S2.id, S3: S3.id, S4: S4.id },
})

// ───────────────────────────── summary ─────────────────────────────

const countBy = <T>(xs: T[], f: (x: T) => string) => xs.reduce<Record<string, number>>((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {})
for (const desk of DESKS) {
  const es = enquiries.filter((e) => e.desk === desk)
  console.log(`${desk.code}: ${es.length} enquiries`, countBy(es, (e) => e.status), `| deals ${deskDeals(desk).length}`)
}
console.log('Asia desk avg premium', round2(deskPrem), '| desk claim share', (deskClaim * 100).toFixed(3) + '%', '| barging/mt', round2(deskBargingPerMt))
console.log('S1', s1Checks)
console.log('S2 free HSFO barges by day', s2Free)
console.log('S4 suggested premium', s4Prem, '| margin/mt', round2(marginPerMt(S4, s4Prem)))
const tight = enquiries
  .filter((e) => e.desk === ASIA && e.status === 'open' && e !== S1)
  .filter((e) => e.customer.creditLimit - groupExposure(e.customer) < e.qty * (benchOn(e.grade, 0) + e.customer.basePremium + 4))
  .map((e) => e.customer.name)
console.log('Other open Asia enquiries likely short on credit:', tight)
console.log(`Wrote ${Object.keys(tables).length + 1} files to src/data/`)
