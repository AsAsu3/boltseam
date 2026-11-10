/**
 * FX Organ — currency-conversion claim verification.
 *
 * Primary source (confirmed 2026-11-10 — Frankfurter API has migrated):
 *   Frankfurter: GET https://api.frankfurter.dev/v1/{YYYY-MM-DD}?from={FROM}&to={TO}
 *   - api.frankfurter.app now 301-redirects to api.frankfurter.dev; using new base URL.
 *   - Response: { "amount": 1.0, "base": "USD", "date": "2024-10-10", "rates": { "JPY": 148.97 } }
 *   - Ref: https://api.frankfurter.dev (official site)
 *   - CORS: Frankfurter sets Access-Control-Allow-Origin: *; direct browser fetch is fine.
 *
 * Fallback source (confirmed 2026-11-10):
 *   open.er-api.com free tier: GET https://open.er-api.com/v6/latest/{base}
 *   - Free tier provides LATEST rates only — no historical support.
 *   - When used as fallback, the packet source is labelled "open.er-api.com (latest rate)"
 *     and a note explains it is not a historical rate.
 *   - Ref: https://www.exchangerate-api.com/docs/free
 *   - CORS: open.er-api.com sets Access-Control-Allow-Origin: *; direct browser fetch is fine.
 *
 * Rates are labelled as central-bank reference rates (Frankfurter) or mid-market latest
 * rates (open.er-api.com fallback), never as tradable quotes (Req 4.3).
 */

import type { Organ, OrganContext, EvidencePacket, Tolerance } from "../contract/index.ts";
import type { SubClaim } from "../../intake/types.ts";
import {
  sourceFetch,
  sha256Hex,
  compareWithTolerance,
  RateLimitedError,
} from "../contract/index.ts";

// ── Tolerance ──────────────────────────────────────────────────────────────

const FX_TOLERANCE: Tolerance = { kind: "relative", value: 0.01 };

// ── API endpoints ──────────────────────────────────────────────────────────

const FRANKFURTER_BASE = "https://api.frankfurter.dev/v1";
const OPEN_ER_BASE = "https://open.er-api.com/v6/latest";

// ── Response shapes ────────────────────────────────────────────────────────

interface FrankfurterResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

interface OpenErResponse {
  result: string;
  base_code: string;
  rates: Record<string, number>;
}

// ── FX Organ ───────────────────────────────────────────────────────────────

export class FxOrgan implements Organ {
  readonly domain = "fx";

  async verify(sc: SubClaim, ctx: OrganContext): Promise<EvidencePacket> {
    const { cache, signal, anchorDate } = ctx;

    // ── 1. Extract entities ────────────────────────────────────────────────
    const amount = extractNumber(sc.entities["amount"]) ?? sc.statedValue;
    const fromCurrency = extractString(sc.entities["fromCurrency"])?.toUpperCase();
    const toCurrency   = extractString(sc.entities["toCurrency"])?.toUpperCase();

    if (amount === null || fromCurrency === undefined || toCurrency === undefined) {
      return this._unverifiablePacket(sc, "missing_operands");
    }

    // ── 2. Resolve date ────────────────────────────────────────────────────
    const dateStr = resolveFxDate(sc.dateExpr, anchorDate);
    if (dateStr === null) {
      return this._unverifiablePacket(sc, "unknown_date");
    }
    if (isFutureDate(dateStr, anchorDate)) {
      return this._unverifiablePacket(sc, "future_date");
    }

    // ── 3. Try Frankfurter ────────────────────────────────────────────────
    const frankfurterUrl = `${FRANKFURTER_BASE}/${dateStr}?from=${fromCurrency}&to=${toCurrency}`;
    let rate: number | null = null;
    let sourceLabel: string = "Frankfurter (central-bank reference rate)";
    let usedUrl: string = frankfurterUrl;
    let fetchedBody: string = "";
    let fetchedAt: string = nowIso();
    let fromCacheFlag: boolean = false;

    try {
      const entry = await sourceFetch(frankfurterUrl, cache, signal);
      const parsed = JSON.parse(entry.body) as FrankfurterResponse;
      if (
        typeof parsed.rates === "object" &&
        parsed.rates !== null &&
        typeof parsed.rates[toCurrency] === "number"
      ) {
        rate = parsed.rates[toCurrency];
        fetchedBody = entry.body;
        fetchedAt = entry.fetchedAt;
        fromCacheFlag = entry.fromCache;
      }
    } catch (err) {
      if (err instanceof RateLimitedError) {
        return this._errorPacket(sc, "rate_limited", frankfurterUrl, nowIso());
      }
      // Frankfurter failed — try fallback
    }

    // ── 4. Fallback: open.er-api.com (latest rate) ─────────────────────────
    if (rate === null) {
      const openErUrl = `${OPEN_ER_BASE}/${fromCurrency}`;
      try {
        const entry = await sourceFetch(openErUrl, cache, signal);
        const parsed = JSON.parse(entry.body) as OpenErResponse;
        if (
          parsed.result === "success" &&
          typeof parsed.rates === "object" &&
          parsed.rates !== null &&
          typeof parsed.rates[toCurrency] === "number"
        ) {
          rate = parsed.rates[toCurrency];
          sourceLabel = "open.er-api.com (latest rate — not historical; fallback used)";
          usedUrl = openErUrl;
          fetchedBody = entry.body;
          fetchedAt = entry.fetchedAt;
          fromCacheFlag = entry.fromCache;
        }
      } catch (err) {
        if (err instanceof RateLimitedError) {
          return this._errorPacket(sc, "rate_limited", openErUrl, nowIso());
        }
        return this._errorPacket(sc, "http_error", openErUrl, nowIso());
      }
    }

    if (rate === null) {
      return this._errorPacket(sc, "http_error", usedUrl, fetchedAt);
    }

    // ── 5. Recompute and compare ───────────────────────────────────────────
    const convertedAmount = amount * rate;
    const claimedValue = sc.statedValue;

    if (claimedValue === null) {
      return this._unverifiablePacket(sc, "missing_operands");
    }

    const { verdict } = compareWithTolerance(claimedValue, convertedAmount, FX_TOLERANCE);

    // ── 6. quantity_mismatch note ──────────────────────────────────────────
    // If entities carry an explicit 'amount' that differs from statedValue,
    // the claim's principal vs profit is potentially inconsistent — flag it.
    const notes: Array<"quantity_mismatch"> = [];
    if (
      sc.statedValue !== null &&
      amount !== null &&
      Math.abs(amount - sc.statedValue) / Math.max(Math.abs(sc.statedValue), 1) > FX_TOLERANCE.value
    ) {
      notes.push("quantity_mismatch");
    }

    // ── 7. Build provenance ────────────────────────────────────────────────
    const rawSha256 = await sha256Hex(fetchedBody);

    return {
      subClaimId: sc.id,
      organ: "fx",
      verdict,
      reason: null,
      claimedValue,
      observedValue: convertedAmount,
      unit: toCurrency,
      tolerance: FX_TOLERANCE,
      notes,
      provenance: {
        source: sourceLabel,
        requestUrl: usedUrl,
        fetchedAt,
        rawExcerpt: fetchedBody.slice(0, 2048),
        rawSha256,
        fromCache: fromCacheFlag,
      },
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private _unverifiablePacket(
    sc: SubClaim,
    reason: "missing_operands" | "unknown_date" | "future_date",
  ): EvidencePacket {
    return {
      subClaimId: sc.id,
      organ: "fx",
      verdict: "unverifiable",
      reason,
      claimedValue: sc.statedValue,
      observedValue: null,
      unit: sc.unit,
      tolerance: null,
      notes: [],
      provenance: {
        source: "Frankfurter (central-bank reference rate)",
        requestUrl: `boltseam://fx/unverifiable/${reason}`,
        fetchedAt: nowIso(),
        rawExcerpt: "",
        rawSha256: null,
        rawSha256NullReason: `no fetch attempted — verdict is ${reason}`,
      },
    };
  }

  private _errorPacket(
    sc: SubClaim,
    reason: "rate_limited" | "http_error",
    requestUrl: string,
    fetchedAt: string,
  ): EvidencePacket {
    return {
      subClaimId: sc.id,
      organ: "fx",
      verdict: "source_error",
      reason,
      claimedValue: sc.statedValue,
      observedValue: null,
      unit: sc.unit,
      tolerance: null,
      notes: [],
      provenance: {
        source: "Frankfurter (central-bank reference rate)",
        requestUrl,
        fetchedAt,
        rawExcerpt: "",
        rawSha256: null,
        rawSha256NullReason: `fetch failed with reason: ${reason}`,
      },
    };
  }
}

// ── Utilities ──────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, "Z");
}

function isFutureDate(dateStr: string, anchorDate: string): boolean {
  return dateStr > anchorDate.slice(0, 10);
}

function extractNumber(v: string | number | null | undefined): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/,/g, ""));
    return isNaN(n) ? null : n;
  }
  return null;
}

function extractString(v: string | number | null | undefined): string | undefined {
  if (typeof v === "string" && v.length > 0) return v;
  return undefined;
}

/**
 * Resolve a date expression to YYYY-MM-DD.
 * Handles explicit ISO dates and simple English month patterns.
 */
function resolveFxDate(dateExpr: string | null, anchorDate: string): string | null {
  if (dateExpr === null) return anchorDate.slice(0, 10);

  const trimmed = dateExpr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  const monthDayYear = trimmed.match(
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?$/i,
  );
  if (monthDayYear) {
    const monthNames: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    };
    const mon = monthNames[monthDayYear[1].toLowerCase().slice(0, 3)];
    const day = monthDayYear[2].padStart(2, "0");
    const year = monthDayYear[3] ?? anchorDate.slice(0, 4);
    return `${year}-${mon}-${day}`;
  }

  return null;
}
