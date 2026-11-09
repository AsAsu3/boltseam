# Implementation Plan — Organ Router and First Organs

Spec: `organ-router-first-organs` · Execute in Kiro after the intake spec's Worklist contract is in place.

- [x] 1. Define the Evidence Packet schema and organ interface
  - Types + JSON Schema for the packet, verdict enum, reason codes, tolerance shapes; a packet validator shared by organs, stitcher, and tests.
  - _Requirements: 2.1, 2.2_

- [x] 2. Implement the comparator library
  - Deterministic claimed/observed comparison with relative and absolute tolerances; partially-supported band support for range-based organs.
  - _Requirements: 2.3, 2.4_

- [x] 3. Implement the Router
  - Registry dispatch by domain tag; `unverifiable/no_organ` for unimplemented tags; 10 s per-organ timeout; per-sub-claim status events; rejection-to-`source_error` conversion.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 4. Implement the session cache and failure policy
  - URL-keyed cache preserving original fetch time; single retry with backoff; 429 latch per source per audit.
  - _Requirements: 7.1, 7.2, 7.3_

- [ ] 5. Implement the Market Organ
  - Kraken daily OHLC fetch and symbol table; close comparison plus high–low band for `partially_supported`; Binance cross-check with `source_disagreement` note at >1%; declared 0.5% tolerance.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 6. Implement the FX Organ
  - Frankfurter historical rate fetch; recomputation and 1% tolerance comparison; reference-rate labelling; open.er-api.com fallback with source marked; `quantity_mismatch` consistency note.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 7. Implement the Calendar Organ
  - Date-expression resolution with printed anchor; duration arithmetic; weekday-pair verification; business-day calculation with Nager.Date holidays and weekend-only degradation note.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 8. Implement Abacus
  - Rational arithmetic recomputation for percentage/multiple/sum/difference; step rendering; `missing_operands` handling; provenance labelled as local recomputation with null hash explained.
  - _Requirements: 6.1, 6.2, 6.3_

- [ ] 9. Expose organs via the organ-mcp server (development-time)
  - MCP tools wrapping each organ's `verify` for use inside Kiro while building organs 4–6; configuration under `.kiro/settings/` per current Kiro docs (confirm schema at build start).
  - _Requirements: 2.1 (contract reuse)_

- [ ] 10. Tests
  - Recorded-fixture contract tests per organ (packet completeness, verdict derivability).
  - Property-based tests for the comparator (monotonicity, tolerance symmetry).
  - Golden audit test on the CONCEPT.md example with fixtures.
  - _Requirements: 2.1, 2.3, 3.3, 7.3_
