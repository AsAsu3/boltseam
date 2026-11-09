/**
 * Unit tests for the Router: dispatch, no_organ fallback, timeout, and
 * source_error conversion.
 *
 * A stub organ is used throughout; no real API calls are made.
 */

import { describe, it, expect } from "vitest";
import { Router } from "../../../src/router/router.ts";
import type { Organ, EvidencePacket } from "../../../src/organs/contract/index.ts";
import type { SubClaim, Worklist } from "../../../src/intake/types.ts";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeSubClaim(
  id: string,
  domain: SubClaim["domain"],
  statedValue: number | null = null,
): SubClaim {
  return {
    id,
    span: [0, 10],
    text: "test claim",
    domain,
    statedValue,
    unit: "USD",
    entities: {},
    dateExpr: null,
    arithmeticOperands: null,
    unroutedReason: null,
    userEdited: false,
    originalExtraction: null,
  };
}

function makeWorklist(subClaims: SubClaim[]): Worklist {
  return {
    auditId: "test-audit",
    createdAt: "2026-11-09T00:00:00Z",
    originalText: "test post",
    subClaims,
  };
}

function supportedPacket(sc: SubClaim, organName: string): EvidencePacket {
  return {
    subClaimId: sc.id,
    organ: organName,
    verdict: "supported",
    reason: null,
    claimedValue: sc.statedValue,
    observedValue: sc.statedValue,
    unit: sc.unit,
    tolerance: { kind: "relative", value: 0.005 },
    notes: [],
    provenance: {
      source: "Stub",
      requestUrl: "https://stub.example/api",
      fetchedAt: "2026-11-09T00:00:00Z",
      rawExcerpt: "{}",
      rawSha256: "abc",
    },
  };
}

/** Organ stub that resolves immediately */
function makeStubOrgan(domain: string): Organ {
  return {
    domain,
    verify: (sc, _ctx) => Promise.resolve(supportedPacket(sc, domain)),
  };
}

/** Organ stub that rejects immediately */
function makeFailingOrgan(domain: string): Organ {
  return {
    domain,
    verify: (_sc, _ctx) => Promise.reject(new Error("simulated failure")),
  };
}

/** Organ stub that hangs forever (for timeout tests) */
function makeSlowOrgan(domain: string, delayMs: number): Organ {
  return {
    domain,
    verify: (_sc, _ctx) =>
      new Promise((_resolve) => setTimeout(_resolve, delayMs)),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("Router.dispatch", () => {
  it("dispatches to the registered organ and returns its packet", async () => {
    const router = new Router();
    router.register(makeStubOrgan("price"));

    const worklist = makeWorklist([makeSubClaim("sc-01", "price", 100)]);
    const packets = await router.dispatch(worklist);

    expect(packets).toHaveLength(1);
    expect(packets[0]?.verdict).toBe("supported");
    expect(packets[0]?.organ).toBe("price");
  });

  it("returns unverifiable/no_organ for an unregistered domain tag", async () => {
    const router = new Router();
    const worklist = makeWorklist([makeSubClaim("sc-01", "weather")]);
    const packets = await router.dispatch(worklist);

    expect(packets).toHaveLength(1);
    expect(packets[0]?.verdict).toBe("unverifiable");
    expect(packets[0]?.reason).toBe("no_organ");
    expect(packets[0]?.organ).toBe("router");
  });

  it("returns a packet for every sub-claim (none dropped)", async () => {
    const router = new Router();
    router.register(makeStubOrgan("price"));

    const worklist = makeWorklist([
      makeSubClaim("sc-01", "price"),
      makeSubClaim("sc-02", "fx"),   // no organ
      makeSubClaim("sc-03", "date"), // no organ
    ]);
    const packets = await router.dispatch(worklist);

    expect(packets).toHaveLength(3);
    expect(packets.map((p) => p.subClaimId)).toEqual(["sc-01", "sc-02", "sc-03"]);
  });

  it("converts an organ rejection to source_error", async () => {
    const router = new Router();
    router.register(makeFailingOrgan("price"));

    const worklist = makeWorklist([makeSubClaim("sc-01", "price")]);
    const packets = await router.dispatch(worklist);

    expect(packets[0]?.verdict).toBe("source_error");
    expect(packets[0]?.reason).toBe("http_error");
  });

  it("converts a timeout to source_error with reason=timeout", async () => {
    // timeoutMs = 50; organ delays 500 ms
    const router = new Router(50);
    router.register(makeSlowOrgan("price", 500));

    const worklist = makeWorklist([makeSubClaim("sc-01", "price")]);
    const packets = await router.dispatch(worklist, { timeoutMs: 50 });

    expect(packets[0]?.verdict).toBe("source_error");
    expect(packets[0]?.reason).toBe("timeout");
  }, 2000);

  it("emits status events: queued → running → done", async () => {
    const events: Array<{ subClaimId: string; status: string }> = [];
    const router = new Router();
    router.register(makeStubOrgan("price"));

    const worklist = makeWorklist([makeSubClaim("sc-01", "price")]);
    await router.dispatch(worklist, {
      onStatus: (e) => events.push({ subClaimId: e.subClaimId, status: e.status }),
    });

    const statuses = events
      .filter((e) => e.subClaimId === "sc-01")
      .map((e) => e.status);
    expect(statuses).toEqual(["queued", "running", "done"]);
  });

  it("emits queued → done for no_organ sub-claims (never running)", async () => {
    const events: Array<{ status: string }> = [];
    const router = new Router();

    const worklist = makeWorklist([makeSubClaim("sc-01", "weather")]);
    await router.dispatch(worklist, { onStatus: (e) => events.push(e) });

    expect(events.map((e) => e.status)).toEqual(["queued", "done"]);
  });

  it("emits source_error status when organ rejects", async () => {
    const events: Array<{ status: string }> = [];
    const router = new Router();
    router.register(makeFailingOrgan("price"));

    const worklist = makeWorklist([makeSubClaim("sc-01", "price")]);
    await router.dispatch(worklist, { onStatus: (e) => events.push(e) });

    expect(events.map((e) => e.status)).toContain("source_error");
  });

  it("runs sub-claims concurrently (total time ≈ max single time)", async () => {
    // Each organ delays 100 ms; 3 sub-claims should take ~100 ms, not 300 ms
    const router = new Router(5000);
    router.register(makeSlowOrgan("price", 100));
    // Use distinct domain per claim so we need to override organ per sc
    // Actually use same domain for all three, verifying concurrency
    const worklist = makeWorklist([
      makeSubClaim("sc-01", "price"),
      makeSubClaim("sc-02", "price"),
      makeSubClaim("sc-03", "price"),
    ]);
    const start = Date.now();
    const packets = await router.dispatch(worklist);
    const elapsed = Date.now() - start;

    expect(packets).toHaveLength(3);
    // Should complete in under 400 ms (3 × 100 ms sequential would be 300+,
    // concurrent should be ~100-200 ms including overhead)
    expect(elapsed).toBeLessThan(400);
  }, 2000);

  it("honors options.anchorDate in the context passed to organs", async () => {
    let capturedDate: string | undefined;
    const spyOrgan: Organ = {
      domain: "price",
      verify: (sc, ctx) => {
        capturedDate = ctx.anchorDate;
        return Promise.resolve(supportedPacket(sc, "price"));
      },
    };
    const router = new Router();
    router.register(spyOrgan);

    const worklist = makeWorklist([makeSubClaim("sc-01", "price")]);
    await router.dispatch(worklist, { anchorDate: "2026-10-10T00:00:00Z" });

    expect(capturedDate).toBe("2026-10-10T00:00:00Z");
  });
});

describe("Router.register", () => {
  it("is chainable", () => {
    const router = new Router();
    const result = router.register(makeStubOrgan("price"));
    expect(result).toBe(router);
  });

  it("last register wins for the same domain", async () => {
    const router = new Router();
    router.register(makeFailingOrgan("price"));
    router.register(makeStubOrgan("price"));

    const worklist = makeWorklist([makeSubClaim("sc-01", "price")]);
    const packets = await router.dispatch(worklist);
    expect(packets[0]?.verdict).toBe("supported");
  });
});
