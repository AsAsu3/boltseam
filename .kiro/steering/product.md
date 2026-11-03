# Product steering — Boltseam

## What Boltseam is

Boltseam is a claim-verification desk for quantitative claims in social posts. A user pastes a post; the app cuts it into atomic sub-claims, routes each one to a specialist "organ" backed by a different free public data source, and stitches the organ verdicts into one audit report where every number can be traced to the raw source response that settled it.

## Who it serves

Readers of quantitative online claims — posters in trading and side-income communities, journalists, moderators, and anyone in a group chat where a screenshot of earnings just landed. They are not fact-checking professionals; they need one paste to replace five manual site visits.

## Product principles (do not violate these in generated code or copy)

1. **Verdicts come from data, not from the model.** Language models may decompose and route claims. They never decide verdicts. Verdicts are computed by deterministic code from live source responses.
2. **Every number carries its seam.** Any value shown in a report must trace to an evidence packet: source, request URL, fetch time, response hash, tolerance. If it cannot be traced, it does not ship.
3. **"Unverifiable" is a first-class result.** When public data cannot settle a sub-claim, the product says so plainly. Never force a true/false outcome, never fill gaps with plausible text.
4. **No single truth score.** Reports summarise as counts per verdict class with a mixture label. There is no percentage-true figure and no overall red/green verdict, by design.
5. **One paste, one audit.** Boltseam audits a static artifact on demand. It does not monitor, watch, alert, or track anything over time.
6. **Out of domain, permanently:** wallets, prediction markets, and any monitoring-over-time feature. These belong to a different product and must not be suggested, scaffolded, or added.

## The organs (canonical list)

Market (Kraken/Binance public APIs), FX (Frankfurter), Calendar (local arithmetic + Nager.Date), Repo (GitHub API), Sky (Open-Meteo Archive), Statistics (World Bank). Plus Abacus, the built-in deterministic arithmetic checker, which is never called an organ.

## Voice

Plain, measured, specific. The product shows its working and admits its limits in the same tone. No hype words, no "AI-powered" decoration, no claims of being the first or only tool of its kind.
