/**
 * Core contract types: EvidencePacket, Verdict, organ interface.
 *
 * These are the ONLY types shared between organs, the router, and the
 * stitcher. No organ may import from another organ — only from this module.
 */

// ── Verdict ────────────────────────────────────────────────────────────────

export type Verdict =
  | "supported"
  | "contradicted"
  | "partially_supported"
  | "unverifiable"
  | "source_error";

// ── Reason codes (machine-readable) ──────────────────────────────────────

export type ReasonCode =
  | "no_organ"
  | "unknown_symbol"
  | "unknown_date"
  | "ambiguous_date"
  | "missing_operands"
  | "rate_limited"
  | "timeout"
  | "http_error"
  | "parse_error"
  | "future_date"
  | "pre_listing_date"
  | "no_country"
  | null;

// ── Note codes ────────────────────────────────────────────────────────────

export type NoteCode =
  | "source_disagreement"
  | "quantity_mismatch"
  | "weekend_only_arithmetic"
  | "ambiguous_anchor";

// ── Tolerance ─────────────────────────────────────────────────────────────

export interface RelativeTolerance {
  kind: "relative";
  /** Fraction (0.005 = 0.5%) */
  value: number;
}

export interface AbsoluteTolerance {
  kind: "absolute";
  value: number;
  unit: string;
}

export type Tolerance = RelativeTolerance | AbsoluteTolerance;

// ── Provenance ─────────────────────────────────────────────────────────────

export interface Provenance {
  /** Human-readable source name (e.g. "Kraken public API") */
  source: string;
  /** Full URL that was (or would have been) fetched */
  requestUrl: string;
  /** UTC ISO-8601 timestamp of when the raw response was received */
  fetchedAt: string;
  /** First 2 KB of the raw response body (or recomputation steps for Abacus) */
  rawExcerpt: string;
  /**
   * SHA-256 hex digest of the full raw response body.
   * null for Abacus packets (local recomputation; hashing is meaningless).
   */
  rawSha256: string | null;
  /**
   * Populated when rawSha256 is null to explain why.
   * Required by the evidence-format lint check.
   */
  rawSha256NullReason?: string;
  /** true when this packet was built from the session cache, not a live fetch */
  fromCache?: boolean;
  /** true when served from a recorded fixture (demo mode) */
  fixture?: boolean;
}

// ── Evidence Packet ────────────────────────────────────────────────────────

export interface EvidencePacket {
  subClaimId: string;
  /** Which organ produced this packet (or "abacus", "router") */
  organ: string;
  verdict: Verdict;
  /** Machine-readable reason; required when verdict is unverifiable/source_error */
  reason: ReasonCode;
  /** The value stated in the post */
  claimedValue: number | null;
  /** The value observed in the source; null when unverifiable */
  observedValue: number | null;
  unit: string | null;
  tolerance: Tolerance | null;
  notes: NoteCode[];
  provenance: Provenance;
}

// ── Organ context ──────────────────────────────────────────────────────────

import type { SubClaim } from "../../intake/types.ts";
import type { SessionCache } from "../contract/sessionCache.ts";

export interface OrganContext {
  /** UTC ISO-8601 date string used as "today" for this audit */
  anchorDate: string;
  cache: SessionCache;
  signal: AbortSignal;
}

// ── Organ interface ────────────────────────────────────────────────────────

export interface Organ {
  /** The domain tag this organ handles, e.g. "price" */
  readonly domain: string;
  verify(subClaim: SubClaim, ctx: OrganContext): Promise<EvidencePacket>;
}
