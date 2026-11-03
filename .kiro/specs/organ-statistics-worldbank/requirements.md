# Requirements — Statistics Organ (World Bank)

Spec: `organ-statistics-worldbank` · Project: Boltseam · Status: draft for Kiro import (created 2026-11-02, pre-implementation)

## Introduction

This feature is the creature's sixth organ: it verifies claims about public statistics — population, GDP, inflation, and similar indicators — against the World Bank API, using the same organ contract and Evidence Packet as the router spec (`organ-router-first-organs`). It is the last organ in the six-organ registry; with it, every domain tag in the CONCEPT.md organ table has an organ, and the router's `no_organ` path becomes a genuine fallback rather than a standing gap.

The organ's central discipline is about the year. A statistic without a year is a different number every year, so a sub-claim that names no year cannot be settled by quietly using the latest value. The packet always prints the observed year, and a missing year is unverifiable.

## Glossary

- **Indicator**: a World Bank indicator code (for example the population-total, GDP-current-US$, and consumer-price-inflation codes — the exact code table is checked in at implementation time and confirmed against current World Bank documentation).
- **Country code**: the ISO 3166-1 alpha-3 code for a country. The organ maps country names to codes from a checked-in table; it never guesses a code.
- **Reason codes** (in addition to the router spec's): `missing_year`, `missing_country`, `ambiguous_country`, `unknown_indicator`, `no_value_for_year`.

## Requirements

### Requirement 1: Three inputs, all required

**User Story:** As a user, I want a statistic checked for the country, indicator, and year the claim actually states, so that a right number for the wrong year cannot pass.

#### Acceptance Criteria

1. WHEN a `statistic` sub-claim carries an indicator, a country, and a year, THE SYSTEM SHALL query exactly that combination.
2. IF the sub-claim carries no year, THEN THE SYSTEM SHALL return verdict `unverifiable` with reason `missing_year` and SHALL NOT substitute the latest available value.
3. IF the sub-claim carries no usable country, THEN THE SYSTEM SHALL return verdict `unverifiable` with reason `missing_country` and SHALL NOT default to any country.
4. IF the country name maps to more than one code in the checked-in table, THEN THE SYSTEM SHALL return verdict `unverifiable` with reason `ambiguous_country` and list the candidates in the packet notes, rather than silently choosing one.

### Requirement 2: Indicator mapping

**User Story:** As a user, I want "GDP" and "inflation" to mean the World Bank series they name, so that a claim is never checked against a neighbouring series.

#### Acceptance Criteria

1. THE SYSTEM SHALL resolve an indicator name to a code only through the checked-in indicator table; the table SHALL be confirmed against current World Bank documentation at implementation time and its confirmation noted in the code header.
2. IF the indicator name has no entry in the table, THEN THE SYSTEM SHALL return verdict `unverifiable` with reason `unknown_indicator` and SHALL NOT approximate with the closest-sounding series.
3. THE SYSTEM SHALL print the indicator code and the indicator's published name in the evidence packet, so a reader can see exactly which series was checked.

### Requirement 3: Value comparison

**User Story:** As a user, I want a claimed statistic compared with the published value for that year, with the year's value printed, so that rounding in the post is visible rather than hidden.

#### Acceptance Criteria

1. WHEN the API returns a value for the requested country, indicator, and year, THE SYSTEM SHALL compare it with the claimed value using a declared relative tolerance of 1% (posters round statistics), printed in the packet.
2. THE SYSTEM SHALL always print the observed year alongside the observed value, even when it equals the claimed year — the year is part of the evidence, not metadata.
3. THE SYSTEM SHALL print the value's unit as published for the indicator (for example persons, current US$, annual percent), and SHALL NOT convert units silently: IF the claim's unit differs from the published unit, THEN THE SYSTEM SHALL return `unverifiable` unless a deterministic conversion is defined in the indicator table entry.
4. IF the API returns no value (null) for the requested year, THEN THE SYSTEM SHALL return verdict `unverifiable` with reason `no_value_for_year` and SHALL NOT substitute another year's value.

### Requirement 4: Revisions and vintage

**User Story:** As a user, I want to know that World Bank figures are revised, so that a verdict is read as "against today's published value", not as timeless truth.

#### Acceptance Criteria

1. THE SYSTEM SHALL print the fetch time in the packet for every Statistics verdict, and the stitcher SHALL surface it, because a revised series can change a verdict on a later audit.
2. THE SYSTEM SHALL NOT cache Statistics responses across audits: the session cache (router spec Req 7.1) applies within one audit only, and a new audit re-fetches.
3. THE SYSTEM SHALL NOT present a cached value from an earlier audit as a fresh observation.

### Requirement 5: Packet completeness

**User Story:** As a reader of the final report, I want every Statistics verdict traceable to one API response, like every other organ's verdict.

#### Acceptance Criteria

1. THE SYSTEM SHALL return the router spec's Evidence Packet for every Statistics verdict, including request URL, fetched-at timestamp in UTC, raw response excerpt, and SHA-256 of the full raw response body.
2. THE SYSTEM SHALL declare the exact endpoint path and parameters in the organ's code header at implementation time, confirmed against the World Bank API documentation current at that date; endpoint paths in this spec are descriptive, not copied from memory as a guarantee.
3. THE SYSTEM SHALL record, in the packet notes, whether the fetch went direct from the browser or through the proxy described in steering/tech.md, per the per-source proxy decision made at build time.
