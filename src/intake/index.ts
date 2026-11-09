/**
 * Public API of the intake package.
 *
 * Exports types and pipeline components consumed by the report UI and the
 * organ router. No verdict vocabulary may be re-exported from here.
 */

export type {
  DomainTag,
  SubClaim,
  Worklist,
  ArithmeticOperands,
  OriginalExtraction,
} from "./types.ts";

export { normalise, scanForCredentials } from "./normaliser.ts";
export { validateDecomposition, SCHEMA_ERRORS } from "./schemaValidator.ts";
export type { ValidationResult } from "./schemaValidator.ts";
export { DecompositionClient } from "./decompositionClient.ts";
export type {
  DecompositionProvider,
  ProviderRequest,
  ProviderResponse,
} from "./decompositionClient.ts";
export {
  extractArithmetic,
  retagSubClaim,
  extractNumbers,
} from "./arithmeticExtractor.ts";
export { mountCorrectionUI } from "./correctionUI.ts";
export type { CorrectionUICallbacks } from "./correctionUI.ts";
export { freezeWorklist } from "./worklistEmitter.ts";
