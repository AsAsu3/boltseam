/**
 * SchemaValidator — validates raw model JSON against the decomposition schema.
 *
 * Uses AJV (Ajv) for JSON Schema draft-07 validation. Span presence is
 * enforced both by the schema and by an additional structural check here
 * (spans are mandatory per design.md).
 *
 * Requirements: 2.4, 2.5
 */

import Ajv from "ajv";
import type { ValidateFunction } from "ajv";
import decompositionSchema from "./decompositionSchema.json" with { type: "json" };
import type { SubClaim } from "./types.ts";

// ── Ajv instance ───────────────────────────────────────────────────────────

const ajv = new Ajv({ allErrors: true, strict: false });
let _validate: ValidateFunction | undefined;

function getValidator(): ValidateFunction {
  if (!_validate) {
    _validate = ajv.compile(decompositionSchema);
  }
  return _validate;
}

// ── Error codes ────────────────────────────────────────────────────────────

/** Human-readable schema-error message prefix constants (stable identifiers) */
export const SCHEMA_ERRORS = {
  INVALID_JSON: "INVALID_JSON",
  MISSING_SUB_CLAIMS: "MISSING_SUB_CLAIMS",
  SCHEMA_VIOLATIONS: "SCHEMA_VIOLATIONS",
  MISSING_SPANS: "MISSING_SPANS",
} as const;

export type SchemaErrorCode = (typeof SCHEMA_ERRORS)[keyof typeof SCHEMA_ERRORS];

// ── Public types ───────────────────────────────────────────────────────────

export type ValidationResult =
  | { ok: true; subClaims: SubClaim[] }
  | { ok: false; code: SchemaErrorCode; errors: string[] };

// ── validateDecomposition ─────────────────────────────────────────────────

/**
 * Parses `rawJson` and validates it against the decomposition schema.
 *
 * Returns:
 *   { ok: true, subClaims }   — on success
 *   { ok: false, code, errors } — on any failure; `errors` is a list of
 *     human-readable messages suitable for appending to a retry request.
 */
export function validateDecomposition(rawJson: string): ValidationResult {
  // 1. Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (e) {
    return {
      ok: false,
      code: SCHEMA_ERRORS.INVALID_JSON,
      errors: [`${SCHEMA_ERRORS.INVALID_JSON}: ${String(e)}`],
    };
  }

  // 2. JSON Schema validation
  const validate = getValidator();
  const valid = validate(parsed);

  if (!valid) {
    const errors = (validate.errors ?? []).map(
      (err) => `${err.instancePath || "/"} ${err.message ?? "unknown error"}`
    );
    return {
      ok: false,
      code: SCHEMA_ERRORS.SCHEMA_VIOLATIONS,
      errors: errors.length > 0
        ? errors
        : [`${SCHEMA_ERRORS.SCHEMA_VIOLATIONS}: schema validation failed`],
    };
  }

  // 3. Typed access (safe after schema validation)
  const data = parsed as { subClaims: SubClaim[] };

  if (!Array.isArray(data.subClaims) || data.subClaims.length === 0) {
    return {
      ok: false,
      code: SCHEMA_ERRORS.MISSING_SUB_CLAIMS,
      errors: [`${SCHEMA_ERRORS.MISSING_SUB_CLAIMS}: subClaims array is empty`],
    };
  }

  // 4. Mandatory span check (spans must be present and non-negative)
  const spanErrors: string[] = [];
  for (const sc of data.subClaims) {
    if (
      !Array.isArray(sc.span) ||
      sc.span.length !== 2 ||
      typeof sc.span[0] !== "number" ||
      typeof sc.span[1] !== "number" ||
      sc.span[0] < 0 ||
      sc.span[1] < sc.span[0]
    ) {
      spanErrors.push(
        `${SCHEMA_ERRORS.MISSING_SPANS}: sub-claim "${sc.id}" has an invalid span [${sc.span}]`
      );
    }
  }

  if (spanErrors.length > 0) {
    return {
      ok: false,
      code: SCHEMA_ERRORS.MISSING_SPANS,
      errors: spanErrors,
    };
  }

  return { ok: true, subClaims: data.subClaims };
}
