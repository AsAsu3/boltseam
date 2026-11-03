# Implementation Plan — Evidence Stitcher and Report

Spec: `evidence-stitcher-report` · Execute in Kiro after the router spec's packet contract is in place.

- [ ] 1. Implement the Stitcher as a pure function
  - Join worklist + packets into ReportModel; missing packet → `unverifiable / no_packet`; row order follows the original text.
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 2. Implement headline counts and the mixture-label rule
  - Counts per verdict class; label by the published ordered rule in design.md; counts always rendered beside the label; no numeric truth score anywhere (assert by UI test).
  - _Requirements: 2.1, 2.2, 2.3_

- [ ] 3. Implement the plain-language dictionary
  - Single module mapping verdicts, reason codes, and note codes to reader-facing words; stitcher and views consume only this module for wording.
  - _Requirements: 3.3, 3.4, 6.1_

- [ ] 4. Implement ConsistencyPass
  - Shared-date conflict detection across rows; promotion of packet notes (quantity mismatch, source disagreement) into row-adjacent display notes; duplicate-span merge note.
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 5. Implement ReportView with visible seams
  - Summary layer + expandable seam layer per row (source, URL, fetched-at, tolerance, excerpt, full hash; Abacus rows show the recomputation note instead of a hash); span highlighting back into the original text; per-organ status during runs comes from the router spec's status events.
  - _Requirements: 3.1, 3.2, 6.2_

- [ ] 6. Implement static export
  - Single self-contained HTML from the same ReportModel and row components; original text delimited; embedded JSON model block; fetch timestamps carried over unchanged.
  - _Requirements: 5.1, 5.2, 5.3_

- [ ] 7. Responsive and accessibility pass
  - 360 px layout without horizontal scrolling; keyboard traversal and screen-reader text for every row's verdict and provenance.
  - _Requirements: 6.2, 6.3_

- [ ] 8. Tests
  - Property-based tests: row-count invariant, no-untraced-values invariant, headline count/label derivation.
  - Golden test on the worked example (label "Mixed", counts 1/1/3/1/0, FX note placement).
  - Snapshot tests per verdict class including Abacus and `source_error` rows.
  - _Requirements: 1.4, 2.1, 3.2, 4.2_
