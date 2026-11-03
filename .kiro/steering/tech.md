# Tech steering — Boltseam

## Stack

- **Language**: TypeScript throughout (app, organs, tests). Strict mode on.
- **App shape**: a client-side single-page app; no user accounts, no server-side storage of claim text. Organ calls go directly to public APIs from the browser where CORS allows; where a source blocks browser calls, use the thin proxy described below — never a database.
- **Proxy (only if needed)**: a single serverless function on the host's free tier that forwards GET requests to an allow-list of organ source hosts and returns the body unchanged. It must not log request contents beyond counts, must not add data, and packets must record that the fetch passed through it. Decide per-source at build time from live CORS behaviour; record the decision in the build log.
- **Hosting**: a free static/serverless host (GitHub Pages or Cloudflare Pages; final choice at deployment milestone — see ROADMAP.md). The deployed URL must need no login for judges.
- **LLM access**: decomposition only, behind a provider interface in the intake package. API key, if the chosen provider needs one, is supplied via environment at deploy time and never committed. If no key is available in the judging environment, the app must still run its recorded-fixture demo mode (labelled as fixture mode in the UI) so judges can see the full flow.
- **Hashing**: SHA-256 via Web Crypto (`crypto.subtle`) over the exact raw response body text.

## Data-source rules

- Primary sources are free and keyless: Kraken public API, Binance public API, Frankfurter, Nager.Date, GitHub REST API (unauthenticated), Open-Meteo Archive + Geocoding, World Bank API.
- CoinGecko is optional and key-flagged; do not make any committed feature depend on it.
- Exact endpoint paths and parameters must be confirmed against the source's current official documentation at implementation time and the confirmation noted in the organ's code header. Do not code endpoints from memory.
- Rate limits are product behaviour, not an afterthought: one retry maximum, 429 latches the source off for the rest of the audit, session cache keyed by request URL.

## Testing

- Vitest (or the Kiro-default equivalent) for unit and contract tests; recorded API fixtures for organs — live calls are never part of the gating test suite.
- Property-based tests are required for: the verdict comparator, the arithmetic checker (Abacus), and the stitcher invariants (row count, no untraced values, headline derivation). Use fast-check or equivalent.
- Every spec's golden fixture (starting with the CONCEPT.md worked example) lives under `tests/fixtures/` and is replayable offline.

## Kiro usage conventions for this repo

- Specs live in `.kiro/specs/<feature>/` with `requirements.md` (EARS), `design.md`, `tasks.md`. Implementation follows the task lists; when reality diverges, update the spec first, then the code.
- Steering files in `.kiro/steering/` are always-on context; keep them short and current.
- Hooks live in `.kiro/hooks/` as JSON files. If the installed Kiro version asks to migrate hook format on open, accept the migration and commit the migrated files — the hook behaviour matters, not the schema vintage.
- MCP: the organs are exposed during development through a local `organ-mcp` server; its config lives under `.kiro/settings/` (confirm exact filename/schema against current Kiro docs at build start).
- The `/.kiro` directory must never be added to `.gitignore`. A guard hook enforces this.

## Code conventions

- Organs are pure adapters: one source, one `verify` function, no cross-organ imports. Shared logic lives in the comparator and packet modules only.
- No verdict vocabulary in the intake package; no model calls outside the decomposition client and (optionally) report-language assistance — and never for verdicts.
- All user-facing wording comes from the plain-language dictionary module; do not hard-code verdict or reason strings in components.
