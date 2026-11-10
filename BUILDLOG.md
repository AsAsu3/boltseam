# Build log — Boltseam

A factual record of build sessions. Implementation is executed inside Kiro,
against the specs in `.kiro/specs/` with the steering files in
`.kiro/steering/` always on. This log records what each session did and the
evidence it produced (task checkboxes, test runs, builds).

## 2026-11-09 — M1 build sessions (Kiro CLI)

Environment: Kiro CLI 3.1.0 (`kiro-cli chat`, non-interactive mode), signed in
with the project owner's Kiro account. Sessions ran in order; each session
re-read its spec's `requirements.md` and `design.md` before executing tasks.

### Session 1 — claim-intake-decomposition, tasks 1–4

- Scaffold (Vite + Vitest, TypeScript strict) and shared types (`SubClaim`,
  `Worklist`, domain tags) with no verdict vocabulary in the intake package.
- Decomposition JSON Schema checked in as an artifact shared by the validator
  and the tests.
- `Normaliser` with the 20 / 10,000 character guards and a credential-pattern
  scan with warn-and-strip before any model call; `IntakeForm` keeps the
  submitted original text immutable.
- `DecompositionClient` behind a provider interface, with a fixture-backed
  default provider (the CONCEPT.md worked example plus a generic stub), so
  the whole flow runs with no API key and no external model call. Timeout,
  one network retry, two schema retries, then manual-entry fallback.
- `SchemaValidator` (AJV) with typed error codes.
- Evidence: tasks 1–4 marked `[x]` in the spec; 29/29 tests passed;
  `tsc && vite build` clean.

### Session 2 — organ-router-first-organs, tasks 1–4

- Evidence Packet contract: types, JSON-level completeness rules, and a
  packet validator shared by organs, stitcher and tests.
- Comparator library: deterministic claimed/observed comparison with
  relative and absolute tolerances and a partially-supported band. Includes
  property-based tests (monotonicity, tolerance symmetry); one property was
  corrected during the session for floating-point epsilon at large observed
  values, with a dedicated exact-boundary unit test added.
- `Router`: registry dispatch by domain tag, 10 s per-organ timeout,
  per-sub-claim status events, rejection converted to `source_error`, and
  `unverifiable/no_organ` for unimplemented tags.
- Session cache keyed by request URL with original fetch time preserved;
  fetch wrapper with one retry with backoff and a 429 latch per source.
- Evidence: tasks 1–4 marked `[x]`; 73/73 tests passed cumulatively;
  `tsc --noEmit` clean.

### Session 3 — claim-intake-decomposition, tasks 5–7

- `ArithmeticExtractor` (deterministic): percentage / multiple / sum /
  difference detection with operands taken from the post itself; unambiguous
  assertions are retagged to `arithmetic` with operands attached, ambiguous
  ones keep their tag with a note.
- `CorrectionUI` (plain DOM): sub-claim cards with span highlighting into the
  original text; edit (original extraction preserved, `userEdited` flag),
  split, merge, delete, add; confirm freezes the Worklist; an empty worklist
  blocks with an explanation.
- Hand-off wiring: `freezeWorklist()` stamps an audit id and creation time,
  renumbers sub-claims, and returns a frozen Worklist in exactly the shape
  `Router.dispatch()` consumes. No data-source calls exist in the intake
  package.
- Golden test: the CONCEPT.md worked example is replayed through the fixture
  provider and produces exactly 6 sub-claims with the expected domain tags
  (arithmetic, date, price, fx, repo, weather).
- Evidence: tasks 5–7 marked `[x]`; 112/112 tests passed across 9 test
  files; `tsc --noEmit` and `tsc && vite build` clean.

### M1 status

M1 definition met on fixture data: a pasted claim produces a frozen,
user-corrected worklist, and the Router emits Evidence Packets for it
end-to-end. Organs are still fixture/stub-backed; unimplemented domain tags
return `unverifiable/no_organ` by design, and real organs land in M2.

### Standing notes

- Decomposition currently runs in fixture mode. A live provider can be
  configured behind the existing interface at deployment time; the app must
  keep its labelled fixture demo mode for judging environments without a key
  (see `.kiro/steering/tech.md`).
- Intake task 8 (dedicated test pass) remains open as a checkbox; the unit,
  contract, property and golden tests named above were written alongside
  tasks 1–7, and the remaining task-8 scope is the dedicated review pass.
- The hook definitions in `.kiro/hooks/` are IDE-format JSON; the CLI
  sessions above did not execute them, and no hook firings are claimed here.

## M2 sessions — 2026-11-10 (Kiro CLI, same environment as M1)

Three further non-interactive sessions ran on 2026-11-10. The CLI was
found still logged in (Builder ID); no re-login was needed.

- Session A (Router tasks 5–7): Market Organ (Kraken primary; a Binance
  cross-check that fails for availability reasons, including the HTTP 451
  geo-block observed from this machine, is treated as source unavailable
  and never as source_disagreement), FX Organ (Frankfurter — the API has
  moved to https://api.frankfurter.dev/v1; the migration is recorded as a
  CHANGE NOTES entry in the Router spec's tasks.md, and the endpoint was
  confirmed live before implementation; open.er-api.com remains the
  fallback), Calendar Organ (Nager.Date v3). Tasks 5–7 checked [x] by the
  session. 161/161 tests passed; tsc --noEmit clean.
- Session B (Router tasks 8–10): Abacus (arithmetic recomputation;
  verdicts only from the deterministic comparator), the organ-mcp stdio
  server exposing market/fx/calendar/abacus verify tools through the same
  Organ interface, and the Tests task (Abacus contract + property tests,
  and a golden test running all six CONCEPT.md sub-claims through the
  Router with recorded fixtures). Tasks 8–10 checked [x] by the session.
  204/204 tests passed; tsc --noEmit clean. The Router spec is complete.
- Session C (Repo Organ tasks 1–7, plus Intake task 8): the session was
  INTERRUPTED by Kiro's monthly usage limit ("You've reached your monthly
  usage limit") before its final verification pass. State left behind,
  verified by direct inspection after the interruption: the Repo Organ
  implementation, fixtures and contract tests exist and the full Vitest
  suite passes (242/242, 16 files), but `tsc --noEmit` reports 4 errors
  in the Repo Organ files (two unused declarations in
  src/organs/repo/repoOrgan.ts, one type error and one unused variable in
  tests/contract/repo/repoOrgan.test.ts), and the task checkboxes in
  organ-repo-github/tasks.md and Intake task 8 were not yet ticked. The
  session's own analysis found Intake task 8's named tests already exist
  and pass, but it did not get to record that. These residuals are
  recorded here rather than silently fixed outside Kiro; they are the
  first items for the next Kiro session once usage is available again.

M2 status against ROADMAP: the organs named in the M2 milestone (Market,
FX, Calendar, Abacus, Repo) are implemented; the milestone is not ticked
complete until the Session C residuals above are closed inside Kiro.
