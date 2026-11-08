# Solomud Radio — Android

Android WebView shell for https://solomud-hue.github.io/solomud-radio/.

The Android app opens the **live website** so the station list, previous-station memory, themes and interactive spectrum remain in sync with the published web version.

## Build APK with GitHub Actions

1. In the repository, open **Actions**.
2. Select **Build Solomud Radio Android APK** and run the workflow (or use its automatic push build).
3. Open the successful workflow run and download the artifact **solomud-radio-android-debug-apk**.
4. Unzip the artifact to obtain `app-debug.apk` and install it on Android.

The APK is a debug build signed with a development key, suitable for testing. For public distribution, create a release signing key and a signed release build.

## Current limitations

- Requires an internet connection; radio streams are live.
- Android System WebView needs to support the site's codec and stream.
- Background playback and lock-screen media controls are **not implemented**; a separate native MediaSession/foreground service design is needed for reliable playback with the screen off.
- This is a WebView wrapper, not a standalone offline copy of the site.
