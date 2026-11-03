# Roadmap — Boltseam, 2026-10-31 → 2026-12-05 07:00 JST

Hard deadline: **2026-12-05 07:00 JST** (2026-12-04 14:00 PT). Submission target: **2026-12-02 JST**, keeping three buffer days. All dates JST. "User" marks a step only the user can do (see COMPLIANCE.md); everything else is preparation or in-Kiro build work.

## Phase 0 — Concept and specs (2026-10-31 – 11-03)

- [x] 2026-10-31: Concept brief, naming with full collision check, three Kiro specs, steering drafts, hooks, compliance map (this pack).
- [x] 2026-11-01 – 11-02: Spec review pass against the rules (EARS check, Frankenstein fit, compliance re-read). Add per-organ specs for Repo, Sky, Statistics (same trio format) so the freeze covers all six organs. — Done 2026-11-02: EARS form confirmed in all three existing specs; the three new specs (`organ-repo-github`, `organ-sky-openmeteo`, `organ-statistics-worldbank`, each requirements/design/tasks) keep the same contract, add no monitoring/wallet/prediction-market scope, and flag endpoint paths as to-confirm at build time per steering/tech.md. Freeze on 2026-11-03 unchanged.
- [x] **User, by 2026-11-03**: Kiro access ready on their machine (install/sign-in or web), repo created public on GitHub from this skeleton with MIT `LICENSE` and the planned `.gitignore` (which must not list `.kiro`); first commit includes the full `.kiro` directory. — Done 2026-11-03: Kiro sign-in confirmed by the user; public repo created by the user at https://github.com/AsAsu3/boltseam (empty, no README/.gitignore/license auto-init); this skeleton pushed as the first content commit with the full `.kiro` directory.
- [x] **2026-11-03: SPEC FREEZE v1.** After this date, spec changes go through a change note in the spec folder (what changed, why) — no silent rewrites. — In effect 2026-11-03: all six organ specs plus intake, router and stitcher specs frozen as committed in the first commit.

## Phase 1 — Credits and core build (2026-11-04 – 11-10)

- [ ] **User, by 2026-11-07**: Submit the Kiro credits request form (4,000 credits; their Kiro user ID / AWS account ID). Absolute rules deadline is 2026-12-01 12:00 PT with 48 business hours of review — November 7 keeps a month of slack.
- [ ] Build in Kiro, in task-list order: intake spec tasks 1–4 (form, normaliser, decomposition client, validator).
- [ ] Router spec tasks 1–4 (packet schema, comparator, router, cache/failure policy).
- [ ] Start `BUILDLOG.md`: record hook firings, MCP usage, and any spec change notes — the write-up is built from this log.
- [ ] Milestone M1 (2026-11-10): a pasted claim produces a frozen, user-corrected worklist; packets exist for fixture data end-to-end (organs may still be fixture-backed).

## Phase 2 — Organs (2026-11-11 – 11-17)

- [ ] Market Organ live against Kraken (+ Binance cross-check); FX Organ live against Frankfurter; Calendar Organ + Abacus complete. Contract + property tests green.
- [ ] Per-source terms/CORS confirmations from COMPLIANCE.md's to-confirm list closed and noted in code headers; proxy decision made per source.
- [ ] Repo Organ (GitHub API) implemented from its spec.
- [ ] Milestone M2 (2026-11-17): the CONCEPT.md worked example audits end-to-end against live sources for Market/FX/Calendar/Abacus, and against the Repo Organ for its sub-claim.

## Phase 3 — Remaining organs and stitching (2026-11-18 – 11-24)

- [ ] Sky Organ (Open-Meteo) and Statistics Organ (World Bank) implemented; six-organ registry complete.
- [ ] Stitcher spec implemented: pure join, headline rule, consistency pass, report view with visible seams, static export.
- [ ] organ-mcp in active use for organ testing inside Kiro; evidence-format lint hook running on all report/stitcher edits.
- [ ] Golden + property test suites green, including the worked-example golden test (headline "Mixed", counts 1/1/3/1/0 on fixtures).
- [ ] Milestone M3 (2026-11-24): feature-complete audit flow on live data. **Credits-request fallback checkpoint**: if credits were somehow not requested by today, the user submits the form today at the latest.

## Phase 4 — Deployment and hardening (2026-11-25 – 11-28)

- [ ] Deploy to the chosen free host; judge path tested from a clean browser profile: no login, one paste, full audit, export download.
- [ ] Failure drills: kill each source (block the host) and confirm `source_error` rows render in plain language; 429 behaviour verified against the cache/latch policy.
- [ ] README finalised (setup, run, spec map, mixture-label rule, organ/source table with attribution where terms require it).
- [ ] Pre-submission repo checks: `git check-ignore .kiro` returns nothing; `.kiro` visible in the public repo; LICENSE detectable in About; no secrets in history (search for key-like strings).
- [ ] Milestone M4 (2026-11-28): submission-ready build frozen; only fixes after this point.

## Phase 5 — Video, texts, Devpost (2026-11-29 – 12-02)

- [ ] 2026-11-29: Record the demo against the deployed app per the COMPLIANCE.md shot list; synthesised narration; target 2:30, hard cap under 3:00; no third-party material.
- [ ] **User, by 2026-12-01**: Upload the video to YouTube as public; confirm the link plays without login.
- [ ] 2026-11-30: Devpost draft fully populated in an attended session (description from CONCEPT.md, Kiro write-up from BUILDLOG.md per the COMPLIANCE.md outline, repo URL, app URL, video link, category Frankenstein).
- [ ] 2026-12-01: Full submission rehearsal — read the Devpost preview as a judge: every link clicked, video watched start to finish, app audited once from the live URL.
- [ ] **User, 2026-12-02: SUBMIT.** (Attended; submission is the entrant's attestation.)

## Phase 6 — Buffer and close-out (2026-12-03 – 12-05 07:00 JST)

- [ ] Buffer for judge-path breakage: if the app URL or repo is found broken, fix the deployment (not the submission content) and re-verify.
- [ ] Optional bonus actions if the user chooses: bonus blog post published with the Kiroween mention; Social Blitz post starting with #KiroweenHackathon26 with the link added to the form before the deadline.
- [ ] 2026-12-05 07:00 JST: hard close. After this, keep the app deployed and the repo public and unchanged in substance until the Judging Period ends (2027-01-29 PT), per the rules' testing-availability requirement.

## Kill / pivot criteria

| Trigger (measured at the milestone) | Action |
|--------------------------------------|--------|
| By M1 (11-10) the decomposition → worklist flow is not working in Kiro | Cut scope: manual sub-claim entry becomes the primary intake (decomposition becomes assistive), keep organs and stitcher unchanged. The audit value survives; the video shows the correction UI as the main interaction. |
| By M2 (11-17) fewer than 2 of the first 3 organs pass their live contract tests | Ship a 3-organ creature (whichever pass, plus Abacus) and move the remaining organs to "designed, not built" in the write-up — honest scope over broken breadth. Do not fake organ results with fixtures presented as live. |
| Kiro access or credits blocked by 2026-11-10 (user-side dependency unresolved) | Escalate to the user immediately with the exact blocker; if unresolved by 2026-11-17, abandon this cycle rather than building outside Kiro (a non-Kiro build risks the insufficient-Kiro-use disqualification and wastes the remaining window). |
| A primary source dies or changes terms mid-build | Swap to the documented fallback for that organ (FX: er-api; Market: Binance/Kraken order swap). If both sources for an organ die, the organ ships in `unverifiable`-only mode with the reason stated — never silently substitute a different kind of data. |
| By M4 (11-28) no deployable public URL | Pivot hosting the same day (GitHub Pages ↔ Cloudflare Pages); if neither works by 11-30, submit with the repo + video and the best available URL rather than missing the deadline — and state the situation honestly in the submission's testing notes. |
| Video cannot be recorded against the live app by 12-01 | Record against fixture mode with the fixture label visible on screen and say so in the video description; never present fixture output as live data. |
| At any point the concept drifts toward monitoring, wallets, or prediction markets | Stop and re-read steering/product.md: that is a different, ineligible-for-reuse product. The drift itself is the kill signal for the drifted feature. |
