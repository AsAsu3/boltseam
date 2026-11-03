# Compliance map — Boltseam vs Kiroween 2026 rules

Sources: official rules at kiroween.devpost.com/rules (read 2026-10-31) and the rules-check log `~/workspace/goals/earn-with-muse-top-10-build-out/hidden_files/kiroween-rules-check-2026-10-31.md`. Rule references are to the official rules sections. Items that could not be verified from public sources are marked **to-confirm** and must be checked at the stated moment — they are not assumed.

## Rule-by-rule map

| # | Requirement (source) | How this design satisfies it | Status / owner |
|---|----------------------|------------------------------|----------------|
| 1 | Eligibility: entrant of majority age, residence not on the excluded list (§3). Japan is not excluded. | Individual entry by the user (Japan resident). Team size 1 of max 3. | Satisfied by entrant facts; no action. |
| 2 | Submission Period: projects newly created after 2026-10-30 09:00 PT; pre-existing code/work incorporated must be disclosed; standard frameworks/libraries/templates allowed (§4, New Projects Only). | This repo skeleton and spec pack were created 2026-10-31, inside the period. The build starts from an empty codebase. Only standard libraries/frameworks will be used. No code, text, images, fixtures, or data from WatchDigest (submitted 2026-10-28, pre-period) or from the static red-flag checklist are used — the differentiation is documented in CONCEPT.md and steering/product.md forbids those domains outright. | Satisfied by design; build discipline required (hooks + steering enforce). |
| 3 | Category: enter one category; Frankenstein = stitch a chimera of technologies into one app (§4). | Entered as Frankenstein only. The concept is a literal chimera of six unrelated public APIs joined by an evidence seam format (CONCEPT.md). | Decided. |
| 4 | Working app built with Kiro (IDE, CLI, Web, and/or Crew); insufficient Kiro use can disqualify (§4). | The implementation is executed inside Kiro from this spec pack: spec-driven workflow per feature, steering always on, three agent hooks, an MCP server exposing the organs during development, property-based tests. The `.kiro` directory in the repo is the auditable evidence of that use. | **User-side dependency**: requires the user's Kiro sign-in (see "User steps"). Muse can prepare everything except operating the user's Kiro account. |
| 5 | Public GitHub repo (not GitLab/Bitbucket) containing all source, assets, instructions (§4). | Repo created from this skeleton at build start, public from the first push, README with setup/run instructions and a spec map. | Build step. |
| 6 | Open-source licence file, detectable at the top/About of the repo (§4). | **MIT** — rationale: the app is a client-side tool built entirely on free public APIs and standard libraries; MIT is the most widely recognised permissive licence, is what GitHub detects most reliably for the About section, imposes no copyleft obligations on judges who fork it to test, and matches the licence norms of the organ-source client libraries. A standard MIT `LICENSE` file goes at repo root in the first commit. | Decided (MIT). |
| 7 | `/.kiro` directory at repo root with specs/hooks/steering; must NOT be in `.gitignore` — ignoring it can disqualify (§4). | This skeleton already has `.kiro/` at the root of `~/workspace/kiroween/` (the future repo root). The planned `.gitignore` (node artefacts, build output, env files only) never lists `.kiro`, includes an explicit comment saying so, and the `kiro-dir-guard` hook runs a `git check-ignore` test whenever `.gitignore` is edited. Pre-submission checklist item: run `git check-ignore .kiro` and confirm no match, and confirm `.kiro` is visible in the public repo. | Satisfied by design + hook + checklist. |
| 8 | Working app URL; judge login credentials in the form if needed (§4, Testing §4). | Deployed on a free static/serverless host (GitHub Pages or Cloudflare Pages — final pick at the deployment milestone). Boltseam has **no accounts and no login**, so no judge credentials are needed; the submission form will state "no login required". App must remain available free and unrestricted until the Judging Period ends (2027-01-29 PT) — keep the deployment and repo untouched-but-live after submission. | Build + deploy step; post-submission availability noted. |
| 9 | Text description explaining features and functionality (§4). | Drafted from CONCEPT.md at submission-writing time (problem, organs, evidence seams, verdict taxonomy, worked example). All materials in English (see #12). | Submission step. |
| 10 | Write-up on how Kiro was used — judges must understand its effective use; the rules prompt for IDE/CLI/Web/Crew, custom agents, hooks, spec-driven development, steering, MCP, PBT, powers (§4). | Write-up outline in this file (next section) covers: spec-driven development (this pack → implementation, with approval gates), steering (three docs and the evidence discipline they encode), hooks (the three hooks and what each caught during the build — log real firings), MCP (organ-mcp used to test organs during development), property-based testing (comparator, Abacus, stitcher invariants), and which Kiro surface was used for what. Only features actually used will be claimed; the build log must record hook firings and MCP usage so the write-up is evidence-based. | Submission step; build log discipline required. |
| 11 | Demo video: under 3 minutes, public on YouTube, shows the project working, no third-party trademarks or copyrighted material without permission (§4). | Video plan (next section): screen recording + generated narration, ~2:30 target, all visuals from the app itself and self-made title cards; no third-party music (silence or self-generated tones only), no third-party logos (organ sources named in text only). No face or voice of the entrant is required: narration is synthesised, consistent with the entrant's standing privacy rule. Uploaded public by the user (their YouTube channel — a user step; see below). | Plan ready; recording at the roadmap milestone. |
| 12 | All materials in English, or with English translation (§4, Language Requirements). | Repo docs, app UI strings, Devpost text, write-up, and video narration are English-first. (Internal planning docs in this workspace may be Japanese; nothing Japanese-only is submitted.) | Satisfied by convention; check at submission pass. |
| 13 | Third-party integrations must be authorised under their terms (§4). | All organ sources are public APIs offered for unauthenticated public use (Kraken, Binance, Frankfurter, Nager.Date, GitHub, Open-Meteo, World Bank). No scraping, no credentials of third parties, no prediction-market or wallet data. Per-source terms to be re-read at implementation time and any attribution requirement implemented then (**to-confirm** per source at build). | Design satisfied; per-source terms check at build. |
| 14 | Submission is the entrant's original work; open-source components allowed with licence compliance (§4 IP, §7). | All code written for this project inside the period; library licences are standard permissive ones; the repo's own code is MIT. | Build discipline. |
| 15 | No financial/preferential support from Sponsor/Administrator in developing the project (§4). | None. Kiro credits under #16 are the hackathon's own entrant allotment, expressly provided by the rules. | Satisfied. |
| 16 | Free 4,000 Kiro credits: request via the Credit Request Form by **2026-12-01 12:00 PT** with accurate Kiro user ID / AWS account ID; allow 48 business hours for review; credits expire 2026-12-31 23:59 PT (§4). | **User step** (needs the user's own Kiro account identity). Target: request by 2026-11-07, hard internal deadline 2026-11-24 to leave review slack. Do not let this drift to Dec 1. | **User action with date** — see ROADMAP. |
| 17 | Registration for the hackathon (§4). | Already completed by the user on 2026-10-25 on their own device. | Done; no action. |
| 18 | Devpost project + submission form completed within the Submission Period (closes 2026-12-04 14:00 PT = 2026-12-05 07:00 JST) (§1, §4). | Submission target: 2026-12-02 (JST), leaving ~3 days of buffer. Devpost project creation is a **user-side step** in an attended session (Muse prepares all text and assets beforehand). | Scheduled in ROADMAP. |
| 19 | Bonus prizes (optional, §4/§6): Bonus Blog (public blog post during the period, mentioning Kiroween 2026; top-100 by score), Social Blitz (post starting with #KiroweenHackathon26 + link in the form; 5 selected), Best Demo (top Presentation score in top 10% overall — automatic from the main submission), Best Kiro Crew App (only if a Kiro Crew app is built — not planned). | Blog: the entrant's existing note channel can carry a build post during the period with the required mention; text can be prepared by Muse, posting is a user action. Social Blitz: requires the user's own social account — user decision, not assumed. Best Demo: no extra action beyond a strong video. Crew: out of scope. | Optional user decisions; flagged, not scheduled as commitments. |

## Kiro write-up outline (for the submission)

1. **Surfaces used** — which parts were built in Kiro IDE vs CLI/Web (record truthfully during the build; to be filled from the build log).
2. **Spec-driven development** — this pack's three specs (plus per-organ specs added during the build): how requirements in EARS constrained the implementation, where approval gates changed the design, and one honest comparison against vibe coding from the build experience.
3. **Steering** — product.md's hard rules (verdicts from data, no truth score, out-of-domain list) and concrete moments they redirected generated code.
4. **Hooks** — the three hooks, with at least one real firing each from the build log (a spec inconsistency caught, an evidence-lint catch, the gitignore guard test).
5. **MCP** — organ-mcp: how exposing the organs as MCP tools let the agent verify its own organs against recorded fixtures while writing the next organ.
6. **Property-based testing** — the invariants chosen (comparator monotonicity, Abacus identities, stitcher no-untraced-values) and any real bug PBT caught.
7. **Custom agents / powers** — only if actually used; otherwise this section states plainly that none were used rather than padding.

## Demo video plan (target 2:30, hard cap under 3:00)

| Time | Content |
|------|---------|
| 0:00–0:20 | Title card (self-made): "Boltseam — a claim, taken apart." The fictional worked-example post appears as pasted text. |
| 0:20–0:50 | Paste the claim; the decomposition cut appears; one wrong cut is corrected by hand to show the correction step. |
| 0:50–1:40 | Organs run with per-organ status; seams open one by one: Abacus holds (arithmetic supported), Market seam tears (price contradicted, with the day's range shown), FX seam shows the quantity-mismatch note. |
| 1:40–2:10 | The Repo sub-claim lands on Unverifiable — narrated as a feature: "the creature refuses to guess." Headline counts appear: Mixed, 1/1/3/1. |
| 2:10–2:30 | Static export downloaded and opened; closing card with repo URL and category. |

Recording rules: screen capture of the real deployed app (fixture mode only if live APIs fail on recording day — and if fixture mode is used, the UI's fixture label stays visible; never present fixture data as live), synthesised narration, no third-party music or logos, public YouTube upload.

## "Built with Kiro" execution plan

What happens inside Kiro itself (the disqualifying-risk item if skipped):

1. The user opens this repo in Kiro; these specs are imported/used as the spec workflow's source (requirements → design → tasks per feature, with the user's approval at gates).
2. Implementation of every task list happens in Kiro (IDE primarily; CLI/Web as the user prefers), with steering active from the first session.
3. The three hooks are enabled from day one; every firing that changes work is noted in a build log (`BUILDLOG.md`, created at build start) — the write-up quotes it.
4. organ-mcp is configured under `.kiro/settings/` and used when implementing organs 4–6 and during integration testing.
5. Property-based tests are written and run inside the Kiro workflow per the specs' testing sections.

What Muse can prepare without the user: this entire spec pack, all submission texts, the video script and narration text, README drafts, checklists, and (outside Kiro) nothing that would count as the submitted implementation — pre-writing the app code outside Kiro would undermine both the "built with Kiro" requirement's spirit and the new-project evidence trail, so it will not be done.

## Precisely what needs the user (and only the user)

| Step | Why it is user-only | Deadline |
|------|---------------------|----------|
| Kiro account sign-in / install or web access on their machine | It is the user's own account and device; Muse does not hold the credentials. | Before build start; target 2026-11-03 |
| Kiro credits request (4,000 credits form, with their Kiro user ID / AWS account ID) | Requires the user's own account identifiers; incorrect IDs are rejected per the rules. Allow 48 business hours for review. | Request by 2026-11-07; absolute deadline 2026-12-01 12:00 PT |
| Approval gates inside the Kiro spec workflow (requirements/design approvals) | The spec workflow's gates are designed for the developer; the user is the developer of record. Muse prepares the material for each gate. | At each spec milestone (ROADMAP) |
| Devpost project creation + final submission | Submission is an attestation by the entrant on their account. Muse prepares every field's content in advance for an attended session. | Draft by 2026-11-30; submit target 2026-12-02 (hard close 2026-12-05 07:00 JST) |
| YouTube upload of the demo video (public) | The user's channel/account. Muse produces the finished video file, title, and description. | By 2026-12-01 |
| (Optional) Bonus blog post + Social Blitz post | Published under the user's own channels/accounts, if the user chooses to enter those bonus categories. | During the Submission Period |

## To-confirm list (not guessed)

- Exact Frankfurter / open.er-api.com endpoint shapes and current terms — confirm against official docs at organ implementation.
- CoinGecko free-tier key policy — optional source only; confirm only if the Market Organ's third source is attempted.
- Kiro hook JSON schema version in the user's installed Kiro (IDE 1.x uses `.kiro/hooks/*.json`; a migration prompt may appear) — validate on first open; accept migration if offered and commit the result.
- Kiro MCP config filename/schema under `.kiro/settings/` — confirm against current Kiro docs at build start.
- Free host choice (GitHub Pages vs Cloudflare Pages) and per-source browser CORS behaviour — decide from live tests during the first organ's implementation.
- Whether judges' region affects Binance availability — mitigated by Kraken-primary design; no confirmation needed pre-build.
- J-PlatPat formal trademark search for "Boltseam" — run 2026-10-31 via browser, 0 records both for the exact mark alone and with the reading ボルトシーム (recorded in NAMING.md; not a legal clearance opinion). No further search needed before the hackathon submission; re-check only before any post-hackathon public launch if the mark's use changes.
