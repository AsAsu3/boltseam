/**
 * Unit tests for the schema validator.
 *
 * Requirements: 2.4, 2.5
 */

import { describe, it, expect } from "vitest";
import {
  validateDecomposition,
  SCHEMA_ERRORS,
} from "../../../src/intake/schemaValidator.ts";

// ── Helpers ────────────────────────────────────────────────────────────────

const VALID_SUB_CLAIM = {
  id: "sc-01",
  span: [0, 42],
  text: "BTC was only $61,200 on Saturday Oct 10",
  domain: "price",
  statedValue: 61200,
  unit: "USD",
  entities: { symbol: "BTC" },
  dateExpr: "Saturday Oct 10",
  arithmeticOperands: null,
  unroutedReason: null,
  userEdited: false,
  originalExtraction: null,
};

function validPayload(overrides: object = {}): string {
  return JSON.stringify({
    subClaims: [{ ...VALID_SUB_CLAIM, ...overrides }],
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("validateDecomposition — valid input", () => {
  it("accepts a minimal valid sub-claim", () => {
    const result = validateDecomposition(validPayload());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.subClaims).toHaveLength(1);
      expect(result.subClaims[0].id).toBe("sc-01");
    }
  });

  it("accepts multiple sub-claims", () => {
    const payload = JSON.stringify({
      subClaims: [
        VALID_SUB_CLAIM,
        { ...VALID_SUB_CLAIM, id: "sc-02", span: [43, 90], text: "another" },
      ],
    });
    const result = validateDecomposition(payload);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.subClaims).toHaveLength(2);
  });

  it("accepts an arithmetic sub-claim with arithmeticOperands", () => {
    const result = validateDecomposition(
      validPayload({
        domain: "arithmetic",
        arithmeticOperands: {
          kind: "percentage_change",
          values: [50, 4890],
          statedResult: 9680,
        },
      })
    );
    expect(result.ok).toBe(true);
  });

  it("accepts an unrouted sub-claim", () => {
    const result = validateDecomposition(
      validPayload({
        domain: "unrouted",
        statedValue: null,
        unit: null,
        unroutedReason: "This is an opinion, not a verifiable fact.",
      })
    );
    expect(result.ok).toBe(true);
  });
});

describe("validateDecomposition — invalid JSON", () => {
  it("rejects unparseable JSON", () => {
    const result = validateDecomposition("not-json{{{");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(SCHEMA_ERRORS.INVALID_JSON);
  });

  it("rejects an empty string", () => {
    const result = validateDecomposition("");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(SCHEMA_ERRORS.INVALID_JSON);
  });
});

describe("validateDecomposition — schema violations", () => {
  it("rejects when subClaims is missing", () => {
    const result = validateDecomposition(JSON.stringify({}));
    expect(result.ok).toBe(false);
  });

  it("rejects when domain tag is invalid", () => {
    const result = validateDecomposition(
      validPayload({ domain: "finance" }) // not in the enum
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(SCHEMA_ERRORS.SCHEMA_VIOLATIONS);
  });

  it("rejects when id does not match pattern sc-NN", () => {
    const result = validateDecomposition(validPayload({ id: "claim_1" }));
    expect(result.ok).toBe(false);
  });

  it("rejects when statedValue is a string instead of number|null", () => {
    const result = validateDecomposition(
      validPayload({ statedValue: "61200" })
    );
    expect(result.ok).toBe(false);
  });
});

describe("validateDecomposition — span checks", () => {
  it("rejects a sub-claim with an invalid span (end < start)", () => {
    const result = validateDecomposition(validPayload({ span: [50, 10] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(SCHEMA_ERRORS.MISSING_SPANS);
  });

  it("rejects a sub-claim with a negative span offset", () => {
    const result = validateDecomposition(validPayload({ span: [-1, 10] }));
    expect(result.ok).toBe(false);
  });

  it("provides human-readable error messages on failure", () => {
    const result = validateDecomposition("bad json");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(typeof result.errors[0]).toBe("string");
    }
  });
});
