/**
 * The SINGLE source of the StrackS API base URL.
 *
 * By default, the app points to the backend deployed in production on the VPS.
 * `EXPO_PUBLIC_API_URL` overrides this value to target a local backend during
 * development; set it BEFORE `expo start`:
 *
 *   # iOS simulator / web mode (they share the Mac's network)
 *   EXPO_PUBLIC_API_URL=http://localhost:8080 npx expo start
 *   # Android emulator (10.0.2.2 = alias for the Mac's localhost)
 *   EXPO_PUBLIC_API_URL=http://10.0.2.2:8080 npx expo start
 *   # Physical phone (the Mac's local IP)
 *   EXPO_PUBLIC_API_URL=http://192.168.1.23:8080 npx expo start
 *
 * It's the ONLY place in the code where the base URL is defined: everything else
 * (HTTP client, hooks) imports `API_BASE_URL` from here.
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://stracks.alshimysth.cloud';
