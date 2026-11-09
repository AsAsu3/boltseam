/**
 * Public API of the organs/contract package.
 *
 * The router, stitcher, and organs import from here.
 */
export type {
  Verdict,
  ReasonCode,
  NoteCode,
  Tolerance,
  RelativeTolerance,
  AbsoluteTolerance,
  Provenance,
  EvidencePacket,
  Organ,
  OrganContext,
} from "./types.ts";

export { SessionCache } from "./sessionCache.ts";
export type { CacheEntry } from "./sessionCache.ts";

export { validatePacket, assertValidPacket } from "./packetValidator.ts";
export type { ValidationError } from "./packetValidator.ts";

export { compareWithTolerance, computeBand, verdictFor } from "./comparator.ts";
export type { CompareResult } from "./comparator.ts";

export { sourceFetch, sha256Hex, RateLimitedError, SourceFetchError } from "./sourceFetch.ts";
