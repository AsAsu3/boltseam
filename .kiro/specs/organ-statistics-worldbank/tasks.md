# Implementation Plan — Statistics Organ (World Bank)

Spec: `organ-statistics-worldbank` · Execute in Kiro after the router spec's packet schema, comparator, and registry are in place. No app code is written outside Kiro.

- [ ] 1. Register the organ and its domain tag
  - Add the `statistic` tag → StatisticsOrgan registry entry; with this organ the six-organ registry is complete.
  - _Requirements: 1.1, and router spec 1.1–1.2_

- [ ] 2. Implement the checked-in tables
  - Country-name → ISO alpha-3 table and indicator-name → indicator-code table, confirmed against current World Bank documentation at implementation time; unknown entries take the `unverifiable` path, never a nearest match.
  - _Requirements: 1.4, 2.1, 2.2_

- [ ] 3. Implement input validation
  - Missing year → `unverifiable/missing_year` with no API call; missing country → `unverifiable/missing_country`; ambiguous country → `unverifiable/ambiguous_country` with candidates listed.
  - _Requirements: 1.2, 1.3, 1.4_

- [ ] 4. Implement the indicator fetch and comparison
  - Single call for the exact country/indicator/year; 1% relative tolerance; observed year and published unit printed; unit mismatch without a table-defined conversion → `unverifiable`; null value for the year → `unverifiable/no_value_for_year`, no neighbouring-year substitution.
  - _Requirements: 2.3, 3.1, 3.2, 3.3, 3.4_

- [ ] 5. Implement revision honesty
  - Fetch time printed in every packet; session cache scoped to the current audit only, never carried into a later audit.
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 6. Expose via organ-mcp and test
  - MCP tool wrapping `verify` for use inside Kiro.
  - Fixture contract tests (per reason code, supported, contradicted, observed-year printing), table tests, one non-gating live smoke call; endpoint paths and table entries confirmed against current World Bank documentation and noted in the code header.
  - _Requirements: 5.1, 5.2_
