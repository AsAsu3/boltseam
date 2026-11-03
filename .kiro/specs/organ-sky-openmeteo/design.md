# Design — Sky Organ (Open-Meteo)

Spec: `organ-sky-openmeteo` · Project: Boltseam

## Architecture

```
weather sub-claim ──► SkyOrgan.verify() ──┬─► Geocoding API ──► lat/lon + display name
                                          └─► Archive API ───► daily precipitation / temperature
                                                    │
                                                    ▼
                                              EvidencePacket (router contract)
```

- **SkyOrgan** — a pure adapter implementing the router spec's organ interface: `verify(subClaim, ctx) -> Promise<EvidencePacket>`. Two source calls, one packet: the provenance section carries both calls, so a reader can re-run the place resolution as well as the weather fetch.
- **Two-step, in order.** Geocoding runs first; the archive call is built from the resolved coordinates, never from the raw place string. If geocoding fails, there is no archive call and the packet says so.
- **No sub-daily synthesis.** The organ's variable set is exactly the archive's daily variables used here: precipitation sum, temperature maximum, temperature minimum, temperature mean. Requirement 4 is enforced by the variable set: there is no hourly variable to compare against.

## Variable mapping

| Sub-claim kind | Daily variable | Comparison |
|---|---|---|
| rain / no rain, per day | precipitation sum (mm) | > 0 mm → rain day; 0 mm → dry day (Req 2.2) |
| heat claim | temperature maximum (°C) | Absolute tolerance 1 °C |
| cold claim | temperature minimum (°C) | Absolute tolerance 1 °C |
| average-temperature claim | temperature mean (°C) | Absolute tolerance 1 °C |
| specific-hour claim | (none — daily only) | `partially_supported/hourly_not_available`, daily values printed (Req 4) |

## Date handling

- The organ receives resolved dates from the worklist (the intake/calendar side resolves expressions like "that weekend" before routing; the Sky Organ does not re-interpret them). A multi-day claim produces one packet per the router's per-sub-claim granularity, with every day's value printed inside it — a weekend claim is one sub-claim, several printed days.
- Dates are requested as calendar days in the place's local date (archive daily values are day aggregates). The packet prints the requested date range and the place's resolved coordinates together, so a timezone shift cannot silently move a day.
- Coverage check runs before the archive call is treated as evidence: future dates and dates past the archive's latest available date → `unverifiable/data_not_yet_available`; dates before the archive's start → `unverifiable/date_out_of_range` (Req 5). The archive's coverage bounds are read from the API's own response/documentation at build time and noted in the code header, not assumed here.

## Failure model

- Geocoding no-result → `unverifiable/place_not_found`; ambiguous candidates that change the verdict → `partially_supported` with all candidates printed (Req 1.3).
- Archive failure or timeout (router's 10-second per-organ timeout, one retry) → `source_error` via the router's rejection conversion; a failed archive call never falls back to another day or a forecast.
- Session cache (router spec Req 7.1) applies to both calls, keyed by request URL, keeping original fetch times.

## Testing strategy

- Recorded-fixture contract tests: geocoding fixture (single result, no result, multiple results), archive fixtures for a dry range, a wet day inside a "never rained" range, and each temperature aggregate; packet completeness for both provenance entries.
- Golden audit: the CONCEPT.md worked example's sky sub-claim ("never rained in Tokyo that weekend") must produce `contradicted` naming the wet day, against fixtures.
- Property-based tests: none specific beyond the shared comparator's; the rain rule (> 0 mm) is a boundary test, including exactly 0 mm.
- Live smoke tests (non-gating): one real geocoding call and one real archive call before demo recording; endpoint paths confirmed against current Open-Meteo documentation and noted in the code header.
