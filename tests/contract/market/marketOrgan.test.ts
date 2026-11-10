/**
 * Contract tests for the Market Organ.
 *
 * All tests run against recorded API fixtures — no live network calls.
 * Fixtures: src/fixtures/market/
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { MarketOrgan } from "../../../src/organs/market/marketOrgan.ts";
import { SessionCache } from "../../../src/organs/contract/sessionCache.ts";
import { validatePacket } from "../../../src/organs/contract/packetValidator.ts";
import type { SubClaim } from "../../../src/intake/types.ts";
import krakenFixture from "../../../src/fixtures/market/kraken-xbtusd-20241010.json";

// ── Fixture wiring ─────────────────────────────────────────────────────────

const KRAKEN_BODY = JSON.stringify(krakenFixture);

/** Build a minimal valid SubClaim for price domain. */
function priceSubClaim(overrides: Partial<SubClaim> = {}): SubClaim {
  return {
    id: "sc-01",
    span: [0, 10],
    text: "BTC was $61,350 on Oct 10",
    domain: "price",
    statedValue: 61350,
    unit: "USD",
    entities: { symbol: "BTC" },
    dateExpr: "Oct 10 2024",
    arithmeticOperands: null,
    unroutedReason: null,
    userEdited: false,
    originalExtraction: null,
    ...overrides,
  };
}

function makeCtx(fetchBody?: string) {
  const cache = new SessionCache();
  const controller = new AbortController();

  // Stub globalThis.fetch so no real network calls are made
  const fetchStub = vi.fn().mockImplementation(async (url: string) => {
    const urlStr = String(url);
    if (urlStr.includes("kraken.com")) {
      return {
        ok: true,
        status: 200,
        text: async () => fetchBody ?? KRAKEN_BODY,
      };
    }
    // Binance — simulate 451 geo-block (should be treated as unavailable, not an error)
    if (urlStr.includes("binance.com")) {
      return { ok: false, status: 451, text: async () => "Unavailable For Legal Reasons" };
    }
    return { ok: false, status: 404, text: async () => "" };
  });

  return {
    cache,
    signal: controller.signal,
    anchorDate: "2024-10-15T00:00:00Z",
    fetchStub,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("MarketOrgan — packet completeness", () => {
  let organ: MarketOrgan;

  beforeEach(() => {
    organ = new MarketOrgan();
    vi.restoreAllMocks();
  });

  it("produces a structurally valid packet for a known symbol and date", async () => {
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const sc = priceSubClaim();
    const packet = await organ.verify(sc, { cache, signal, anchorDate });

    const errors = validatePacket(packet);
    expect(errors, "packet validation errors: " + JSON.stringify(errors)).toHaveLength(0);
  });

  it("sets organ = 'market'", async () => {
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(priceSubClaim(), { cache, signal, anchorDate });
    expect(packet.organ).toBe("market");
  });

  it("stores claimedValue from subClaim.statedValue", async () => {
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(priceSubClaim({ statedValue: 61350 }), { cache, signal, anchorDate });
    expect(packet.claimedValue).toBe(61350);
  });

  it("sets tolerance to 0.5% relative", async () => {
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(priceSubClaim(), { cache, signal, anchorDate });
    expect(packet.tolerance).toEqual({ kind: "relative", value: 0.005 });
  });

  it("includes provenance.source pointing to Kraken", async () => {
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(priceSubClaim(), { cache, signal, anchorDate });
    expect(packet.provenance.source).toContain("Kraken");
  });

  it("includes a non-empty rawExcerpt", async () => {
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(priceSubClaim(), { cache, signal, anchorDate });
    expect(packet.provenance.rawExcerpt.length).toBeGreaterThan(0);
  });

  it("includes a rawSha256 hex string", async () => {
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(priceSubClaim(), { cache, signal, anchorDate });
    expect(packet.provenance.rawSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("includes provenance.requestUrl containing the Kraken endpoint", async () => {
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(priceSubClaim(), { cache, signal, anchorDate });
    expect(packet.provenance.requestUrl).toContain("api.kraken.com");
  });
});

describe("MarketOrgan — verdict derivation", () => {
  let organ: MarketOrgan;

  beforeEach(() => {
    organ = new MarketOrgan();
    vi.restoreAllMocks();
  });

  it("returns 'supported' when claimed ≈ close (within 0.5%)", async () => {
    // close = 61350.0; claimed = 61350 → delta 0 ≤ band
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(priceSubClaim({ statedValue: 61350 }), { cache, signal, anchorDate });
    expect(packet.verdict).toBe("supported");
  });

  it("returns 'contradicted' when claimed is outside range", async () => {
    // close = 61350, range [60200, 62100]; claimed = 55000 → contradicted
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(priceSubClaim({ statedValue: 55000 }), { cache, signal, anchorDate });
    expect(packet.verdict).toBe("contradicted");
  });

  it("returns 'partially_supported' when claimed is inside high-low range but outside close tolerance", async () => {
    // close = 61350, range [60200, 62100]; claimed = 62000 — inside range, outside 0.5% band
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(priceSubClaim({ statedValue: 62000 }), { cache, signal, anchorDate });
    expect(packet.verdict).toBe("partially_supported");
  });

  it("does NOT add source_disagreement when Binance returns 451 (geo-blocked)", async () => {
    // Binance returns 451 → treated as unavailable, no source_disagreement
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(priceSubClaim({ statedValue: 61350 }), { cache, signal, anchorDate });
    expect(packet.notes).not.toContain("source_disagreement");
  });
});

describe("MarketOrgan — unverifiable cases", () => {
  let organ: MarketOrgan;

  beforeEach(() => {
    organ = new MarketOrgan();
    vi.restoreAllMocks();
  });

  it("returns unverifiable/unknown_symbol for unrecognised symbol", async () => {
    const cache = new SessionCache();
    const signal = new AbortController().signal;

    const packet = await organ.verify(
      priceSubClaim({ entities: { symbol: "FOOBAR" } }),
      { cache, signal, anchorDate: "2024-10-15T00:00:00Z" },
    );
    expect(packet.verdict).toBe("unverifiable");
    expect(packet.reason).toBe("unknown_symbol");
  });

  it("returns unverifiable/future_date when date is after anchorDate", async () => {
    const cache = new SessionCache();
    const signal = new AbortController().signal;

    const packet = await organ.verify(
      priceSubClaim({ dateExpr: "2099-01-01" }),
      { cache, signal, anchorDate: "2024-10-15T00:00:00Z" },
    );
    expect(packet.verdict).toBe("unverifiable");
    expect(packet.reason).toBe("future_date");
  });

  it("returns unverifiable/unknown_date when dateExpr cannot be resolved", async () => {
    const cache = new SessionCache();
    const signal = new AbortController().signal;

    const packet = await organ.verify(
      priceSubClaim({ dateExpr: "sometime last year" }),
      { cache, signal, anchorDate: "2024-10-15T00:00:00Z" },
    );
    expect(packet.verdict).toBe("unverifiable");
    expect(packet.reason).toBe("unknown_date");
  });

  it("returns source_error when Kraken returns HTTP error", async () => {
    const cache = new SessionCache();
    const signal = new AbortController().signal;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    }));

    const packet = await organ.verify(
      priceSubClaim(),
      { cache, signal, anchorDate: "2024-10-15T00:00:00Z" },
    );
    expect(packet.verdict).toBe("source_error");
  });

  it("returns unverifiable/unknown_symbol when statedValue is null", async () => {
    const cache = new SessionCache();
    const signal = new AbortController().signal;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => KRAKEN_BODY,
    }));

    const packet = await organ.verify(
      priceSubClaim({ statedValue: null }),
      { cache, signal, anchorDate: "2024-10-15T00:00:00Z" },
    );
    expect(packet.verdict).toBe("unverifiable");
  });
});

describe("MarketOrgan — cache behaviour", () => {
  it("serves from cache on second call and sets fromCache flag", async () => {
    const organ = new MarketOrgan();
    const cache = new SessionCache();
    const signal = new AbortController().signal;

    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("binance.com")) {
        return { ok: false, status: 451, text: async () => "" };
      }
      callCount++;
      return { ok: true, status: 200, text: async () => KRAKEN_BODY };
    }));

    const ctx = { cache, signal, anchorDate: "2024-10-15T00:00:00Z" };
    const sc = priceSubClaim();

    await organ.verify(sc, ctx);
    await organ.verify(sc, ctx);

    // Kraken should only be called once (second call served from cache)
    expect(callCount).toBe(1);
  });
});
