/**
 * Calendar Organ — date and duration claim verification.
 *
 * Local arithmetic is authoritative. Nager.Date is used as a supplementary
 * source for public holidays when business-day counts are involved.
 *
 * Nager.Date endpoint (confirmed 2026-11-10 against v3 REST API docs):
 *   GET https://date.nager.at/api/v3/PublicHolidays/{year}/{countryCode}
 *   - countryCode: ISO 3166-1 alpha-2 (e.g. "US", "GB", "DE")
 *   - Response: Array of { date: "YYYY-MM-DD", name: string, ... }
 *   - Ref: https://date.nager.at and https://github.com/nager/Nager.Date
 *   - CORS: date.nager.at sets Access-Control-Allow-Origin: *; direct browser fetch is fine.
 *
 * Sub-claim entity contract:
 *   entities.claimType  — "weekday_check" | "duration" | "business_days" | "date_exists"
 *   entities.weekday    — claimed weekday name ("Saturday", "Sunday", …)
 *   entities.country    — ISO 3166-1 alpha-2 country code (optional)
 *   entities.duration   — numeric duration value
 *   entities.durationUnit — "hours" | "days" | "weeks" | "months"
 *   entities.startDate  — explicit start date for duration (YYYY-MM-DD, optional)
 *   entities.endDate    — explicit end date for duration (YYYY-MM-DD, optional)
 *   entities.businessDays — claimed number of business days
 *   dateExpr           — the date expression to resolve
 */

import type { Organ, OrganContext, EvidencePacket, Tolerance, NoteCode } from "../contract/index.ts";
import type { SubClaim } from "../../intake/types.ts";
import {
  sourceFetch,
  sha256Hex,
  RateLimitedError,
  compareWithTolerance,
} from "../contract/index.ts";

// ── Constants ──────────────────────────────────────────────────────────────

const NAGER_BASE = "https://date.nager.at/api/v3/PublicHolidays";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ── Nager.Date response shape ──────────────────────────────────────────────

interface NagerHoliday {
  date: string;        // YYYY-MM-DD
  name: string;
  localName: string;
  countryCode: string;
}

// ── Calendar Organ ─────────────────────────────────────────────────────────

export class CalendarOrgan implements Organ {
  readonly domain = "date";

  async verify(sc: SubClaim, ctx: OrganContext): Promise<EvidencePacket> {
    const { cache, signal, anchorDate } = ctx;
    const claimType = extractString(sc.entities["claimType"]) ?? "date_exists";

    switch (claimType) {
      case "weekday_check":
        return this._verifyWeekday(sc, anchorDate);

      case "duration":
        return this._verifyDuration(sc, anchorDate);

      case "business_days":
        return this._verifyBusinessDays(sc, anchorDate, cache, signal);

      default:
        return this._verifyDateExists(sc, anchorDate);
    }
  }

  // ── Weekday verification ───────────────────────────────────────────────

  private _verifyWeekday(sc: SubClaim, anchorDate: string): EvidencePacket {
    const dateStr = resolveDate(sc.dateExpr, anchorDate);
    if (dateStr === null) {
      return localUnverifiablePacket(sc, "unknown_date", "date expression could not be resolved");
    }

    if (!isValidDateString(dateStr)) {
      return localUnverifiablePacket(sc, "unknown_date", `invalid date: ${dateStr}`);
    }

    const claimedWeekday = extractString(sc.entities["weekday"]);
    if (claimedWeekday === undefined) {
      return localUnverifiablePacket(sc, "unknown_date", "no weekday entity in sub-claim");
    }

    const actualWeekday = getWeekdayName(dateStr);
    const resolvedNote = `Resolved "${sc.dateExpr ?? ""}" → ${dateStr} (${actualWeekday})`;

    const matches =
      actualWeekday.toLowerCase() === claimedWeekday.toLowerCase();

    const steps = [
      resolvedNote,
      `Claimed weekday: ${claimedWeekday}`,
      `Actual weekday: ${actualWeekday}`,
      matches ? "Match: ✓" : "Match: ✗",
    ].join("\n");

    // Encode weekday comparison as numeric boolean (1 = match claimed, 0 = no match)
    // so the validator's value-based verdict constraint is satisfied.
    const tolerance: Tolerance = { kind: "absolute", value: 0, unit: "weekday match" };
    return {
      subClaimId: sc.id,
      organ: "calendar",
      verdict: matches ? "supported" : "contradicted",
      reason: null,
      claimedValue: 1,
      observedValue: matches ? 1 : 0,
      unit: "weekday match",
      tolerance,
      notes: [],
      provenance: localProvenance(steps),
    };
  }

  // ── Duration verification ──────────────────────────────────────────────

  private _verifyDuration(sc: SubClaim, anchorDate: string): EvidencePacket {
    const startDateStr = extractString(sc.entities["startDate"]) ??
      resolveDate(sc.dateExpr, anchorDate);
    const endDateStr = extractString(sc.entities["endDate"]);

    if (startDateStr === null || endDateStr === undefined) {
      return localUnverifiablePacket(sc, "unknown_date", "need both startDate and endDate for duration check");
    }

    const claimedDuration = extractNumber(sc.entities["duration"]) ?? sc.statedValue;
    const durationUnit = extractString(sc.entities["durationUnit"]) ?? "days";

    if (claimedDuration === null) {
      return localUnverifiablePacket(sc, "missing_operands", "no duration value in sub-claim");
    }

    const startMs = Date.UTC(...parseDateParts(startDateStr));
    const endMs   = Date.UTC(...parseDateParts(endDateStr));
    const diffMs  = Math.abs(endMs - startMs);

    let observedDuration: number;
    let unitLabel: string;
    const tolerance: Tolerance = { kind: "relative", value: 0.01 };

    switch (durationUnit) {
      case "hours":
        observedDuration = diffMs / 3_600_000;
        unitLabel = "hours";
        break;
      case "weeks":
        observedDuration = diffMs / (7 * 86_400_000);
        unitLabel = "weeks";
        break;
      case "months":
        observedDuration = diffMs / (30 * 86_400_000);
        unitLabel = "months";
        break;
      default:
        observedDuration = diffMs / 86_400_000;
        unitLabel = "days";
    }

    const { verdict } = compareWithTolerance(claimedDuration, observedDuration, tolerance);

    const steps = [
      `Start: ${startDateStr}`,
      `End: ${endDateStr}`,
      `Difference: ${diffMs} ms = ${observedDuration.toFixed(2)} ${unitLabel}`,
      `Claimed: ${claimedDuration} ${unitLabel}`,
    ].join("\n");

    return {
      subClaimId: sc.id,
      organ: "calendar",
      verdict,
      reason: null,
      claimedValue: claimedDuration,
      observedValue: parseFloat(observedDuration.toFixed(4)),
      unit: unitLabel,
      tolerance,
      notes: [],
      provenance: localProvenance(steps),
    };
  }

  // ── Business-day verification ──────────────────────────────────────────

  private async _verifyBusinessDays(
    sc: SubClaim,
    anchorDate: string,
    cache: import("../contract/sessionCache.ts").SessionCache,
    signal: AbortSignal,
  ): Promise<EvidencePacket> {
    const startDateStr = extractString(sc.entities["startDate"]) ??
      resolveDate(sc.dateExpr, anchorDate);
    const endDateStr = extractString(sc.entities["endDate"]);

    if (startDateStr === null || endDateStr === undefined) {
      return localUnverifiablePacket(sc, "unknown_date", "need startDate and endDate for business-day check");
    }

    const claimedBd = extractNumber(sc.entities["businessDays"]) ?? sc.statedValue;
    if (claimedBd === null) {
      return localUnverifiablePacket(sc, "missing_operands", "no businessDays value in sub-claim");
    }

    const country = extractString(sc.entities["country"]);
    const notes: NoteCode[] = [];

    // Try to fetch holidays for each year covered by the range
    let holidays: Set<string> = new Set();
    let nagerBody = "";
    let nagerFetchedAt = nowIso();
    let nagerUrl = "";
    let fromCacheFlag = false;
    let nagerSha256: string | null = null;
    let nagerNullReason: string | undefined;

    if (country !== undefined) {
      const years = yearsInRange(startDateStr, endDateStr);
      const allHolidayDates: string[] = [];
      const fetchedBodies: string[] = [];

      for (const year of years) {
        nagerUrl = `${NAGER_BASE}/${year}/${country}`;
        try {
          const entry = await sourceFetch(nagerUrl, cache, signal);
          const parsed = JSON.parse(entry.body) as NagerHoliday[];
          if (Array.isArray(parsed)) {
            for (const h of parsed) {
              allHolidayDates.push(h.date.slice(0, 10));
            }
          }
          fetchedBodies.push(entry.body);
          nagerFetchedAt = entry.fetchedAt;
          fromCacheFlag = entry.fromCache;
        } catch (err) {
          if (err instanceof RateLimitedError) {
            notes.push("weekend_only_arithmetic");
          }
          // If Nager fails, fall back to weekend-only
          notes.push("weekend_only_arithmetic");
        }
      }

      if (fetchedBodies.length > 0) {
        nagerBody = fetchedBodies.join("\n");
        nagerSha256 = await sha256Hex(nagerBody);
      } else {
        nagerSha256 = null;
        nagerNullReason = "Nager.Date fetch failed; weekend-only arithmetic used";
      }
      holidays = new Set(allHolidayDates);
    } else {
      // No country — weekend-only
      notes.push("weekend_only_arithmetic");
      nagerSha256 = null;
      nagerNullReason = "no country provided; weekend-only arithmetic used";
    }

    // Count actual business days
    const observedBd = countBusinessDays(startDateStr, endDateStr, holidays);

    const tolerance: Tolerance = { kind: "absolute", value: 1, unit: "days" };
    const { verdict } = compareWithTolerance(claimedBd, observedBd, tolerance);

    const holidayList = Array.from(holidays)
      .filter((d) => d >= startDateStr && d <= endDateStr)
      .sort()
      .join(", ");

    const steps = [
      `Start: ${startDateStr}`,
      `End: ${endDateStr}`,
      country !== undefined ? `Country: ${country}` : "No country (weekend-only)",
      holidayList ? `Holidays in window: ${holidayList}` : "No holidays in window",
      `Observed business days: ${observedBd}`,
      `Claimed business days: ${claimedBd}`,
    ].join("\n");

    // Deduplicate notes
    const uniqueNotes = Array.from(new Set(notes)) as NoteCode[];

    // Build provenance — Nager is supplementary
    if (nagerUrl !== "") {
      return {
        subClaimId: sc.id,
        organ: "calendar",
        verdict,
        reason: null,
        claimedValue: claimedBd,
        observedValue: observedBd,
        unit: "business days",
        tolerance,
        notes: uniqueNotes,
        provenance: {
          source: "local arithmetic (authoritative) + Nager.Date (public holidays, supplementary)",
          requestUrl: nagerUrl,
          fetchedAt: nagerFetchedAt,
          rawExcerpt: steps + (nagerBody ? `\n---\n${nagerBody.slice(0, 1500)}` : ""),
          rawSha256: nagerSha256,
          rawSha256NullReason: nagerSha256 === null ? nagerNullReason : undefined,
          fromCache: fromCacheFlag,
        },
      };
    }

    // No network call made
    return {
      subClaimId: sc.id,
      organ: "calendar",
      verdict,
      reason: null,
      claimedValue: claimedBd,
      observedValue: observedBd,
      unit: "business days",
      tolerance,
      notes: uniqueNotes,
      provenance: localProvenance(steps, nagerNullReason),
    };
  }

  // ── Date-exists verification ──────────────────────────────────────────

  private _verifyDateExists(sc: SubClaim, anchorDate: string): EvidencePacket {
    const dateStr = resolveDate(sc.dateExpr, anchorDate);

    if (dateStr === null) {
      return localUnverifiablePacket(sc, "unknown_date", `cannot resolve date: ${sc.dateExpr ?? "(null)"}`);
    }

    // Check for ambiguity (e.g., "10/11" can be Oct 11 or Nov 10)
    if (sc.dateExpr !== null && isAmbiguousDate(sc.dateExpr)) {
      const alt = alternativeDate(sc.dateExpr, anchorDate);
      if (alt !== null && alt !== dateStr) {
        const steps = [
          `Ambiguous date expression: "${sc.dateExpr}"`,
          `Reading 1: ${dateStr}`,
          `Reading 2: ${alt}`,
          "Cannot determine which reading was intended without additional context.",
        ].join("\n");

        return {
          subClaimId: sc.id,
          organ: "calendar",
          verdict: "partially_supported",
          reason: null,
          claimedValue: sc.statedValue,
          observedValue: null,
          unit: sc.unit,
          tolerance: null,
          notes: ["ambiguous_anchor"],
          provenance: localProvenance(steps),
        };
      }
    }

    if (!isValidDateString(dateStr)) {
      return localUnverifiablePacket(sc, "unknown_date", `invalid calendar date: ${dateStr}`);
    }

    const steps = [
      `Resolved "${sc.dateExpr ?? "(null)"}" → ${dateStr}`,
      `Date exists: ${dateStr}`,
    ].join("\n");

    return {
      subClaimId: sc.id,
      organ: "calendar",
      verdict: "supported",
      reason: null,
      claimedValue: sc.statedValue,
      observedValue: null,
      unit: sc.unit,
      tolerance: null,
      notes: [],
      provenance: localProvenance(steps),
    };
  }
}

// ── Local packet factories ─────────────────────────────────────────────────

function localProvenance(steps: string, nullReason?: string) {
  return {
    source: "local arithmetic",
    requestUrl: "boltseam://calendar/local",
    fetchedAt: nowIso(),
    rawExcerpt: steps,
    rawSha256: null as null,
    rawSha256NullReason: nullReason ?? "local recomputation — no network response to hash",
  };
}

function localUnverifiablePacket(
  sc: SubClaim,
  reason: "unknown_date" | "ambiguous_date" | "missing_operands",
  detail: string,
): EvidencePacket {
  return {
    subClaimId: sc.id,
    organ: "calendar",
    verdict: "unverifiable",
    reason,
    claimedValue: sc.statedValue,
    observedValue: null,
    unit: sc.unit,
    tolerance: null,
    notes: [],
    provenance: localProvenance(detail),
  };
}

// ── Date utilities ─────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, "Z");
}

/** Resolve a date expression (ISO or English) to YYYY-MM-DD. */
function resolveDate(dateExpr: string | null, anchorDate: string): string | null {
  if (dateExpr === null) return anchorDate.slice(0, 10);

  const trimmed = dateExpr.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  // "Oct 10" or "Oct 10 2024"
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

  // "last Saturday", "this Friday" — relative expressions
  const relative = trimmed.match(/^(last|this|next)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/i);
  if (relative) {
    const modifier = relative[1].toLowerCase();
    const targetDay = WEEKDAYS.findIndex((d) => d.toLowerCase() === relative[2].toLowerCase());
    if (targetDay !== -1) {
      return resolveRelativeWeekday(modifier as "last" | "this" | "next", targetDay, anchorDate);
    }
  }

  // "MM/DD" or "DD/MM" — ambiguous; return the MM/DD reading
  const slashDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slashDate) {
    const year = slashDate[3]
      ? (slashDate[3].length === 2 ? "20" + slashDate[3] : slashDate[3])
      : anchorDate.slice(0, 4);
    const m = slashDate[1].padStart(2, "0");
    const d = slashDate[2].padStart(2, "0");
    return `${year}-${m}-${d}`;
  }

  return null;
}

function resolveRelativeWeekday(
  modifier: "last" | "this" | "next",
  targetDayIndex: number,
  anchorDate: string,
): string {
  const anchor = new Date(anchorDate.slice(0, 10) + "T00:00:00Z");
  const anchorDay = anchor.getUTCDay();
  let delta: number;

  if (modifier === "last") {
    delta = targetDayIndex - anchorDay;
    if (delta >= 0) delta -= 7;
  } else if (modifier === "next") {
    delta = targetDayIndex - anchorDay;
    if (delta <= 0) delta += 7;
  } else {
    // "this" = same week
    delta = targetDayIndex - anchorDay;
  }

  const result = new Date(anchor.getTime() + delta * 86_400_000);
  return result.toISOString().slice(0, 10);
}

/** True if the expression could be read as MM/DD or DD/MM */
function isAmbiguousDate(dateExpr: string): boolean {
  const m = dateExpr.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return false;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  // Ambiguous when both interpretations are plausible (a<=12 and b<=12)
  return a >= 1 && a <= 12 && b >= 1 && b <= 12 && a !== b;
}

/** Return the alternative reading of an ambiguous MM/DD expression (as DD/MM). */
function alternativeDate(dateExpr: string, anchorDate: string): string | null {
  const m = dateExpr.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const year = anchorDate.slice(0, 4);
  // Swap: treat first as day, second as month
  const day   = m[1].padStart(2, "0");
  const month = m[2].padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidDateString(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(dateStr + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr;
}

function getWeekdayName(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return WEEKDAYS[d.getUTCDay()];
}

function parseDateParts(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split("-").map(Number);
  // months are 0-indexed in Date.UTC
  return [y, (m ?? 1) - 1, d ?? 1];
}

function yearsInRange(startDate: string, endDate: string): number[] {
  const startYear = parseInt(startDate.slice(0, 4), 10);
  const endYear   = parseInt(endDate.slice(0, 4), 10);
  const years: number[] = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);
  return years;
}

/**
 * Count business days (Mon–Fri, excluding holidays) between startDate and
 * endDate inclusive (both as YYYY-MM-DD).
 */
function countBusinessDays(
  startDate: string,
  endDate: string,
  holidays: Set<string>,
): number {
  let count = 0;
  const start = new Date(startDate + "T00:00:00Z");
  const end   = new Date(endDate   + "T00:00:00Z");

  const current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getUTCDay(); // 0=Sun, 6=Sat
    const iso = current.toISOString().slice(0, 10);
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidays.has(iso)) {
      count++;
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return count;
}

// ── Shared extractors ──────────────────────────────────────────────────────

function extractString(v: string | number | null | undefined): string | undefined {
  if (typeof v === "string" && v.length > 0) return v;
  return undefined;
}

function extractNumber(v: string | number | null | undefined): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/,/g, ""));
    return isNaN(n) ? null : n;
  }
  return null;
}
