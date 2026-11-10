/**
 * Repo Organ — GitHub repository fact verification.
 *
 * Endpoint confirmed against current GitHub REST API documentation (2026-11-10):
 *   GET https://api.github.com/repos/{owner}/{repo}
 *   - No authentication required (unauthenticated limit: 60 req/hr).
 *   - Optional: Authorization: Bearer <token> header raises limit to 5,000 req/hr.
 *   - Response: Repository resource object.
 *   - Ref: https://docs.github.com/en/rest/repos/repos#get-a-repository
 *
 * CORS: api.github.com sets Access-Control-Allow-Origin: * for public
 *       endpoints; direct browser fetch is fine for public repositories.
 *
 * Rate-limit detection (Req 5.3):
 *   - 429 → rate_limited (standard); latch per sourceFetch.
 *   - 403 with X-RateLimit-Remaining: 0 → rate_limited; handled below by
 *     checking response headers before forwarding to sourceFetch.
 *
 * Star-history refusal (Req 4):
 *   The GitHub API exposes only current counts; there is NO history endpoint
 *   for star counts in the unauthenticated tier. Growth / rate sub-claims
 *   therefore return unverifiable/no_star_history unconditionally.
 *
 * Supported sub-claim kinds (entities.claimType):
 *   "existence"    — does the repo exist publicly?
 *   "stars"        — current stargazers_count (5% relative tolerance)
 *   "forks"        — current forks_count (5% relative tolerance)
 *   "created"      — creation date (day-precision)
 *   "language"     — primary language (case-insensitive exact match)
 *   "archived"     — archived boolean
 *   "star_history" — growth / rate over time → always unverifiable/no_star_history
 *
 * Default when claimType is absent: "stars" (most common repo claim).
 */

import type { Organ, OrganContext, EvidencePacket, Tolerance } from "../contract/index.ts";
import type { SubClaim } from "../../intake/types.ts";
import {
  sourceFetch,
  sha256Hex,
  compareWithTolerance,
  RateLimitedError,
  SourceFetchError,
} from "../contract/index.ts";

// ── Constants ──────────────────────────────────────────────────────────────

const GITHUB_API_BASE = "https://api.github.com/repos";
const REPO_TOLERANCE: Tolerance = { kind: "relative", value: 0.05 };

// ── GitHub REST API response shape ─────────────────────────────────────────

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string | null;
  created_at: string;         // ISO-8601
  updated_at: string;
  pushed_at: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  archived: boolean;
  disabled: boolean;
}

// ── Repo Organ ─────────────────────────────────────────────────────────────

export class RepoOrgan implements Organ {
  readonly domain = "repo";

  /** Optional token supplied by the app's runtime settings (never committed). */
  #token: string | null;

  constructor(token: string | null = null) {
    this.#token = token;
  }

  async verify(sc: SubClaim, ctx: OrganContext): Promise<EvidencePacket> {
    const { cache, signal } = ctx;

    // ── 1. Resolve repository reference ───────────────────────────────────
    const refResult = resolveRepoRef(sc);
    if (refResult.kind === "missing") {
      return this._unverifiablePacket(sc, "missing_repo_ref", nowIso());
    }
    if (refResult.kind === "ambiguous") {
      return this._ambiguousPacket(sc, refResult.candidates, nowIso());
    }

    const ownerRepo = refResult.ref; // "owner/repo"

    // ── 2. Determine claim type ────────────────────────────────────────────
    const claimType = extractString(sc.entities["claimType"]) ?? "stars";

    // Star-history refusal — no fetch needed (Req 4.1)
    if (claimType === "star_history") {
      return this._noStarHistoryPacket(sc, nowIso());
    }

    // ── 3. Fetch repository resource ───────────────────────────────────────
    const url = `${GITHUB_API_BASE}/${ownerRepo}`;

    let body: string;
    let fetchedAt: string;
    let fromCacheFlag: boolean;

    try {
      // Use our own fetch wrapper (handles 403 rate-limit header detection
      // and both token and non-token paths). This avoids sourceFetch's
      // retry-on-403 behaviour which would double-count rate-limit responses.
      const fetchResult = await this._fetchWithToken(url, cache, signal);
      body = fetchResult.body;
      fetchedAt = fetchResult.fetchedAt;
      fromCacheFlag = fetchResult.fromCache;
    } catch (err) {
      if (err instanceof RateLimitedError) {
        return this._errorPacket(sc, "rate_limited", url, nowIso());
      }
      if (err instanceof SourceFetchError) {
        if (err.status === 404) {
          // 404: repo not publicly retrievable
          return this._handle404(sc, claimType, url, nowIso());
        }
      }
      return this._errorPacket(sc, "http_error", url, nowIso());
    }

    // ── 4. Parse response ──────────────────────────────────────────────────
    let repo: GitHubRepo;
    try {
      repo = JSON.parse(body) as GitHubRepo;
      // Sanity check: GitHub 404s can arrive with status 200 in some edge cases;
      // ensure the parsed object has the expected shape.
      if (typeof repo.id !== "number") {
        return this._errorPacket(sc, "parse_error", url, fetchedAt);
      }
    } catch {
      return this._errorPacket(sc, "parse_error", url, fetchedAt);
    }

    // ── 5. Build provenance base fields ───────────────────────────────────
    const rawSha256 = await sha256Hex(body);
    const baseProvenance = {
      source: "GitHub REST API",
      requestUrl: url,
      fetchedAt,
      rawExcerpt: body.slice(0, 2048),
      rawSha256,
      fromCache: fromCacheFlag,
    };

    // ── 6. Dispatch by claim type ──────────────────────────────────────────
    switch (claimType) {
      case "existence":
        return this._verifyExistence(sc, repo, baseProvenance);

      case "stars":
        return this._verifyCount(sc, "stars", repo.stargazers_count, repo.full_name, fetchedAt, baseProvenance);

      case "forks":
        return this._verifyCount(sc, "forks", repo.forks_count, repo.full_name, fetchedAt, baseProvenance);

      case "created":
        return this._verifyCreated(sc, repo, baseProvenance);

      case "language":
        return this._verifyLanguage(sc, repo, baseProvenance);

      case "archived":
        return this._verifyArchived(sc, repo, baseProvenance);

      default:
        // Unknown claim type — treat like a star count (most common)
        return this._verifyCount(sc, "stars", repo.stargazers_count, repo.full_name, fetchedAt, baseProvenance);
    }
  }

  // ── Claim-type handlers ────────────────────────────────────────────────

  private _verifyExistence(
    sc: SubClaim,
    repo: GitHubRepo,
    prov: ReturnType<typeof buildProvenance>,
  ): EvidencePacket {
    // Existence is a boolean check; encode as 1 (exists) = supported
    return {
      subClaimId: sc.id,
      organ: "repo",
      verdict: "supported",
      reason: null,
      claimedValue: 1,
      observedValue: 1,
      unit: "exists",
      tolerance: { kind: "absolute", value: 0, unit: "exists" },
      notes: [],
      provenance: prov,
    };
  }

  private _verifyCount(
    sc: SubClaim,
    countKind: "stars" | "forks",
    observedCount: number,
    repoFullName: string,
    fetchedAt: string,
    prov: ReturnType<typeof buildProvenance>,
  ): EvidencePacket {
    const claimedValue = sc.statedValue;
    if (claimedValue === null) {
      return {
        subClaimId: sc.id,
        organ: "repo",
        verdict: "unverifiable",
        reason: "missing_operands",
        claimedValue: null,
        observedValue: observedCount,
        unit: countKind,
        tolerance: null,
        notes: [],
        provenance: {
          ...prov,
          rawExcerpt: prov.rawExcerpt +
            `\nObserved ${countKind}: ${observedCount} (as of ${fetchedAt}, repo: ${repoFullName})`,
        },
      };
    }

    const { verdict } = compareWithTolerance(claimedValue, observedCount, REPO_TOLERANCE);

    return {
      subClaimId: sc.id,
      organ: "repo",
      verdict,
      reason: null,
      claimedValue,
      observedValue: observedCount,
      unit: countKind,
      tolerance: REPO_TOLERANCE,
      notes: [],
      provenance: {
        ...prov,
        rawExcerpt: prov.rawExcerpt +
          `\nObserved ${countKind}: ${observedCount} (current as of ${fetchedAt}, repo: ${repoFullName})`,
      },
    };
  }

  private _verifyCreated(
    sc: SubClaim,
    repo: GitHubRepo,
    prov: ReturnType<typeof buildProvenance>,
  ): EvidencePacket {
    const claimedDateExpr = sc.dateExpr ?? extractString(sc.entities["createdDate"]);
    const observedDateStr = repo.created_at.slice(0, 10); // YYYY-MM-DD

    if (claimedDateExpr === undefined || claimedDateExpr === null) {
      // No claimed date — just report the observed date
      return {
        subClaimId: sc.id,
        organ: "repo",
        verdict: "unverifiable",
        reason: "unknown_date",
        claimedValue: null,
        observedValue: null,
        unit: "date",
        tolerance: null,
        notes: [],
        provenance: {
          ...prov,
          rawExcerpt: prov.rawExcerpt +
            `\nObserved created_at: ${repo.created_at} (day precision: ${observedDateStr})`,
        },
      };
    }

    const claimedDate = resolveDate(claimedDateExpr);
    if (claimedDate === null) {
      return {
        subClaimId: sc.id,
        organ: "repo",
        verdict: "unverifiable",
        reason: "unknown_date",
        claimedValue: null,
        observedValue: null,
        unit: "date",
        tolerance: null,
        notes: [],
        provenance: {
          ...prov,
          rawExcerpt: prov.rawExcerpt +
            `\nCould not resolve claimed date: "${claimedDateExpr}". Observed created_at: ${repo.created_at}`,
        },
      };
    }

    const matches = claimedDate === observedDateStr;

    // Encode date match as numeric boolean for the packet validator
    const tolerance: Tolerance = { kind: "absolute", value: 0, unit: "day match" };
    return {
      subClaimId: sc.id,
      organ: "repo",
      verdict: matches ? "supported" : "contradicted",
      reason: null,
      claimedValue: 1,
      observedValue: matches ? 1 : 0,
      unit: "day match",
      tolerance,
      notes: [],
      provenance: {
        ...prov,
        rawExcerpt: prov.rawExcerpt +
          `\nClaimed created: ${claimedDate}; Observed created_at: ${observedDateStr}`,
      },
    };
  }

  private _verifyLanguage(
    sc: SubClaim,
    repo: GitHubRepo,
    prov: ReturnType<typeof buildProvenance>,
  ): EvidencePacket {
    if (repo.language === null) {
      return {
        subClaimId: sc.id,
        organ: "repo",
        verdict: "unverifiable",
        reason: "no_language_data",
        claimedValue: null,
        observedValue: null,
        unit: "language",
        tolerance: null,
        notes: [],
        provenance: {
          ...prov,
          rawExcerpt: prov.rawExcerpt +
            "\nGitHub API returned null for language field (no detectable language).",
        },
      };
    }

    const claimedLanguage = extractString(sc.entities["language"]) ??
      (typeof sc.entities["expectedValue"] === "string" ? sc.entities["expectedValue"] : undefined);

    if (claimedLanguage === undefined) {
      // No claimed language in entities — just report what we found
      return {
        subClaimId: sc.id,
        organ: "repo",
        verdict: "unverifiable",
        reason: "missing_operands",
        claimedValue: null,
        observedValue: null,
        unit: "language",
        tolerance: null,
        notes: [],
        provenance: {
          ...prov,
          rawExcerpt: prov.rawExcerpt + `\nObserved language: ${repo.language}`,
        },
      };
    }

    const matches = claimedLanguage.toLowerCase() === repo.language.toLowerCase();
    const tolerance: Tolerance = { kind: "absolute", value: 0, unit: "language match" };

    return {
      subClaimId: sc.id,
      organ: "repo",
      verdict: matches ? "supported" : "contradicted",
      reason: null,
      claimedValue: 1,
      observedValue: matches ? 1 : 0,
      unit: "language match",
      tolerance,
      notes: [],
      provenance: {
        ...prov,
        rawExcerpt: prov.rawExcerpt +
          `\nClaimed language: ${claimedLanguage}; Observed language: ${repo.language}`,
      },
    };
  }

  private _verifyArchived(
    sc: SubClaim,
    repo: GitHubRepo,
    prov: ReturnType<typeof buildProvenance>,
  ): EvidencePacket {
    const claimedArchived = extractBoolish(sc.entities["archived"]) ??
      (sc.statedValue !== null ? sc.statedValue !== 0 : undefined);

    if (claimedArchived === undefined) {
      return {
        subClaimId: sc.id,
        organ: "repo",
        verdict: "unverifiable",
        reason: "missing_operands",
        claimedValue: null,
        observedValue: repo.archived ? 1 : 0,
        unit: "archived",
        tolerance: null,
        notes: [],
        provenance: {
          ...prov,
          rawExcerpt: prov.rawExcerpt + `\nObserved archived: ${repo.archived}`,
        },
      };
    }

    const matches = claimedArchived === repo.archived;
    const tolerance: Tolerance = { kind: "absolute", value: 0, unit: "archived match" };

    return {
      subClaimId: sc.id,
      organ: "repo",
      verdict: matches ? "supported" : "contradicted",
      reason: null,
      claimedValue: claimedArchived ? 1 : 0,
      observedValue: repo.archived ? 1 : 0,
      unit: "archived match",
      tolerance,
      notes: [],
      provenance: {
        ...prov,
        rawExcerpt: prov.rawExcerpt +
          `\nClaimed archived: ${claimedArchived}; Observed archived: ${repo.archived}`,
      },
    };
  }

  // ── 404 handler ────────────────────────────────────────────────────────

  private _handle404(
    sc: SubClaim,
    claimType: string,
    url: string,
    fetchedAt: string,
  ): EvidencePacket {
    if (claimType === "existence") {
      // 404 for an existence claim: contradicted (Req 2.1)
      // Wording: "not publicly retrievable" — not "does not exist" (Req 2.3)
      return {
        subClaimId: sc.id,
        organ: "repo",
        verdict: "contradicted",
        reason: null,
        claimedValue: 1,
        observedValue: 0,
        unit: "exists",
        tolerance: { kind: "absolute", value: 0, unit: "exists" },
        notes: [],
        provenance: {
          source: "GitHub REST API",
          requestUrl: url,
          fetchedAt,
          rawExcerpt:
            "GitHub returned 404. The repository is not publicly retrievable. " +
            "A private repository also returns 404; this does not prove the repository does not exist.",
          rawSha256: null,
          rawSha256NullReason: "404 response — no repository body to hash",
        },
      };
    }

    // 404 for any other claim type: unverifiable/repo_not_found (Req 2.2)
    return {
      subClaimId: sc.id,
      organ: "repo",
      verdict: "unverifiable",
      reason: "repo_not_found",
      claimedValue: sc.statedValue,
      observedValue: null,
      unit: sc.unit,
      tolerance: null,
      notes: [],
      provenance: {
        source: "GitHub REST API",
        requestUrl: url,
        fetchedAt,
        rawExcerpt:
          "GitHub returned 404. The repository is not publicly retrievable. " +
          "A private repository also returns 404; this does not prove the repository does not exist. " +
          "No data can be fetched about a non-public repository.",
        rawSha256: null,
        rawSha256NullReason: "404 response — no repository body to hash",
      },
    };
  }

  // ── star_history refusal ────────────────────────────────────────────────

  private _noStarHistoryPacket(sc: SubClaim, fetchedAt: string): EvidencePacket {
    // Per Req 4: return unverifiable/no_star_history.
    // We deliberately do NOT fetch the repo here; creation date and current
    // star count are facts the API supplies but we cannot match them against
    // a growth claim. If the sub-claim carries a repo reference, the caller
    // may have separately verified those two facts via "created"/"stars".
    return {
      subClaimId: sc.id,
      organ: "repo",
      verdict: "unverifiable",
      reason: "no_star_history",
      claimedValue: sc.statedValue,
      observedValue: null,
      unit: sc.unit,
      tolerance: null,
      notes: [],
      provenance: {
        source: "GitHub REST API",
        requestUrl: `boltseam://repo/unverifiable/no_star_history`,
        fetchedAt,
        rawExcerpt:
          "The GitHub REST API does not expose a history of star counts. " +
          "Only the current stargazers_count is available. " +
          "A claim about how many stars accumulated within a specific window " +
          "cannot be settled from this source.",
        rawSha256: null,
        rawSha256NullReason:
          "no fetch attempted — the GitHub API has no star-history endpoint",
      },
    };
  }

  // ── Packet factories ───────────────────────────────────────────────────

  private _unverifiablePacket(
    sc: SubClaim,
    reason: "missing_repo_ref" | "ambiguous_repo_ref" | "no_language_data" | "missing_operands",
    fetchedAt: string,
  ): EvidencePacket {
    return {
      subClaimId: sc.id,
      organ: "repo",
      verdict: "unverifiable",
      reason,
      claimedValue: sc.statedValue,
      observedValue: null,
      unit: sc.unit,
      tolerance: null,
      notes: [],
      provenance: {
        source: "GitHub REST API",
        requestUrl: `boltseam://repo/unverifiable/${reason}`,
        fetchedAt,
        rawExcerpt: "",
        rawSha256: null,
        rawSha256NullReason: `no fetch attempted — verdict is ${reason}`,
      },
    };
  }

  private _ambiguousPacket(
    sc: SubClaim,
    candidates: string[],
    fetchedAt: string,
  ): EvidencePacket {
    return {
      subClaimId: sc.id,
      organ: "repo",
      verdict: "unverifiable",
      reason: "ambiguous_repo_ref",
      claimedValue: sc.statedValue,
      observedValue: null,
      unit: sc.unit,
      tolerance: null,
      notes: [],
      provenance: {
        source: "GitHub REST API",
        requestUrl: "boltseam://repo/unverifiable/ambiguous_repo_ref",
        fetchedAt,
        rawExcerpt: `Ambiguous repository reference. Candidates: ${candidates.join(", ")}`,
        rawSha256: null,
        rawSha256NullReason:
          "no fetch attempted — multiple candidates; refusing to guess (Req 1.3)",
      },
    };
  }

  private _errorPacket(
    sc: SubClaim,
    reason: "rate_limited" | "http_error" | "parse_error",
    requestUrl: string,
    fetchedAt: string,
  ): EvidencePacket {
    return {
      subClaimId: sc.id,
      organ: "repo",
      verdict: "source_error",
      reason,
      claimedValue: sc.statedValue,
      observedValue: null,
      unit: sc.unit,
      tolerance: null,
      notes: [],
      provenance: {
        source: "GitHub REST API",
        requestUrl,
        fetchedAt,
        rawExcerpt: "",
        rawSha256: null,
        rawSha256NullReason: `fetch failed with reason: ${reason}`,
      },
    };
  }

  // ── Token-aware fetch ──────────────────────────────────────────────────

  private async _fetchWithToken(
    url: string,
    cache: import("../contract/sessionCache.ts").SessionCache,
    signal: AbortSignal,
  ): Promise<{ body: string; fetchedAt: string; fromCache: boolean }> {
    if (cache.isRateLimited(url)) {
      throw new RateLimitedError(url);
    }

    // Check cache first (token-augmented requests still benefit from caching)
    const cached = cache.get(url);
    if (cached !== undefined) {
      return { body: cached.body, fetchedAt: cached.fetchedAt, fromCache: true };
    }

    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    if (this.#token !== null) {
      headers["Authorization"] = `Bearer ${this.#token}`;
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= 1; attempt++) {
      if (attempt > 0) {
        await new Promise<void>((r) => setTimeout(r, 500));
      }
      if (signal.aborted) throw new Error("aborted");
      try {
        const res = await fetch(url, { signal, headers });

        if (res.status === 429) {
          cache.latchRateLimit(url);
          throw new RateLimitedError(url);
        }
        if (res.status === 403) {
          // Check for rate-limit specific 403 (X-RateLimit-Remaining: 0)
          const remaining = res.headers.get("X-RateLimit-Remaining");
          if (remaining === "0") {
            cache.latchRateLimit(url);
            throw new RateLimitedError(url);
          }
          throw new SourceFetchError(403, url);
        }
        if (!res.ok) {
          throw new SourceFetchError(res.status, url);
        }

        const body = await res.text();
        const fetchedAt = new Date().toISOString().replace(/\.\d+Z$/, "Z");
        cache.set(url, { url, body, fetchedAt, status: res.status });
        return { body, fetchedAt, fromCache: false };
      } catch (err) {
        if (err instanceof RateLimitedError) throw err;
        if (err instanceof SourceFetchError) throw err;
        lastError = err;
      }
    }
    throw lastError;
  }
}

// ── Utilities ──────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, "Z");
}

/** Build a provenance object (typed helper so spread works). */
function buildProvenance(
  source: string,
  requestUrl: string,
  fetchedAt: string,
  rawExcerpt: string,
  rawSha256: string | null,
  fromCache: boolean,
): import("../contract/types.ts").Provenance {
  if (rawSha256 === null) {
    return { source, requestUrl, fetchedAt, rawExcerpt, rawSha256: null, rawSha256NullReason: "see rawExcerpt", fromCache };
  }
  return { source, requestUrl, fetchedAt, rawExcerpt, rawSha256, fromCache };
}

// Make buildProvenance visible to the class methods by returning the right type.
// (We use the simpler inline approach inside the class instead of calling this
//  function — the type is already inferred there. This is here for reference.)
void buildProvenance;

/**
 * Resolve the owner/repo reference from a SubClaim.
 *
 * Returns:
 *   { kind: "ok", ref: "owner/repo" }
 *   { kind: "missing" }
 *   { kind: "ambiguous", candidates: string[] }
 */
function resolveRepoRef(
  sc: SubClaim,
): { kind: "ok"; ref: string } | { kind: "missing" } | { kind: "ambiguous"; candidates: string[] } {
  // Primary: entities.repo (should be "owner/repo")
  const repoPrimary = extractString(sc.entities["repo"]);
  if (repoPrimary !== undefined) {
    if (!isOwnerRepoPair(repoPrimary)) {
      // Not a proper owner/repo pair
      return { kind: "missing" };
    }
    return { kind: "ok", ref: repoPrimary };
  }

  // Fallback: entities.owner + entities.repoName assembled
  const owner = extractString(sc.entities["owner"]);
  const repoName = extractString(sc.entities["repoName"]);
  if (owner !== undefined && repoName !== undefined) {
    return { kind: "ok", ref: `${owner}/${repoName}` };
  }

  // Multiple candidates check: entities.candidates (array in JSON encoded as string)
  const candidatesRaw = sc.entities["candidates"];
  if (Array.isArray(candidatesRaw)) {
    const candidates = candidatesRaw.filter((c): c is string => typeof c === "string");
    if (candidates.length > 1) {
      return { kind: "ambiguous", candidates };
    }
    if (candidates.length === 1 && isOwnerRepoPair(candidates[0])) {
      return { kind: "ok", ref: candidates[0] };
    }
  }

  return { kind: "missing" };
}

/** Returns true when `s` looks like "owner/repo" (no extra slashes). */
function isOwnerRepoPair(s: string): boolean {
  return /^[A-Za-z0-9_.\-]+\/[A-Za-z0-9_.\-]+$/.test(s);
}

/**
 * Resolve a date expression to YYYY-MM-DD.
 * Minimal resolver — only handles ISO dates and simple patterns
 * sufficient for creation-date comparisons.
 */
function resolveDate(dateExpr: string): string | null {
  const trimmed = dateExpr.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  return null;
}

function extractString(v: string | number | null | undefined): string | undefined {
  if (typeof v === "string" && v.length > 0) return v;
  return undefined;
}

function extractBoolish(v: string | number | null | undefined): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    if (v.toLowerCase() === "true") return true;
    if (v.toLowerCase() === "false") return false;
  }
  if (typeof v === "number") return v !== 0;
  return undefined;
}
