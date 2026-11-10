/**
 * Property-based tests for Abacus.
 *
 * Properties verified:
 * 1. Exact arithmetic always produces "supported" verdict.
 * 2. If claimedResult matches the recomputed value, verdict is "supported".
 * 3. Verdict is re-derivable from (claimedValue, observedValue, tolerance).
 * 4. Missing operands always yields unverifiable/missing_operands.
 *
 * Requirements: 6.1
 */

import { describe, it } from "vitest";
import * as fc from "fast-check";
import { AbacusOrgan } from "../../src/organs/abacus/abacusOrgan.ts";
import { compareWithTolerance } from "../../src/organs/contract/comparator.ts";
import { validatePacket } from "../../src/organs/contract/packetValidator.ts";
import { SessionCache } from "../../src/organs/contract/sessionCache.ts";
import type { SubClaim } from "../../src/intake/types.ts";

const organ = new AbacusOrgan();

function makeCtx() {
  return {
    cache: new SessionCache(),
    signal: new AbortController().signal,
    anchorDate: "2024-10-15T00:00:00Z",
  };
}

function makeArithSubClaim(overrides: Partial<SubClaim>): SubClaim {
  return {
    id: "sc-prop",
    span: [0, 10],
    text: "test",
    domain: "arithmetic",
    statedValue: null,
    unit: null,
    entities: {},
    dateExpr: null,
    arithmeticOperands: null,
    unroutedReason: null,
    userEdited: false,
    originalExtraction: null,
    ...overrides,
  };
}

// ── Properties ─────────────────────────────────────────────────────────────

describe("Abacus properties", () => {
  it("prop: exact percentage_change always produces supported", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 1, max: 1000, noNaN: true }),
        fc.double({ min: 1, max: 1000, noNaN: true }),
        async (start, end) => {
          const correctPct = ((end - start) / start) * 100;
          const sc = makeArithSubClaim({
            statedValue: correctPct,
            unit: "%",
            arithmeticOperands: {
              kind: "percentage_change",
              values: [start, end],
              statedResult: correctPct,
            },
          });
          const packet = await organ.verify(sc, makeCtx());
          return packet.verdict === "supported";
        },
      ),
    );
  });

  it("prop: exact multiple always produces supported", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 1, max: 1000, noNaN: true }),
        fc.double({ min: 1, max: 1000, noNaN: true }),
        async (start, end) => {
          const correctMult = end / start;
          const sc = makeArithSubClaim({
            statedValue: correctMult,
            unit: "×",
            arithmeticOperands: {
              kind: "multiple",
              values: [start, end],
              statedResult: correctMult,
            },
          });
          const packet = await organ.verify(sc, makeCtx());
          return packet.verdict === "supported";
        },
      ),
    );
  });

  it("prop: verdict is re-derivable from claimed, observed, tolerance", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 1, max: 1000, noNaN: true }),
        fc.double({ min: 1, max: 1000, noNaN: true }),
        // Arbitrary statedResult (may be wrong, that's fine — we just check derivability)
        fc.double({ min: 0, max: 20000, noNaN: true }),
        async (start, end, statedResult) => {
          const sc = makeArithSubClaim({
            statedValue: statedResult,
            unit: "%",
            arithmeticOperands: {
              kind: "percentage_change",
              values: [start, end],
              statedResult,
            },
          });
          const packet = await organ.verify(sc, makeCtx());

          // For value-based verdicts, re-derive from packet fields
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
            return verdict === packet.verdict;
          }
          return true; // unverifiable packets don't need re-derivation
        },
      ),
    );
  });

  it("prop: missing arithmeticOperands always yields unverifiable/missing_operands", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string(),
        async (text) => {
          const sc = makeArithSubClaim({
            text,
            arithmeticOperands: null,
          });
          const packet = await organ.verify(sc, makeCtx());
          return packet.verdict === "unverifiable" && packet.reason === "missing_operands";
        },
      ),
    );
  });

  it("prop: every packet passes structural validation", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 1, max: 1000, noNaN: true }),
        fc.double({ min: 1, max: 1000, noNaN: true }),
        fc.double({ min: -100, max: 20000, noNaN: true }),
        async (start, end, statedResult) => {
          const sc = makeArithSubClaim({
            statedValue: statedResult,
            unit: "%",
            arithmeticOperands: {
              kind: "percentage_change",
              values: [start, end],
              statedResult,
            },
          });
          const packet = await organ.verify(sc, makeCtx());
          const errors = validatePacket(packet);
          return errors.length === 0;
        },
      ),
    );
  });
});
