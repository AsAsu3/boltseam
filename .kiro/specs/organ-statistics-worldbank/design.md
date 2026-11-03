# Design — Statistics Organ (World Bank)

Spec: `organ-statistics-worldbank` · Project: Boltseam

## Architecture

```
statistic sub-claim ──► StatisticsOrgan.verify() ──► World Bank API (country/indicator/year)
                                                              │
                                                              ▼
                                                        EvidencePacket (router contract)
```

- **StatisticsOrgan** — a pure adapter implementing the router spec's organ interface: `verify(subClaim, ctx) -> Promise<EvidencePacket>`. One source, one call per sub-claim (the API returns the requested year's value directly; there is no second call to make).
- **Tables, not inference.** Country-name → ISO alpha-3 mapping and indicator-name → indicator-code mapping are checked-in tables, confirmed at implementation time. Anything not in a table is `unverifiable` with a named reason — the organ has no fuzzy-matching path, because a fuzzy match is a silent choice of a different country or series.
- **Year is a query parameter, not a fallback.** The request asks for exactly the claimed year. If the API returns null for that year, the organ stops (Req 3.4); it does not walk to neighbouring years.

## Comparison semantics

- Relative tolerance 1%, declared in the packet. Statistics are the most rounded numbers posters quote (populations in millions, GDP in trillions), so the tolerance is a floor for poster rounding, not a claim about the data's precision.
- Unit discipline: the packet prints the published unit. If the claim's unit differs and the indicator table entry defines no deterministic conversion, the verdict is `unverifiable` — converting, say, a GDP in current US$ to PPP dollars inside the organ would be substituting a different series.
- Observed year is printed in the packet body, not only in provenance: a reader scanning the report sees "Japan, population, 2023: 124,600,000" and can spot a year mismatch without opening the packet.

## Failure model

- Missing year / missing country / ambiguous country / unknown indicator → `unverifiable` with the named reason, before any API call is needed for the first three (no call is made when an input is missing — calling the API without a year would be the silent-latest-value failure this spec exists to prevent).
- Null value for the year → `unverifiable/no_value_for_year`.
- API failure or timeout (router's 10-second per-organ timeout, one retry) → `source_error` via the router's rejection conversion.
- Session cache (router spec Req 7.1) applies within the audit only; Requirement 4 forbids carrying a Statistics value into a later audit, because revisions change published values.

## Registry completion

With this organ, the six-organ registry is complete: Market, FX, Calendar, Repo, Sky, Statistics, plus Abacus. The router's `unverifiable/no_organ` path remains for tags outside this set, and any future organ follows this spec's trio format (requirements/design/tasks) and the router contract without router changes.

## Testing strategy

- Recorded-fixture contract tests: one fixture per reason code (`missing_year`, `missing_country`, `ambiguous_country`, `unknown_indicator`, `no_value_for_year`), plus a supported case and a contradicted case, asserting packet completeness and observed-year printing.
- Table tests: every entry in the country and indicator tables resolves to the expected code, and unknown names resolve to the `unverifiable` path rather than a nearest match.
- Property-based tests: none specific beyond the shared comparator's; the 1% tolerance reuses the comparator's relative-tolerance property tests.
- Live smoke test (non-gating): one real call for a well-known indicator/country/year before demo recording; endpoint paths and table entries confirmed against current World Bank documentation and noted in the code header.
