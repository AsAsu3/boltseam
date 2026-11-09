/**
 * Session-scoped URL-keyed cache for raw API responses.
 *
 * Packets built from cache reuse the original body and hash but keep the
 * original fetchedAt, so a report never claims data is fresher than it is
 * (Req 7.1).
 *
 * Rate-limit latch: once a source host has returned HTTP 429, the cache
 * refuses all further fetches to that host for the audit lifetime (Req 7.3).
 */

export interface CacheEntry {
  url: string;
  body: string;
  fetchedAt: string;
  status: number;
}

export class SessionCache {
  private readonly _responses = new Map<string, CacheEntry>();
  /** Set of latched host origins (e.g. "https://api.kraken.com") */
  private readonly _rateLimitedHosts = new Set<string>();

  get(url: string): CacheEntry | undefined {
    return this._responses.get(url);
  }

  set(url: string, entry: CacheEntry): void {
    this._responses.set(url, entry);
  }

  /** Record that the host serving `url` returned 429 */
  latchRateLimit(url: string): void {
    const origin = new URL(url).origin;
    this._rateLimitedHosts.add(origin);
  }

  /** True when the host for this URL has been latched due to a 429 */
  isRateLimited(url: string): boolean {
    const origin = new URL(url).origin;
    return this._rateLimitedHosts.has(origin);
  }
}
