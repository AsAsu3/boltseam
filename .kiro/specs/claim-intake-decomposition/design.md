# Design — Claim Intake and Decomposition

Spec: `claim-intake-decomposition` · Project: Boltseam

## Architecture

Intake is a client-side pipeline with one model call and no data-source calls:

```
paste box ──► normaliser ──► decomposition client ──► schema validator ──► correction UI ──► frozen worklist
                 │                    │                      │                                   │
                 │                    └─ LLM (structured     └─ retry x2, then manual-entry      └─ Worklist JSON
                 │                        output)               fallback                           (consumed by
                 └─ credential-pattern warning                                                    organ router)
```

Components:

- **IntakeForm** — single text field, character counter, length guards (Req 1). Holds `originalText` immutable after submit.
- **Normaliser** — trims surrounding whitespace for processing only; never mutates the stored original. Runs the credential-pattern scan (Req 5.2) before anything leaves the browser.
- **DecompositionClient** — sends the post to the configured LLM with a system prompt that encodes the domain taxonomy and the decomposition schema, requesting structured JSON output. Model choice is a build-time decision recorded in steering/tech.md; the client is written against an interface so the model can be swapped without touching callers.
- **SchemaValidator** — validates model output against the decomposition schema (JSON Schema). On failure, retries with the validation errors appended (max 2), then surfaces the manual-entry fallback (Req 2.5).
- **ArithmeticExtractor** — deterministic post-pass over validated sub-claims: detects percentage/multiple/sum assertions whose operands all appear in the post and retags them `arithmetic` with operands attached (Req 3). Implemented as pure functions; this is a property-based-testing target (see the stitcher spec for the comparator PBT, and tasks.md here).
- **CorrectionUI** — renders sub-claim cards with span highlighting back into the original text; edit/split/merge/delete/add (Req 4). User-edited flag and original extraction are retained on the card model.
- **Worklist** — the frozen output: `{ auditId, createdAt, originalText, subClaims: [...] }`. This is the single hand-off contract to `organ-router-first-organs`.

## Data model

```jsonc
// SubClaim
{
  "id": "sc-03",                    // stable within the audit
  "span": [412, 468],               // char offsets into originalText
  "text": "BTC was only $61,200 on Saturday Oct 10",
  "domain": "price",                // price|fx|date|repo|weather|statistic|arithmetic|unrouted
  "statedValue": 61200,
  "unit": "USD",
  "asset": "BTC",                   // domain-specific entities live in "entities"
  "entities": { "symbol": "BTC", "dateExpr": "Saturday Oct 10" },
  "dateExpr": "Saturday Oct 10",    // unresolved expression; resolution is the Calendar Organ's job
  "userEdited": false,
  "originalExtraction": null        // populated when userEdited becomes true
}
```

Design decisions:

- **Dates stay expressions at intake.** "Last Saturday" must be resolved against the post's own context, not the moment of pasting. Intake stores the expression plus any anchor date found in the post; resolution belongs to the Calendar Organ (spec `organ-router-first-organs`).
- **Spans are mandatory.** A sub-claim that cannot point at its source text cannot be audited; the validator rejects span-less output.
- **No verdict vocabulary in this layer.** Types in this package contain no verdict enum. Verdicts exist only downstream, which makes the evidence-free zone enforceable by the compiler rather than by convention.

## Decomposition prompt contract (summary)

The full prompt is a build artifact; the contract it must satisfy:

- Output only schema-valid JSON, one sub-claim per atomic assertion.
- Split conjunctions ("and it rained, and BTC was $X") into separate sub-claims.
- Never invent values, dates, or entities not present in the text; missing pieces stay null and are the organs' problem.
- Opinion/prediction spans are returned as `unrouted` with a one-line reason, never dropped.
- Worked examples for the prompt's few-shot set come from this project's own fixtures (to be written during the build), never from WatchDigest or the red-flag checklist materials.

## Error handling

| Failure | Behaviour |
|---------|-----------|
| Text too short / too long | Refuse before any model call; message states the exact limit (Req 1.2, 1.3). |
| Model timeout / network failure | Retry once; then manual-entry fallback with the original text pre-loaded. |
| Schema-invalid output | Retry up to 2 times with validator errors appended; then manual-entry fallback (Req 2.5). |
| Credential-like string detected | Warn and offer strip; decomposition does not proceed until the user chooses (Req 5.2). |
| Empty confirmed worklist | Block audit start with explanation (Req 4.5). |

## Testing strategy

- Unit tests for Normaliser guards and the credential-pattern scan.
- Golden-fixture tests for decomposition: a fixed set of claim posts (including the CONCEPT.md worked example) with expected sub-claim counts, domain tags, and extracted values. Model output is recorded and replayed so tests are deterministic in CI; live-model tests are a separate, non-gating suite.
- Property-based tests for ArithmeticExtractor: generated operand pairs must retag correctly, and non-arithmetic text must never be retagged.
