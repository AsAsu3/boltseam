/**
 * Abacus — deterministic arithmetic recomputation checker.
 *
 * Abacus is NOT an organ in the product vocabulary, but it implements the
 * Organ interface so the Router can dispatch "arithmetic" sub-claims to it
 * without special-casing.
 *
 * No network calls are ever made. `ctx.cache` and `ctx.signal` are ignored.
 *
 * Supported arithmetic kinds (from ArithmeticOperands):
 *   "percentage_change" — ((values[1] - values[0]) / values[0]) * 100
 *   "multiple"          — values[1] / values[0]
 *   "sum"               — sum(values[0..n-2]) compared to values[n-1]
 *                         OR if only 2 values, sum = statedResult
 *   "difference"        — values[0] - values[1]
 *
 * Tolerance:
 *   percentage_change, multiple: 0.1% relative ({ kind:"relative", value:0.001 })
 *   sum, difference:             0.5 absolute ({ kind:"absolute", value:0.5, unit:"units" })
 *
 * Provenance:
 *   source:              "local recomputation"
 *   requestUrl:          "boltseam://abacus/local"
 *   rawSha256:           null    (local recomputation — no network response to hash)
 *   rawSha256NullReason: "local recomputation — no network response to hash"
 *
 * Verdicts come exclusively from compareWithTolerance() — never from model output.
 *
 * Requirements: 6.1, 6.2, 6.3
 */

import type { Organ, OrganContext, EvidencePacket, Tolerance } from "../contract/index.ts";
import type { SubClaim, ArithmeticOperands } from "../../intake/types.ts";
import { compareWithTolerance } from "../contract/index.ts";

// ── Tolerances ─────────────────────────────────────────────────────────────

const RELATIVE_TOL: Tolerance = { kind: "relative", value: 0.001 }; // 0.1%
const ABSOLUTE_TOL: Tolerance = { kind: "absolute", value: 0.5, unit: "units" };

// ── Helpers ────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, "Z");
}

/** Format a number for display in step strings — no scientific notation. */
function fmt(n: number): string {
  if (!isFinite(n)) return String(n);
  // Use locale-independent fixed notation, trimming trailing zeros.
  const s = n.toPrecision(10).replace(/\.?0+$/, "");
  // Add thousands-separator for readability in steps.
  const [intPart, fracPart] = s.split(".");
  const withCommas = intPart!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fracPart !== undefined ? `${withCommas}.${fracPart}` : withCommas;
}

// ── Recomputation logic ────────────────────────────────────────────────────

interface RecomputeResult {
  observed: number;
  claimed: number;
  unit: string;
  tolerance: Tolerance;
  steps: string;
}

function recompute(ops: ArithmeticOperands): RecomputeResult {
  const { kind, values, statedResult } = ops;

  switch (kind) {
    case "percentage_change": {
      // ((end - start) / start) * 100
      const start = values[0]!;
      const end = values[1] ?? statedResult;
      const pct = ((end - start) / start) * 100;
      const steps = [
        `Start value: ${fmt(start)}`,
        `End value: ${fmt(end)}`,
        `Change: ${fmt(end)} − ${fmt(start)} = ${fmt(end - start)}`,
        `Percentage: (${fmt(end - start)} ÷ ${fmt(start)}) × 100 = ${fmt(pct)}%`,
        `Claimed: ${fmt(statedResult)}%`,
      ].join("\n");
      return {
        observed: pct,
        claimed: statedResult,
        unit: "%",
        tolerance: RELATIVE_TOL,
        steps,
      };
    }

    case "multiple": {
      // end / start
      const start = values[0]!;
      const end = values[1] ?? statedResult;
      const mult = end / start;
      const steps = [
        `Start value: ${fmt(start)}`,
        `End value: ${fmt(end)}`,
        `Multiple: ${fmt(end)} ÷ ${fmt(start)} = ${fmt(mult)}×`,
        `Claimed: ${fmt(statedResult)}×`,
      ].join("\n");
      return {
        observed: mult,
        claimed: statedResult,
        unit: "×",
        tolerance: RELATIVE_TOL,
        steps,
      };
    }

    case "sum": {
      // All operands in values[] except the last are inputs; last is result.
      // If only 2 values: values[0] + values[1] compared to statedResult.
      let inputs: number[];
      if (values.length >= 2) {
        inputs = values.slice(0, -1);
      } else {
        inputs = values;
      }
      const sum = inputs.reduce((a, b) => a + b, 0);
      const stepTerms = inputs.map(fmt).join(" + ");
      const steps = [
        `Addends: ${stepTerms}`,
        `Sum: ${stepTerms} = ${fmt(sum)}`,
        `Claimed: ${fmt(statedResult)}`,
      ].join("\n");
      return {
        observed: sum,
        claimed: statedResult,
        unit: "units",
        tolerance: ABSOLUTE_TOL,
        steps,
      };
    }

    case "difference": {
      const a = values[0]!;
      const b = values[1]!;
      const diff = a - b;
      const steps = [
        `Minuend: ${fmt(a)}`,
        `Subtrahend: ${fmt(b)}`,
        `Difference: ${fmt(a)} − ${fmt(b)} = ${fmt(diff)}`,
        `Claimed: ${fmt(statedResult)}`,
      ].join("\n");
      return {
        observed: diff,
        claimed: statedResult,
        unit: "units",
        tolerance: ABSOLUTE_TOL,
        steps,
      };
    }
  }
}

// ── Abacus ─────────────────────────────────────────────────────────────────

export class AbacusOrgan implements Organ {
  readonly domain = "arithmetic";

  async verify(sc: SubClaim, _ctx: OrganContext): Promise<EvidencePacket> {
    const fetchedAt = nowIso();

    // ── Missing operands ──────────────────────────────────────────────────
    if (sc.arithmeticOperands === null) {
      return {
        subClaimId: sc.id,
        organ: "abacus",
        verdict: "unverifiable",
        reason: "missing_operands",
        claimedValue: sc.statedValue,
        observedValue: null,
        unit: sc.unit,
        tolerance: null,
        notes: [],
        provenance: {
          source: "local recomputation",
          requestUrl: "boltseam://abacus/local",
          fetchedAt,
          rawExcerpt: "No arithmetic operands available; cannot recompute.",
          rawSha256: null,
          rawSha256NullReason: "local recomputation — no network response to hash",
        },
      };
    }

    // ── Recompute ─────────────────────────────────────────────────────────
    const { observed, claimed, unit, tolerance, steps } = recompute(
      sc.arithmeticOperands,
    );

    const { verdict } = compareWithTolerance(claimed, observed, tolerance);

    return {
      subClaimId: sc.id,
      organ: "abacus",
      verdict,
      reason: null,
      claimedValue: claimed,
      observedValue: observed,
      unit: sc.unit ?? unit,
      tolerance,
      notes: [],
      provenance: {
        source: "local recomputation",
        requestUrl: "boltseam://abacus/local",
        fetchedAt,
        rawExcerpt: steps,
        rawSha256: null,
        rawSha256NullReason: "local recomputation — no network response to hash",
      },
    };
  }
}
