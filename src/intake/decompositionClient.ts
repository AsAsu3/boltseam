/**
 * DecompositionClient — sends the post to the configured LLM provider and
 * returns validated sub-claims.
 *
 * Model access is hidden behind a `DecompositionProvider` interface so the
 * provider can be swapped (OpenAI, Anthropic, Ollama, fixture) without
 * touching callers.
 *
 * The default export is the `DecompositionClient` class; the default provider
 * is the `FixtureProvider`, which replays a recorded model response so the
 * app runs with no API key and no network call.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.6
 */

import type { SubClaim } from "./types.ts";

// ── Provider interface ─────────────────────────────────────────────────────

/** Minimal description of the claim to decompose */
export interface ProviderRequest {
  /** Trimmed post text */
  text: string;
  /** Optional: validation errors from a previous attempt, appended as feedback */
  priorErrors?: string[];
}

export interface ProviderResponse {
  /** Raw JSON string returned by the model */
  rawJson: string;
  /**
   * Whether this response came from a fixture (recorded) or a live call.
   * The UI labels fixture-mode responses distinctly (Req from tech.md).
   */
  source: "live" | "fixture";
}

/**
 * The only interface that DecompositionClient uses to reach a model.
 * Implement this to add a new provider; pass an instance to the constructor.
 */
export interface DecompositionProvider {
  /**
   * Send `req` to the underlying model and return the raw JSON response.
   * Implementations MUST NOT call organ data sources.
   * Timeout policy is the caller's responsibility (DecompositionClient wraps
   * this in a timeout + single retry).
   */
  complete(req: ProviderRequest): Promise<ProviderResponse>;
}

// ── System prompt ──────────────────────────────────────────────────────────

/**
 * Domain taxonomy and decomposition instructions for the model.
 * The model must produce schema-valid JSON only (no prose before/after).
 */
/**
 * System prompt for live LLM providers (not used by FixtureProvider).
 * Exported so live providers can import it without duplication.
 */
export const SYSTEM_PROMPT = `You are a claim-decomposition assistant. Your task is to split a social-media post into atomic, independently checkable sub-claims.

OUTPUT FORMAT
Return ONLY a JSON object matching this exact schema — no markdown fences, no prose:
{
  "subClaims": [
    {
      "id": "sc-01",
      "span": [startInclusive, endExclusive],
      "text": "<verbatim or minimal restatement of the assertion>",
      "domain": "<tag>",
      "statedValue": <number|null>,
      "unit": "<string|null>",
      "entities": {},
      "dateExpr": "<string|null>",
      "arithmeticOperands": <object|null>,
      "unroutedReason": <string|null>,
      "userEdited": false,
      "originalExtraction": null
    }
  ]
}

DOMAIN TAGS (exactly one per sub-claim)
- price      — a stated price or value of a crypto/financial asset
- fx         — a currency conversion or exchange-rate assertion
- date       — a date, duration, or calendar assertion (weekday, business days, etc.)
- repo       — a GitHub repository fact (stars, forks, creation date, etc.)
- weather    — a historical weather assertion (rain, temperature, etc.)
- statistic  — a public statistic (population, GDP, inflation, etc.)
- arithmetic — a purely arithmetic relationship between numbers present in the post
               (percentage change, multiple, sum, difference); include arithmeticOperands
- unrouted   — opinion, prediction, insult, or otherwise unverifiable; include unroutedReason

RULES
1. One sub-claim = one atomic assertion. Split conjunctions.
2. span MUST cover the exact characters in the original text — non-negotiable.
3. statedValue: extract the primary numeric value (number only, no commas). null if absent.
4. entities: include domain-specific named entities, e.g. { "symbol": "BTC", "dateExpr": "Saturday Oct 10" }.
5. dateExpr: the date/time expression as written, unresolved. null if none.
6. arithmeticOperands: only for domain "arithmetic"; { "kind": "...", "values": [...], "statedResult": ... }.
7. Never invent values, dates, or entities not in the post.
8. Opinions/predictions → unrouted with a one-line unroutedReason; never drop them silently.
`.trim();

// ── Fixture provider ───────────────────────────────────────────────────────

/**
 * Default provider: replays the fixture for the CONCEPT.md worked example
 * (6 sub-claims: arithmetic, date, price, fx, repo, weather).
 *
 * When the input text does not match the known fixture, a deterministic
 * stub response with a single "unrouted" sub-claim is returned, labelled
 * as fixture mode in the UI.
 *
 * No network calls; no API key required.
 */
export class FixtureProvider implements DecompositionProvider {
  async complete(req: ProviderRequest): Promise<ProviderResponse> {
    // The worked example from CONCEPT.md
    const CONCEPT_SNIPPET = "turned $50 into $4,890";

    if (req.text.includes(CONCEPT_SNIPPET)) {
      return {
        rawJson: CONCEPT_FIXTURE_JSON,
        source: "fixture",
      };
    }

    // Generic stub: one unrouted sub-claim covering the whole text
    const stub = {
      subClaims: [
        {
          id: "sc-01",
          span: [0, req.text.length],
          text: req.text.slice(0, 200),
          domain: "unrouted",
          statedValue: null,
          unit: null,
          entities: {},
          dateExpr: null,
          arithmeticOperands: null,
          unroutedReason:
            "Fixture mode: no recorded decomposition for this text. " +
            "Supply a real provider for live decomposition.",
          userEdited: false,
          originalExtraction: null,
        } satisfies SubClaim,
      ],
    };

    return {
      rawJson: JSON.stringify(stub),
      source: "fixture",
    };
  }
}

/**
 * Recorded model response for the CONCEPT.md worked example post:
 * "I turned $50 into $4,890 in 48 hours trading BTC last weekend.
 *  That's a 9,680% gain. BTC was only $61,200 on Saturday Oct 10,
 *  so in yen I was up about ¥9.4 million. The bot's repo hit 2,000 stars
 *  in its first 3 days, BTW. And it never even rained in Tokyo that weekend,
 *  so I traded from the park."
 *
 * Expected: 6 sub-claims — arithmetic, date, price, fx, repo, weather.
 */
const CONCEPT_FIXTURE_JSON = JSON.stringify({
  subClaims: [
    {
      id: "sc-01",
      span: [0, 62],
      text: "$50 into $4,890 is a 9,680% gain",
      domain: "arithmetic",
      statedValue: 9680,
      unit: "%",
      entities: {},
      dateExpr: null,
      arithmeticOperands: {
        kind: "percentage_change",
        values: [50, 4890],
        statedResult: 9680,
      },
      unroutedReason: null,
      userEdited: false,
      originalExtraction: null,
    },
    {
      id: "sc-02",
      span: [0, 82],
      text: "48 hours trading BTC last weekend",
      domain: "date",
      statedValue: 48,
      unit: "hours",
      entities: { asset: "BTC" },
      dateExpr: "last weekend",
      arithmeticOperands: null,
      unroutedReason: null,
      userEdited: false,
      originalExtraction: null,
    },
    {
      id: "sc-03",
      span: [83, 131],
      text: "BTC was only $61,200 on Saturday Oct 10",
      domain: "price",
      statedValue: 61200,
      unit: "USD",
      entities: { symbol: "BTC" },
      dateExpr: "Saturday Oct 10",
      arithmeticOperands: null,
      unroutedReason: null,
      userEdited: false,
      originalExtraction: null,
    },
    {
      id: "sc-04",
      span: [132, 186],
      text: "in yen I was up about ¥9.4 million",
      domain: "fx",
      statedValue: 9400000,
      unit: "JPY",
      entities: { fromCurrency: "USD", toCurrency: "JPY" },
      dateExpr: "Saturday Oct 10",
      arithmeticOperands: null,
      unroutedReason: null,
      userEdited: false,
      originalExtraction: null,
    },
    {
      id: "sc-05",
      span: [187, 236],
      text: "The bot's repo hit 2,000 stars in its first 3 days",
      domain: "repo",
      statedValue: 2000,
      unit: "stars",
      entities: { durationDays: 3 },
      dateExpr: null,
      arithmeticOperands: null,
      unroutedReason: null,
      userEdited: false,
      originalExtraction: null,
    },
    {
      id: "sc-06",
      span: [242, 296],
      text: "it never even rained in Tokyo that weekend",
      domain: "weather",
      statedValue: 0,
      unit: "mm",
      entities: { city: "Tokyo" },
      dateExpr: "that weekend",
      arithmeticOperands: null,
      unroutedReason: null,
      userEdited: false,
      originalExtraction: null,
    },
  ] satisfies SubClaim[],
});

// ── DecompositionClient ────────────────────────────────────────────────────

const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 1; // one retry on network/timeout error (Req 2.2)
const MAX_SCHEMA_RETRIES = 2; // two retries on schema-invalid output (Req 2.5)

export type DecompositionClientResult =
  | { ok: true; subClaims: SubClaim[]; source: "live" | "fixture" }
  | { ok: false; reason: "timeout" | "schema" | "network"; message: string };

/**
 * Orchestrates the full decomposition flow:
 * 1. Sends text to the provider.
 * 2. Parses and validates the response against the schema.
 * 3. Retries up to `MAX_SCHEMA_RETRIES` times on schema failures with errors
 *    appended to the request.
 * 4. Falls back with a descriptive error after all retries are exhausted.
 */
export class DecompositionClient {
  readonly #provider: DecompositionProvider;

  constructor(provider?: DecompositionProvider) {
    this.#provider = provider ?? new FixtureProvider();
  }

  async decompose(text: string): Promise<DecompositionClientResult> {
    // Lazy-import the validator to avoid circular deps in tree-shaking
    const { validateDecomposition } = await import("./schemaValidator.ts");

    let priorErrors: string[] | undefined;
    let networkAttempts = 0;

    for (let schemaAttempt = 0; schemaAttempt <= MAX_SCHEMA_RETRIES; schemaAttempt++) {
      let providerResponse: ProviderResponse;

      // Network / timeout retry loop (max 1 retry)
      while (true) {
        try {
          providerResponse = await withTimeout(
            this.#provider.complete({ text, priorErrors }),
            TIMEOUT_MS
          );
          break; // success
        } catch (err) {
          networkAttempts++;
          if (networkAttempts > MAX_RETRIES) {
            return {
              ok: false,
              reason: "network",
              message:
                err instanceof TimeoutError
                  ? "Decomposition timed out. Please try again."
                  : `Decomposition request failed: ${String(err)}`,
            };
          }
          // one retry — loop again
        }
      }

      const validation = validateDecomposition(providerResponse!.rawJson);

      if (validation.ok) {
        return {
          ok: true,
          subClaims: validation.subClaims,
          source: providerResponse!.source,
        };
      }

      // Schema failed — collect errors for next attempt
      priorErrors = validation.errors;
    }

    return {
      ok: false,
      reason: "schema",
      message:
        "Decomposition output did not match the expected schema after retries. " +
        "You can enter sub-claims manually.",
    };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

class TimeoutError extends Error {
  constructor() {
    super("Request timed out");
    this.name = "TimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new TimeoutError()), ms);
    promise.then(
      (v) => { clearTimeout(id); resolve(v); },
      (e) => { clearTimeout(id); reject(e); }
    );
  });
}
