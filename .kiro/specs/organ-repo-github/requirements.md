# Requirements — Repo Organ (GitHub)

Spec: `organ-repo-github` · Project: Boltseam · Status: draft for Kiro import (created 2026-11-02, pre-implementation)

## Introduction

This feature is the creature's fourth organ: it verifies claims about a public GitHub repository — existence, creation date, star count, fork count, primary language, and archived status — against the GitHub REST API, using the same organ contract and Evidence Packet as the router spec (`organ-router-first-organs`). It implements the router contract's admission rule: adding this organ is a registry entry, and the router code does not change.

One hard limit shapes the whole organ. The GitHub API exposes a repository's *current* counts and dates; it does not expose a history of star counts over time. A claim about how fast stars accumulated ("hit 2,000 stars in its first 3 days") therefore cannot be settled from this source, and this organ must say so instead of approximating it from the current count.

## Glossary

- **Repository reference**: an `owner/repo` pair. The organ accepts exactly this form; a bare project name, a URL, or a display name is resolved by the intake step before routing, never guessed by the organ.
- **Current value**: a count or date as returned at fetch time. The packet always prints the fetch time next to a current value, because a star count is a moving target.
- **Reason codes** (in addition to the router spec's): `repo_not_found`, `no_star_history`, `missing_repo_ref`, `ambiguous_repo_ref`, `rate_limited`.

## Requirements

### Requirement 1: Repository identification

**User Story:** As a user, I want a repo claim checked against one specific repository, so that a similarly named fork is never mistaken for the original.

#### Acceptance Criteria

1. WHEN a `repository` sub-claim carries an `owner/repo` reference, THE SYSTEM SHALL query exactly that repository.
2. IF the sub-claim carries no usable repository reference, THEN THE SYSTEM SHALL return verdict `unverifiable` with reason `missing_repo_ref` and SHALL NOT search GitHub for a best guess.
3. IF the intake step supplies more than one plausible repository for one sub-claim, THEN THE SYSTEM SHALL return verdict `unverifiable` with reason `ambiguous_repo_ref` and list the candidates in the packet notes, rather than silently choosing one.

### Requirement 2: Existence

**User Story:** As a user, I want "the repo exists" settled by the API itself, so that a deleted or renamed repository is caught.

#### Acceptance Criteria

1. WHEN a sub-claim asserts that a repository exists, THE SYSTEM SHALL return `supported` if the API returns the repository and `contradicted` if the API returns 404 for that exact reference.
2. IF the API returns 404 and the sub-claim asserts any other fact about that repository (stars, language, dates), THEN THE SYSTEM SHALL return `unverifiable` with reason `repo_not_found`, because there is no repository for those facts to attach to.
3. THE SYSTEM SHALL NOT treat a private repository's 404 as proof of non-existence in user-facing wording: the packet SHALL state only that the repository is not publicly retrievable, and the stitcher SHALL surface that wording.

### Requirement 3: Current counts and dates

**User Story:** As a user, I want "it has 2,000 stars" checked against the live count, with the date of the check visible, so that a stale count cannot pass as current.

#### Acceptance Criteria

1. WHEN a sub-claim asserts a star count or fork count, THE SYSTEM SHALL compare it with the current `stargazers_count` or `forks_count` from the API response, using a declared relative tolerance of 5% (posters round counts), and SHALL print the observed count and the fetch time in the packet.
2. WHEN a sub-claim asserts a creation date, THE SYSTEM SHALL compare it with `created_at` at day precision and SHALL print both dates in the packet.
3. WHEN a sub-claim asserts a primary language, THE SYSTEM SHALL compare it case-insensitively with the API's `language` field; IF the field is null (no detectable language), THEN THE SYSTEM SHALL return `unverifiable` with reason `no_language_data`.
4. WHEN a sub-claim asserts archived status, THE SYSTEM SHALL compare it with the API's `archived` boolean exactly.

### Requirement 4: Star history is unverifiable, not approximated

**User Story:** As a user, I want a growth claim ("2,000 stars in 3 days") to be marked honestly, so that a current count is never dressed up as a history.

#### Acceptance Criteria

1. WHEN a sub-claim asserts a star count reached within a stated window after creation, or a star growth rate over time, THE SYSTEM SHALL return verdict `unverifiable` with reason `no_star_history`.
2. THE SYSTEM SHALL still print, in the same packet's notes, the two facts the API does supply — the creation date and the current star count — clearly labelled as current facts, not as evidence for the growth claim.
3. THE SYSTEM SHALL NOT estimate a growth curve from the current count, and SHALL NOT substitute any third-party star-history source unless that source is added by a later spec change note.

### Requirement 5: Rate limits and authentication

**User Story:** As a user running audits without a GitHub account, I want the organ to work unauthenticated and to fail plainly at the rate limit, so that a blocked call never looks like a checked claim.

#### Acceptance Criteria

1. THE SYSTEM SHALL call the GitHub REST API without an API key by default, accepting the unauthenticated rate limit (60 requests per hour, per the API's published terms at spec time — re-confirm at build time).
2. THE SYSTEM SHALL accept an optional user-supplied token, supplied only via the app's runtime settings and never committed, which raises the limit; the app SHALL never require a token for any verdict.
3. IF the API returns a rate-limit response (403 with rate-limit headers, or 429), THEN THE SYSTEM SHALL return verdict `source_error` with reason `rate_limited`, and the router's per-audit source latch SHALL apply (no further GitHub calls in that audit).
4. THE SYSTEM SHALL record the rate-limit headers (remaining, reset time) in the packet notes when a rate-limit response is received, so the report can say when retrying would help.

### Requirement 6: Packet completeness

**User Story:** As a reader of the final report, I want every Repo verdict traceable to one API response, like every other organ's verdict.

#### Acceptance Criteria

1. THE SYSTEM SHALL return the router spec's Evidence Packet for every Repo verdict, including request URL, fetched-at timestamp in UTC, raw response excerpt, and SHA-256 of the full raw response body.
2. THE SYSTEM SHALL include the tolerance used (Requirement 3.1) and, for count claims, a note that the observed count is current as of the fetch time.
3. THE SYSTEM SHALL declare the exact endpoint path and parameters in the organ's code header at implementation time, confirmed against the GitHub REST API documentation current at that date; endpoint paths in this spec are descriptive, not copied from memory as a guarantee.
