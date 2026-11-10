/**
 * Contract tests for Abacus.
 *
 * Abacus makes no network calls; no fetch stub is needed. Tests exercise the
 * full verify() path: packet completeness, verdict derivability, step
 * rendering, and error paths.
 *
 * Requirements: 6.1, 6.2, 6.3
 */

import { describe, it, expect } from "vitest";
import { AbacusOrgan } from "../../../src/organs/abacus/abacusOrgan.ts";
import { SessionCache } from "../../../src/organs/contract/sessionCache.ts";
import { validatePacket } from "../../../src/organs/contract/packetValidator.ts";
import { compareWithTolerance } from "../../../src/organs/contract/comparator.ts";
import type { SubClaim } from "../../../src/intake/types.ts";
import type { ArithmeticOperands } from "../../../src/intake/types.ts";

// ── Sub-claim factories ────────────────────────────────────────────────────

function makeCtx() {
  const cache = new SessionCache();
  const signal = new AbortController().signal;
  return { cache, signal, anchorDate: "2024-10-15T00:00:00Z" };
}

function arithmeticSubClaim(
  ops: ArithmeticOperands | null,
  overrides: Partial<SubClaim> = {},
): SubClaim {
  return {
    id: "sc-01",
    span: [0, 50],
    text: "$50 into $4,890 is a 9,680% gain",
    domain: "arithmetic",
    statedValue: ops?.statedResult ?? null,
    unit: "%",
    entities: {},
    dateExpr: null,
    arithmeticOperands: ops,
    unroutedReason: null,
    userEdited: false,
    originalExtraction: null,
    ...overrides,
  };
}

/** CONCEPT.md worked example: $50 → $4,890 = 9,680% gain */
const CONCEPT_OPS: ArithmeticOperands = {
  kind: "percentage_change",
  values: [50, 4890],
  statedResult: 9680,
};

// ── Packet completeness ────────────────────────────────────────────────────

describe("AbacusOrgan — packet completeness", () => {
  const organ = new AbacusOrgan();

  it("produces a structurally valid packet for a known percentage_change", async () => {
    const packet = await organ.verify(arithmeticSubClaim(CONCEPT_OPS), makeCtx());
    const errors = validatePacket(packet);
    expect(errors, "validation errors: " + JSON.stringify(errors)).toHaveLength(0);
  });

  it("sets organ = 'abacus'", async () => {
    const packet = await organ.verify(arithmeticSubClaim(CONCEPT_OPS), makeCtx());
    expect(packet.organ).toBe("abacus");
  });

  it("sets provenance.source = 'local recomputation'", async () => {
    const packet = await organ.verify(arithmeticSubClaim(CONCEPT_OPS), makeCtx());
    expect(packet.provenance.source).toBe("local recomputation");
  });

  it("sets provenance.requestUrl = 'boltseam://abacus/local'", async () => {
    const packet = await organ.verify(arithmeticSubClaim(CONCEPT_OPS), makeCtx());
    expect(packet.provenance.requestUrl).toBe("boltseam://abacus/local");
  });

  it("rawSha256 is null (local recomputation — no network response)", async () => {
    const packet = await organ.verify(arithmeticSubClaim(CONCEPT_OPS), makeCtx());
    expect(packet.provenance.rawSha256).toBeNull();
  });

  it("rawSha256NullReason is present and non-empty when rawSha256 is null", async () => {
    const packet = await organ.verify(arithmeticSubClaim(CONCEPT_OPS), makeCtx());
    expect(packet.provenance.rawSha256NullReason).toBeTruthy();
    expect(packet.provenance.rawSha256NullReason).toContain("recomputation");
  });

  it("provenance.rawExcerpt contains recomputation steps", async () => {
    const packet = await organ.verify(arithmeticSubClaim(CONCEPT_OPS), makeCtx());
    expect(packet.provenance.rawExcerpt.length).toBeGreaterThan(10);
    // Steps must mention both input values
    expect(packet.provenance.rawExcerpt).toContain("50");
    expect(packet.provenance.rawExcerpt).toContain("4,890");
  });

  it("declares a non-null tolerance for value-based verdicts", async () => {
    const packet = await organ.verify(arithmeticSubClaim(CONCEPT_OPS), makeCtx());
    expect(packet.tolerance).not.toBeNull();
  });

  it("provenance.fetchedAt is a UTC ISO-8601 string", async () => {
    const packet = await organ.verify(arithmeticSubClaim(CONCEPT_OPS), makeCtx());
    expect(packet.provenance.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
});

// ── Verdict derivability ───────────────────────────────────────────────────

describe("AbacusOrgan — verdict derivability (percentage_change)", () => {
  const organ = new AbacusOrgan();

  it("CONCEPT: $50 → $4,890 = 9,680% → supported", async () => {
    // Recomputed: ((4890 - 50) / 50) * 100 = 9680
    const packet = await organ.verify(arithmeticSubClaim(CONCEPT_OPS), makeCtx());
    expect(packet.verdict).toBe("supported");
    expect(packet.claimedValue).toBeCloseTo(9680, 0);
    expect(packet.observedValue).toBeCloseTo(9680, 0);
  });

  it("wrong percentage → contradicted", async () => {
    const packet = await organ.verify(
      arithmeticSubClaim({ kind: "percentage_change", values: [50, 4890], statedResult: 5000 }),
      makeCtx(),
    );
    expect(packet.verdict).toBe("contradicted");
  });

  it("verdict re-derivable from claimed, observed, tolerance", async () => {
    const packet = await organ.verify(arithmeticSubClaim(CONCEPT_OPS), makeCtx());
    if (
      packet.verdict !== "unverifiable" &&
      packet.verdict !== "source_error" &&
      packet.claimedValue !== null &&
      packet.observedValue !== null &&
      packet.tolerance !== null
    ) {
      const { verdict } = compareWithTolerance(
        packet.claimedValue,
        packet.observedValue,
        packet.tolerance,
      );
      expect(verdict).toBe(packet.verdict);
    }
  });
});

// ── Multiple kind ──────────────────────────────────────────────────────────

describe("AbacusOrgan — multiple kind", () => {
  const organ = new AbacusOrgan();

  it("100 to 300 = 3× → supported", async () => {
    const packet = await organ.verify(
      arithmeticSubClaim(
        { kind: "multiple", values: [100, 300], statedResult: 3 },
        { unit: "×" },
      ),
      makeCtx(),
    );
    expect(packet.verdict).toBe("supported");
    expect(packet.observedValue).toBeCloseTo(3, 5);
  });

  it("wrong multiple → contradicted", async () => {
    const packet = await organ.verify(
      arithmeticSubClaim({ kind: "multiple", values: [100, 300], statedResult: 2 }),
      makeCtx(),
    );
    expect(packet.verdict).toBe("contradicted");
  });

  it("produces valid packet", async () => {
    const packet = await organ.verify(
      arithmeticSubClaim({ kind: "multiple", values: [100, 300], statedResult: 3 }),
      makeCtx(),
    );
    expect(validatePacket(packet)).toHaveLength(0);
  });
});

// ── Sum kind ───────────────────────────────────────────────────────────────

describe("AbacusOrgan — sum kind", () => {
  const organ = new AbacusOrgan();

  it("100 + 200 = 300 → supported", async () => {
    const packet = await organ.verify(
      arithmeticSubClaim(
        { kind: "sum", values: [100, 200, 300], statedResult: 300 },
        { unit: "units" },
      ),
      makeCtx(),
    );
    // 100 + 200 = 300; statedResult = 300 → supported
    expect(packet.verdict).toBe("supported");
  });

  it("wrong sum → contradicted", async () => {
    const packet = await organ.verify(
      arithmeticSubClaim({ kind: "sum", values: [100, 200, 300], statedResult: 500 }),
      makeCtx(),
    );
    expect(packet.verdict).toBe("contradicted");
  });

  it("produces valid packet", async () => {
    const packet = await organ.verify(
      arithmeticSubClaim({ kind: "sum", values: [100, 200, 300], statedResult: 300 }),
      makeCtx(),
    );
    expect(validatePacket(packet)).toHaveLength(0);
  });
});

// ── Difference kind ────────────────────────────────────────────────────────

describe("AbacusOrgan — difference kind", () => {
  const organ = new AbacusOrgan();

  it("500 - 200 = 300 → supported", async () => {
    const packet = await organ.verify(
      arithmeticSubClaim(
        { kind: "difference", values: [500, 200], statedResult: 300 },
        { unit: "units" },
      ),
      makeCtx(),
    );
    expect(packet.verdict).toBe("supported");
    expect(packet.observedValue).toBeCloseTo(300, 5);
  });

  it("wrong difference → contradicted", async () => {
    const packet = await organ.verify(
      arithmeticSubClaim({ kind: "difference", values: [500, 200], statedResult: 100 }),
      makeCtx(),
    );
    expect(packet.verdict).toBe("contradicted");
  });

  it("produces valid packet", async () => {
    const packet = await organ.verify(
      arithmeticSubClaim({ kind: "difference", values: [500, 200], statedResult: 300 }),
      makeCtx(),
    );
    expect(validatePacket(packet)).toHaveLength(0);
  });
});

// ── Missing operands ───────────────────────────────────────────────────────

describe("AbacusOrgan — missing_operands", () => {
  const organ = new AbacusOrgan();

  it("returns unverifiable with reason = 'missing_operands' when arithmeticOperands is null", async () => {
    const packet = await organ.verify(arithmeticSubClaim(null), makeCtx());
    expect(packet.verdict).toBe("unverifiable");
    expect(packet.reason).toBe("missing_operands");
  });

  it("produces a structurally valid packet even when operands are missing", async () => {
    const packet = await organ.verify(arithmeticSubClaim(null), makeCtx());
    const errors = validatePacket(packet);
    expect(errors, "validation errors: " + JSON.stringify(errors)).toHaveLength(0);
  });

  it("rawSha256 is null in missing_operands packet", async () => {
    const packet = await organ.verify(arithmeticSubClaim(null), makeCtx());
    expect(packet.provenance.rawSha256).toBeNull();
    expect(packet.provenance.rawSha256NullReason).toBeTruthy();
  });
});

// ── domain ────────────────────────────────────────────────────────────────

describe("AbacusOrgan — domain registration", () => {
  it("declares domain = 'arithmetic'", () => {
    const organ = new AbacusOrgan();
    expect(organ.domain).toBe("arithmetic");
  });
});
