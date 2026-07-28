/**
 * Source UNIQUE de l'URL de base de l'API StrackS.
 *
 * Par défaut, l'app pointe vers le backend déployé en production sur le VPS.
 * `EXPO_PUBLIC_API_URL` permet de surcharger ponctuellement cette valeur pour
 * cibler un backend local en développement — à définir AVANT `expo start` :
 *
 *   # Simulateur iOS / mode web (partagent le réseau du Mac)
 *   EXPO_PUBLIC_API_URL=http://localhost:8080 npx expo start
 *   # Émulateur Android (10.0.2.2 = alias vers le localhost du Mac)
 *   EXPO_PUBLIC_API_URL=http://10.0.2.2:8080 npx expo start
 *   # Téléphone physique (IP locale du Mac)
 *   EXPO_PUBLIC_API_URL=http://192.168.1.23:8080 npx expo start
 *
 * C'est le SEUL endroit du code où l'URL de base est définie : tout le reste
 * (client HTTP, hooks) importe `API_BASE_URL` d'ici.
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://stracks.alshimysth.cloud';
