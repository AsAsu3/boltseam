# Requirements — Organ Router and First Organs

Spec: `organ-router-first-organs` · Project: Boltseam · Status: draft for Kiro import (created 2026-10-31, pre-implementation)

## Introduction

This feature is the creature's torso: a router that dispatches each frozen sub-claim to exactly one specialist organ, a uniform organ contract, an evidence packet format that every organ must return, and the first three organs — Market (Kraken primary, Binance cross-check), FX (Frankfurter), and Calendar (local arithmetic + Nager.Date) — plus the built-in Abacus arithmetic checker. Organs 4–6 (Repo, Sky, Statistics) follow the same contract and get their own spec when scheduled; the router must not need modification to admit them.

## Glossary

- **Organ**: a single-purpose verification module bound to one data source (or, for Calendar, one source plus deterministic local computation).
- **Evidence Packet**: the uniform organ output: verdict, claimed value, observed value, unit, delta, and provenance (source name, request URL, fetched-at timestamp, raw response excerpt, SHA-256 of the full raw response).
- **Verdict**: one of `supported`, `contradicted`, `partially_supported`, `unverifiable`, `source_error`.
- **Tolerance**: the organ-specific relative or absolute band inside which a claim counts as supported; declared per organ, never hidden.

## Requirements

### Requirement 1: Routing

**User Story:** As a user, I want each sub-claim sent to the one specialist that can settle it, so that a price claim is never judged by a weather source.

#### Acceptance Criteria

1. WHEN the router receives a frozen worklist, THE SYSTEM SHALL dispatch each sub-claim to exactly one organ selected by its domain tag.
2. IF a sub-claim's domain tag has no implemented organ, THEN THE SYSTEM SHALL return verdict `unverifiable` with reason `no_organ` instead of guessing or dropping the sub-claim.
3. THE SYSTEM SHALL run organ calls concurrently with a per-organ timeout of 10 seconds.
4. IF an organ exceeds its timeout or its source returns an error, THEN THE SYSTEM SHALL record verdict `source_error` for that sub-claim and SHALL NOT block the remaining sub-claims.
5. WHILE organs are running, THE SYSTEM SHALL expose per-sub-claim status (queued, running, done, source_error) for the UI.

### Requirement 2: The organ contract and evidence packet

**User Story:** As a reader of the final report, I want every verdict backed by the same kind of evidence, so that I can re-check any number myself regardless of which organ produced it.

#### Acceptance Criteria

1. THE SYSTEM SHALL require every organ result to include: sub-claim id, verdict, claimed value, observed value (nullable), unit, tolerance used, source name, request URL, fetched-at timestamp in UTC, raw response excerpt, and the SHA-256 hash of the full raw response body.
2. IF an organ cannot produce an observed value, THEN THE SYSTEM SHALL set the verdict to `unverifiable` or `source_error` with a machine-readable reason and SHALL NOT fabricate an observed value.
3. THE SYSTEM SHALL compute verdicts by deterministic comparison code over the claimed and observed values; organ code SHALL NOT ask a language model to decide a verdict.
4. THE SYSTEM SHALL include the tolerance used in the evidence packet, so a supported verdict can be re-derived by a reader.

### Requirement 3: Market Organ (price claims)

**User Story:** As a user, I want "BTC was $61,200 on Oct 10" checked against real market data from the claimed date, so that a price claim stands or falls on the exchange record.

#### Acceptance Criteria

1. WHEN a `price` sub-claim names an asset and a date, THE SYSTEM SHALL fetch daily OHLC for that asset and date from the Kraken public API without requiring an API key.
2. THE SYSTEM SHALL compare the claimed price against the day's close, and SHALL also report the day's high–low range in the evidence packet.
3. IF the claimed price falls inside the day's high–low range but differs from the close beyond tolerance, THEN THE SYSTEM SHALL return `partially_supported` and state both facts.
4. WHEN the primary source returns data, THE SYSTEM SHALL cross-check with the Binance public API and SHALL flag a `source_disagreement` note if the two sources' closes differ by more than 1%.
5. IF the asset or date cannot be resolved (unknown symbol, future date, pre-listing date), THEN THE SYSTEM SHALL return `unverifiable` with the specific reason.
6. THE SYSTEM SHALL declare its tolerance for price claims (default: 0.5% of the observed close) in the evidence packet.

### Requirement 4: FX Organ (currency claims)

**User Story:** As a user, I want "that's about ¥9.4 million" checked against the reference exchange rate of the claimed date, so that conversions cannot be rounded into a different story.

#### Acceptance Criteria

1. WHEN an `fx` sub-claim names an amount, a source currency, a target currency, and a date, THE SYSTEM SHALL fetch the reference rate for that date from the Frankfurter API without an API key.
2. THE SYSTEM SHALL recompute the converted amount and compare it with the claimed amount using a declared tolerance (default: 1%, because posters round conversions).
3. THE SYSTEM SHALL label rates as central-bank reference rates in the evidence packet, never as tradable quotes.
4. IF Frankfurter is unavailable, THEN THE SYSTEM SHALL try the open.er-api.com free endpoint and mark the packet's source accordingly; IF both fail, THEN the verdict SHALL be `source_error`.
5. IF the sub-claim's implied quantity is inconsistent with the rest of the claim (for example converting a principal when the text describes a profit), THEN THE SYSTEM SHALL still verify the stated conversion AND attach a `quantity_mismatch` note for the stitcher to surface.

### Requirement 5: Calendar Organ (date and duration claims)

**User Story:** As a user, I want "48 hours last weekend" resolved to real dates and checked, so that elastic time words cannot stretch a claim.

#### Acceptance Criteria

1. WHEN a `date` sub-claim contains a date expression ("last Saturday", "Oct 10", "that weekend"), THE SYSTEM SHALL resolve it against the anchor date extracted from the post (or the audit date if the post states none) and SHALL print the resolved dates in the evidence packet.
2. THE SYSTEM SHALL verify duration assertions (hours, days, "within a week") by deterministic date arithmetic computed locally.
3. WHEN a claim depends on business days, THE SYSTEM SHALL consult the Nager.Date public-holiday API for the relevant country and year and list the holidays that fall inside the window.
4. IF a date expression is ambiguous between two readings that change the verdict, THEN THE SYSTEM SHALL return `partially_supported` and show both readings rather than silently choosing one.
5. THE SYSTEM SHALL treat local computation as authoritative for arithmetic and SHALL mark Nager.Date as a supplementary source in the packet.

### Requirement 6: Abacus (internal arithmetic)

**User Story:** As a user, I want the claim's internal maths recomputed exactly, so that correct arithmetic is credited and wrong arithmetic is caught even when no external data is involved.

#### Acceptance Criteria

1. WHEN an `arithmetic` sub-claim carries extracted operands, THE SYSTEM SHALL recompute the asserted relationship deterministically and compare it with the stated result using exact rational arithmetic where practical, with a declared rounding tolerance (default: 0.1% or half a unit of the stated precision, whichever is larger).
2. THE SYSTEM SHALL show the recomputation steps in the evidence packet in place of an API response, clearly labelled as a recomputation, not a source fetch.
3. IF the operands are insufficient to recompute, THEN THE SYSTEM SHALL return `unverifiable` with reason `missing_operands`.

### Requirement 7: Rate limits, caching, and honesty under failure

**User Story:** As a user running several audits, I want repeated checks to stay fast and within public API limits, without stale data ever being presented as fresh.

#### Acceptance Criteria

1. THE SYSTEM SHALL cache source responses in the browser session keyed by request URL, and SHALL record the original fetch time in the packet even when served from cache.
2. THE SYSTEM SHALL NOT retry a failed source more than once per sub-claim.
3. IF a source enforces a rate limit (HTTP 429), THEN THE SYSTEM SHALL stop calling that source for the remainder of the audit and mark affected sub-claims `source_error` with reason `rate_limited`.
