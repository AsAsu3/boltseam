/**
 * Contract tests for the Calendar Organ.
 *
 * All tests use local arithmetic only or recorded Nager.Date fixtures.
 * No live network calls.
 * Fixtures: src/fixtures/calendar/
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CalendarOrgan } from "../../../src/organs/calendar/calendarOrgan.ts";
import { SessionCache } from "../../../src/organs/contract/sessionCache.ts";
import { validatePacket } from "../../../src/organs/contract/packetValidator.ts";
import type { SubClaim } from "../../../src/intake/types.ts";
import nagerFixture from "../../../src/fixtures/calendar/nager-us-2024.json";

// ── Fixture wiring ─────────────────────────────────────────────────────────

const NAGER_BODY = JSON.stringify(nagerFixture);

function dateSubClaim(overrides: Partial<SubClaim> = {}): SubClaim {
  return {
    id: "sc-03",
    span: [0, 20],
    text: "on Saturday Oct 12 2024",
    domain: "date",
    statedValue: null,
    unit: null,
    entities: { claimType: "weekday_check", weekday: "Saturday" },
    dateExpr: "2024-10-12",
    arithmeticOperands: null,
    unroutedReason: null,
    userEdited: false,
    originalExtraction: null,
    ...overrides,
  };
}

function makeCtx(nagerBody?: string) {
  const cache = new SessionCache();
  const controller = new AbortController();
  const fetchStub = vi.fn().mockImplementation(async (url: string) => {
    if (String(url).includes("date.nager.at")) {
      return {
        ok: true,
        status: 200,
        text: async () => nagerBody ?? NAGER_BODY,
      };
    }
    return { ok: false, status: 404, text: async () => "" };
  });
  return { cache, signal: controller.signal, anchorDate: "2024-10-15T00:00:00Z", fetchStub };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("CalendarOrgan — packet completeness", () => {
  let organ: CalendarOrgan;

  beforeEach(() => {
    organ = new CalendarOrgan();
    vi.restoreAllMocks();
  });

  it("produces a structurally valid packet for a weekday check", async () => {
    const { cache, signal, anchorDate } = makeCtx();

    const packet = await organ.verify(dateSubClaim(), { cache, signal, anchorDate });
    const errors = validatePacket(packet);
    expect(errors, "validation errors: " + JSON.stringify(errors)).toHaveLength(0);
  });

  it("sets organ = 'calendar'", async () => {
    const { cache, signal, anchorDate } = makeCtx();

    const packet = await organ.verify(dateSubClaim(), { cache, signal, anchorDate });
    expect(packet.organ).toBe("calendar");
  });

  it("provenance marks source as local arithmetic", async () => {
    const { cache, signal, anchorDate } = makeCtx();

    const packet = await organ.verify(dateSubClaim(), { cache, signal, anchorDate });
    expect(packet.provenance.source).toContain("local arithmetic");
  });

  it("rawSha256 is null with rawSha256NullReason for local computation", async () => {
    const { cache, signal, anchorDate } = makeCtx();

    const packet = await organ.verify(dateSubClaim(), { cache, signal, anchorDate });
    expect(packet.provenance.rawSha256).toBeNull();
    expect(packet.provenance.rawSha256NullReason).toBeTruthy();
  });
});

describe("CalendarOrgan — weekday verification", () => {
  let organ: CalendarOrgan;

  beforeEach(() => {
    organ = new CalendarOrgan();
    vi.restoreAllMocks();
  });

  it("returns 'supported' when weekday matches date — Saturday Oct 12 2024", async () => {
    const { cache, signal, anchorDate } = makeCtx();
    // 2024-10-12 is a Saturday
    const packet = await organ.verify(
      dateSubClaim({ entities: { claimType: "weekday_check", weekday: "Saturday" }, dateExpr: "2024-10-12" }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("supported");
  });

  it("returns 'contradicted' when weekday does not match — 2024-10-12 is NOT Sunday", async () => {
    const { cache, signal, anchorDate } = makeCtx();
    const packet = await organ.verify(
      dateSubClaim({ entities: { claimType: "weekday_check", weekday: "Sunday" }, dateExpr: "2024-10-12" }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("contradicted");
  });

  it("returns unverifiable/unknown_date when dateExpr is unresolvable", async () => {
    const { cache, signal, anchorDate } = makeCtx();
    const packet = await organ.verify(
      dateSubClaim({ entities: { claimType: "weekday_check", weekday: "Monday" }, dateExpr: "sometime last century" }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("unverifiable");
    expect(packet.reason).toBe("unknown_date");
  });

  it("returns unverifiable when weekday entity is missing", async () => {
    const { cache, signal, anchorDate } = makeCtx();
    const packet = await organ.verify(
      dateSubClaim({ entities: { claimType: "weekday_check" } }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("unverifiable");
  });
});

describe("CalendarOrgan — duration verification", () => {
  let organ: CalendarOrgan;

  beforeEach(() => {
    organ = new CalendarOrgan();
    vi.restoreAllMocks();
  });

  it("returns 'supported' for a correct 7-day duration", async () => {
    const { cache, signal, anchorDate } = makeCtx();
    const packet = await organ.verify(
      dateSubClaim({
        entities: {
          claimType: "duration",
          startDate: "2024-10-01",
          endDate: "2024-10-08",
          duration: 7,
          durationUnit: "days",
        },
        statedValue: 7,
      }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("supported");
    expect(packet.observedValue).toBeCloseTo(7, 2);
  });

  it("returns 'contradicted' for a wrong duration claim (48 hours vs 72-hour window)", async () => {
    const { cache, signal, anchorDate } = makeCtx();
    const packet = await organ.verify(
      dateSubClaim({
        entities: {
          claimType: "duration",
          startDate: "2024-10-01",
          endDate: "2024-10-04",
          duration: 48,
          durationUnit: "hours",
        },
        statedValue: 48,
      }),
      { cache, signal, anchorDate },
    );
    // 3 days = 72 hours, claimed = 48 → contradicted
    expect(packet.verdict).toBe("contradicted");
  });

  it("produces a valid packet for duration check", async () => {
    const { cache, signal, anchorDate } = makeCtx();
    const packet = await organ.verify(
      dateSubClaim({
        entities: {
          claimType: "duration",
          startDate: "2024-10-01",
          endDate: "2024-10-08",
          duration: 7,
          durationUnit: "days",
        },
        statedValue: 7,
      }),
      { cache, signal, anchorDate },
    );
    const errors = validatePacket(packet);
    expect(errors).toHaveLength(0);
  });
});

describe("CalendarOrgan — business-day verification", () => {
  let organ: CalendarOrgan;

  beforeEach(() => {
    organ = new CalendarOrgan();
    vi.restoreAllMocks();
  });

  it("returns 'supported' for correct business-day count with US holidays", async () => {
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    // 2024-10-07 (Mon) to 2024-10-11 (Fri) = 5 business days (no US holidays in this window)
    const packet = await organ.verify(
      dateSubClaim({
        entities: {
          claimType: "business_days",
          startDate: "2024-10-07",
          endDate: "2024-10-11",
          businessDays: 5,
          country: "US",
        },
        statedValue: 5,
      }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("supported");
  });

  it("includes Nager.Date URL in provenance when country is provided", async () => {
    const { cache, signal, anchorDate, fetchStub } = makeCtx();
    vi.stubGlobal("fetch", fetchStub);

    const packet = await organ.verify(
      dateSubClaim({
        entities: {
          claimType: "business_days",
          startDate: "2024-10-07",
          endDate: "2024-10-11",
          businessDays: 5,
          country: "US",
        },
        statedValue: 5,
      }),
      { cache, signal, anchorDate },
    );
    expect(packet.provenance.requestUrl).toContain("nager");
    expect(packet.provenance.source).toContain("Nager.Date");
  });

  it("adds weekend_only_arithmetic note when no country provided", async () => {
    const { cache, signal, anchorDate } = makeCtx();

    const packet = await organ.verify(
      dateSubClaim({
        entities: {
          claimType: "business_days",
          startDate: "2024-10-07",
          endDate: "2024-10-11",
          businessDays: 5,
        },
        statedValue: 5,
      }),
      { cache, signal, anchorDate },
    );
    expect(packet.notes).toContain("weekend_only_arithmetic");
  });

  it("returns unverifiable when startDate or endDate is missing", async () => {
    const { cache, signal, anchorDate } = makeCtx();

    const packet = await organ.verify(
      dateSubClaim({
        entities: { claimType: "business_days", businessDays: 5 },
        statedValue: 5,
      }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("unverifiable");
  });
});

describe("CalendarOrgan — ambiguous date detection", () => {
  let organ: CalendarOrgan;

  beforeEach(() => {
    organ = new CalendarOrgan();
    vi.restoreAllMocks();
  });

  it("returns 'partially_supported' with ambiguous_anchor note for MM/DD ambiguity", async () => {
    const { cache, signal, anchorDate } = makeCtx();

    // "10/11" can be October 11 or November 10
    const packet = await organ.verify(
      dateSubClaim({ entities: { claimType: "date_exists" }, dateExpr: "10/11" }),
      { cache, signal, anchorDate },
    );
    expect(packet.verdict).toBe("partially_supported");
    expect(packet.notes).toContain("ambiguous_anchor");
  });
});

describe("CalendarOrgan — relative date resolution", () => {
  let organ: CalendarOrgan;

  beforeEach(() => {
    organ = new CalendarOrgan();
    vi.restoreAllMocks();
  });

  it("resolves 'last Saturday' relative to anchorDate", async () => {
    const { cache, signal } = makeCtx();
    // anchorDate = 2024-10-15 (Tuesday); last Saturday = 2024-10-12
    const packet = await organ.verify(
      dateSubClaim({
        entities: { claimType: "weekday_check", weekday: "Saturday" },
        dateExpr: "last Saturday",
      }),
      { cache, signal, anchorDate: "2024-10-15T00:00:00Z" },
    );
    // 2024-10-12 is Saturday → supported
    expect(packet.verdict).toBe("supported");
  });
});
