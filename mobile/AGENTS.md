# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v58.0.0/ before writing any code.

Note (2026-10-06, #90): back on SDK 57. The project had been downgraded from 57 to 54 on
2026-07-17 because the App Store Expo Go was still on 54. By 2026-09-30 Expo Go had moved to
57 and refused the SDK 54 project, which removed that reason. Device testing goes through an
EAS development build (`mobile/DEV-BUILD.md`) anyway: Expo Go cannot run background location.

Note (2026-11-17): upgraded to SDK 58 (React Native 0.88, React 19.3). Things that bit or
nearly bit: `File.write()` from `expo-file-system` is async (await it), React Native list
props no longer accept `null` components (use `undefined`), release Android builds now run
R8 (`android.enableMinifyInReleaseBuilds`), and a new development build is required.
