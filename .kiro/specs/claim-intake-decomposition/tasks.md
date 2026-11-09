# Implementation Plan — Claim Intake and Decomposition

Spec: `claim-intake-decomposition` · Execute in Kiro from this task list after requirements and design are approved in the spec workflow.

- [x] 1. Scaffold the intake module and shared types
  - Create the client app skeleton per steering/structure.md; define `SubClaim`, `Worklist`, and domain-tag types with no verdict vocabulary in this package.
  - Add the decomposition JSON Schema as a checked-in artifact used by both validator and tests.
  - _Requirements: 2.1, 2.3_

- [x] 2. Implement IntakeForm and Normaliser
  - Single text field with character counter; enforce 20 / 10,000 character guards with the exact refusal messages; keep the original text immutable after submit.
  - Implement the credential-pattern scan with warn-and-strip flow before any model call.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 5.2_

- [x] 3. Implement DecompositionClient with structured output
  - System prompt encoding the domain taxonomy and schema; structured JSON request; timeout and single network retry.
  - Keep model access behind an interface so the provider can be swapped via configuration.
  - _Requirements: 2.1, 2.2, 2.3, 2.6_

- [x] 4. Implement SchemaValidator and fallbacks
  - Validate output against the schema (spans mandatory); retry up to 2 times with validator errors appended; then route to manual-entry fallback.
  - _Requirements: 2.4, 2.5_

- [x] 5. Implement ArithmeticExtractor (deterministic)
  - Pure functions detecting percentage/multiple/sum/difference assertions with all operands present in the post; retag to `arithmetic` with operands; ambiguity leaves the domain tag untouched with a note.
  - _Requirements: 3.1, 3.2_

- [x] 6. Implement CorrectionUI
  - Sub-claim cards with span highlighting into the original text; edit (with original extraction preserved and userEdited flag), split, merge, delete, add; confirm action freezes the Worklist; empty worklist blocks with explanation.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 7. Wire the hand-off to the organ router
  - Emit the frozen Worklist in the contract shape the router spec consumes; no data-source calls anywhere in this package (assert by lint rule / import boundary).
  - _Requirements: 2.6, 5.1, 5.3_

- [ ] 8. Tests
  - Unit tests for guards and credential scan.
  - Golden-fixture decomposition tests with recorded model responses, including the CONCEPT.md worked example (expected: 6 sub-claims — arithmetic, date, price, fx, repo, weather).
  - Property-based tests for ArithmeticExtractor retagging.
  - _Requirements: 1.2, 2.5, 3.1, 3.2_
