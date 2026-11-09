/**
 * Core intake types — SubClaim, Worklist, domain tags.
 *
 * EVIDENCE-FREE ZONE: this package contains NO verdict vocabulary.
 * Verdict types live exclusively in src/organs/contract/.
 * This is enforced by the TypeScript compiler: no imports from
 * src/organs/contract/ are allowed here.
 */

// ── Domain tags ────────────────────────────────────────────────────────────

/**
 * Every sub-claim is tagged with exactly one domain.
 * "arithmetic"  = a purely arithmetic relationship between values in the post.
 * "unrouted"    = opinion, prediction, or unclassifiable assertion.
 */
export type DomainTag =
  | "price"
  | "fx"
  | "date"
  | "repo"
  | "weather"
  | "statistic"
  | "arithmetic"
  | "unrouted";

// ── SubClaim ───────────────────────────────────────────────────────────────

/**
 * One atomic, independently checkable assertion extracted from the claim post.
 * Spans reference byte offsets into Worklist.originalText (inclusive start,
 * exclusive end — same convention as String.slice).
 */
export interface SubClaim {
  /** Stable within the audit; format: "sc-NN" */
  id: string;

  /** [startInclusive, endExclusive] into Worklist.originalText */
  span: [number, number];

  /** Verbatim or user-edited assertion text */
  text: string;

  /** Single domain tag */
  domain: DomainTag;

  /** Stated numeric value in the post, if any */
  statedValue: number | null;

  /** Unit string (e.g. "USD", "JPY", "%") */
  unit: string | null;

  /**
   * Domain-specific entities extracted by the decomposition model.
   * Examples: { symbol: "BTC" }, { repo: "owner/name" }, { city: "Tokyo" }.
   */
  entities: Record<string, string | number | null>;

  /**
   * Date or date expression as it appears in the post (unresolved).
   * Resolution is the Calendar Organ's responsibility.
   */
  dateExpr: string | null;

  /**
   * For arithmetic sub-claims: the operands detected in the post.
   * null when domain !== "arithmetic" or operands are ambiguous.
   */
  arithmeticOperands: ArithmeticOperands | null;

  /**
   * For "unrouted" sub-claims: one-line reason why it could not be routed.
   */
  unroutedReason: string | null;

  /** Whether the user has edited this sub-claim in the correction UI */
  userEdited: boolean;

  /**
   * The original model-extracted sub-claim, populated when userEdited
   * becomes true. null until the first user edit.
   */
  originalExtraction: Readonly<OriginalExtraction> | null;
}

/** Preserved snapshot of the model output before any user edit */
export interface OriginalExtraction {
  text: string;
  span: [number, number];
  domain: DomainTag;
  statedValue: number | null;
  unit: string | null;
  entities: Record<string, string | number | null>;
  dateExpr: string | null;
}

/** Operands for an arithmetic sub-claim */
export interface ArithmeticOperands {
  kind: "percentage_change" | "multiple" | "sum" | "difference";
  /** All numeric operands present in the post text, in order of appearance */
  values: number[];
  /** The stated result in the post */
  statedResult: number;
}

// ── Worklist ───────────────────────────────────────────────────────────────

/**
 * The frozen output of the intake pipeline; this is the single hand-off
 * contract to the organ router.
 *
 * Once frozen (user has confirmed the correction UI), no further mutations
 * are permitted. Consumers treat this as Readonly<Worklist>.
 */
export interface Worklist {
  /** UUID v4, generated at freeze time */
  auditId: string;

  /** ISO-8601 timestamp of when the user confirmed the worklist */
  createdAt: string;

  /** Byte-for-byte original pasted text */
  originalText: string;

  /** Frozen list of sub-claims, each with a stable id */
  subClaims: SubClaim[];
}
