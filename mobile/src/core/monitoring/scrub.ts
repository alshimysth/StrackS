/**
 * Nettoyage des événements de monitoring avant envoi (lot 5).
 *
 * Un rapport d'erreur part chez un tiers (Sentry). Il ne doit contenir **aucune** donnée
 * personnelle : ni position (les tracés GPS sont des données sensibles, contrainte 6 du
 * PRD), ni email, ni jeton, ni code, ni mot de passe.
 *
 * Trois défenses, parce qu'une seule ne suffit pas (revue PR #88) :
 *  1. **par clé** : toute clé dont le nom *contient* un terme sensible est retirée
 *     (`accessToken`, `userEmail`, `startLat`…), pas seulement les noms exacts ;
 *  2. **par valeur** : dans toute chaîne — message d'erreur compris —, les emails, les
 *     jetons JWT et les nombres qui ont la précision d'une coordonnée sont masqués ;
 *  3. **par profondeur** : au-delà de la limite, le sous-arbre entier est remplacé, jamais
 *     renvoyé tel quel.
 */
const SENSITIVE_KEY =
  /(lat|lng|lon|coord|altitude|accuracy|position|location|path|trackpoint|points|privacyzone|email|password|passwd|secret|token|authorization|cookie|session|code|displayname|weight|physical)/i;

/** Clés techniques qui contiennent un terme sensible sans en être (`status_code`…). */
const SAFE_KEY = /^(status_?code|http\.status_code|error_?code|exit_?code|type|category|level)$/i;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT = /eyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{5,}/g;
/** Un décimal à 4 chiffres après la virgule ou plus : précision d'une coordonnée (~11 m). */
const COORDINATE = /-?\b\d{1,3}\.\d{4,}\b/g;

const REDACTED = '[retiré]';
const MAX_DEPTH = 8;

/**
 * Ce qui suit un mot désignant un secret (« Password hunter2 failed », « code: ABCD… »,
 * « token=… ») : le mot reste, le terme suivant disparaît (revue PR #88).
 */
const AFTER_SECRET_WORD =
  /\b(password|passwd|pwd|passcode|mot de passe|code|token|jeton|secret|api[_-]?key|authorization|bearer)(\s*[:=]\s*|\s+)(?!\[|(?:bearer|basic|digest)\b)("[^"]*"|'[^']*'|\S+)/gi;
/**
 * Schéma d'authentification HTTP suivi de son jeton (`Bearer xyz`, `Basic dXNlcjpw`) :
 * c'est le jeton qui compte, pas le mot `Bearer` (revue PR #88). Appliqué avant la règle
 * générale, pour que `Authorization: Bearer xyz` ne masque pas seulement le schéma.
 */
const AUTH_SCHEME = /\b(bearer|basic|digest)\s+(?!\[)\S+/gi;
/** Format exact des codes à usage unique du compte (#74, #75) : `ABCD-EFGH` ou `ABCDEFGH`. */
const ACCOUNT_CODE = /\b[2-9A-HJ-NP-Z]{4}-?[2-9A-HJ-NP-Z]{4}\b/g;

/**
 * Masque les données personnelles reconnaissables dans un texte libre.
 *
 * Limite assumée : aucun motif ne garantit qu'un texte arbitraire est sans secret. Ce qui
 * rend le risque résiduel acceptable, c'est la source des messages — aucun message d'erreur
 * de l'app n'interpole de secret (vérifié au lot 5 : ce sont des chaînes fixes, ou le
 * `detail` RFC 7807 du serveur, qui n'en contient pas) — et un monitoring éteint par défaut.
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

/** Nettoie récursivement clés et valeurs. Ne modifie pas l'entrée. */
export function scrub<T>(value: T, depth = 0): T {
  if (typeof value === 'string') {
    return sanitizeText(value) as T;
  }
  if (value == null || typeof value !== 'object') {
    return value;
  }
  if (depth >= MAX_DEPTH) {
    return REDACTED as T; // jamais un sous-arbre non inspecté
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

/** Retire la chaîne de requête d'une URL : elle peut porter un email ou un filtre. */
export function stripQuery(url: string | undefined): string | undefined {
  return url?.split('?')[0];
}
