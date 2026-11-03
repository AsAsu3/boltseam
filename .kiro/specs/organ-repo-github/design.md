# Design — Repo Organ (GitHub)

Spec: `organ-repo-github` · Project: Boltseam

## Architecture

```
repository sub-claim ──► RepoOrgan.verify() ──► GitHub REST API (repository resource)
                                                    │
                                                    ▼
                                              EvidencePacket (router contract)
```

- **RepoOrgan** — a pure adapter implementing the router spec's organ interface: `verify(subClaim, ctx) -> Promise<EvidencePacket>`. It imports nothing from other organs; shared logic lives only in the comparator and packet modules.
- **Reference resolution is not this organ's job.** The intake step supplies an `owner/repo` reference. If it cannot, the organ returns `unverifiable/missing_repo_ref` (Req 1.2) rather than searching — a search would let the organ pick the repository it then "verifies".
- **No history module.** There is deliberately no code path that derives a star timeline. Requirement 4 is enforced by absence: the organ's field set is existence, `created_at`, `stargazers_count`, `forks_count`, `language`, `archived` — nothing else is read from the response, so a growth claim has no observed value to compare against.

## Field mapping

| Sub-claim kind | API field | Comparison |
|---|---|---|
| existence | HTTP status (200 vs 404) | 200 → supported; 404 → contradicted (Req 2.1) |
| star count | `stargazers_count` | Relative tolerance 5%, current value + fetch time printed |
| fork count | `forks_count` | Relative tolerance 5%, current value + fetch time printed |
| creation date | `created_at` | Day precision, both dates printed |
| primary language | `language` | Case-insensitive exact match; null → `unverifiable/no_language_data` |
| archived status | `archived` | Exact boolean match |
| star growth / rate over time | (no field) | `unverifiable/no_star_history`, with creation date + current count in notes only |

## Failure model

- 404 → existence claims contradicted; all other claims about that reference `unverifiable/repo_not_found` (Req 2.2). The packet wording for 404 says "not publicly retrievable", never "does not exist", because a private repository also returns 404.
- Rate-limit responses (403 with `X-RateLimit-Remaining: 0`, or 429) → `source_error/rate_limited`, and the router latches GitHub off for the rest of the audit (router spec Req 7.3). The reset time from the headers goes into the packet notes.
- Network failure or timeout (router's 10-second per-organ timeout) → `source_error` via the router's rejection conversion; the organ never retries more than once (router spec Req 7.2).
- Session cache (router spec Req 7.1) applies unchanged: repeated checks of the same repository in one audit reuse the first response body and hash, keeping the original fetch time.

## Authentication

Unauthenticated by default. An optional token, if the user supplies one in runtime settings, is sent as an `Authorization` header and nothing else changes — no endpoint, no field set, no tolerance depends on it. The token is never written into a packet, a fixture, or the build log.

## Testing strategy

- Recorded-fixture contract tests: one fixture per field kind (including a 404 fixture, a null-language fixture, and a rate-limit fixture) asserting packet completeness and verdict derivability from claimed/observed/tolerance.
- Golden audit: the CONCEPT.md worked example's repo sub-claim ("hit 2,000 stars in its first 3 days") must produce `unverifiable/no_star_history` with creation date and current count in notes, against fixtures.
- Property-based tests: none specific to this organ beyond the shared comparator's; count comparisons reuse the comparator's relative-tolerance property tests.
- Live smoke test (non-gating): one real call per field kind before demo recording, to catch API drift; endpoint paths confirmed against current GitHub REST documentation at that point and noted in the code header.
