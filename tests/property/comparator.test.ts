/**
 * Property-based and unit tests for the comparator.
 *
 * Properties verified (per spec):
 * 1. Monotonicity: larger |claimed - observed| never produces a "better" verdict.
 * 2. Tolerance symmetry: (claimed + band) and (claimed - band) are both supported.
 * 3. Exactly at-band → supported (inclusive boundary).
 * 4. Just outside band → contradicted (no range given).
 * 5. partially_supported only when claimed is inside a provided range.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  compareWithTolerance,
  computeBand,
} from "../../src/organs/contract/comparator.ts";
import type { Tolerance } from "../../src/organs/contract/types.ts";

// Verdicts ordered from "closest match" to "furthest"
const VERDICT_RANK: Record<string, number> = {
  supported: 0,
  partially_supported: 1,
  contradicted: 2,
};

const relativeTolerance = (value: number): Tolerance => ({
  kind: "relative",
  value,
});
const absoluteTolerance = (value: number): Tolerance => ({
  kind: "absolute",
  value,
  unit: "USD",
});

describe("compareWithTolerance – unit tests", () => {
  it("returns supported when delta = 0", () => {
    const r = compareWithTolerance(100, 100, relativeTolerance(0.01));
    expect(r.verdict).toBe("supported");
    expect(r.delta).toBe(0);
  });

  it("returns supported at exact band boundary (relative)", () => {
    // band = 0.01 * 200 = 2; claimed = 202 → delta = 2 ≤ band
    const r = compareWithTolerance(202, 200, relativeTolerance(0.01));
    expect(r.verdict).toBe("supported");
  });

  it("returns contradicted just outside band (relative)", () => {
    // band = 0.01 * 200 = 2; claimed = 202.01 → delta > band
    const r = compareWithTolerance(202.01, 200, relativeTolerance(0.01));
    expect(r.verdict).toBe("contradicted");
  });

  it("returns supported at exact band boundary (absolute)", () => {
    const r = compareWithTolerance(105, 100, absoluteTolerance(5));
    expect(r.verdict).toBe("supported");
  });

  it("returns contradicted just outside absolute band", () => {
    const r = compareWithTolerance(105.01, 100, absoluteTolerance(5));
    expect(r.verdict).toBe("contradicted");
  });

  it("returns partially_supported when claimed is in range but outside band", () => {
    // close = 200, band = 2; range = [195, 205]; claimed = 204
    const r = compareWithTolerance(204, 200, relativeTolerance(0.01), [195, 205]);
    expect(r.verdict).toBe("partially_supported");
  });

  it("returns contradicted when claimed is outside both band and range", () => {
    const r = compareWithTolerance(210, 200, relativeTolerance(0.01), [195, 205]);
    expect(r.verdict).toBe("contradicted");
  });
});

describe("computeBand", () => {
  it("relative: band = fraction * |observed|", () => {
    expect(computeBand(500, relativeTolerance(0.005))).toBeCloseTo(2.5);
  });

  it("relative: band is 0 when observed is 0", () => {
    expect(computeBand(0, relativeTolerance(0.01))).toBe(0);
  });

  it("absolute: band = tolerance.value", () => {
    expect(computeBand(9999, absoluteTolerance(3))).toBe(3);
  });
});

// ── Property-based tests ────────────────────────────────────────────────────

describe("comparator properties", () => {
  it("prop: delta = 0 always yields supported (relative)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.0001, max: 1000, noNaN: true }),
        fc.double({ min: 0.0001, max: 0.5, noNaN: true }),
        (observed, tolValue) => {
          const r = compareWithTolerance(
            observed,
            observed,
            relativeTolerance(tolValue),
          );
          return r.verdict === "supported";
        },
      ),
    );
  });

  it("prop: tolerance symmetry — ±band both produce supported", () => {
    // At exactly ±band the verdict must be supported (inclusive boundary).
    // We add a tiny epsilon-scaled fuzz because observed + band - observed
    // can lose precision in IEEE-754 double arithmetic.
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 1000, noNaN: true }),
        fc.double({ min: 0.001, max: 0.4, noNaN: true }),
        (observed, tolValue) => {
          const tol = relativeTolerance(tolValue);
          const band = computeBand(observed, tol);
          // Use a claimed value that is exactly band away from observed,
          // ensuring we don't overshoot due to rounding.
          const eps = Math.abs(observed) * Number.EPSILON * 4;
          const rUp = compareWithTolerance(observed + band - eps, observed, tol);
          const rDown = compareWithTolerance(observed - band + eps, observed, tol);
          return rUp.verdict === "supported" && rDown.verdict === "supported";
        },
      ),
    );
  });

  it("prop: monotonicity — larger delta never yields a better verdict rank", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 100, max: 1000, noNaN: true }),
        fc.double({ min: 0.0001, max: 0.3, noNaN: true }),
        fc.double({ min: 0, max: 200, noNaN: true }),
        fc.double({ min: 0, max: 200, noNaN: true }),
        (observed, tolValue, d1, d2) => {
          const tol = relativeTolerance(tolValue);
          const [smaller, larger] = d1 <= d2 ? [d1, d2] : [d2, d1];
          const r1 = compareWithTolerance(observed + smaller, observed, tol);
          const r2 = compareWithTolerance(observed + larger, observed, tol);
          const rank1 = VERDICT_RANK[r1.verdict] ?? 99;
          const rank2 = VERDICT_RANK[r2.verdict] ?? 99;
          // larger delta must never produce a *lower* rank (better verdict)
          return rank2 >= rank1;
        },
      ),
    );
  });

  it("prop: absolute tolerance band is independent of observed value", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1e6, noNaN: true }),
        fc.double({ min: 0.001, max: 100, noNaN: true }),
        (observed, absBand) => {
          const band = computeBand(observed, absoluteTolerance(absBand));
          return Math.abs(band - absBand) < 1e-9;
        },
      ),
    );
  });
});
