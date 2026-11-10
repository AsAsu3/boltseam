/**
 * Contract tests for the FX Organ.
 *
 * All tests run against recorded API fixtures — no live network calls.
 * Fixtures: src/fixtures/fx/
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { FxOrgan } from "../../../src/organs/fx/fxOrgan.ts";
import { SessionCache } from "../../../src/organs/contract/sessionCache.ts";
import { validatePacket } from "../../../src/organs/contract/packetValidator.ts";
import type { SubClaim } from "../../../src/intake/types.ts";
import frankfurterFixture from "../../../src/fixtures/fx/frankfurter-usd-jpy-20241010.json";

// ── Fixture wiring ─────────────────────────────────────────────────────────

const FRANKFURTER_BODY = JSON.stringify(frankfurterFixture);
// 63000 USD × 148.97 = 9,385,110 JPY
const USD_AMOUNT = 63000;
const JPY_RATE = 148.97;
const CONVERTED_JPY = USD_AMOUNT * JPY_RATE; // 9_385_110

function fxSubClaim(overrides: Partial<SubClaim> = {}): SubClaim {
  return {
    id: "sc-02",
    span: [0, 20],
    text: "that's about ¥9,385,110",
    domain: "fx",
    statedValue: CONVERTED_JPY,
    unit: "JPY",
    entities: {
      amount: USD_AMOUNT,
      fromCurrency: "USD",
      toCurrency: "JPY",
    },
    dateExpr: "2024-10-10",
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
  const fetchStub = vi.fn().mockImplementation(async (url: string) => {
    if (String(url).includes("frankfurter")) {
      return {
        ok: true,
        status: 200,
        text: async () => fetchBody ?? FRANKFURTER_BODY,
      };
    }
    return { ok: false, status: 404, text: async () => "" };
  });
  return { cache, signal: controller.signal, anchorDate: "2024-10-15T00:00:00Z", fetchStub };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("FxOrgan — packet completeness", () => {
  let organ: FxOrgan;

  beforeEach(() => {
    organ = new FxOrgan();
    vi.restoreAllMocks();
  });

  it("produces a structurally valid packet", async () => {
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(fxSubClaim(), { cache, signal, anchorDate });
    const errors = validatePacket(packet);
    expect(errors, "validation errors: " + JSON.stringify(errors)).toHaveLength(0);
  });

  it("sets organ = 'fx'", async () => {
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(fxSubClaim(), { cache, signal, anchorDate });
    expect(packet.organ).toBe("fx");
  });

  it("sets tolerance to 1% relative", async () => {
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(fxSubClaim(), { cache, signal, anchorDate });
    expect(packet.tolerance).toEqual({ kind: "relative", value: 0.01 });
  });

  it("includes provenance.requestUrl pointing to Frankfurter", async () => {
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(fxSubClaim(), { cache, signal, anchorDate });
    expect(packet.provenance.requestUrl).toContain("frankfurter");
  });

  it("labels source as central-bank reference rate", async () => {
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(fxSubClaim(), { cache, signal, anchorDate });
    expect(packet.provenance.source.toLowerCase()).toContain("central-bank");
  });

  it("includes rawSha256 hex string", async () => {
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(fxSubClaim(), { cache, signal, anchorDate });
    expect(packet.provenance.rawSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("FxOrgan — verdict derivation", () => {
  let organ: FxOrgan;

  beforeEach(() => {
    organ = new FxOrgan();
    vi.restoreAllMocks();
  });

  it("returns 'supported' when claimed ≈ recomputed amount (within 1%)", async () => {
    // claimed = rate × amount = 148.97 × 63000 = 9,385,110
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(
      fxSubClaim({ statedValue: CONVERTED_JPY }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("supported");
  });

  it("returns 'contradicted' when claimed differs by >1%", async () => {
    // claimed = 8_000_000 (way off from ~9.4M)
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(
      fxSubClaim({ statedValue: 8_000_000 }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("contradicted");
  });

  it("stores observedValue = amount × rate", async () => {
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(fxSubClaim(), { cache, signal, anchorDate });
    expect(packet.observedValue).toBeCloseTo(CONVERTED_JPY, 0);
  });
});

describe("FxOrgan — fallback and error handling", () => {
  let organ: FxOrgan;

  beforeEach(() => {
    organ = new FxOrgan();
    vi.restoreAllMocks();
  });

  it("falls back to open.er-api.com when Frankfurter fails and labels source accordingly", async () => {
    const cache = new SessionCache();
    const signal = new AbortController().signal;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("frankfurter")) {
        return { ok: false, status: 503, text: async () => "" };
      }
      if (urlStr.includes("open.er-api.com")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            result: "success",
            base_code: "USD",
            rates: { JPY: 149.5 },
          }),
        };
      }
      return { ok: false, status: 404, text: async () => "" };
    }));

    const packet = await organ.verify(
      fxSubClaim({ statedValue: USD_AMOUNT * 149.5 }),
      { cache, signal, anchorDate: "2024-10-15T00:00:00Z" },
    );

    expect(packet.provenance.source).toContain("open.er-api.com");
    const errors = validatePacket(packet);
    expect(errors).toHaveLength(0);
  });

  it("returns source_error when both sources fail", async () => {
    const cache = new SessionCache();
    const signal = new AbortController().signal;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "",
    }));

    const packet = await organ.verify(
      fxSubClaim(),
      { cache, signal, anchorDate: "2024-10-15T00:00:00Z" },
    );
    expect(packet.verdict).toBe("source_error");
  });

  it("returns unverifiable/missing_operands when currencies are absent", async () => {
    const cache = new SessionCache();
    const signal = new AbortController().signal;

    const packet = await organ.verify(
      fxSubClaim({ entities: {} }),
      { cache, signal, anchorDate: "2024-10-15T00:00:00Z" },
    );
    expect(packet.verdict).toBe("unverifiable");
    expect(packet.reason).toBe("missing_operands");
  });

  it("returns unverifiable/future_date for future dates", async () => {
    const cache = new SessionCache();
    const signal = new AbortController().signal;

    const packet = await organ.verify(
      fxSubClaim({ dateExpr: "2099-01-01" }),
      { cache, signal, anchorDate: "2024-10-15T00:00:00Z" },
    );
    expect(packet.verdict).toBe("unverifiable");
    expect(packet.reason).toBe("future_date");
  });
});

describe("FxOrgan — quantity_mismatch note", () => {
  it("adds quantity_mismatch note when entity amount differs significantly from statedValue", async () => {
    const organ = new FxOrgan();
    vi.restoreAllMocks();

    const cache = new SessionCache();
    const signal = new AbortController().signal;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => FRANKFURTER_BODY,
    }));

    // amount in entities = 1000 USD, but statedValue = 9_385_110 JPY
    // These are clearly different quantities (the stated conversion, vs a small principal)
    const packet = await organ.verify(
      fxSubClaim({
        entities: { amount: 1000, fromCurrency: "USD", toCurrency: "JPY" },
        statedValue: CONVERTED_JPY,
      }),
      { cache, signal, anchorDate: "2024-10-15T00:00:00Z" },
    );

    expect(packet.notes).toContain("quantity_mismatch");
  });
});
