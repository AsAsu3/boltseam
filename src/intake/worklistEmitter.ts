/**
 * WorklistEmitter — freezes the confirmed sub-claim list into the Worklist
 * contract consumed by the organ router.
 *
 * This module is the single hand-off point between the intake pipeline and
 * the router. It:
 *   1. Generates a UUID v4 auditId via crypto.randomUUID().
 *   2. Records the confirmation timestamp as createdAt.
 *   3. Assigns each sub-claim a stable "sc-NN" id (re-numbering to keep ids
 *      compact after any edits, splits, or deletes in the correction UI).
 *   4. Returns a frozen (Object.freeze) Worklist.
 *
 * Import boundary: no imports from src/organs/ or src/router/ are permitted
 * here. The router imports from this package, never the reverse.
 *
 * Requirements: 2.6, 4.4, 5.1, 5.3
 */

import type { SubClaim, Worklist } from "./types.ts";

// ── freezeWorklist ─────────────────────────────────────────────────────────

/**
 * Convert a confirmed sub-claim list into a frozen, router-ready Worklist.
 *
 * @param subClaims  The sub-claims confirmed in the correction UI.
 * @param originalText  The byte-for-byte original pasted text.
 * @returns A deeply-frozen Worklist (Readonly<Worklist>).
 */
export function freezeWorklist(
  subClaims: SubClaim[],
  originalText: string,
): Readonly<Worklist> {
  const auditId = crypto.randomUUID();
  const createdAt = new Date().toISOString().replace(/\.\d+Z$/, "Z");

  // Re-number sub-claims to stable "sc-NN" ids after any correction-UI edits.
  const numberedSubClaims: SubClaim[] = subClaims.map((sc, i) => ({
    ...sc,
    id: `sc-${String(i + 1).padStart(2, "0")}`,
  }));

  const worklist: Worklist = {
    auditId,
    createdAt,
    originalText,
    subClaims: numberedSubClaims,
  };

  // Freeze for downstream safety (Req 4.4: "frozen" semantics)
  return Object.freeze(worklist);
}
