/**
 * Deterministic claimed/observed comparator.
 *
 * Rules:
 * - "supported": |claimed − observed| ≤ tolerance band
 * - "contradicted": |claimed − observed| > tolerance band AND claimed is
 *    outside the provided range (when a range is given)
 * - "partially_supported": claimed is outside close-match band but falls
 *    inside the provided high/low range (e.g. intraday print vs day close)
 *
 * Tolerances:
 * - RelativeTolerance: band = tolerance.value × |observed|
 * - AbsoluteTolerance: band = tolerance.value (same unit)
 *
 * All arithmetic is performed on plain JS numbers; the design doc states that
 * percentages and multiples use exact rational arithmetic in Abacus — those
 * are handled in the Abacus module, not here.
 */

import type { Tolerance } from "./types.ts";
import type { Verdict } from "./types.ts";

/** Result of a single comparison */
export interface CompareResult {
  verdict: Verdict;
  /** Absolute difference |claimed - observed| */
  delta: number;
  /** Computed tolerance band (absolute value) */
  band: number;
}

/**
 * Compare a claimed value against an observed value with a declared tolerance.
 *
 * @param claimed   Value stated in the post
 * @param observed  Value observed from the source
 * @param tolerance Declared organ tolerance
 * @param range     Optional [low, high] range for partially_supported logic
 *                  (e.g. day's high–low for price organs)
 */
export function compareWithTolerance(
  claimed: number,
  observed: number,
  tolerance: Tolerance,
  range?: [number, number],
): CompareResult {
  const band = computeBand(observed, tolerance);
  const delta = Math.abs(claimed - observed);

  if (delta <= band) {
    return { verdict: "supported", delta, band };
  }

  // Outside close-match band — check range for partially_supported
  if (range !== undefined) {
    const [lo, hi] = range;
    if (claimed >= lo && claimed <= hi) {
      return { verdict: "partially_supported", delta, band };
    }
  }

  return { verdict: "contradicted", delta, band };
}

/**
 * Compute the tolerance band as an absolute value.
 * For relative tolerances the band grows with |observed|, so a claim of 0
 * against an observed of 0 always gets band = 0 (considered supported).
 */
export function computeBand(observed: number, tolerance: Tolerance): number {
  if (tolerance.kind === "relative") {
    return tolerance.value * Math.abs(observed);
  }
  // absolute
  return tolerance.value;
}

/**
 * Convenience: compare and return only the verdict.
 */
export function verdictFor(
  claimed: number,
  observed: number,
  tolerance: Tolerance,
  range?: [number, number],
): Verdict {
  return compareWithTolerance(claimed, observed, tolerance, range).verdict;
}
