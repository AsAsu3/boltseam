/**
 * Controlled HTTP GET helper for organs.
 *
 * Responsibilities (Req 7.1, 7.2, 7.3):
 * - URL-keyed session cache: cache hit → no network call.
 * - One retry on failure with 500 ms → 1 s exponential backoff.
 * - HTTP 429 latches the entire source host off for the rest of the audit;
 *   subsequent attempts to that host throw RateLimitedError immediately.
 * - Provides a CacheEntry (body + fetchedAt) regardless of cache/live source.
 * - SHA-256 is computed here via Web Crypto (or Node crypto in tests).
 */

import type { SessionCache, CacheEntry } from "./sessionCache.ts";

export class RateLimitedError extends Error {
  constructor(url: string) {
    super(`rate_limited: ${new URL(url).origin}`);
    Object.defineProperty(this, "name", { value: "RateLimitedError" });
  }
}

export class SourceFetchError extends Error {
  readonly status: number;
  constructor(status: number, url: string) {
    super(`HTTP ${status} from ${url}`);
    this.status = status;
    Object.defineProperty(this, "name", { value: "SourceFetchError" });
  }
}

const RETRY_DELAYS_MS = [500, 1000] as const;

/**
 * Fetch `url` with caching, retry, and 429 latch.
 *
 * @returns CacheEntry with body, fetchedAt, status, and fromCache flag.
 */
export async function sourceFetch(
  url: string,
  cache: SessionCache,
  signal: AbortSignal,
): Promise<CacheEntry & { fromCache: boolean }> {
  // Check latch first
  if (cache.isRateLimited(url)) {
    throw new RateLimitedError(url);
  }

  // Cache hit
  const cached = cache.get(url);
  if (cached !== undefined) {
    return { ...cached, fromCache: true };
  }

  // Live fetch with one retry
  let lastError: unknown;
  for (let attempt = 0; attempt <= 1; attempt++) {
    if (attempt > 0) {
      await delay(RETRY_DELAYS_MS[attempt - 1] ?? 500);
    }
    if (signal.aborted) {
      throw new Error("aborted");
    }
    try {
      const res = await fetch(url, { signal });

      if (res.status === 429) {
        cache.latchRateLimit(url);
        throw new RateLimitedError(url);
      }

      if (!res.ok) {
        throw new SourceFetchError(res.status, url);
      }

      const body = await res.text();
      const fetchedAt = new Date().toISOString().replace(/\.\d+Z$/, "Z");
      const entry: CacheEntry = { url, body, fetchedAt, status: res.status };
      cache.set(url, entry);
      return { ...entry, fromCache: false };
    } catch (err) {
      // Re-throw rate-limit immediately (no retry)
      if (err instanceof RateLimitedError) throw err;
      lastError = err;
    }
  }

  throw lastError;
}

/**
 * Compute SHA-256 hex digest of a UTF-8 string using Web Crypto.
 * Falls back to a pure-JS approach when crypto.subtle is unavailable.
 * In Vitest/Node environments, Web Crypto is available via globalThis.crypto.
 */
export async function sha256Hex(text: string): Promise<string> {
  const subtle =
    (typeof globalThis !== "undefined" &&
      (globalThis as Record<string, unknown>)["crypto"] !== undefined &&
      ((globalThis as Record<string, unknown>)["crypto"] as Record<string, unknown>)["subtle"] !== undefined)
      ? ((globalThis as Record<string, unknown>)["crypto"] as { subtle: SubtleCrypto }).subtle
      : null;

  if (subtle !== null) {
    const encoded = new TextEncoder().encode(text);
    const hashBuffer = await subtle.digest("SHA-256", encoded);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Fallback: very simple (non-constant-time) hex encoding via dynamic import
  // This path is only hit in unusual test environments; production always has Web Crypto.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const nodeCrypto = await (new Function('return import("node:crypto")')()) as {
    createHash(alg: string): { update(s: string, enc: string): { digest(enc: string): string } };
  };
  return nodeCrypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
