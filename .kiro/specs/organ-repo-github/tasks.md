# Implementation Plan — Repo Organ (GitHub)

Spec: `organ-repo-github` · Execute in Kiro after the router spec's packet schema, comparator, and registry are in place. No app code is written outside Kiro.

- [ ] 1. Register the organ and its domain tag
  - Add the `repository` tag → RepoOrgan registry entry; unregistered tags keep returning `unverifiable/no_organ` from the router.
  - _Requirements: 1.1, and router spec 1.1–1.2_

- [ ] 2. Implement reference validation
  - Accept exactly `owner/repo`; return `unverifiable/missing_repo_ref` for a missing reference and `unverifiable/ambiguous_repo_ref` with candidates listed for multiple candidates.
  - _Requirements: 1.2, 1.3_

- [ ] 3. Implement the repository fetch
  - Single repository-resource call, unauthenticated by default, optional runtime token only; request URL, fetch time, excerpt, and SHA-256 into the packet.
  - _Requirements: 5.1, 5.2, 6.1, 6.3_

- [ ] 4. Implement existence, count, date, language, and archived comparisons
  - 404 handling per Requirement 2 (contradicted for existence, `repo_not_found` otherwise, "not publicly retrievable" wording); 5% relative tolerance for counts; day-precision creation-date comparison; case-insensitive language match with null → `no_language_data`; exact archived boolean.
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 6.2_

- [ ] 5. Implement the star-history refusal
  - Growth/rate sub-claims return `unverifiable/no_star_history` with creation date and current count in notes only; no timeline estimation code path exists.
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 6. Implement rate-limit handling
  - 403/429 → `source_error/rate_limited` with remaining/reset headers in notes; router latch stops further GitHub calls in the audit.
  - _Requirements: 5.3, 5.4_

- [ ] 7. Expose via organ-mcp and test
  - MCP tool wrapping `verify` for use inside Kiro while building later organs.
  - Fixture contract tests (per-field, 404, null-language, rate-limit), golden worked-example test, one non-gating live smoke call; endpoint paths confirmed against current GitHub REST documentation and noted in the code header.
  - _Requirements: 6.1, 6.3_
