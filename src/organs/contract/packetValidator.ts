/**
 * Evidence Packet validator.
 *
 * Validates that an EvidencePacket is structurally complete before it leaves
 * an organ. Used by the router and in tests.
 *
 * Rules enforced:
 * - All required top-level fields present and correctly typed.
 * - When verdict is "unverifiable" or "source_error", reason must be non-null.
 * - When verdict is "supported"/"contradicted"/"partially_supported",
 *   claimedValue and observedValue must be present.
 * - Provenance fields are all present.
 * - When rawSha256 is null, rawSha256NullReason must be present.
 * - fetchedAt is a valid ISO-8601 UTC string.
 */

import type { EvidencePacket, Verdict } from "./types.ts";

export interface ValidationError {
  field: string;
  message: string;
}

const VALID_VERDICTS: Verdict[] = [
  "supported",
  "contradicted",
  "partially_supported",
  "unverifiable",
  "source_error",
];

function isIso8601Utc(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(s);
}

export function validatePacket(packet: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof packet !== "object" || packet === null) {
    return [{ field: "root", message: "packet must be a non-null object" }];
  }

  const p = packet as Record<string, unknown>;

  // subClaimId
  if (typeof p["subClaimId"] !== "string" || p["subClaimId"] === "") {
    errors.push({ field: "subClaimId", message: "must be a non-empty string" });
  }
  // organ
  if (typeof p["organ"] !== "string" || p["organ"] === "") {
    errors.push({ field: "organ", message: "must be a non-empty string" });
  }
  // verdict
  if (!VALID_VERDICTS.includes(p["verdict"] as Verdict)) {
    errors.push({
      field: "verdict",
      message: `must be one of ${VALID_VERDICTS.join("|")}`,
    });
  }
  const verdict = p["verdict"] as Verdict;

  // reason must be non-null for unverifiable / source_error
  if (
    (verdict === "unverifiable" || verdict === "source_error") &&
    p["reason"] === null
  ) {
    errors.push({
      field: "reason",
      message: `must be non-null when verdict is "${verdict}"`,
    });
  }

  // claimedValue / observedValue required for value-based verdicts
  if (
    verdict === "supported" ||
    verdict === "contradicted" ||
    verdict === "partially_supported"
  ) {
    if (typeof p["claimedValue"] !== "number") {
      errors.push({
        field: "claimedValue",
        message: "must be a number for value-based verdicts",
      });
    }
    if (typeof p["observedValue"] !== "number") {
      errors.push({
        field: "observedValue",
        message: "must be a number for value-based verdicts",
      });
    }
    if (p["tolerance"] === null || p["tolerance"] === undefined) {
      errors.push({
        field: "tolerance",
        message: "must be present for value-based verdicts",
      });
    }
  }

  // notes
  if (!Array.isArray(p["notes"])) {
    errors.push({ field: "notes", message: "must be an array" });
  }

  // provenance
  if (typeof p["provenance"] !== "object" || p["provenance"] === null) {
    errors.push({ field: "provenance", message: "must be a non-null object" });
    return errors; // can't check sub-fields
  }
  const prov = p["provenance"] as Record<string, unknown>;

  if (typeof prov["source"] !== "string" || prov["source"] === "") {
    errors.push({ field: "provenance.source", message: "must be a non-empty string" });
  }
  if (typeof prov["requestUrl"] !== "string" || prov["requestUrl"] === "") {
    errors.push({ field: "provenance.requestUrl", message: "must be a non-empty string" });
  }
  if (typeof prov["fetchedAt"] !== "string" || !isIso8601Utc(prov["fetchedAt"])) {
    errors.push({
      field: "provenance.fetchedAt",
      message: "must be a UTC ISO-8601 string (…Z)",
    });
  }
  if (typeof prov["rawExcerpt"] !== "string") {
    errors.push({ field: "provenance.rawExcerpt", message: "must be a string" });
  }
  // rawSha256: string or null; when null, rawSha256NullReason required
  if (prov["rawSha256"] !== null && typeof prov["rawSha256"] !== "string") {
    errors.push({
      field: "provenance.rawSha256",
      message: "must be a hex string or null",
    });
  }
  if (
    prov["rawSha256"] === null &&
    (typeof prov["rawSha256NullReason"] !== "string" ||
      prov["rawSha256NullReason"] === "")
  ) {
    errors.push({
      field: "provenance.rawSha256NullReason",
      message: "must be present when rawSha256 is null",
    });
  }

  return errors;
}

/** Throws if any validation errors are found. */
export function assertValidPacket(packet: unknown): asserts packet is EvidencePacket {
  const errors = validatePacket(packet);
  if (errors.length > 0) {
    throw new Error(
      `Invalid EvidencePacket:\n${errors.map((e) => `  ${e.field}: ${e.message}`).join("\n")}`,
    );
  }
}
