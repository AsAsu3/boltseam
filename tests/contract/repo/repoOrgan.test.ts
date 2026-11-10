/**
 * Contract tests for the Repo Organ.
 *
 * All tests run against recorded API fixtures — no live network calls.
 * Fixtures: src/fixtures/repo/
 *
 * Tests cover:
 *   - Packet completeness (all required fields, valid structure)
 *   - Existence claim (200 → supported, 404 → contradicted)
 *   - Star / fork count claim (5% relative tolerance)
 *   - Creation date claim (day precision)
 *   - Language claim (case-insensitive match, null → no_language_data)
 *   - Archived status claim (exact boolean)
 *   - Star history refusal (unverifiable/no_star_history)
 *   - 404 for non-existence claims (unverifiable/repo_not_found)
 *   - Rate-limit handling (403 → source_error/rate_limited)
 *   - Missing / ambiguous reference (unverifiable/missing_repo_ref, ambiguous_repo_ref)
 *   - Cache reuse
 *
 * Requirements: 1.1–1.3, 2.1–2.3, 3.1–3.4, 4.1–4.3, 5.1–5.4, 6.1–6.3
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { RepoOrgan } from "../../../src/organs/repo/repoOrgan.ts";
import { SessionCache } from "../../../src/organs/contract/sessionCache.ts";
import { validatePacket } from "../../../src/organs/contract/packetValidator.ts";
import type { SubClaim } from "../../../src/intake/types.ts";

// ── Fixtures ───────────────────────────────────────────────────────────────

import repoFixture from "../../../src/fixtures/repo/github-repo-20241010.json";
import repo404Fixture from "../../../src/fixtures/repo/github-repo-404.json";
import repoNoLangFixture from "../../../src/fixtures/repo/github-repo-no-language.json";
import repoRateLimitFixture from "../../../src/fixtures/repo/github-ratelimit.json";

const REPO_BODY = JSON.stringify(repoFixture);
const REPO_404_BODY = JSON.stringify(repo404Fixture);
const REPO_NO_LANG_BODY = JSON.stringify(repoNoLangFixture);
const REPO_RATE_LIMIT_BODY = JSON.stringify(repoRateLimitFixture);

// ── Helper builders ────────────────────────────────────────────────────────

function repoSubClaim(overrides: Partial<SubClaim> = {}): SubClaim {
  return {
    id: "sc-05",
    span: [187, 236],
    text: "The bot's repo hit 2,000 stars in its first 3 days",
    domain: "repo",
    statedValue: 2000,
    unit: "stars",
    entities: { repo: "example-user/demo-bot", claimType: "stars" },
    dateExpr: null,
    arithmeticOperands: null,
    unroutedReason: null,
    userEdited: false,
    originalExtraction: null,
    ...overrides,
  };
}

function makeCtx(fetchImpl?: (url: string) => Promise<unknown>) {
  const cache = new SessionCache();
  const controller = new AbortController();
  const fetchStub = vi.fn().mockImplementation(async (url: string) => {
    if (fetchImpl) return fetchImpl(url);
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => REPO_BODY,
    };
  });
  return { cache, signal: controller.signal, anchorDate: "2024-10-15T00:00:00Z", fetchStub };
}

function okFetch(body: string) {
  return async (_url: string) => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    text: async () => body,
  });
}

function failFetch(status: number, body = "") {
  return async (_url: string) => ({
    ok: false,
    status,
    headers: new Headers(),
    text: async () => body,
  });
}

function rateLimitFetch() {
  return async (_url: string) => ({
    ok: false,
    status: 403,
    headers: new Headers({ "X-RateLimit-Remaining": "0" }),
    text: async () => REPO_RATE_LIMIT_BODY,
  });
}

// ── Packet completeness ────────────────────────────────────────────────────

describe("RepoOrgan — packet completeness", () => {
  let organ: RepoOrgan;

  beforeEach(() => {
    organ = new RepoOrgan();
    vi.restoreAllMocks();
  });

  it("produces a structurally valid packet for a known repo (stars claim)", async () => {
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(repoSubClaim(), { cache, signal, anchorDate });
    const errors = validatePacket(packet);
    expect(errors, "validation errors: " + JSON.stringify(errors)).toHaveLength(0);
  });

  it("sets organ = 'repo'", async () => {
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(repoSubClaim(), { cache, signal, anchorDate });
    expect(packet.organ).toBe("repo");
  });

  it("includes provenance.source pointing to GitHub REST API", async () => {
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(repoSubClaim(), { cache, signal, anchorDate });
    expect(packet.provenance.source).toContain("GitHub");
  });

  it("includes a rawSha256 hex string for a successful fetch", async () => {
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(repoSubClaim(), { cache, signal, anchorDate });
    expect(packet.provenance.rawSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("includes provenance.requestUrl containing api.github.com", async () => {
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(repoSubClaim(), { cache, signal, anchorDate });
    expect(packet.provenance.requestUrl).toContain("api.github.com");
  });

  it("includes a non-empty rawExcerpt", async () => {
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(repoSubClaim(), { cache, signal, anchorDate });
    expect(packet.provenance.rawExcerpt.length).toBeGreaterThan(0);
  });
});

// ── Existence claim ────────────────────────────────────────────────────────

describe("RepoOrgan — existence claim", () => {
  let organ: RepoOrgan;

  beforeEach(() => {
    organ = new RepoOrgan();
    vi.restoreAllMocks();
  });

  it("returns 'supported' for an existence claim when repo is found (200)", async () => {
    const { cache, signal, anchorDate } = makeCtx();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(okFetch(REPO_BODY)));

    const packet = await organ.verify(
      repoSubClaim({ entities: { repo: "example-user/demo-bot", claimType: "existence" } }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("supported");
    const errors = validatePacket(packet);
    expect(errors).toHaveLength(0);
  });

  it("returns 'contradicted' for an existence claim when repo returns 404 (Req 2.1)", async () => {
    const { cache, signal, anchorDate } = makeCtx();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(failFetch(404, REPO_404_BODY)));

    const packet = await organ.verify(
      repoSubClaim({ entities: { repo: "example-user/demo-bot", claimType: "existence" } }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("contradicted");
  });

  it("404 existence packet rawExcerpt says 'not publicly retrievable' (Req 2.3)", async () => {
    const { cache, signal, anchorDate } = makeCtx();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(failFetch(404, REPO_404_BODY)));

    const packet = await organ.verify(
      repoSubClaim({ entities: { repo: "example-user/nonexistent", claimType: "existence" } }),
      { cache, signal, anchorDate },
    );
    expect(packet.provenance.rawExcerpt.toLowerCase()).toContain("not publicly retrievable");
  });
});

// ── 404 for non-existence claims ───────────────────────────────────────────

describe("RepoOrgan — 404 for non-existence claims", () => {
  let organ: RepoOrgan;

  beforeEach(() => {
    organ = new RepoOrgan();
    vi.restoreAllMocks();
  });

  it("returns unverifiable/repo_not_found for stars claim when repo is 404 (Req 2.2)", async () => {
    const { cache, signal, anchorDate } = makeCtx();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(failFetch(404, REPO_404_BODY)));

    const packet = await organ.verify(
      repoSubClaim({ entities: { repo: "example-user/nonexistent", claimType: "stars" } }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("unverifiable");
    expect(packet.reason).toBe("repo_not_found");
  });

  it("404 non-existence packet rawExcerpt says 'not publicly retrievable'", async () => {
    const { cache, signal, anchorDate } = makeCtx();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(failFetch(404, REPO_404_BODY)));

    const packet = await organ.verify(
      repoSubClaim({ entities: { repo: "example-user/nonexistent", claimType: "forks" } }),
      { cache, signal, anchorDate },
    );
    expect(packet.provenance.rawExcerpt.toLowerCase()).toContain("not publicly retrievable");
  });
});

// ── Star count claim ───────────────────────────────────────────────────────

describe("RepoOrgan — star count claim", () => {
  let organ: RepoOrgan;

  beforeEach(() => {
    organ = new RepoOrgan();
    vi.restoreAllMocks();
  });

  it("returns 'supported' when claimed ≈ stargazers_count (within 5%)", async () => {
    // Fixture stargazers_count = 2345; claimed = 2345
    const { cache, signal, anchorDate } = makeCtx();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(okFetch(REPO_BODY)));

    const packet = await organ.verify(
      repoSubClaim({
        statedValue: 2345,
        entities: { repo: "example-user/demo-bot", claimType: "stars" },
      }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("supported");
    expect(packet.tolerance).toEqual({ kind: "relative", value: 0.05 });
  });

  it("returns 'supported' when claimed is within 5% tolerance of observed count", async () => {
    // 2345 × 0.95 = 2227.75; 2300 is within 5%
    const { cache, signal, anchorDate } = makeCtx();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(okFetch(REPO_BODY)));

    const packet = await organ.verify(
      repoSubClaim({
        statedValue: 2300,
        entities: { repo: "example-user/demo-bot", claimType: "stars" },
      }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("supported");
  });

  it("returns 'contradicted' when claimed differs by more than 5% (Req 3.1)", async () => {
    // Fixture stargazers_count = 2345; 1500 is way off
    const { cache, signal, anchorDate } = makeCtx();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(okFetch(REPO_BODY)));

    const packet = await organ.verify(
      repoSubClaim({
        statedValue: 1500,
        entities: { repo: "example-user/demo-bot", claimType: "stars" },
      }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("contradicted");
  });

  it("includes fetch time note in rawExcerpt for count claims (Req 6.2)", async () => {
    const { cache, signal, anchorDate } = makeCtx();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(okFetch(REPO_BODY)));

    const packet = await organ.verify(
      repoSubClaim({ statedValue: 2345, entities: { repo: "example-user/demo-bot", claimType: "stars" } }),
      { cache, signal, anchorDate },
    );
    // rawExcerpt should mention the observed count and "current as of"
    expect(packet.provenance.rawExcerpt).toContain("2345");
    expect(packet.provenance.rawExcerpt.toLowerCase()).toContain("current as of");
  });
});

// ── Fork count claim ───────────────────────────────────────────────────────

describe("RepoOrgan — fork count claim", () => {
  let organ: RepoOrgan;

  beforeEach(() => {
    organ = new RepoOrgan();
    vi.restoreAllMocks();
  });

  it("returns 'supported' when forks_count matches within 5%", async () => {
    // Fixture forks_count = 89; claimed = 89
    const { cache, signal, anchorDate } = makeCtx();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(okFetch(REPO_BODY)));

    const packet = await organ.verify(
      repoSubClaim({
        statedValue: 89,
        unit: "forks",
        entities: { repo: "example-user/demo-bot", claimType: "forks" },
      }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("supported");
    expect(packet.tolerance).toEqual({ kind: "relative", value: 0.05 });
  });

  it("returns 'contradicted' when forks differ by more than 5%", async () => {
    // forks_count = 89; claimed = 200
    const { cache, signal, anchorDate } = makeCtx();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(okFetch(REPO_BODY)));

    const packet = await organ.verify(
      repoSubClaim({
        statedValue: 200,
        unit: "forks",
        entities: { repo: "example-user/demo-bot", claimType: "forks" },
      }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("contradicted");
  });
});

// ── Creation date claim ────────────────────────────────────────────────────

describe("RepoOrgan — creation date claim (Req 3.2)", () => {
  let organ: RepoOrgan;

  beforeEach(() => {
    organ = new RepoOrgan();
    vi.restoreAllMocks();
  });

  it("returns 'supported' when claimed date matches created_at day precision", async () => {
    // Fixture created_at = "2024-10-07T00:00:00Z" → "2024-10-07"
    const { cache, signal, anchorDate } = makeCtx();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(okFetch(REPO_BODY)));

    const packet = await organ.verify(
      repoSubClaim({
        entities: { repo: "example-user/demo-bot", claimType: "created" },
        dateExpr: "2024-10-07",
      }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("supported");
    const errors = validatePacket(packet);
    expect(errors).toHaveLength(0);
  });

  it("returns 'contradicted' when claimed date differs from created_at", async () => {
    // claimed 2024-10-01, actual 2024-10-07
    const { cache, signal, anchorDate } = makeCtx();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(okFetch(REPO_BODY)));

    const packet = await organ.verify(
      repoSubClaim({
        entities: { repo: "example-user/demo-bot", claimType: "created" },
        dateExpr: "2024-10-01",
      }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("contradicted");
  });

  it("prints both dates in rawExcerpt (Req 3.2)", async () => {
    const { cache, signal, anchorDate } = makeCtx();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(okFetch(REPO_BODY)));

    const packet = await organ.verify(
      repoSubClaim({
        entities: { repo: "example-user/demo-bot", claimType: "created" },
        dateExpr: "2024-10-07",
      }),
      { cache, signal, anchorDate },
    );
    // Both the claimed and observed dates should appear in the excerpt
    expect(packet.provenance.rawExcerpt).toContain("2024-10-07");
  });
});

// ── Language claim ─────────────────────────────────────────────────────────

describe("RepoOrgan — language claim (Req 3.3)", () => {
  let organ: RepoOrgan;

  beforeEach(() => {
    organ = new RepoOrgan();
    vi.restoreAllMocks();
  });

  it("returns 'supported' for case-insensitive language match", async () => {
    // Fixture language = "Python"; claimed = "python" (lowercase)
    const { cache, signal, anchorDate } = makeCtx();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(okFetch(REPO_BODY)));

    const packet = await organ.verify(
      repoSubClaim({
        entities: { repo: "example-user/demo-bot", claimType: "language", language: "python" },
      }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("supported");
  });

  it("returns 'contradicted' when language does not match", async () => {
    const { cache, signal, anchorDate } = makeCtx();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(okFetch(REPO_BODY)));

    const packet = await organ.verify(
      repoSubClaim({
        entities: { repo: "example-user/demo-bot", claimType: "language", language: "JavaScript" },
      }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("contradicted");
  });

  it("returns unverifiable/no_language_data when language field is null (Req 3.3)", async () => {
    const { cache, signal, anchorDate } = makeCtx();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(okFetch(REPO_NO_LANG_BODY)));

    const packet = await organ.verify(
      repoSubClaim({
        entities: { repo: "example-user/docs-only", claimType: "language", language: "Markdown" },
      }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("unverifiable");
    expect(packet.reason).toBe("no_language_data");
    const errors = validatePacket(packet);
    expect(errors).toHaveLength(0);
  });
});

// ── Archived status claim ──────────────────────────────────────────────────

describe("RepoOrgan — archived status claim (Req 3.4)", () => {
  let organ: RepoOrgan;

  beforeEach(() => {
    organ = new RepoOrgan();
    vi.restoreAllMocks();
  });

  it("returns 'supported' when claimed archived = false and repo is not archived", async () => {
    // Fixture archived = false
    const { cache, signal, anchorDate } = makeCtx();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(okFetch(REPO_BODY)));

    const packet = await organ.verify(
      repoSubClaim({
        entities: { repo: "example-user/demo-bot", claimType: "archived", archived: "false" },
        statedValue: 0,
      }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("supported");
  });

  it("returns 'contradicted' when claimed archived = true but repo is not archived", async () => {
    const { cache, signal, anchorDate } = makeCtx();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(okFetch(REPO_BODY)));

    const packet = await organ.verify(
      repoSubClaim({
        entities: { repo: "example-user/demo-bot", claimType: "archived", archived: "true" },
        statedValue: 1,
      }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("contradicted");
  });
});

// ── Star history refusal ───────────────────────────────────────────────────

describe("RepoOrgan — star history refusal (Req 4)", () => {
  let organ: RepoOrgan;

  beforeEach(() => {
    organ = new RepoOrgan();
    vi.restoreAllMocks();
  });

  it("returns unverifiable/no_star_history for star_history claim type (Req 4.1)", async () => {
    // No fetch should be made for this claim type
    const { cache, signal, anchorDate } = makeCtx();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const packet = await organ.verify(
      repoSubClaim({
        entities: { repo: "example-user/demo-bot", claimType: "star_history", durationDays: 3 },
      }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("unverifiable");
    expect(packet.reason).toBe("no_star_history");
    // No fetch call should have been made (Req 4.3: no code path for growth)
    expect(fetchMock).not.toHaveBeenCalled();
    const errors = validatePacket(packet);
    expect(errors).toHaveLength(0);
  });

  it("star_history refusal packet explains why (Req 4.2 — API has no history endpoint)", async () => {
    const { cache, signal, anchorDate } = makeCtx();
    vi.stubGlobal("fetch", vi.fn());

    const packet = await organ.verify(
      repoSubClaim({
        entities: { repo: "example-user/demo-bot", claimType: "star_history" },
      }),
      { cache, signal, anchorDate },
    );
    expect(packet.provenance.rawExcerpt.toLowerCase()).toContain("history");
  });
});

// ── CONCEPT.md golden fixture sub-claim ───────────────────────────────────

describe("RepoOrgan — CONCEPT.md golden fixture (sc-05)", () => {
  it("produces unverifiable/no_star_history for '2,000 stars in its first 3 days' claim", async () => {
    const organ = new RepoOrgan();
    vi.restoreAllMocks();

    const cache = new SessionCache();
    const signal = new AbortController().signal;
    // No fetch should be needed
    vi.stubGlobal("fetch", vi.fn());

    // The CONCEPT.md sc-05: "The bot's repo hit 2,000 stars in its first 3 days"
    // The intake marks claimType=star_history because it's a growth claim.
    const sc: SubClaim = {
      id: "sc-05",
      span: [187, 236],
      text: "The bot's repo hit 2,000 stars in its first 3 days",
      domain: "repo",
      statedValue: 2000,
      unit: "stars",
      entities: { repo: "example-user/demo-bot", claimType: "star_history", durationDays: 3 },
      dateExpr: null,
      arithmeticOperands: null,
      unroutedReason: null,
      userEdited: false,
      originalExtraction: null,
    };

    const packet = await organ.verify(sc, {
      cache,
      signal,
      anchorDate: "2024-10-15T00:00:00Z",
    });

    expect(packet.verdict).toBe("unverifiable");
    expect(packet.reason).toBe("no_star_history");
    expect(packet.organ).toBe("repo");

    const errors = validatePacket(packet);
    expect(errors).toHaveLength(0);
  });
});

// ── Reference validation ───────────────────────────────────────────────────

describe("RepoOrgan — reference validation (Req 1)", () => {
  let organ: RepoOrgan;

  beforeEach(() => {
    organ = new RepoOrgan();
    vi.restoreAllMocks();
  });

  it("returns unverifiable/missing_repo_ref when no repo entity is present (Req 1.2)", async () => {
    const { cache, signal, anchorDate } = makeCtx();

    const packet = await organ.verify(
      repoSubClaim({ entities: {} }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("unverifiable");
    expect(packet.reason).toBe("missing_repo_ref");
  });

  it("returns unverifiable/missing_repo_ref for a bare repo name without owner", async () => {
    const { cache, signal, anchorDate } = makeCtx();

    const packet = await organ.verify(
      repoSubClaim({ entities: { repo: "demo-bot" } }), // missing owner
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("unverifiable");
    expect(packet.reason).toBe("missing_repo_ref");
  });

  it("accepts owner + repoName entities as an alternative to repo entity", async () => {
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(
      repoSubClaim({
        entities: { owner: "example-user", repoName: "demo-bot", claimType: "stars" },
      }),
      { cache, signal, anchorDate },
    );
    // Should succeed (not return missing_repo_ref)
    expect(packet.reason).not.toBe("missing_repo_ref");
    expect(packet.provenance.requestUrl).toContain("example-user/demo-bot");
  });

  it("returns unverifiable/ambiguous_repo_ref when candidates array has multiple entries (Req 1.3)", async () => {
    const { cache, signal, anchorDate } = makeCtx();

    const packet = await organ.verify(
      repoSubClaim({
        entities: {
          candidates: ["owner-a/demo-bot", "owner-b/demo-bot"],
          claimType: "stars",
        },
      }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("unverifiable");
    expect(packet.reason).toBe("ambiguous_repo_ref");
    // Candidates should be listed in the rawExcerpt
    expect(packet.provenance.rawExcerpt).toContain("owner-a/demo-bot");
    expect(packet.provenance.rawExcerpt).toContain("owner-b/demo-bot");
  });
});

// ── Rate-limit handling ────────────────────────────────────────────────────

describe("RepoOrgan — rate-limit handling (Req 5.3)", () => {
  let organ: RepoOrgan;

  beforeEach(() => {
    organ = new RepoOrgan();
    vi.restoreAllMocks();
  });

  it("returns source_error/rate_limited on 403 with X-RateLimit-Remaining: 0", async () => {
    const { cache, signal, anchorDate } = makeCtx();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(rateLimitFetch()));

    const packet = await organ.verify(
      repoSubClaim({ entities: { repo: "example-user/demo-bot", claimType: "stars" } }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("source_error");
    expect(packet.reason).toBe("rate_limited");
    const errors = validatePacket(packet);
    expect(errors).toHaveLength(0);
  });

  it("latches the host after a rate-limit so subsequent calls skip the fetch", async () => {
    const organ2 = new RepoOrgan();
    const cache = new SessionCache();
    const signal = new AbortController().signal;

    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        callCount++;
        return {
          ok: false,
          status: 403,
          headers: new Headers({ "X-RateLimit-Remaining": "0" }),
          text: async () => REPO_RATE_LIMIT_BODY,
        };
      }),
    );

    const ctx = { cache, signal, anchorDate: "2024-10-15T00:00:00Z" };
    const sc = repoSubClaim({ entities: { repo: "example-user/demo-bot", claimType: "stars" } });

    const p1 = await organ2.verify(sc, ctx);
    expect(p1.reason).toBe("rate_limited");

    // Second call should be latched — fetch should not be called again
    const p2 = await organ2.verify(sc, ctx);
    expect(p2.verdict).toBe("source_error");
    expect(p2.reason).toBe("rate_limited");
    expect(callCount).toBe(1); // only the first call hit the network
  });

  it("returns source_error/rate_limited on HTTP 429", async () => {
    const { cache, signal, anchorDate } = makeCtx();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => ({
      ok: false,
      status: 429,
      headers: new Headers(),
      text: async () => "",
    })));

    const packet = await organ.verify(
      repoSubClaim({ entities: { repo: "example-user/demo-bot", claimType: "stars" } }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("source_error");
    expect(packet.reason).toBe("rate_limited");
  });
});

// ── Cache behaviour ────────────────────────────────────────────────────────

describe("RepoOrgan — cache behaviour", () => {
  it("serves from cache on second call, not calling the network again", async () => {
    const organ = new RepoOrgan();
    vi.restoreAllMocks();

    const cache = new SessionCache();
    const signal = new AbortController().signal;

    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      callCount++;
      return { ok: true, status: 200, headers: new Headers(), text: async () => REPO_BODY };
    }));

    const ctx = { cache, signal, anchorDate: "2024-10-15T00:00:00Z" };
    const sc = repoSubClaim({ entities: { repo: "example-user/demo-bot", claimType: "stars" } });

    await organ.verify(sc, ctx);
    await organ.verify(sc, ctx);

    expect(callCount).toBe(1);
  });
});

// ── HTTP error handling ────────────────────────────────────────────────────

describe("RepoOrgan — HTTP error handling", () => {
  it("returns source_error/http_error on HTTP 500", async () => {
    const organ = new RepoOrgan();
    vi.restoreAllMocks();

    const { cache, signal, anchorDate } = makeCtx();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(failFetch(500)));

    const packet = await organ.verify(
      repoSubClaim({ entities: { repo: "example-user/demo-bot", claimType: "stars" } }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("source_error");
    expect(packet.reason).toBe("http_error");
  });
});
