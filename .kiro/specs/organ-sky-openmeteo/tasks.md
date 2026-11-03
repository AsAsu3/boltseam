# Implementation Plan — Sky Organ (Open-Meteo)

Spec: `organ-sky-openmeteo` · Execute in Kiro after the router spec's packet schema, comparator, and registry are in place. No app code is written outside Kiro.

- [ ] 1. Register the organ and its domain tag
  - Add the `weather` tag → SkyOrgan registry entry.
  - _Requirements: 1.1, and router spec 1.1–1.2_

- [ ] 2. Implement place resolution
  - Geocoding call with resolved name/coordinates printed in the packet; no result → `unverifiable/place_not_found`; verdict-changing ambiguity → `partially_supported` with all candidates printed.
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 3. Implement the archive fetch
  - Daily precipitation sum and temperature maximum/minimum/mean for the requested date range, from the resolved coordinates; both calls' provenance in the packet; proxy-vs-direct noted per the build-time per-source decision.
  - _Requirements: 6.1, 6.2, 6.3_

- [ ] 4. Implement rain and temperature comparisons
  - Rain rule (> 0 mm per day, every day printed, wet days named); temperature aggregate selection by claim wording with stated default; 1 °C absolute tolerance.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4_

- [ ] 5. Implement the hour-precision and coverage refusals
  - Specific-hour claims → `partially_supported/hourly_not_available` with daily values printed, no interpolation; future/beyond-archive dates → `unverifiable/data_not_yet_available`; pre-archive dates → `unverifiable/date_out_of_range`; no forecast or neighbouring-day substitution.
  - _Requirements: 4.1, 4.2, 4.3, 5.1, 5.2, 5.3_

- [ ] 6. Expose via organ-mcp and test
  - MCP tool wrapping `verify` for use inside Kiro while building the remaining work.
  - Fixture contract tests (geocoding variants, dry/wet ranges, each temperature aggregate, both provenance entries), golden worked-example test, boundary test at exactly 0 mm, one non-gating live smoke call per source; endpoint paths confirmed against current Open-Meteo documentation and noted in the code header.
  - _Requirements: 6.1, 6.2_
