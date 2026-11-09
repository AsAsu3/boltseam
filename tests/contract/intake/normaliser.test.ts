/**
 * Unit tests for the normaliser: character guards and credential-pattern scan.
 *
 * Requirements: 1.2, 1.3, 5.2
 */

import { describe, it, expect } from "vitest";
import {
  normalise,
  scanForCredentials,
  MIN_LENGTH,
  MAX_LENGTH,
  ERR_TOO_SHORT,
  ERR_TOO_LONG,
} from "../../../src/intake/normaliser.ts";

// ── Character guards ───────────────────────────────────────────────────────

describe("normalise — character guards", () => {
  it("rejects text shorter than MIN_LENGTH characters", () => {
    const short = "a".repeat(MIN_LENGTH - 1);
    const result = normalise(short);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("too_short");
      expect(result.message).toBe(ERR_TOO_SHORT);
    }
  });

  it("rejects empty string", () => {
    const result = normalise("");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("too_short");
  });

  it("rejects text consisting only of whitespace", () => {
    const result = normalise("   \n\t  ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("too_short");
  });

  it("accepts text exactly at MIN_LENGTH after trimming", () => {
    const text = "a".repeat(MIN_LENGTH);
    const result = normalise(`  ${text}  `); // surrounding whitespace
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.trimmed).toBe(text);
      // original must be byte-for-byte preserved
      expect(result.original).toBe(`  ${text}  `);
    }
  });

  it("accepts text exactly at MAX_LENGTH", () => {
    const text = "x".repeat(MAX_LENGTH);
    const result = normalise(text);
    expect(result.ok).toBe(true);
  });

  it("rejects text longer than MAX_LENGTH", () => {
    const text = "x".repeat(MAX_LENGTH + 1);
    const result = normalise(text);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("too_long");
      expect(result.message).toBe(ERR_TOO_LONG);
    }
  });

  it("does not silently truncate oversized text", () => {
    // Requirement 1.3: must refuse, not truncate
    const oversize = "y".repeat(MAX_LENGTH + 500);
    const result = normalise(oversize);
    expect(result.ok).toBe(false);
  });

  it("preserves the original text immutably on success", () => {
    const raw = "  I turned $50 into $4,890 in 48 hours.  ";
    const result = normalise(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.original).toBe(raw);
      expect(result.trimmed).not.toBe(raw);
    }
  });
});

// ── Credential-pattern scan ────────────────────────────────────────────────

describe("scanForCredentials", () => {
  it("returns empty array for clean text", () => {
    const matches = scanForCredentials(
      "BTC was only $61,200 on Saturday October 10."
    );
    expect(matches).toHaveLength(0);
  });

  it("detects a password= assignment", () => {
    const matches = scanForCredentials(
      "My config has password=super_secret_123 in it"
    );
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].label).toMatch(/password/i);
  });

  it("detects an api_key= assignment", () => {
    const matches = scanForCredentials(
      "api_key=sk-1234567890abcdef and something"
    );
    expect(matches.length).toBeGreaterThan(0);
  });

  it("detects a PEM private key header", () => {
    const pem =
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----";
    const matches = scanForCredentials(pem);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].label).toMatch(/PEM/i);
  });

  it("detects an AWS access key ID", () => {
    const matches = scanForCredentials(
      "My key is AKIAIOSFODNN7EXAMPLE and I use it here"
    );
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].label).toMatch(/AWS/i);
  });

  it("detects a Bearer token fragment", () => {
    const matches = scanForCredentials(
      "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig"
    );
    expect(matches.length).toBeGreaterThan(0);
    // Multiple patterns may fire; at least one should be the Bearer rule
    const bearerMatch = matches.find((m) => /Bearer/i.test(m.label));
    expect(bearerMatch).toBeDefined();
  });

  it("reports the match offset correctly", () => {
    const text = "prefix password=secret123 suffix";
    const matches = scanForCredentials(text);
    const m = matches.find((x) => x.label.match(/password/i));
    expect(m).toBeDefined();
    if (m) {
      // The match should start at the 'p' of 'password'
      expect(text.slice(m.offset, m.offset + 8)).toBe("password");
    }
  });

  it("normalise propagates credential matches into NormaliseOk", () => {
    const text =
      "api_key=SEKRET_0123456789 BTC was only $61,200 on Saturday October 10 wow";
    const result = normalise(text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.credentialMatches.length).toBeGreaterThan(0);
    }
  });
});
