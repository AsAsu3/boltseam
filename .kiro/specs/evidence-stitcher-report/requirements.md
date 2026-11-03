# Requirements — Evidence Stitcher and Report

Spec: `evidence-stitcher-report` · Project: Boltseam · Status: draft for Kiro import (created 2026-10-31, pre-implementation)

## Introduction

The stitcher is where the creature becomes one body. It takes the frozen worklist and the evidence packets and produces the audit report: a headline that counts verdict classes (never a single true/false), one row per sub-claim with its seam fully visible (organ, source, request URL, fetch time, response hash, tolerance, claimed vs observed), cross-sub-claim consistency notes, and a shareable static export. The stitcher adds no new facts; it only joins, counts, and presents. Any number that cannot be traced to a packet must not appear in the report.

## Glossary

- **Seam**: the visible join between a sub-claim and its evidence — the provenance block rendered with the verdict.
- **Headline counts**: the report's summary as counts per verdict class (e.g. "2 supported · 3 contradicted · 1 unverifiable").
- **Consistency note**: a stitcher-generated observation about relationships between sub-claims (e.g. an FX `quantity_mismatch`, a date used by two organs resolving differently).

## Requirements

### Requirement 1: Report assembly

**User Story:** As a reader, I want one report that shows every part of the claim and what settled it, so that I can see the whole audit at a glance and drill into any seam.

#### Acceptance Criteria

1. WHEN all organ calls for an audit have settled (done or `source_error`), THE SYSTEM SHALL assemble the report from the worklist and the evidence packets.
2. THE SYSTEM SHALL render exactly one report row per sub-claim in the frozen worklist, in the order the sub-claims appear in the original text.
3. IF a sub-claim has no packet when assembly begins, THEN THE SYSTEM SHALL render it as `unverifiable` with reason `no_packet` rather than omitting the row.
4. THE SYSTEM SHALL NOT introduce any number, date, or value into the report that is not present in the worklist or a packet.

### Requirement 2: Headline without a single verdict

**User Story:** As a reader, I want the summary to show the mixture of results, so that one true detail cannot launder a mostly false post — and one false detail cannot sink a mostly true one.

#### Acceptance Criteria

1. THE SYSTEM SHALL summarise the audit as counts per verdict class plus a one-word mixture label derived from those counts by a published rule (e.g. all supported → "Supported"; all contradicted → "Contradicted"; any mixture → "Mixed"; majority unverifiable → "Mostly unverifiable").
2. THE SYSTEM SHALL NOT compute or display a single numeric truth score, percentage-true figure, or red/green overall verdict.
3. THE SYSTEM SHALL display the counts next to the mixture label at all times, so the label can never be read without its basis.

### Requirement 3: Visible seams

**User Story:** As a sceptical reader, I want to re-check any row myself, so every row must show where its evidence came from and when.

#### Acceptance Criteria

1. THE SYSTEM SHALL render, for each row: verdict, claimed value, observed value, unit, tolerance used, organ name, source name, fetch timestamp, and a link or expandable view of the raw response excerpt.
2. THE SYSTEM SHALL render the response hash (SHA-256, truncated for display with full value available) for every packet that has one, and SHALL render an explicit "local recomputation — no source response" note for Abacus rows instead of a hash.
3. WHEN a packet carries notes (such as `quantity_mismatch`, `source_disagreement`, ambiguous-date readings), THE SYSTEM SHALL render them on the row in plain language, not as raw codes.
4. IF a row's verdict is `unverifiable` or `source_error`, THEN THE SYSTEM SHALL render the reason in plain language on the row itself, not only in a tooltip or log.

### Requirement 4: Cross-sub-claim consistency

**User Story:** As a reader, I want contradictions *between* parts of the claim surfaced, so that a post whose pieces are individually plausible but jointly impossible is caught.

#### Acceptance Criteria

1. WHEN two sub-claims resolve the same date expression to different dates via different organs, THE SYSTEM SHALL add a consistency note naming both resolutions.
2. WHEN an organ attaches a `quantity_mismatch` note, THE SYSTEM SHALL surface it in the report body adjacent to the affected row, naming the two quantities involved.
3. THE SYSTEM SHALL derive consistency notes only from packet and worklist data; it SHALL NOT call a language model to invent narrative explanations.

### Requirement 5: Static export and sharing

**User Story:** As a user, I want to share the audit as a single file or link, so that others see the same seams I saw.

#### Acceptance Criteria

1. THE SYSTEM SHALL export the report as one self-contained HTML file (inline styles, no external requests) whose content matches the on-screen report including all seams.
2. THE SYSTEM SHALL include the original claim text in the export, clearly delimited as the audited material.
3. IF the audit was run against recorded fixtures or cached responses, THEN THE SYSTEM SHALL state the fetch timestamps in the export exactly as in the app, with no freshness upgrade.

### Requirement 6: Accessibility and language of the report

**User Story:** As any reader, I want the report readable without specialist knowledge, so verdicts must be words, not codes, and the layout must survive a small screen.

#### Acceptance Criteria

1. THE SYSTEM SHALL render all verdicts and reasons as plain-language words (internal codes may appear only in the machine-readable export metadata).
2. THE SYSTEM SHALL keep every row's seam reachable by keyboard and readable by a screen reader (verdict and provenance in the row's accessible text).
3. THE SYSTEM SHALL render the report legibly at a 360 px viewport width without horizontal scrolling.
