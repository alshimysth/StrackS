/**
 * Nettoyage des événements de monitoring avant envoi (lot 5).
 *
 * Un rapport d'erreur part chez un tiers (Sentry). Il ne doit contenir **aucune** donnée
 * personnelle : ni position (les tracés GPS sont des données sensibles, contrainte 6 du
 * PRD), ni email, ni jeton, ni code à usage unique, ni mot de passe. Plutôt que de lister
 * les endroits où ces données pourraient apparaître, on retire toute clé dont le nom les
 * désigne, où qu'elle soit dans l'événement.
 */
const SENSITIVE_KEY =
  /^(lat|lng|latitude|longitude|altitude|altitudem|accuracym|coords|path|trackpoints|points|privacyzones|email|newemail|password|currentpassword|newpassword|token|refreshtoken|authorization|code|displayname|weightkg|physical)$/i;

const REDACTED = '[retiré]';

/** Remplace récursivement les valeurs des clés sensibles. Ne modifie pas l'entrée. */
export function scrub<T>(value: T, depth = 0): T {
  if (depth > 8 || value == null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrub(item, depth + 1)) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : scrub(inner, depth + 1);
  }
  return out as T;
}

/** Retire la chaîne de requête d'une URL : elle peut porter un email ou un filtre. */
export function stripQuery(url: string | undefined): string | undefined {
  return url?.split('?')[0];
}
