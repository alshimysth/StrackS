/**
 * Cleaning of monitoring events before sending (lot 5).
 *
 * An error report goes to a third party (Sentry). It must contain **no** personal data:
 * no location (GPS tracks are sensitive data, PRD constraint 6), no email, token, code or
 * password.
 *
 * Three defences, because one isn't enough (PR #88 review):
 *  1. **by key**: any key whose name *contains* a sensitive term is removed
 *     (`accessToken`, `userEmail`, `startLat`…), not just exact names;
 *  2. **by value**: in any string, error messages included, emails, JWTs and numbers with
 *     the precision of a coordinate are masked;
 *  3. **by depth**: beyond the limit, the whole subtree is replaced, never returned as is.
 */
const SENSITIVE_KEY =
  /(lat|lng|lon|coord|altitude|accuracy|position|location|path|trackpoint|points|privacyzone|email|password|passwd|secret|token|authorization|cookie|session|code|displayname|weight|physical)/i;

/** Technical keys that contain a sensitive term without being one (`status_code`…). */
const SAFE_KEY = /^(status_?code|http\.status_code|error_?code|exit_?code|type|category|level)$/i;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT = /eyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{5,}/g;
/** A decimal with 4 or more digits after the point: a coordinate's precision (~11 m). */
const COORDINATE = /-?\b\d{1,3}\.\d{4,}\b/g;

const REDACTED = '[retiré]';
const MAX_DEPTH = 8;

/**
 * What follows a word naming a secret ("Password hunter2 failed", "code: ABCD…",
 * "token=…"): the word stays, the next term disappears (PR #88 review).
 */
const AFTER_SECRET_WORD =
  /\b(password|passwd|pwd|passcode|mot de passe|code|token|jeton|secret|api[_-]?key|authorization|bearer)(\s*[:=]\s*|\s+)(?!\[|(?:bearer|basic|digest)\b)("[^"]*"|'[^']*'|\S+)/gi;
/**
 * HTTP authentication scheme followed by its token (`Bearer xyz`, `Basic dXNlcjpw`): the
 * token is what matters, not the word `Bearer` (PR #88 review). Applied before the general
 * rule, so that `Authorization: Bearer xyz` doesn't only mask the scheme.
 */
const AUTH_SCHEME = /\b(bearer|basic|digest)\s+(?!\[)\S+/gi;
/** Exact format of the account's one-time codes (#74, #75): `ABCD-EFGH` or `ABCDEFGH`. */
const ACCOUNT_CODE = /\b[2-9A-HJ-NP-Z]{4}-?[2-9A-HJ-NP-Z]{4}\b/g;

/**
 * Masks recognizable personal data in free text.
 *
 * Accepted limit: no pattern guarantees an arbitrary text is free of secrets. What makes
 * the residual risk acceptable is where messages come from (no app error message
 * interpolates a secret; checked in lot 5: they're fixed strings, or the server's RFC 7807
 * `detail`, which contains none) and a monitoring that is off by default.
 */
export function sanitizeText(text: string): string {
  return text
    .replace(EMAIL, '[email retiré]')
    .replace(JWT, '[JWT retiré]')
    .replace(AUTH_SCHEME, (_match, scheme: string) => `${scheme} [retiré]`)
    .replace(AFTER_SECRET_WORD, (_match, word: string, separator: string) => `${word}${separator}[retiré]`)
    .replace(ACCOUNT_CODE, '[code retiré]')
    .replace(COORDINATE, '[coord. retirée]');
}

/** Recursively cleans keys and values. Doesn't modify the input. */
export function scrub<T>(value: T, depth = 0): T {
  if (typeof value === 'string') {
    return sanitizeText(value) as T;
  }
  if (value == null || typeof value !== 'object') {
    return value;
  }
  if (depth >= MAX_DEPTH) {
    return REDACTED as T; // never an uninspected subtree
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrub(item, depth + 1)) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) && !SAFE_KEY.test(key) ? REDACTED : scrub(inner, depth + 1);
  }
  return out as T;
}

/** Removes the query string from a URL: it may carry an email or a filter. */
export function stripQuery(url: string | undefined): string | undefined {
  return url?.split('?')[0];
}
