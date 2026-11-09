/**
 * Unit tests for the Evidence Packet validator.
 */

import { describe, it, expect } from "vitest";
import {
  validatePacket,
  assertValidPacket,
} from "../../../src/organs/contract/packetValidator.ts";
import type { EvidencePacket } from "../../../src/organs/contract/types.ts";

function validPacket(overrides: Partial<EvidencePacket> = {}): EvidencePacket {
  return {
    subClaimId: "sc-01",
    organ: "market",
    verdict: "supported",
    reason: null,
    claimedValue: 100,
    observedValue: 100,
    unit: "USD",
    tolerance: { kind: "relative", value: 0.005 },
    notes: [],
    provenance: {
      source: "Test Source",
      requestUrl: "https://example.com/api",
      fetchedAt: "2026-11-09T00:00:00Z",
      rawExcerpt: "{}",
      rawSha256: "abc123",
    },
    ...overrides,
  };
}

describe("validatePacket", () => {
  it("accepts a valid supported packet", () => {
    expect(validatePacket(validPacket())).toHaveLength(0);
  });

  it("accepts a valid unverifiable packet", () => {
    expect(
      validatePacket(
        validPacket({
          verdict: "unverifiable",
          reason: "no_organ",
          claimedValue: null,
          observedValue: null,
          tolerance: null,
        }),
      ),
    ).toHaveLength(0);
  });

  it("rejects null", () => {
    const errors = validatePacket(null);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.field).toBe("root");
  });

  it("requires reason when verdict is unverifiable", () => {
    const errors = validatePacket(
      validPacket({ verdict: "unverifiable", reason: null }),
    );
    expect(errors.some((e) => e.field === "reason")).toBe(true);
  });

  it("requires reason when verdict is source_error", () => {
    const errors = validatePacket(
      validPacket({ verdict: "source_error", reason: null }),
    );
    expect(errors.some((e) => e.field === "reason")).toBe(true);
  });

  it("requires observedValue for value-based verdicts", () => {
    const errors = validatePacket(
      validPacket({ verdict: "supported", observedValue: null as unknown as number }),
    );
    expect(errors.some((e) => e.field === "observedValue")).toBe(true);
  });

  it("requires tolerance for value-based verdicts", () => {
    const errors = validatePacket(validPacket({ tolerance: null }));
    expect(errors.some((e) => e.field === "tolerance")).toBe(true);
  });

  it("rejects non-ISO fetchedAt", () => {
    const p = validPacket();
    (p.provenance as unknown as Record<string, unknown>)["fetchedAt"] = "not-a-date";
    const errors = validatePacket(p);
    expect(errors.some((e) => e.field === "provenance.fetchedAt")).toBe(true);
  });

  it("requires rawSha256NullReason when rawSha256 is null", () => {
    const p = validPacket();
    p.provenance.rawSha256 = null;
    const errors = validatePacket(p);
    expect(errors.some((e) => e.field === "provenance.rawSha256NullReason")).toBe(true);
  });

  it("accepts null rawSha256 with explanation", () => {
    const p = validPacket({
      verdict: "unverifiable",
      reason: "no_organ",
      claimedValue: null,
      observedValue: null,
      tolerance: null,
    });
    p.provenance.rawSha256 = null;
    p.provenance.rawSha256NullReason = "local recomputation";
    expect(validatePacket(p)).toHaveLength(0);
  });
});

describe("assertValidPacket", () => {
  it("does not throw for a valid packet", () => {
    expect(() => assertValidPacket(validPacket())).not.toThrow();
  });

  it("throws for an invalid packet", () => {
    expect(() => assertValidPacket({ subClaimId: "" })).toThrow("Invalid EvidencePacket");
  });
});
