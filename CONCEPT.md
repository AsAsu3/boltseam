# Boltseam — Concept Brief

- Working title: **Boltseam** (collision check: see `NAMING.md`; full layers run 2026-10-31, recommended candidate)
- Hackathon: Kiroween 2026 (Devpost), category **Frankenstein**
- Status: concept + spec pack, created 2026-10-31 inside the Submission Period (opened 2026-10-30 09:00 PT). No application code exists yet, by design.
- One line: **A claim-verification desk stitched together from specialist organs — each organ is a different public data source, each verdict carries its raw evidence, and the seams stay visible.**

## The problem

Social feeds are full of quantitative claims that travel faster than anyone can check them: "turned $50 into $4,890 in 48 hours", "BTC was only $61,200 that day", "this repo hit 2,000 stars in 3 days", "it never rains in that city in October". Readers have two bad options today:

1. Believe or dismiss the whole post as one blob, based on vibes.
2. Open five different sites (an exchange chart, an FX converter, a calendar, a GitHub page, a weather archive) and do the cross-checking by hand — which almost nobody does.

General-purpose "AI fact checkers" give a verdict with no receipts: a single model opinion, no raw data, no way to see which part of the claim failed. A claim is not one fact. It is a bundle of small facts from different domains, and each domain has a free, authoritative public data source that can settle its part. Nobody stitches those sources into one audit.

## The Frankenstein idea

Boltseam treats a claim the way Frankenstein treated a body: as an assembly of heterogeneous parts that were never designed to work together, joined into one creature that walks.

- The user pastes a claim post (text; a URL field is a stretch goal).
- A **decomposition** step (LLM-assisted, schema-constrained) cuts the post into atomic sub-claims, each tagged with a domain: price, currency, date/duration, repository fact, historical weather, public statistic, or pure arithmetic.
- Each sub-claim is routed to exactly one **organ** — a small, single-purpose module backed by one free public data source. Organs do not talk to each other; they know one API each and return a verdict plus the raw response they based it on.
- An **evidence stitcher** sews the organ verdicts into one audit report. Every number in the report is a seam you can pull: it links to the organ, the exact request URL, the fetch timestamp, and a hash of the raw response. If a seam cannot be sewn (the data does not exist publicly), the report says so instead of bluffing.

Why this fits Frankenstein specifically, not just thematically:

- The category asks for "a chimera of technologies… seemingly incompatible elements… unexpectedly powerful". The organs are deliberately incompatible: an exchange order-book API, a central-bank FX feed, a holiday calendar, the GitHub API, a weather archive, and a development-bank statistics API share no schema, no units, no time model. The creature is the adapter layer and the shared evidence format that make them one body.
- The stitching is not a metaphor pasted on afterwards. The core engineering artifact is literally a seam format (the Evidence Packet, see the stitcher spec) that lets mismatched parts hold together — and the report UI renders the seams as a feature, not a bug.
- The build mirrors the product: each organ is its own Kiro spec, and the creature is assembled in Kiro from specs + steering + hooks + MCP. The write-up can honestly say the app was stitched together the same way it stitches claims.

## The organs

Six organs ship in the plan; the first three are the committed core, the rest are scheduled in the roadmap. All primary sources are free and need no API key. Every organ returns the same shape: verdict, claimed value, observed value, unit, delta, raw evidence (request URL, timestamp, response excerpt, SHA-256 of full response).

| # | Organ | Domain | Primary source (no key) | Fallback / notes |
|---|-------|--------|--------------------------|------------------|
| 1 | Market Organ | Crypto / asset prices, current and historical | Kraken public REST API (OHLC / ticker) | Binance public REST API as cross-check source. Binance may geo-restrict some judge regions, so Kraken is primary. CoinGecko is an optional third source, flagged key-required (its free tier policy changed; treat as to-confirm at build time). |
| 2 | FX Organ | Currency conversion at current and historical dates | Frankfurter API (ECB reference rates, no key) | open.er-api.com free endpoint as fallback (no key; rates are reference values, not tradable quotes — the report labels them as such). |
| 3 | Calendar Organ | Date arithmetic, durations, weekdays, business days | Deterministic local computation + Nager.Date public-holiday API (no key) | Local computation is authoritative for arithmetic; Nager.Date only supplies holiday calendars per country. |
| 4 | Repo Organ | GitHub repository facts: existence, created date, stars, forks, language, archived status | GitHub REST API (no key; 60 req/h unauthenticated) | Optional user-supplied token raises limits; the app must never require one. Historical star growth is NOT available from the API — those sub-claims resolve to Unverifiable (see example). |
| 5 | Sky Organ | Historical weather for a place and date (rain, temperature) | Open-Meteo Archive API (no key) | Geocoding via Open-Meteo Geocoding API (no key). Daily aggregates only; claims about a specific hour resolve to Partially supported at best. |
| 6 | Statistics Organ | Public statistics: population, GDP, inflation and similar indicators | World Bank API (no key) | Indicator + country + year must all be extracted from the sub-claim; missing year resolves to Unverifiable rather than guessing the latest value silently (the observed year is always printed). |

Plus one built-in module that is deliberately not called an organ:

- **Abacus** — a deterministic, no-network checker for pure arithmetic inside the claim itself (percentage changes, multiples, totals). It needs no evidence packet from the web; its "evidence" is the recomputation, shown step by step. Counting it as an organ would be dishonest; it is the creature's spine, not an organ.

### Verdict taxonomy (used by every organ)

- **Supported** — observed value matches the claim within the organ's stated tolerance.
- **Contradicted** — observed value differs beyond tolerance.
- **Partially supported** — part of the sub-claim checks out, part does not (the report must say which part).
- **Unverifiable** — no public data can settle it (e.g. historical star counts, deleted posts, private accounts). This is a first-class result, not an error.
- **Source error** — the source failed or timed out; shown distinctly from Unverifiable so a dead API never masquerades as a checked claim.

## Worked example

Input post (fictional, written for this brief; all "observed" values below are illustrative placeholders — at runtime they come from the live API responses):

> "I turned $50 into $4,890 in 48 hours trading BTC last weekend. That's a 9,680% gain. BTC was only $61,200 on Saturday Oct 10, so in yen I was up about ¥9.4 million. The bot's repo hit 2,000 stars in its first 3 days, BTW. And it never even rained in Tokyo that weekend, so I traded from the park."

Decomposition and expected verdicts:

| Sub-claim | Routed to | Check | Expected verdict |
|-----------|-----------|-------|------------------|
| $50 → $4,890 equals a 9,680% gain | Abacus | 4890 / 50 = 97.8×, i.e. +9,680% | **Supported** (the arithmetic is right — which says nothing about whether the trade happened) |
| The window was 48 hours, "last weekend", ending on the post's stated date | Calendar Organ | Date extraction + duration arithmetic against the post date | **Supported / Partially** depending on extracted dates; the report prints the exact window it used |
| BTC was $61,200 on Saturday Oct 10 (year extracted from post context) | Market Organ | Kraken daily OHLC for that date; Binance cross-check | **Contradicted** if the observed close is outside tolerance (illustrative observed value in the demo fixture: $111,340 — placeholder, not a real quote) |
| $61,200 ≈ ¥9.4M "in yen I was up about ¥9.4M" | FX Organ | USD/JPY reference rate for that date via Frankfurter; also exposes the post's own conflation: ¥9.4M would be the value of ~100 BTC at that price, not of the $4,890 profit — the stitcher flags the unit mismatch | **Contradicted** (rate check) + stitcher note on the conflated quantity |
| The repo hit 2,000 stars in its first 3 days | Repo Organ | GitHub API: repo exists, created_at, current stargazers_count. Growth history is not exposed by the API | **Unverifiable** for the 3-day growth claim; **Supported/Contradicted** for current stars and creation date, printed separately |
| It never rained in Tokyo that weekend | Sky Organ | Open-Meteo Archive daily precipitation for Tokyo on those dates | **Contradicted** if any day shows precipitation > 0 mm (illustrative fixture: 3.2 mm on day 2) |

Stitched headline: **Mixed — 1 supported, 1 partially supported, 3 contradicted, 1 unverifiable.** The point of the demo: the one true part (the arithmetic) is exactly the part that makes the post feel credible, and the report shows that in one glance.

## Differentiation

### From WatchDigest (the entrant's earlier project — read carefully)

WatchDigest was submitted to the Nebius × NVIDIA hackathon on 2026-10-28, before the Kiroween Submission Period. Kiroween's New Projects Only rule bars reuse of prior work, so Boltseam is designed to be a different creature, not a reskin:

- **Different verb.** WatchDigest *watches over time*: it monitors prediction-market wallets and reports changes. Boltseam *audits a static artifact on demand*: one pasted claim, one report, no monitoring, no watchlist, no scheduling.
- **Different domain.** No wallets, no prediction markets, no Polymarket anywhere in Boltseam — not in the organs, not in the examples, not in the fixtures.
- **Different core asset.** WatchDigest's core was change-detection over a ledger. Boltseam's core is claim decomposition + heterogeneous-source routing + evidence stitching. No code, text, images, or data files are carried over; this spec pack was written from scratch on 2026-10-31 and the build starts from an empty repository.

### From generic AI fact-checkers

- **Verdicts come from data, not from the model.** The LLM only cuts the claim into pieces and routes them. Verdicts are computed from live API responses by deterministic comparison code. A fact-checker that asks a model "is this true?" can be confident and wrong; Boltseam can only say what a named source returned, and shows the response.
- **Every number is traceable.** Each report row carries source name, request URL, fetch time, and a response hash. Generic tools give a paragraph; Boltseam gives an audit trail.
- **"Unverifiable" is a designed outcome.** The taxonomy treats unsettleable sub-claims as a normal, visible result instead of forcing a true/false guess.

### From the entrant's static red-flag checklist (Rank 10 checker)

That product is a qualitative checklist read by a human; it fetches nothing. Boltseam performs live verification against public APIs with machine-checkable evidence. Different mechanism, different deliverable, no shared text or assets.

## Judging-criteria mapping

Kiroween Stage Two scores five criteria at 20% each (rules §6). Frankenstein itself is defined in rules §4 as stitching a chimera of technologies into one app — "seemingly incompatible elements… unexpectedly powerful". Stage One is pass/fail on theme fit and required-tool use.

| Criterion | How Boltseam answers it |
|-----------|--------------------------|
| Potential Impact (20%) | The audience is anyone who reads quantitative claims online — traders, journalists, community moderators, group-chat members. The demo claim type (viral earnings posts) is one the entrant has already catalogued extensively in prior research, so the problem is documented, not hypothetical. One paste → one audit replaces five manual site visits. |
| Technological Implementation (20%) | The build itself is the exhibit: 6+ Kiro specs (one per feature/organ), steering docs that encode the evidence discipline, agent hooks that lint evidence format and re-verify specs on save, an MCP server exposing the organs as tools so Kiro can test its own organs while building them, and property-based tests on the verdict comparators and the arithmetic checker (the rules' write-up prompts name exactly these features). |
| Design (20%) | The report is the product surface: verdict chips per sub-claim, seams rendered visibly (source, time, hash on every row), a headline that counts verdict classes instead of issuing one true/false. Complete flow: paste → decompose (user can correct the cut) → organs run with visible per-organ status → stitched report → shareable static export. |
| Innovation / Idea (20%) | The novel combination is the point: exchange market data + central-bank FX + holiday calendars + the GitHub API + a weather archive + development statistics were not designed to be one instrument. The Evidence Packet seam format and the first-class Unverifiable verdict are the two ideas that do not exist in generic fact-checkers. |
| Presentation (20%) | Under-3-minute video plan (see COMPLIANCE.md): one viral-style claim pasted live, organs lighting up one by one, the arithmetic seam holding while the price seam tears, ending on the Unverifiable star claim — "the creature shows you its stitches". Screen recording + narration; no face, no third-party material. |

## Scope discipline

In scope for the submission build: paste-text intake, decomposition with user-correctable sub-claims, six organs (three committed first), Abacus, stitcher, report UI + static export, deployed public URL, no accounts, no keys required from users.

Out of scope: URL fetching of posts (stretch only), image/screenshot claims, social-platform login or scraping, any monitoring/alerting over time, any wallet or prediction-market data, user accounts, stored claim history beyond the browser session.
