# Requirements — Claim Intake and Decomposition

Spec: `claim-intake-decomposition` · Project: Boltseam · Status: draft for Kiro import (created 2026-10-31, pre-implementation)

## Introduction

Boltseam begins when a user pastes a claim post. This feature covers everything from the paste box to a user-confirmed list of atomic sub-claims ready for organ routing: text intake and normalisation, LLM-assisted decomposition into atomic sub-claims under a strict JSON schema, deterministic pre-checks (arithmetic extraction), and a correction UI where the user can edit, split, merge, or delete sub-claims before anything is verified. Nothing in this feature calls a data-source API; it produces the worklist every other feature consumes.

## Glossary

- **Claim post**: the raw text the user pastes (a social post, a screenshot transcription, a quote).
- **Sub-claim**: one atomic, independently checkable assertion extracted from the claim post, with exactly one domain tag.
- **Domain tag**: one of `price`, `fx`, `date`, `repo`, `weather`, `statistic`, `arithmetic`, `unrouted`.
- **Decomposition schema**: the JSON contract every sub-claim must satisfy (id, text span, domain tag, extracted entities, stated value, unit, stated date or date expression).
- **Evidence-free zone**: the rule that intake and decomposition never fetch external data and never emit verdicts.

## Requirements

### Requirement 1: Text intake

**User Story:** As a reader who found a suspicious post, I want to paste it into one box and start an audit, so that I do not have to rewrite or pre-format anything.

#### Acceptance Criteria

1. THE SYSTEM SHALL accept a claim post of 20 to 10,000 characters in a single text field.
2. WHEN a user submits text shorter than 20 characters, THE SYSTEM SHALL reject it with a message explaining that the text is too short to contain a checkable claim.
3. WHEN a user submits text longer than 10,000 characters, THE SYSTEM SHALL truncate nothing silently; it SHALL refuse the submission and state the limit.
4. THE SYSTEM SHALL preserve the original pasted text byte-for-byte for display alongside the report.
5. IF the pasted text contains URLs, THEN THE SYSTEM SHALL keep them as text spans and SHALL NOT fetch them during intake.

### Requirement 2: Decomposition into atomic sub-claims

**User Story:** As a user, I want the post cut into individual checkable assertions, so that each part can be verified by the right specialist organ instead of judged as one blob.

#### Acceptance Criteria

1. WHEN decomposition runs, THE SYSTEM SHALL produce sub-claims that each contain exactly one checkable assertion and exactly one domain tag.
2. THE SYSTEM SHALL record, for each sub-claim, the exact character span of the original text it was extracted from.
3. WHEN a sub-claim contains a stated numeric value, THE SYSTEM SHALL extract the value, its unit, and any stated date or date expression into structured fields.
4. IF a portion of the post contains no checkable assertion (opinion, insult, prediction about the future), THEN THE SYSTEM SHALL mark it `unrouted` with a reason instead of dropping it silently.
5. THE SYSTEM SHALL constrain decomposition output to the decomposition schema via structured output or validated parsing; IF the model output fails schema validation after two retries, THEN THE SYSTEM SHALL show a decomposition failure state and offer manual sub-claim entry.
6. WHILE decomposition is running, THE SYSTEM SHALL show progress and SHALL NOT display any verdict language (no "true", "false", or scores) anywhere in the intake UI.

### Requirement 3: Deterministic arithmetic extraction

**User Story:** As a user, I want pure arithmetic inside the claim ("$50 to $4,890 is a 9,680% gain") recognised as its own sub-claim type, so that it is recomputed exactly instead of being sent to a data API.

#### Acceptance Criteria

1. WHEN a sub-claim asserts a purely arithmetic relationship (percentage change, multiple, sum, difference) between numbers present in the post, THE SYSTEM SHALL tag it `arithmetic` and attach the operands it extracted.
2. IF the arithmetic relationship is ambiguous (operands cannot be identified with confidence), THEN THE SYSTEM SHALL leave the sub-claim in its domain tag and note the ambiguity rather than guessing operands.

### Requirement 4: User correction of the cut

**User Story:** As a user, I want to fix a wrong decomposition before verification runs, so that the organs check what the post actually says.

#### Acceptance Criteria

1. THE SYSTEM SHALL present the sub-claim list for review before any organ is called.
2. WHEN a user edits a sub-claim's text, value, unit, date, or domain tag, THE SYSTEM SHALL mark that sub-claim as user-edited and keep the original extraction visible.
3. THE SYSTEM SHALL allow a user to split one sub-claim into two, merge two into one, delete a sub-claim, and add a new one manually.
4. WHEN a user confirms the list, THE SYSTEM SHALL freeze it as the audit's worklist with a stable id per sub-claim.
5. IF the confirmed list is empty, THEN THE SYSTEM SHALL block the audit and explain why.

### Requirement 5: Privacy and scope guardrails at intake

**User Story:** As a user, I want my pasted text handled in-session only, so that auditing a post does not publish or store it.

#### Acceptance Criteria

1. THE SYSTEM SHALL process the claim post in the browser session and SHALL NOT persist it to any server-side store in the submission build.
2. IF the pasted text appears to contain a credential-like string (API key, password assignment, private key block), THEN THE SYSTEM SHALL warn the user and offer to strip it before decomposition is sent to the model.
3. THE SYSTEM SHALL NOT offer login, accounts, or claim history in this feature.
