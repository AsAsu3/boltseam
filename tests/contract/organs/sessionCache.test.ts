/**
 * Unit tests for SessionCache (URL-keyed cache + 429 rate-limit latch).
 */

import { describe, it, expect } from "vitest";
import { SessionCache } from "../../../src/organs/contract/sessionCache.ts";
import type { CacheEntry } from "../../../src/organs/contract/sessionCache.ts";

function makeEntry(url: string): CacheEntry {
  return { url, body: `{"url":"${url}"}`, fetchedAt: "2026-11-09T00:00:00Z", status: 200 };
}

describe("SessionCache", () => {
  it("returns undefined for a miss", () => {
    const cache = new SessionCache();
    expect(cache.get("https://example.com/data")).toBeUndefined();
  });

  it("returns the stored entry on a hit", () => {
    const cache = new SessionCache();
    const entry = makeEntry("https://example.com/data");
    cache.set("https://example.com/data", entry);
    expect(cache.get("https://example.com/data")).toEqual(entry);
  });

  it("is not rate-limited by default", () => {
    const cache = new SessionCache();
    expect(cache.isRateLimited("https://api.kraken.com/data")).toBe(false);
  });

  it("latches the whole origin after a 429", () => {
    const cache = new SessionCache();
    cache.latchRateLimit("https://api.kraken.com/0/public/OHLC?pair=XBTUSD");
    expect(cache.isRateLimited("https://api.kraken.com/0/public/Ticker")).toBe(true);
  });

  it("does not latch unrelated origins", () => {
    const cache = new SessionCache();
    cache.latchRateLimit("https://api.kraken.com/0/public/OHLC");
    expect(cache.isRateLimited("https://api.frankfurter.app/2026-10-10")).toBe(false);
  });

  it("separate caches do not share state", () => {
    const c1 = new SessionCache();
    const c2 = new SessionCache();
    c1.latchRateLimit("https://api.kraken.com/data");
    expect(c2.isRateLimited("https://api.kraken.com/data")).toBe(false);
  });
});
