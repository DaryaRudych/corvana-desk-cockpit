# Corvana Desk Cockpit

A browser prototype for a pre-sales demo: analytics inside a bunkering trader's own app, on governed data. One enquiry decision, end to end, entered from a ranked queue: **can we trade → can we deliver → what price → act**.

**Live:** https://corvana-desk-cockpit.vercel.app

The point it makes: the cockpit, the AI and any other screen use **one set of metric definitions** and **one set of permissions**. All data is synthetic and fictional (Corvana, customers, vessels, barges, IMO numbers and ports).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build to dist/
npm run preview    # serve the production build
```

Requires Node 22.6+ (the data generator runs TypeScript directly with `--experimental-strip-types`). Desktop only, 1280 px wide or more.

## Regenerate the data

```bash
npm run generate-data
```

`scripts/generate-data.ts` writes every table in `src/data/*.json` from a fixed seed, so the output is byte-identical on every run and the demo shows the same queue on every reload. It generates six months of history for two business units (Asia Bunkering, the user's; Rotterdam Bunkering, which exists to show the permission boundary), seeds the four demo scenarios on top, tunes the S1 figures, and **fails if any scenario figure drifts** (S1 headroom $680k → max 1,100 mt, $13 premium, S2's barge gap, S4's margin, …). The demo clock is frozen at 20 Oct 2026, 09:00 desk time (`meta.json`).

## How it is built

```
scripts/generate-data.ts     seeded synthetic data → src/data/*.json (committed)
src/semantic/
  warehouse.ts               raw tables; imported only by permissions.ts
  permissions.ts             user context, row-level (by BU) and object-level (by role) rules
  metrics.ts                 metric registry: definition, formula, owner, certification, lineage, roles, compute
  query.ts                   query(metricId, params, user): the ONLY read path for UI and AI
  actions.ts                 submitResponse(): the ONLY write path (quote / counter / decline)
src/ai/                      enquiry brief, Ask intents, draft message; read only through query()
src/components/              queue, enquiry header, the three decision cards, AI summary, Ask drawer,
                             action bar, metric card, Definitions & access drawer
```

- **Governed reads.** `query()` filters BU-owned tables to the user's business unit and hides compliance detail from traders *before* any metric computes. Asking for another BU's data returns the restriction message instead of a value.
- **Governed writes.** Quote, counter and decline go through `submitResponse()`, with the same scope check. It refuses responses on a compliance flag and double sends. Responses live in memory until reload (no backend).
- **Deterministic AI.** The AI summary, Ask answers and draft messages are templates over `query()` results. Every figure is a governed value rendered as a clickable chip, and each answer lists its sources. A question about another BU is turned into a `query()` for that BU, so the refusal comes from the permission layer. Forecasts and off-topic questions get "I can only answer from governed metrics".
- **Where definitions live.** Click any figure to see its definition, formula, owner, certification and source tables. **Definitions & access** (header) shows the catalog grouped Group / Asia Bunkering, the access rules (generated from the permission code), and how the AI stays accurate.

## Demo script

1. Open the app. The queue shows 40 open enquiries, ranked by time to quote due: **Halbrook Lines** (S4, due in 55 min) and **Brannock Shipping** (S1) at the top, **Quillon Marine** (S3) at the bottom, blocked.
2. Click **Brannock Shipping**. *Compliance & Credit* shows headroom after the deal of **−$247k**. Open **Show exposure breakdown**: $3.92M Asia Bunkering, $400k other BUs (*detail restricted*), 4.0 days past due. *Pricing & Margin* shows the $13.00 suggestion in its header; the ⓘ beside it shows the rule's build-up ($9.99 customer average, +$2.00 claims, +$1.00 late payment, +$0.01 rounding). The **AI summary** cites that build-up and recommends **Counter**: credit is the reason, not price.
3. Click **−$247k**. The metric card shows the definition, owner (Credit) and certification date.
4. Move the **premium slider** in *Pricing & Margin*. Quoted price, margin and headroom update live; ticks under the track mark the lowest lost premium, the won p25–75 band and this customer's average on 246 similar quotes (the ⓘ gives the scope). The **Quoted price** and **Expected margin** tiles update with it; the margin's ⓘ lists what is deducted (our cost, barging).
5. Click **Ask a question** → **What premium did Rotterdam get from this customer?** → *"That data belongs to Rotterdam Bunkering and isn't available to Trader · Asia Bunkering."*
6. Ask **Why this suggested premium?** The answer cites the +$2 claims and +$1 late-payment adjustments.
7. Click **Counter**. The form is prefilled with 1,100 mt (also offered: full quantity with a letter of credit, or 15-day terms). **Review counter** opens the AI-drafted message; edit it, then **Send**. A toast confirms and the queue drops to 39. Nothing is actually sent.
8. Click **Saltmarsh Bulk** (S2). The barge timeline shows both HSFO barges booked on the requested day and Gannet free two days later; the AI summary recommends the later date.
9. Click **Quillon Marine** (S3). Vessel screening **Flag** only, *Refer to compliance*, no price, actions disabled.
10. Open **Definitions & access**: metric catalog, who sees what, how AI stays accurate.

## Deliberate choices and limitations

- The AI summary sits under the evidence, next to the actions (evidence first, synthesis at the decision), and Ask is a per-enquiry drawer that keeps its history for the session. Both were chosen after review; see `PROCESS_NOTES.md`.
- Counter terms (quantity, date, payment) aren't stored after Send: the data model keeps one quote round per enquiry.
- Ask matches questions to a fixed set of intents by keywords; that's by design, so answers are reproducible.
- The seeded data is bundled into the app (≈222 KB gzipped), hence Vite's chunk-size warning.

`PROCESS_NOTES.md` is the build log, stage by stage, including dead ends.

## Stack

Vite, React 19, TypeScript, Tailwind CSS 4. Charts are plain SVG. No backend, no API keys. Deployed on Vercel.
