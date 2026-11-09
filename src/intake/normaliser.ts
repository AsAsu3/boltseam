/**
 * Normaliser — text intake guards and credential-pattern scan.
 *
 * Rules:
 * - Trims surrounding whitespace for processing only; the original text
 *   returned in NormaliseResult.original is always byte-for-byte identical
 *   to the input.
 * - Runs the credential-pattern scan BEFORE anything leaves the browser.
 * - No network calls; no verdict vocabulary.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 5.2
 */

// ── Constants ──────────────────────────────────────────────────────────────

export const MIN_LENGTH = 20;
export const MAX_LENGTH = 10_000;

export const ERR_TOO_SHORT =
  `Text is too short to contain a checkable claim (minimum ${MIN_LENGTH} characters).`;

export const ERR_TOO_LONG =
  `Text exceeds the ${MAX_LENGTH.toLocaleString()}-character limit. ` +
  `Please shorten the post before submitting.`;

// ── Credential pattern scan ────────────────────────────────────────────────

/**
 * Patterns that suggest a credential-like string is present in the pasted
 * text. Each entry carries a human-readable label for the warning UI.
 *
 * Requirement 5.2: warn the user and offer to strip before sending to model.
 */
const CREDENTIAL_PATTERNS: Array<{ label: string; re: RegExp }> = [
  // Generic API key patterns: long hex/base64 tokens
  {
    label: "API key (hex/base64 token)",
    re: /\b[A-Za-z0-9_\-]{32,}\b/,
  },
  // password= or api_key= / apikey= style assignments
  {
    label: "Password or key assignment",
    re: /(?:password|passwd|api[_-]?key|secret|token|auth)\s*[=:]\s*\S+/i,
  },
  // PEM private-key block header
  {
    label: "PEM private key block",
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
  },
  // AWS-style access key IDs
  {
    label: "AWS access key ID",
    re: /(?:AKIA|ASIA|AROA|AIDA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/,
  },
  // Bearer token in an Authorization header fragment
  {
    label: "Bearer token fragment",
    re: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/i,
  },
];

export interface CredentialMatch {
  label: string;
  /** The matched substring */
  match: string;
  /** Character offset of the match start in the input string */
  offset: number;
}

/**
 * Scans `text` for credential-like patterns.
 * Returns an array of matches (empty when clean).
 * Does NOT mutate `text`.
 */
export function scanForCredentials(text: string): CredentialMatch[] {
  const results: CredentialMatch[] = [];
  for (const { label, re } of CREDENTIAL_PATTERNS) {
    const globalRe = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = globalRe.exec(text)) !== null) {
      results.push({ label, match: m[0], offset: m.index });
    }
  }
  return results;
}

// ── Normaliser ────────────────────────────────────────────────────────────

export type NormaliseError = "too_short" | "too_long";

export interface NormaliseOk {
  ok: true;
  /** Byte-for-byte original pasted text (never mutated) */
  original: string;
  /** Trimmed text for downstream processing */
  trimmed: string;
  /** Credential matches found (may be empty) */
  credentialMatches: CredentialMatch[];
}

export interface NormaliseErr {
  ok: false;
  error: NormaliseError;
  message: string;
}

export type NormaliseResult = NormaliseOk | NormaliseErr;

/**
 * Entry point for the normaliser pipeline step.
 *
 * 1. Checks character-length guards (on the trimmed length).
 * 2. Runs the credential-pattern scan on the trimmed text.
 * 3. Returns either an error (too short / too long) or the normalised payload.
 *
 * The caller (IntakeForm) is responsible for prompting the user about any
 * credential matches before proceeding to decomposition.
 */
export function normalise(raw: string): NormaliseResult {
  const trimmed = raw.trim();

  if (trimmed.length < MIN_LENGTH) {
    return { ok: false, error: "too_short", message: ERR_TOO_SHORT };
  }
  if (trimmed.length > MAX_LENGTH) {
    return { ok: false, error: "too_long", message: ERR_TOO_LONG };
  }

  const credentialMatches = scanForCredentials(trimmed);

  return { ok: true, original: raw, trimmed, credentialMatches };
}
