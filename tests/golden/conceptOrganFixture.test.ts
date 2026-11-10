/**
 * Golden organ-fixture test — CONCEPT.md worked example, full organ dispatch.
 *
 * Runs the 6 CONCEPT.md sub-claims through the Router with all implemented
 * organs registered (Market, FX, Calendar, Abacus, Repo). Network calls are
 * stubbed with recorded API fixtures so the test is fully offline.
 *
 * Expected outcome per sub-claim:
 *   sc-01 (arithmetic) → AbacusOrgan  → supported  (9,680% recomputes correctly)
 *   sc-02 (date)       → CalendarOrgan→ any valid verdict (48h "last weekend")
 *   sc-03 (price)      → MarketOrgan  → contradicted (fixture close ~$61,350 ≠ $61,200
 *                                        but within 0.5%, actually may be supported)
 *   sc-04 (fx)         → FxOrgan      → any valid verdict (amount entity handling)
 *   sc-05 (repo)       → RepoOrgan    → unverifiable/missing_repo_ref (the CONCEPT fixture
 *                                        sub-claim has no owner/repo entity — the organ
 *                                        correctly refuses to guess)
 *   sc-06 (weather)    → Router       → unverifiable/no_organ (no Sky organ yet)
 *
 * Key invariants:
 * - Every sub-claim produces exactly one packet (none dropped).
 * - Every packet is structurally valid (validatePacket returns []).
 * - sc-01 (arithmetic) → supported.
 * - sc-05 → repo organ handles it (unverifiable, not no_organ).
 * - sc-06 → unverifiable / no_organ (router fallback).
 *
 * Requirements: 2.1, 2.3, 3.3, 7.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Router } from "../../src/router/router.ts";
import { MarketOrgan } from "../../src/organs/market/index.ts";
import { FxOrgan } from "../../src/organs/fx/index.ts";
import { CalendarOrgan } from "../../src/organs/calendar/index.ts";
import { AbacusOrgan } from "../../src/organs/abacus/index.ts";
import { RepoOrgan } from "../../src/organs/repo/index.ts";
import { validatePacket } from "../../src/organs/contract/packetValidator.ts";
import { DecompositionClient, FixtureProvider } from "../../src/intake/decompositionClient.ts";
import { extractArithmetic } from "../../src/intake/arithmeticExtractor.ts";
import type { Worklist } from "../../src/intake/types.ts";

// ── Recorded fixture bodies ────────────────────────────────────────────────

import krakenFixture from "../../src/fixtures/market/kraken-xbtusd-20241010.json";
import frankfurterFixture from "../../src/fixtures/fx/frankfurter-usd-jpy-20241010.json";
import nagerCalendarFixture from "../../src/fixtures/calendar/nager-us-2024.json";

const KRAKEN_BODY = JSON.stringify(krakenFixture);
const FRANKFURTER_BODY = JSON.stringify(frankfurterFixture);
const NAGER_BODY = JSON.stringify(nagerCalendarFixture);

// ── The CONCEPT.md post ────────────────────────────────────────────────────

const CONCEPT_POST =
  "I turned $50 into $4,890 in 48 hours trading BTC last weekend. " +
  "That's a 9,680% gain. BTC was only $61,200 on Saturday Oct 10, " +
  "so in yen I was up about ¥9.4 million. The bot's repo hit 2,000 stars " +
  "in its first 3 days, BTW. And it never even rained in Tokyo that weekend, " +
  "so I traded from the park.";

// Anchor date: 2024-10-15 (Mon after the Oct 10 weekend)
const ANCHOR_DATE = "2024-10-15T00:00:00Z";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Build a minimal Worklist from the concept fixture sub-claims. */
async function buildConceptWorklist(): Promise<Worklist> {
  const client = new DecompositionClient(new FixtureProvider());
  const result = await client.decompose(CONCEPT_POST);
  if (!result.ok) throw new Error(`Decomposition failed: ${result.message}`);

  const subClaims = extractArithmetic(result.subClaims, CONCEPT_POST);
  return {
    auditId: "golden-test-001",
    createdAt: ANCHOR_DATE,
    originalText: CONCEPT_POST,
    subClaims,
  };
}

/** Build the router with all 5 implemented organs registered. */
function buildRouter(): Router {
  return new Router(10_000)
    .register(new MarketOrgan())
    .register(new FxOrgan())
    .register(new CalendarOrgan())
    .register(new AbacusOrgan())
    .register(new RepoOrgan());
}

/** Stub fetch: routes by URL prefix to the right fixture body. */
function makeFetchStub(): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation(async (url: string) => {
    const urlStr = String(url);

    if (urlStr.includes("kraken.com")) {
      return { ok: true, status: 200, text: async () => KRAKEN_BODY };
    }
    if (urlStr.includes("binance.com")) {
      // Simulate geo-block; Binance is cross-check only
      return { ok: false, status: 451, text: async () => "Unavailable For Legal Reasons" };
    }
    if (urlStr.includes("frankfurter")) {
      return { ok: true, status: 200, text: async () => FRANKFURTER_BODY };
    }
    if (urlStr.includes("open.er-api.com")) {
      return { ok: false, status: 503, text: async () => "" };
    }
    if (urlStr.includes("date.nager.at")) {
      return { ok: true, status: 200, text: async () => NAGER_BODY };
    }
    // Unexpected URL
    return { ok: false, status: 404, text: async () => "" };
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("CONCEPT.md golden organ fixture", () => {
  let worklist: Worklist;

  beforeEach(async () => {
    vi.restoreAllMocks();
    worklist = await buildConceptWorklist();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Packet count and completeness ────────────────────────────────────────

  it("produces exactly 6 packets — no sub-claim is dropped", async () => {
    vi.stubGlobal("fetch", makeFetchStub());
    const router = buildRouter();
    const packets = await router.dispatch(worklist, { anchorDate: ANCHOR_DATE });
    expect(packets).toHaveLength(6);
  });

  it("every packet is structurally valid (validatePacket returns [])", async () => {
    vi.stubGlobal("fetch", makeFetchStub());
    const router = buildRouter();
    const packets = await router.dispatch(worklist, { anchorDate: ANCHOR_DATE });

    for (const packet of packets) {
      const errors = validatePacket(packet);
      expect(
        errors,
        `Packet ${packet.subClaimId} (${packet.organ}) had validation errors: ${JSON.stringify(errors)}`,
      ).toHaveLength(0);
    }
  });

  it("each packet's subClaimId matches a sub-claim in the worklist", async () => {
    vi.stubGlobal("fetch", makeFetchStub());
    const router = buildRouter();
    const packets = await router.dispatch(worklist, { anchorDate: ANCHOR_DATE });

    const ids = new Set(worklist.subClaims.map((sc) => sc.id));
    for (const packet of packets) {
      expect(ids.has(packet.subClaimId), `Unknown subClaimId: ${packet.subClaimId}`).toBe(true);
    }
  });

  // ── sc-01: arithmetic → Abacus ────────────────────────────────────────────

  it("sc-01 (arithmetic) is handled by abacus and returns supported", async () => {
    vi.stubGlobal("fetch", makeFetchStub());
    const router = buildRouter();
    const packets = await router.dispatch(worklist, { anchorDate: ANCHOR_DATE });

    const sc01 = packets.find((p) => p.subClaimId === "sc-01");
    expect(sc01).toBeDefined();
    expect(sc01!.organ).toBe("abacus");
    expect(sc01!.verdict).toBe("supported");
  });

  it("sc-01 (arithmetic) provenance.source = 'local recomputation'", async () => {
    vi.stubGlobal("fetch", makeFetchStub());
    const router = buildRouter();
    const packets = await router.dispatch(worklist, { anchorDate: ANCHOR_DATE });

    const sc01 = packets.find((p) => p.subClaimId === "sc-01");
    expect(sc01!.provenance.source).toBe("local recomputation");
    expect(sc01!.provenance.rawSha256).toBeNull();
    expect(sc01!.provenance.rawSha256NullReason).toBeTruthy();
  });

  // ── sc-02: date → Calendar ────────────────────────────────────────────────

  it("sc-02 (date) is handled by the calendar organ", async () => {
    vi.stubGlobal("fetch", makeFetchStub());
    const router = buildRouter();
    const packets = await router.dispatch(worklist, { anchorDate: ANCHOR_DATE });

    const sc02 = packets.find((p) => p.subClaimId === "sc-02");
    expect(sc02).toBeDefined();
    expect(sc02!.organ).toBe("calendar");
  });

  // ── sc-03: price → Market ─────────────────────────────────────────────────

  it("sc-03 (price) is handled by the market organ", async () => {
    vi.stubGlobal("fetch", makeFetchStub());
    const router = buildRouter();
    const packets = await router.dispatch(worklist, { anchorDate: ANCHOR_DATE });

    const sc03 = packets.find((p) => p.subClaimId === "sc-03");
    expect(sc03).toBeDefined();
    expect(sc03!.organ).toBe("market");
  });

  it("sc-03 provenance references Kraken", async () => {
    vi.stubGlobal("fetch", makeFetchStub());
    const router = buildRouter();
    const packets = await router.dispatch(worklist, { anchorDate: ANCHOR_DATE });

    const sc03 = packets.find((p) => p.subClaimId === "sc-03");
    expect(sc03!.provenance.source).toContain("Kraken");
  });

  // ── sc-04: fx → FX organ ──────────────────────────────────────────────────

  it("sc-04 (fx) is handled by the fx organ", async () => {
    vi.stubGlobal("fetch", makeFetchStub());
    const router = buildRouter();
    const packets = await router.dispatch(worklist, { anchorDate: ANCHOR_DATE });

    const sc04 = packets.find((p) => p.subClaimId === "sc-04");
    expect(sc04).toBeDefined();
    expect(sc04!.organ).toBe("fx");
  });

  // ── sc-05: repo → Repo organ ───────────────────────────────────────────────

  it("sc-05 (repo) is handled by the repo organ (not router fallback)", async () => {
    vi.stubGlobal("fetch", makeFetchStub());
    const router = buildRouter();
    const packets = await router.dispatch(worklist, { anchorDate: ANCHOR_DATE });

    const sc05 = packets.find((p) => p.subClaimId === "sc-05");
    expect(sc05).toBeDefined();
    expect(sc05!.organ).toBe("repo");
  });

  it("sc-05 (repo) returns unverifiable because the fixture sub-claim has no owner/repo entity", async () => {
    // The CONCEPT.md fixture has entities: { durationDays: 3 } — no owner/repo.
    // The RepoOrgan correctly refuses to guess (Req 1.2 — missing_repo_ref).
    vi.stubGlobal("fetch", makeFetchStub());
    const router = buildRouter();
    const packets = await router.dispatch(worklist, { anchorDate: ANCHOR_DATE });

    const sc05 = packets.find((p) => p.subClaimId === "sc-05");
    expect(sc05!.verdict).toBe("unverifiable");
    // reason must be missing_repo_ref or no_star_history (depends on claimType)
    expect(["missing_repo_ref", "no_star_history"]).toContain(sc05!.reason);
  });

  // ── sc-06: weather → no organ ────────────────────────────────────────────

  it("sc-06 (weather) → unverifiable / no_organ (no Sky organ)", async () => {
    vi.stubGlobal("fetch", makeFetchStub());
    const router = buildRouter();
    const packets = await router.dispatch(worklist, { anchorDate: ANCHOR_DATE });

    const sc06 = packets.find((p) => p.subClaimId === "sc-06");
    expect(sc06).toBeDefined();
    expect(sc06!.verdict).toBe("unverifiable");
    expect(sc06!.reason).toBe("no_organ");
  });

  // ── Verdict count invariants ──────────────────────────────────────────────

  it("at least 1 supported verdict (Abacus on sc-01)", async () => {
    vi.stubGlobal("fetch", makeFetchStub());
    const router = buildRouter();
    const packets = await router.dispatch(worklist, { anchorDate: ANCHOR_DATE });

    const supported = packets.filter((p) => p.verdict === "supported");
    expect(supported.length).toBeGreaterThanOrEqual(1);
  });

  it("exactly 1 unverifiable/no_organ verdict (weather, since repo now has an organ)", async () => {
    vi.stubGlobal("fetch", makeFetchStub());
    const router = buildRouter();
    const packets = await router.dispatch(worklist, { anchorDate: ANCHOR_DATE });

    const noOrgan = packets.filter(
      (p) => p.verdict === "unverifiable" && p.reason === "no_organ",
    );
    expect(noOrgan).toHaveLength(1);
  });
});
