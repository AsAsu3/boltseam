# Requirements — Sky Organ (Open-Meteo)

Spec: `organ-sky-openmeteo` · Project: Boltseam · Status: draft for Kiro import (created 2026-11-02, pre-implementation)

## Introduction

This feature is the creature's fifth organ: it verifies claims about historical weather for a place and date — did it rain, how hot or cold was it — against the Open-Meteo Archive API, using the same organ contract and Evidence Packet as the router spec (`organ-router-first-organs`). Place names are resolved through the Open-Meteo Geocoding API; both sources are free and need no key.

Two hard limits shape the organ. The archive publishes *daily* aggregates, so a claim about a specific hour cannot be settled at hour precision. And the archive covers the past only up to a short lag behind today, so a claim about a date the archive does not yet cover cannot be settled either. Both cases must be marked, not fudged.

## Glossary

- **Resolved place**: a geocoding result carrying a display name (place, administrative region, country), latitude, and longitude. The packet always prints all of these, because "Tokyo" alone is not a coordinate.
- **Daily aggregate**: one value per calendar day for a variable (precipitation sum, temperature maximum/minimum/mean). The organ never invents sub-daily values.
- **Reason codes** (in addition to the router spec's): `place_not_found`, `ambiguous_place`, `hourly_not_available`, `data_not_yet_available`, `date_out_of_range`.

## Requirements

### Requirement 1: Place resolution

**User Story:** As a user, I want "in Tokyo" resolved to stated coordinates, so that a weather verdict is tied to a place I can check.

#### Acceptance Criteria

1. WHEN a `weather` sub-claim names a place, THE SYSTEM SHALL resolve it through the Geocoding API and SHALL print the resolved display name, latitude, and longitude in the evidence packet.
2. IF the geocoding step returns no result, THEN THE SYSTEM SHALL return verdict `unverifiable` with reason `place_not_found`.
3. IF the geocoding step returns multiple results whose weather could change the verdict, THEN THE SYSTEM SHALL return verdict `partially_supported`, print every candidate place with its coordinates, and state that the claim was not tied to one place — rather than silently choosing the first result.
4. THE SYSTEM SHALL cache the geocoding result in the session cache keyed by request URL, like any other source response.

### Requirement 2: Rain claims over a date range

**User Story:** As a user, I want "it never rained that weekend" checked day by day, so that one dry day cannot hide a wet one.

#### Acceptance Criteria

1. WHEN a `weather` sub-claim asserts rain or no rain over one or more dates, THE SYSTEM SHALL fetch daily precipitation sums for each date in the range and SHALL print each day's value in the packet.
2. THE SYSTEM SHALL treat a day as a rain day if and only if its daily precipitation sum is greater than 0 mm, matching the CONCEPT.md worked example's rule.
3. IF any day in the range is a rain day and the claim asserts no rain over the whole range, THEN THE SYSTEM SHALL return `contradicted` and name the wet days.
4. IF no day in the range is a rain day and the claim asserts no rain, THEN THE SYSTEM SHALL return `supported`.
5. IF the claim asserts rain on a specific day and that day's precipitation sum is greater than 0 mm, THEN THE SYSTEM SHALL return `supported`; otherwise `contradicted`.

### Requirement 3: Temperature claims

**User Story:** As a user, I want "it was over 30 degrees" checked against the day's recorded temperatures, with the measure named, so that a daily maximum is never compared with a daily mean by accident.

#### Acceptance Criteria

1. WHEN a `weather` sub-claim asserts a temperature, THE SYSTEM SHALL compare it with the daily aggregate that matches the claim's wording: maximum for "high/reached", minimum for "low/dropped to", mean for "averaged" — and SHALL print which aggregate was used.
2. IF the claim names no aggregate, THE SYSTEM SHALL compare against the daily maximum for a heat claim and the daily minimum for a cold claim, and SHALL state that default in the packet.
3. THE SYSTEM SHALL use a declared absolute tolerance of 1 °C (posters round temperatures), printed in the packet.
4. THE SYSTEM SHALL print the temperature unit (°C) and the date for every observed value.

### Requirement 4: Hour precision is partially supported at best

**User Story:** As a user, I want a claim about "rain at 3 pm" to be marked for what it is — a daily record cannot prove an hour — so that the report never overclaims.

#### Acceptance Criteria

1. WHEN a sub-claim asserts weather at a specific hour, THE SYSTEM SHALL return verdict `partially_supported` at best, with reason `hourly_not_available`.
2. THE SYSTEM SHALL still print the full day's daily aggregates in the packet, so the reader can see what the daily record does and does not rule out.
3. THE SYSTEM SHALL NOT interpolate an hourly value from daily aggregates.

### Requirement 5: Archive coverage

**User Story:** As a user, I want a claim about a date the archive does not cover to be marked uncovered, so that absence of data never reads as a dry or mild day.

#### Acceptance Criteria

1. IF a requested date lies in the future, or after the archive's latest available date, THEN THE SYSTEM SHALL return verdict `unverifiable` with reason `data_not_yet_available` and SHALL print the requested date.
2. IF a requested date lies before the archive's earliest available date, THEN THE SYSTEM SHALL return verdict `unverifiable` with reason `date_out_of_range`.
3. THE SYSTEM SHALL NOT substitute a forecast, a neighbouring day, or a climatological average for a missing date.

### Requirement 6: Packet completeness

**User Story:** As a reader of the final report, I want every Sky verdict traceable to its two source calls — geocoding and archive — like every other organ's verdict.

#### Acceptance Criteria

1. THE SYSTEM SHALL return the router spec's Evidence Packet for every Sky verdict, with provenance for both the geocoding call and the archive call (request URLs, fetched-at timestamps in UTC, raw response excerpts, SHA-256 hashes of the full bodies).
2. THE SYSTEM SHALL declare the exact endpoint paths and parameters in the organ's code header at implementation time, confirmed against the Open-Meteo documentation current at that date; endpoint paths in this spec are descriptive, not copied from memory as a guarantee.
3. THE SYSTEM SHALL record, in the packet notes, whether each fetch went direct from the browser or through the proxy described in steering/tech.md, per the per-source proxy decision made at build time.
