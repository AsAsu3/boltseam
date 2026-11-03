# Structure steering — Boltseam

## Repository layout (target)

```
/
├── .kiro/
│   ├── specs/
│   │   ├── claim-intake-decomposition/
│   │   ├── organ-router-first-organs/
│   │   ├── evidence-stitcher-report/
│   │   ├── organ-repo/            (added when scheduled)
│   │   ├── organ-sky/             (added when scheduled)
│   │   └── organ-statistics/      (added when scheduled)
│   ├── steering/                  (product.md, tech.md, structure.md)
│   ├── hooks/                     (JSON hook definitions)
│   └── settings/                  (MCP config; created at build start)
├── src/
│   ├── intake/                    (paste, normalise, decompose, correct — spec 1)
│   ├── organs/
│   │   ├── contract/              (packet schema, organ interface, comparator)
│   │   ├── market/  fx/  calendar/  repo/  sky/  statistics/
│   │   └── abacus/                (built-in arithmetic checker — not an organ)
│   ├── router/                    (dispatch, timeout, cache, failure policy)
│   ├── stitcher/                  (pure join, headline rule, consistency pass)
│   ├── report/                    (views, plain-language dictionary, static export)
│   └── fixtures/                  (recorded API responses for tests and demo mode)
├── tests/
│   ├── contract/  property/  golden/
├── public/                        (host static assets, if the host needs them)
├── CONCEPT.md  NAMING.md  COMPLIANCE.md  ROADMAP.md
├── LICENSE                        (MIT)
└── README.md                      (setup, run, spec map, mixture-label rule)
```

## Placement rules

- A new organ gets: a folder under `src/organs/`, its own spec folder under `.kiro/specs/`, fixtures under `src/fixtures/<organ>/`, and contract tests under `tests/contract/<organ>/`. Nothing else needs to change; if it does, the router contract has leaked — fix the contract, not the caller.
- Cross-cutting types (Evidence Packet, SubClaim, Worklist) live in `src/organs/contract/` and `src/intake/` respectively and are imported, never copied.
- The plain-language dictionary is the only module allowed to turn verdict/reason/note codes into display words; it lives in `src/report/`.
- Fixtures are data, not code: raw response bodies with a small JSON sidecar (request URL, fetched-at, source). Fixture files must never contain credentials or personal data.
- Demo/fixture mode and live mode share every code path except the fetch layer; a fixture fetch must produce packets whose provenance says `fixture` with the original recorded fetch time.

## Naming

- Spec folders: kebab-case feature names, matching the spec's title.
- Organ folders: the organ's domain noun (`market`, `fx`, `calendar`, `repo`, `sky`, `statistics`).
- Files: `camelCase.ts` for modules, `PascalCase.tsx` for components if a component framework is used.
- Verdict and reason codes: `snake_case` string literals, defined once in the contract package.
