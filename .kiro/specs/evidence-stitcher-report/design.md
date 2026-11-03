# Design — Evidence Stitcher and Report

Spec: `evidence-stitcher-report` · Project: Boltseam

## Architecture

```
Worklist ──┐
           ├──► Stitcher (pure join + counts) ──► ReportModel ──┬─► ReportView (app UI)
Packets ───┘        │                                            └─► StaticExport (single HTML file)
                    └─► ConsistencyPass (deterministic rules over packets)
```

- **Stitcher** — a pure function `(worklist, packets) -> ReportModel`. No I/O, no model calls. This purity is what makes Req 1.4 ("no untraced numbers") testable: property tests feed generated worklists/packets and assert every value in the model appears in the inputs.
- **ConsistencyPass** — deterministic rules over the joined model: shared-date resolution conflicts (Req 4.1), packet notes promotion (Req 4.2), and duplicate sub-claim detection (same span audited twice — render once, note the merge). Rules are data-in/data-out and individually unit-tested.
- **ReportModel** — the single structure both renderers consume, so the export can never drift from the on-screen report (Req 5.1).

```jsonc
// ReportModel
{
  "auditId": "…", "createdAt": "…",
  "originalText": "…",
  "headline": { "label": "Mixed", "counts": { "supported": 1, "partially_supported": 1, "contradicted": 3, "unverifiable": 1, "source_error": 0 } },
  "rows": [ { "subClaim": {…}, "packet": {…} | null, "displayNotes": ["…"] } ],
  "consistencyNotes": [ { "kind": "date_conflict", "rowIds": ["sc-02","sc-05"], "text": "…" } ]
}
```

## The mixture-label rule (published, deterministic)

Applied in order; the first matching rule wins, and the rule text ships in the repo README so judges can re-derive any label:

1. Any `source_error` count > 0 and total settled rows = 0 → **"Could not audit"**.
2. All rows `supported` or `partially_supported`, with at least one `supported` → **"Supported"** (if all are only partially, label is **"Mostly supported"**).
3. All rows `contradicted` → **"Contradicted"**.
4. `unverifiable` is the strict majority → **"Mostly unverifiable"**.
5. Otherwise → **"Mixed"**.

There is deliberately no weighted score. A claim with 5 supported rows and 1 contradicted row is "Mixed", and the counts sit next to the label (Req 2.3) — the design refuses to let arithmetic launder the one contradiction.

## Seam rendering

Each row renders in two layers:

- **Summary layer** (always visible): verdict word + colour chip, sub-claim text with its span highlighted in the original post on hover/focus, claimed vs observed values, organ name.
- **Seam layer** (expandable, keyboard reachable): source name, request URL, fetched-at, tolerance, notes in plain language, raw excerpt in a monospace block, full SHA-256.

Plain-language maps for verdicts, reasons, and note codes live in one checked-in dictionary module (`reportLanguage.ts`) — the only place codes become words, which keeps Req 6.1 enforceable and gives the evidence-format lint hook a single file to check new codes against.

## Static export

The exporter serialises the ReportModel through the same row components into a single HTML string with inlined CSS, then triggers a download. No external fonts, scripts, or images (Req 5.1). The export embeds a JSON copy of the ReportModel in a `<script type="application/json">` block for machine re-checking, with internal codes confined to that block (Req 6.1).

## Error handling

| Failure | Behaviour |
|---------|-----------|
| Packet missing at assembly | Row rendered `unverifiable / no_packet` (Req 1.3); headline counts it as unverifiable. |
| Packet fails schema validation | Treated as missing; a build-visible console warning is emitted in development builds only — the report never shows stack traces. |
| Export generation fails | Inline error with retry; the on-screen report is unaffected. |
| Very long claim (near the 10,000-char intake cap) | Rows virtualise by simple pagination ("show all" toggle); seams remain reachable per row. |

## Testing strategy

- Property-based tests on the Stitcher: for generated inputs, (a) row count equals worklist size, (b) every numeric value in the ReportModel occurs in the inputs, (c) headline counts sum to the row count and the label matches the published rule.
- Golden test: the CONCEPT.md worked example (fixture packets) produces headline "Mixed" with counts 1 / 1 / 3 / 1 / 0 and the FX quantity-mismatch note adjacent to the FX row.
- Snapshot tests for seam rendering of each verdict class, including the Abacus no-hash note and the `source_error` plain-language reason.
- Accessibility checks: keyboard traversal order and screen-reader text for one row of each verdict class; 360 px layout check in the demo-environment checklist (manual, recorded in the build log).
