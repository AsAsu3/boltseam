/**
 * ArithmeticExtractor — deterministic post-pass over validated sub-claims.
 *
 * Detects sub-claims whose domain is NOT already "arithmetic" but whose text
 * asserts a purely arithmetic relationship (percentage change, multiple, sum,
 * difference) between numbers all present in the original post text.
 * Retags those sub-claims to "arithmetic" and attaches operands.
 *
 * Rules:
 * - Already-tagged "arithmetic" sub-claims are left unchanged.
 * - Ambiguous operands (cannot identify with confidence) leave the domain
 *   tag untouched and add a note in entities.arithmeticAmbiguity.
 * - Pure functions throughout; no I/O, no network, no verdict vocabulary.
 *
 * Requirements: 3.1, 3.2
 */

import type { SubClaim, ArithmeticOperands, DomainTag } from "./types.ts";

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract all numeric values from a string.
 * Handles commas (1,234), percentages (9,680%), currency prefixes ($50, ¥9.4),
 * and suffixes (k, M, B with case folding, and x/× for multiples).
 */
export function extractNumbers(text: string): number[] {
  // Strip currency symbols / commas, then parse
  // Regex: optional sign, optional currency prefix, digits with optional commas
  // and optional decimal, optional magnitude or multiple suffix
  const re =
    /[+-]?(?:[$€£¥₿]|\bUSD\b|\bEUR\b|\bGBP\b|\bJPY\b)?[\s]?(\d[\d,]*(?:\.\d+)?)([kKmMbBxX×])?(?=%|\b)/g;

  const results: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let value = parseFloat(m[1].replace(/,/g, ""));
    if (Number.isNaN(value)) continue;
    const suffix = m[2]?.toLowerCase();
    if (suffix === "k") value *= 1_000;
    else if (suffix === "m") value *= 1_000_000;
    else if (suffix === "b") value *= 1_000_000_000;
    // x/× suffix: the number IS the multiple itself (e.g. "3x" → 3)
    // no scaling needed; just include the value as-is
    results.push(value);
  }
  return results;
}

// ── Arithmetic pattern detectors ──────────────────────────────────────────

/**
 * Tolerance for floating-point arithmetic comparisons.
 * 2% relative tolerance handles real-world percentage rounding:
 * "9,680% gain" may compute as 9,679.6% — the claim rounds to 9,680%.
 * Also covers 1-decimal rounding like "2.4%" for an exact 2.4375% result.
 */
const REL_EPSILON = 0.02;

function approxEq(a: number, b: number): boolean {
  if (a === 0 && b === 0) return true;
  return Math.abs(a - b) / (Math.abs(b) || 1) <= REL_EPSILON;
}

/**
 * Try to detect a percentage-change assertion in `text`.
 * Pattern: "X to Y is Z%", "X → Y = Z%", or Z% mentioned alongside X and Y.
 *
 * Returns operands if confident, null otherwise.
 */
function tryPercentageChange(
  text: string,
  nums: number[],
): ArithmeticOperands | null {
  if (nums.length < 3) return null;

  // Look for a percentage value explicitly in the text
  const pctRe = /(\d[\d,]*(?:\.\d+)?)\s*%/g;
  let pctM: RegExpExecArray | null;
  const pctCandidates: number[] = [];
  while ((pctM = pctRe.exec(text)) !== null) {
    const v = parseFloat(pctM[1].replace(/,/g, ""));
    if (!Number.isNaN(v)) pctCandidates.push(v);
  }

  if (pctCandidates.length === 0) return null;

  // Try all pairs (a, b) from nums and see if any pct candidate matches
  // ((b - a) / a) * 100 within tolerance
  for (const statedPct of pctCandidates) {
    for (let i = 0; i < nums.length; i++) {
      for (let j = 0; j < nums.length; j++) {
        if (i === j) continue;
        const a = nums[i];
        const b = nums[j];
        if (a === 0) continue;
        const computed = ((b - a) / Math.abs(a)) * 100;
        if (approxEq(computed, statedPct)) {
          return {
            kind: "percentage_change",
            values: [a, b],
            statedResult: statedPct,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Try to detect a multiple assertion ("Nx", "N times", "N×").
 */
function tryMultiple(
  text: string,
  nums: number[],
): ArithmeticOperands | null {
  if (nums.length < 3) return null;

  const multRe = /(\d[\d,]*(?:\.\d+)?)\s*[x×times]/gi;
  let m: RegExpExecArray | null;
  const multCandidates: number[] = [];
  while ((m = multRe.exec(text)) !== null) {
    const v = parseFloat(m[1].replace(/,/g, ""));
    if (!Number.isNaN(v)) multCandidates.push(v);
  }

  if (multCandidates.length === 0) return null;

  for (const statedMult of multCandidates) {
    for (let i = 0; i < nums.length; i++) {
      for (let j = 0; j < nums.length; j++) {
        if (i === j) continue;
        const a = nums[i];
        const b = nums[j];
        if (a === 0) continue;
        if (approxEq(b / a, statedMult)) {
          return {
            kind: "multiple",
            values: [a, b],
            statedResult: statedMult,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Try to detect a sum assertion ("A + B = C").
 */
function trySum(nums: number[]): ArithmeticOperands | null {
  if (nums.length < 3) return null;
  // Try every pair as addends; check if their sum equals any other number
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      const s = nums[i] + nums[j];
      for (let k = 0; k < nums.length; k++) {
        if (k === i || k === j) continue;
        if (approxEq(s, nums[k])) {
          return {
            kind: "sum",
            values: [nums[i], nums[j]],
            statedResult: nums[k],
          };
        }
      }
    }
  }
  return null;
}

/**
 * Try to detect a difference assertion ("A - B = C").
 */
function tryDifference(nums: number[]): ArithmeticOperands | null {
  if (nums.length < 3) return null;
  for (let i = 0; i < nums.length; i++) {
    for (let j = 0; j < nums.length; j++) {
      if (i === j) continue;
      const diff = nums[i] - nums[j];
      for (let k = 0; k < nums.length; k++) {
        if (k === i || k === j) continue;
        if (approxEq(diff, nums[k]) && diff >= 0) {
          return {
            kind: "difference",
            values: [nums[i], nums[j]],
            statedResult: nums[k],
          };
        }
      }
    }
  }
  return null;
}

// ── ArithmeticExtractor keywords ──────────────────────────────────────────

/**
 * Keywords that suggest an arithmetic relationship may be stated.
 * A sub-claim must contain at least one to be a candidate for retagging.
 */
const ARITHMETIC_KEYWORDS =
  /\b(?:gain|profit|loss|percent|%|times|x|×|total|sum|plus|minus|equals?|turned|grew|grew by|up by|down by|increase|decrease|return)\b/i;

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Run the arithmetic extraction pass over `subClaims`.
 *
 * Returns a new array; original objects are not mutated.
 * `originalText` is used to verify all operand values appear in the post.
 *
 * Requirements: 3.1, 3.2
 */
export function extractArithmetic(
  subClaims: SubClaim[],
  originalText: string,
): SubClaim[] {
  return subClaims.map((sc) => retag(sc, originalText));
}

/**
 * Attempt to retag a single sub-claim.
 * Exported for unit testing purposes.
 */
export function retagSubClaim(sc: SubClaim, originalText: string): SubClaim {
  return retag(sc, originalText);
}

function retag(sc: SubClaim, originalText: string): SubClaim {
  // Already tagged — preserve as-is
  if (sc.domain === "arithmetic") return sc;

  // Quick reject: no arithmetic keywords in this sub-claim's text
  if (!ARITHMETIC_KEYWORDS.test(sc.text)) return sc;

  // Extract numbers from sub-claim text (and cross-check against original post)
  const nums = extractNumbers(sc.text);
  if (nums.length < 3) return sc;

  // Verify all extracted numbers appear in the original text (Req 3.1)
  const allPresentInOriginal = nums.every((n) => numberPresentIn(n, originalText));
  if (!allPresentInOriginal) return sc;

  // Attempt detection in priority order
  const operands =
    tryPercentageChange(sc.text, nums) ??
    tryMultiple(sc.text, nums) ??
    trySum(nums) ??
    tryDifference(nums);

  if (operands === null) {
    // Ambiguous — leave domain, add note (Req 3.2)
    return {
      ...sc,
      entities: {
        ...sc.entities,
        arithmeticAmbiguity:
          "Arithmetic relationship suspected but operands could not be identified with confidence.",
      },
    };
  }

  // Successful retag
  return {
    ...sc,
    domain: "arithmetic" as DomainTag,
    arithmeticOperands: operands,
    entities: { ...sc.entities },
  };
}

/**
 * Check whether a number value appears in `text` in any of its natural
 * representations (with or without commas, currency prefix, etc.).
 */
function numberPresentIn(value: number, text: string): boolean {
  // Match the value directly as integer or decimal
  const intPart = Math.round(value);
  if (approxEq(value, intPart)) {
    // Integer — accept with or without thousands separators
    const s = intPart.toString();
    // Also accept comma-formatted variant: 9680 → "9,680"
    const formatted = intPart.toLocaleString("en-US");
    if (text.includes(s) || text.includes(formatted)) return true;
  }
  // Decimal representation
  const str = value.toString();
  return text.includes(str);
}
