/**
 * Market Organ — price claim verification via Kraken (primary) + Binance (cross-check).
 *
 * Endpoint confirmed against current documentation (2026-11-10):
 *   Kraken OHLC:  GET https://api.kraken.com/0/public/OHLC
 *                 Params: pair, interval=1440 (daily), since=<unix epoch seconds>
 *                 Response key: result.<PAIRNAME> → array of
 *                   [time, open, high, low, close, vwap, volume, count]
 *                 Ref: https://docs.kraken.com/api/docs/rest-api/get-ohlc-data
 *
 *   Binance klines: GET https://api.binance.com/api/v3/klines
 *                 Params: symbol, interval=1d, startTime=<ms>, endTime=<ms>, limit=1
 *                 Response: [[openTime, open, high, low, close, volume, ...], ...]
 *                 Ref: https://developers.binance.com/docs/ (kline-candlestick-data)
 *
 * CORS: Kraken allows browser requests (Access-Control-Allow-Origin: *).
 *       Binance allows browser requests from api.binance.com.
 *       Both are direct-fetch; no proxy needed.
 *
 * Binance geo-block note: Binance returns HTTP 451 from some regions.
 * Any non-429 error from Binance (including 451) is treated as "source
 * unavailable" — a note is NOT added, and no source_disagreement verdict
 * is emitted. The spec requires Binance as a cross-check only; Kraken
 * is authoritative.
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

const PRICE_TOLERANCE: Tolerance = { kind: "relative", value: 0.005 };
const CROSS_CHECK_RELATIVE = 0.01; // 1% threshold for source_disagreement note

// ── Symbol mapping ─────────────────────────────────────────────────────────

/**
 * Maps common ticker symbols to Kraken pair names and Binance symbols.
 * Equities and other out-of-scope tickers are intentionally absent —
 * unknown symbols resolve to unverifiable/unknown_symbol.
 */
interface SymbolEntry {
  krakenPair: string;
  binanceSymbol: string;
}

const SYMBOL_MAP: Record<string, SymbolEntry> = {
  BTC:  { krakenPair: "XBTUSD",  binanceSymbol: "BTCUSDT"  },
  ETH:  { krakenPair: "ETHUSD",  binanceSymbol: "ETHUSDT"  },
  SOL:  { krakenPair: "SOLUSD",  binanceSymbol: "SOLUSDT"  },
  XRP:  { krakenPair: "XRPUSD",  binanceSymbol: "XRPUSDT"  },
  LTC:  { krakenPair: "LTCUSD",  binanceSymbol: "LTCUSDT"  },
  DOGE: { krakenPair: "DOGEUSD", binanceSymbol: "DOGEUSDT" },
  ADA:  { krakenPair: "ADAUSD",  binanceSymbol: "ADAUSDT"  },
  DOT:  { krakenPair: "DOTUSD",  binanceSymbol: "DOTUSDT"  },
  LINK: { krakenPair: "LINKUSD", binanceSymbol: "LINKUSDT" },
  MATIC:{ krakenPair: "MATICUSD",binanceSymbol: "MATICUSDT"},
  AVAX: { krakenPair: "AVAXUSD", binanceSymbol: "AVAXUSDT" },
  UNI:  { krakenPair: "UNIUSD",  binanceSymbol: "UNIUSDT"  },
};

// ── Kraken response shape ──────────────────────────────────────────────────

interface KrakenOhlcResponse {
  error: string[];
  result?: Record<string, Array<[number, string, string, string, string, string, string, number]> | number>;
}

// ── Binance klines response shape ──────────────────────────────────────────

type BinanceKline = [
  number,  // openTime (ms)
  string,  // open
  string,  // high
  string,  // low
  string,  // close
  string,  // volume
  number,  // closeTime (ms)
  ...unknown[]
];

// ── Helpers ────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, "Z");
}

/** Convert a YYYY-MM-DD date string to a UTC midnight Unix timestamp (seconds). */
function dateToUnixSec(dateStr: string): number {
  return Math.floor(new Date(dateStr + "T00:00:00Z").getTime() / 1000);
}

/** True when a date string in YYYY-MM-DD is in the future relative to today (UTC). */
function isFutureDate(dateStr: string, anchorDate: string): boolean {
  return dateStr > anchorDate.slice(0, 10);
}

function makeExcerpt(body: string): string {
  return body.slice(0, 2048);
}

// ── Market Organ ───────────────────────────────────────────────────────────

export class MarketOrgan implements Organ {
  readonly domain = "price";

  async verify(sc: SubClaim, ctx: OrganContext): Promise<EvidencePacket> {
    const { cache, signal, anchorDate } = ctx;

    // ── 1. Resolve symbol ──────────────────────────────────────────────────
    const rawSymbol =
      typeof sc.entities["symbol"] === "string" ? sc.entities["symbol"].toUpperCase() : null;

    if (rawSymbol === null || !(rawSymbol in SYMBOL_MAP)) {
      return this._unverifiablePacket(sc, "unknown_symbol", nowIso());
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const symbolEntry = SYMBOL_MAP[rawSymbol]!;

    // ── 2. Resolve date ────────────────────────────────────────────────────
    const dateStr = resolveDate(sc.dateExpr, anchorDate);
    if (dateStr === null) {
      return this._unverifiablePacket(sc, "unknown_date", nowIso());
    }
    if (isFutureDate(dateStr, anchorDate)) {
      return this._unverifiablePacket(sc, "future_date", nowIso());
    }

    // ── 3. Fetch Kraken OHLC ───────────────────────────────────────────────
    const sinceTs = dateToUnixSec(dateStr);
    const krakenUrl = `https://api.kraken.com/0/public/OHLC?pair=${symbolEntry.krakenPair}&interval=1440&since=${sinceTs}`;

    let krakenEntry: { body: string; fetchedAt: string; fromCache: boolean };
    try {
      krakenEntry = await sourceFetch(krakenUrl, cache, signal);
    } catch (err) {
      if (err instanceof RateLimitedError) {
        return this._errorPacket(sc, symbolEntry.krakenPair, "rate_limited", krakenUrl, nowIso());
      }
      return this._errorPacket(sc, symbolEntry.krakenPair, "http_error", krakenUrl, nowIso());
    }

    // ── 4. Parse Kraken response ───────────────────────────────────────────
    let parsed: KrakenOhlcResponse;
    try {
      parsed = JSON.parse(krakenEntry.body) as KrakenOhlcResponse;
    } catch {
      return this._errorPacket(sc, symbolEntry.krakenPair, "parse_error", krakenUrl, krakenEntry.fetchedAt);
    }

    if (parsed.error.length > 0 || parsed.result === undefined) {
      return this._errorPacket(sc, symbolEntry.krakenPair, "http_error", krakenUrl, krakenEntry.fetchedAt);
    }

    // The result key is the internal Kraken pair name (e.g. XXBTZUSD).
    // We look for any key that is not "last".
    const resultKeys = Object.keys(parsed.result).filter((k) => k !== "last");
    if (resultKeys.length === 0) {
      return this._unverifiablePacket(sc, "unknown_symbol", krakenEntry.fetchedAt);
    }

    const candles = parsed.result[resultKeys[0]];
    if (!Array.isArray(candles) || candles.length === 0) {
      // Symbol exists on Kraken but no data for this date — could be pre-listing
      return this._unverifiablePacket(sc, "pre_listing_date", krakenEntry.fetchedAt);
    }

    // Find the candle for the requested UTC day
    const dayCandle = findDayCandle(candles as Array<[number, string, string, string, string, string, string, number]>, dateStr);
    if (dayCandle === null) {
      return this._unverifiablePacket(sc, "pre_listing_date", krakenEntry.fetchedAt);
    }

    const [_time, _open, high, low, close] = dayCandle;
    const closePrice = parseFloat(close);
    const highPrice  = parseFloat(high);
    const lowPrice   = parseFloat(low);

    if (isNaN(closePrice) || isNaN(highPrice) || isNaN(lowPrice)) {
      return this._errorPacket(sc, symbolEntry.krakenPair, "parse_error", krakenUrl, krakenEntry.fetchedAt);
    }

    // ── 5. Compute verdict ─────────────────────────────────────────────────
    const claimedValue = sc.statedValue;
    if (claimedValue === null) {
      return this._unverifiablePacket(sc, "unknown_symbol", krakenEntry.fetchedAt);
    }

    const { verdict } = compareWithTolerance(
      claimedValue,
      closePrice,
      PRICE_TOLERANCE,
      [lowPrice, highPrice],
    );

    // ── 6. Binance cross-check (optional — unavailability is not an error) ─
    const notes: Array<"source_disagreement"> = [];
    try {
      const binanceClose = await this._fetchBinanceClose(
        symbolEntry.binanceSymbol,
        dateStr,
        cache,
        signal,
      );
      if (binanceClose !== null) {
        const diff = Math.abs(closePrice - binanceClose) / closePrice;
        if (diff > CROSS_CHECK_RELATIVE) {
          notes.push("source_disagreement");
        }
      }
    } catch {
      // Binance unavailable (e.g. geo-block 451, network error) — not an error
      // per design; Kraken is the authoritative source.
    }

    // ── 7. Build provenance ────────────────────────────────────────────────
    const rawSha256 = await sha256Hex(krakenEntry.body);

    return {
      subClaimId: sc.id,
      organ: "market",
      verdict,
      reason: null,
      claimedValue,
      observedValue: closePrice,
      unit: sc.unit ?? "USD",
      tolerance: PRICE_TOLERANCE,
      notes,
      provenance: {
        source: "Kraken public API",
        requestUrl: krakenUrl,
        fetchedAt: krakenEntry.fetchedAt,
        rawExcerpt: makeExcerpt(krakenEntry.body),
        rawSha256,
        fromCache: krakenEntry.fromCache,
        ...(krakenEntry.fromCache === false ? {} : {}),
      },
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async _fetchBinanceClose(
    symbol: string,
    dateStr: string,
    cache: import("../contract/sessionCache.ts").SessionCache,
    signal: AbortSignal,
  ): Promise<number | null> {
    const startMs = dateToUnixSec(dateStr) * 1000;
    const endMs   = startMs + 86_400_000 - 1;
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&startTime=${startMs}&endTime=${endMs}&limit=1`;

    const entry = await sourceFetch(url, cache, signal);
    const klines = JSON.parse(entry.body) as BinanceKline[];
    if (!Array.isArray(klines) || klines.length === 0) return null;
    const closeStr = klines[0][4];
    const c = parseFloat(closeStr);
    return isNaN(c) ? null : c;
  }

  private _unverifiablePacket(
    sc: SubClaim,
    reason: "unknown_symbol" | "unknown_date" | "future_date" | "pre_listing_date",
    fetchedAt: string,
  ): EvidencePacket {
    return {
      subClaimId: sc.id,
      organ: "market",
      verdict: "unverifiable",
      reason,
      claimedValue: sc.statedValue,
      observedValue: null,
      unit: sc.unit,
      tolerance: null,
      notes: [],
      provenance: {
        source: "Kraken public API",
        requestUrl: `boltseam://market/unverifiable/${reason}`,
        fetchedAt,
        rawExcerpt: "",
        rawSha256: null,
        rawSha256NullReason: `no fetch attempted — verdict is ${reason}`,
      },
    };
  }

  private _errorPacket(
    sc: SubClaim,
    _pairName: string,
    reason: "rate_limited" | "http_error" | "parse_error",
    requestUrl: string,
    fetchedAt: string,
  ): EvidencePacket {
    return {
      subClaimId: sc.id,
      organ: "market",
      verdict: "source_error",
      reason,
      claimedValue: sc.statedValue,
      observedValue: null,
      unit: sc.unit,
      tolerance: null,
      notes: [],
      provenance: {
        source: "Kraken public API",
        requestUrl,
        fetchedAt,
        rawExcerpt: "",
        rawSha256: null,
        rawSha256NullReason: `fetch failed with reason: ${reason}`,
      },
    };
  }
}

// ── Date resolution ────────────────────────────────────────────────────────

/**
 * Resolve a date expression to a YYYY-MM-DD string.
 * Only handles explicit ISO dates and simple "Oct 10" / "Oct 10 2024" patterns.
 * Returns null when the expression cannot be resolved.
 */
function resolveDate(dateExpr: string | null, anchorDate: string): string | null {
  if (dateExpr === null) return null;

  const trimmed = dateExpr.trim();

  // Already a YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // ISO with time component
  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  // "Oct 10" or "Oct 10 2024" patterns
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

/**
 * Find the daily candle whose UTC day matches `dateStr` (YYYY-MM-DD).
 * Kraken OHLC timestamps are the start of the candle's UTC minute/day.
 */
function findDayCandle(
  candles: Array<[number, string, string, string, string, string, string, number]>,
  dateStr: string,
): [number, string, string, string, string, string, string, number] | null {
  const targetTs = dateToUnixSec(dateStr);
  const nextDayTs = targetTs + 86_400;

  for (const candle of candles) {
    const candleTs = candle[0];
    if (candleTs >= targetTs && candleTs < nextDayTs) {
      return candle;
    }
  }
  return null;
}
