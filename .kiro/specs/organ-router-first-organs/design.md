# Design — Organ Router and First Organs

Spec: `organ-router-first-organs` · Project: Boltseam

## Architecture

```
frozen Worklist ──► Router ──┬─► MarketOrgan ──► Kraken public API ──┐
                             ├─► FxOrgan ──────► Frankfurter API ────┤
                             ├─► CalendarOrgan ─► local arithmetic ──┤──► EvidencePacket[]
                             │                  └► Nager.Date API ───┤         │
                             ├─► Abacus (no network)                 │         ▼
                             └─► (future organs 4–6, same contract)┘   to stitcher spec
```

- **Router** — pure dispatcher over domain tags; a registry maps tag → organ instance. Adding an organ is a registry entry plus the organ module; the router code does not change (Req 1.2 handles tags with no organ yet).
- **Organ interface** — `verify(subClaim, ctx) -> Promise<EvidencePacket>`. `ctx` carries the session cache, the audit's anchor date, and an abort signal wired to the 10-second timeout.
- **Comparator** — shared deterministic helpers (`compareWithTolerance(claimed, observed, tolerance)`) used by every organ so verdict semantics are identical across the creature; tolerances are organ parameters, always written into the packet.
- **Evidence store** — in-session map from sub-claim id to packet; the stitcher reads only this store.

## Evidence Packet schema

```jsonc
{
  "subClaimId": "sc-03",
  "organ": "market",
  "verdict": "contradicted",            // supported|contradicted|partially_supported|unverifiable|source_error
  "reason": null,                       // machine-readable when verdict is unverifiable/source_error
  "claimedValue": 61200, "observedValue": 111340,
  "unit": "USD", "tolerance": { "kind": "relative", "value": 0.005 },
  "notes": ["source_disagreement"],     // e.g. quantity_mismatch, source_disagreement
  "provenance": {
    "source": "Kraken public API",
    "requestUrl": "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440&since=...",
    "fetchedAt": "2026-11-15T03:12:44Z",
    "rawExcerpt": "{ ...first 2 KB of the response... }",
    "rawSha256": "…"
  }
}
```

For Abacus packets, `provenance.source` is `"local recomputation"` and `rawExcerpt` holds the step-by-step recomputation (Req 6.2 in the requirements). Hashing a recomputation is meaningless, so `rawSha256` is null and the packet says why — an honesty detail the evidence-format lint hook checks.

## Organ specifics

### Market Organ
- Symbol mapping: a small checked-in table for common symbols (BTC→XBTUSD on Kraken, ETH, SOL, plus major equity tickers are out of scope for v1 and resolve to `unverifiable/unknown_symbol` — scope control, stated in the UI).
- Daily candle semantics: the packet records which field was compared (close) and the full range. The partially-supported band (Req 3.3) exists because posters often quote an intraday print; the report should be able to say "that price did print that day, but the day closed far away".
- Cross-check: Binance daily kline for the same UTC day; disagreement > 1% adds a note, never a silent average — averaging two sources would destroy traceability.

### FX Organ
- Frankfurter supports historical dates (`/{date}?from=USD&to=JPY` shape — exact path to be confirmed against current docs at build time; endpoint behaviour is a to-confirm item in COMPLIANCE.md).
- The `quantity_mismatch` note (Req 4.5) is produced by a cheap consistency pass: if the converted amount matches a different quantity in the same post (principal vs profit), the note names both quantities. This is deterministic text matching over extracted values, not a model judgement.

### Calendar Organ
- Resolution order: explicit dates in the post → anchor date from post metadata → audit date, in that order, and the packet always prints which anchor was used.
- Weekday claims ("on Saturday Oct 10") are verified as a pair: the calendar date must exist and its weekday must match; a mismatch is `contradicted` with both facts printed (this catches a real class of fabricated posts cheaply).
- Business-day logic subtracts weekends and Nager.Date holidays for the named country; if no country is inferable, business-day sub-claims degrade to weekend-only arithmetic and the packet says so.

### Abacus
- Exact arithmetic via integer/rational representation for percentages and multiples; tolerance covers poster rounding (Req 6.1).
- Steps rendered as text lines ("50 × 97.8 = 4,890; (4,890 − 50) / 50 = 96.8 → +9,680%") so the report can show the working.

## Concurrency and failure model

- Router runs organs with `Promise.allSettled`-style semantics; a rejected organ promise is converted into a `source_error` packet by the router itself, so an organ bug can never crash an audit or silently drop a sub-claim.
- One retry per source call, exponential backoff 500 ms → 1 s, then stop (Req 7.2). HTTP 429 latches the source off for the audit (Req 7.3).
- Cache: session-scoped `Map<url, {fetchedAt, body}>`. Packets built from cache reuse the original body and hash but keep the original `fetchedAt`, so a report never claims data is fresher than it is.

## MCP exposure (build-time and runtime)

The organs are also exposed as tools of a small MCP server (`organ-mcp`) used during development: Kiro can call the same `verify` functions while implementing later organs, which keeps the build honest (the agent tests organs with the real contract). Whether the deployed app also talks MCP at runtime is a build-time decision; the submission does not depend on it. Kiro MCP configuration lives under `.kiro/settings/mcp.json` (exact schema to-confirm at build start; see COMPLIANCE.md).

## Testing strategy

- Contract tests: every organ is tested against recorded API fixtures (request URL → canned response) asserting packet completeness (all provenance fields present, verdict derivable from claimed/observed/tolerance).
- Property-based tests on the comparator: for generated claimed/observed/tolerance triples, verdicts must be monotone in the delta and symmetric around tolerance boundaries.
- Golden audit: the CONCEPT.md worked example runs end-to-end against fixtures and must produce the expected verdict counts (with fixture values, not live ones).
- Live smoke tests (non-gating): one real call per source, run manually before demo recording, to catch API drift.
