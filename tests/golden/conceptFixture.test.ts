/**
 * Golden-fixture test — CONCEPT.md worked example.
 *
 * Runs the full intake pipeline (FixtureProvider → SchemaValidator →
 * ArithmeticExtractor) against the recorded fixture and asserts the 6
 * expected sub-claims with their domain tags.
 *
 * This test is fully offline (no network calls, no API key required).
 *
 * Expected sub-claims per CONCEPT.md:
 *   sc-01: arithmetic  ($50 → $4,890 = 9,680% gain)
 *   sc-02: date        (48 hours, last weekend)
 *   sc-03: price       (BTC $61,200 on Saturday Oct 10)
 *   sc-04: fx          (¥9.4 million in yen)
 *   sc-05: repo        (2,000 stars in 3 days)
 *   sc-06: weather     (never rained in Tokyo)
 *
 * Requirements: 2.1, 2.2, 2.3, 3.1
 */

import { describe, it, expect } from "vitest";
import { DecompositionClient, FixtureProvider } from "../../src/intake/decompositionClient.ts";
import { extractArithmetic } from "../../src/intake/arithmeticExtractor.ts";

// The exact CONCEPT.md example post (must contain "turned $50 into $4,890"
// to match the fixture provider's trigger).
const CONCEPT_POST =
  'I turned $50 into $4,890 in 48 hours trading BTC last weekend. ' +
  "That's a 9,680% gain. BTC was only $61,200 on Saturday Oct 10, " +
  'so in yen I was up about ¥9.4 million. The bot\'s repo hit 2,000 stars ' +
  "in its first 3 days, BTW. And it never even rained in Tokyo that weekend, " +
  "so I traded from the park.";

describe("CONCEPT.md golden fixture", () => {
  it("produces exactly 6 sub-claims from the fixture provider", async () => {
    const client = new DecompositionClient(new FixtureProvider());
    const result = await client.decompose(CONCEPT_POST);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);

    expect(result.source).toBe("fixture");
    expect(result.subClaims).toHaveLength(6);
  });

  it("fixture sub-claims have the expected domain tags in order", async () => {
    const client = new DecompositionClient(new FixtureProvider());
    const result = await client.decompose(CONCEPT_POST);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);

    const domains = result.subClaims.map((sc) => sc.domain);
    expect(domains).toEqual([
      "arithmetic",
      "date",
      "price",
      "fx",
      "repo",
      "weather",
    ]);
  });

  it("all sub-claims have valid spans (non-negative, start ≤ end)", async () => {
    const client = new DecompositionClient(new FixtureProvider());
    const result = await client.decompose(CONCEPT_POST);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);

    for (const sc of result.subClaims) {
      expect(sc.span[0]).toBeGreaterThanOrEqual(0);
      expect(sc.span[1]).toBeGreaterThanOrEqual(sc.span[0]);
    }
  });

  it("arithmetic sub-claim has operands attached", async () => {
    const client = new DecompositionClient(new FixtureProvider());
    const result = await client.decompose(CONCEPT_POST);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);

    const arith = result.subClaims.find((sc) => sc.domain === "arithmetic");
    expect(arith).toBeDefined();
    expect(arith!.arithmeticOperands).not.toBeNull();
    expect(arith!.arithmeticOperands!.kind).toBe("percentage_change");
    expect(arith!.arithmeticOperands!.values).toEqual(
      expect.arrayContaining([50, 4890]),
    );
    expect(arith!.arithmeticOperands!.statedResult).toBeCloseTo(9680, 0);
  });

  it("price sub-claim has statedValue 61200 and unit USD", async () => {
    const client = new DecompositionClient(new FixtureProvider());
    const result = await client.decompose(CONCEPT_POST);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);

    const priceSc = result.subClaims.find((sc) => sc.domain === "price");
    expect(priceSc).toBeDefined();
    expect(priceSc!.statedValue).toBe(61200);
    expect(priceSc!.unit).toBe("USD");
  });

  it("fx sub-claim has statedValue 9400000 and unit JPY", async () => {
    const client = new DecompositionClient(new FixtureProvider());
    const result = await client.decompose(CONCEPT_POST);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);

    const fxSc = result.subClaims.find((sc) => sc.domain === "fx");
    expect(fxSc).toBeDefined();
    expect(fxSc!.statedValue).toBe(9400000);
    expect(fxSc!.unit).toBe("JPY");
  });

  it("repo sub-claim has statedValue 2000", async () => {
    const client = new DecompositionClient(new FixtureProvider());
    const result = await client.decompose(CONCEPT_POST);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);

    const repoSc = result.subClaims.find((sc) => sc.domain === "repo");
    expect(repoSc).toBeDefined();
    expect(repoSc!.statedValue).toBe(2000);
  });

  it("weather sub-claim references Tokyo", async () => {
    const client = new DecompositionClient(new FixtureProvider());
    const result = await client.decompose(CONCEPT_POST);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);

    const weatherSc = result.subClaims.find((sc) => sc.domain === "weather");
    expect(weatherSc).toBeDefined();
    expect(weatherSc!.entities).toMatchObject({ city: "Tokyo" });
  });

  it("ArithmeticExtractor pass leaves already-tagged sub-claims unchanged", async () => {
    const client = new DecompositionClient(new FixtureProvider());
    const result = await client.decompose(CONCEPT_POST);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);

    // After the extractor pass, the fixture's arithmetic sub-claim must
    // remain tagged arithmetic (already correct — extractor preserves it).
    const after = extractArithmetic(result.subClaims, CONCEPT_POST);
    const domains = after.map((sc) => sc.domain);
    expect(domains).toEqual([
      "arithmetic",
      "date",
      "price",
      "fx",
      "repo",
      "weather",
    ]);
  });
});
