# Solomud Radio — Android 1.1

The WebView loads https://solomudradio.pages.dev/ and controls a native Media3
ExoPlayer in `RadioPlaybackService`. Audio no longer belongs to the WebView or
its JavaScript timers. The service supplies a media notification and lock-screen
play/pause, audio focus, headphone-disconnection handling, CPU/Wi-Fi wake locks
while streaming, and bounded reconnection to the same station. The sleep timer
runs in the service too. Closing the Activity does not stop active playback;
use Pause in the notification to stop listening.

The origin-restricted WebMessage bridge accepts only main-frame messages from
the two owned website origins. HTTPS streams, including HLS, are supported.
The browser/PWA version uses direct HTML audio on mobile and Media Session
controls. Mobile audio analysis is disabled to avoid routing sound through a
background-suspendable AudioContext; desktop analysis is retained.

## Build and install

The **Build Solomud Radio Android APK** GitHub Actions workflow builds changes
under `android/`. Download **solomud-radio-android-debug-apk**, extract
`app-debug.apk`, and install it on Android. Version code is 2, version is 1.1.0.

An old APK does not gain a native service from a website refresh. Install the
new APK. A home-screen PWA receives the web changes but is not this native app.
Debug builds use a development signing key; if Android reports a signature
mismatch, an in-place upgrade requires the original signing key. Removing the
old app clears its local preferences. Use a stable release key for distribution.

## Verification

Run `node tests/playback-recovery.cjs` and `node tests/background-playback.cjs`.
Build with Java 17, Gradle 8.13, Android SDK 35: `gradle --no-daemon assembleDebug`.

Physical-device acceptance (not covered by Node tests or an APK compile):

- Play AAC/MP3 and HLS, lock the screen for at least 15 minutes, then unlock.
- Background and reopen the app; ensure only one stream plays and controls agree.
- Pause/resume from the lock screen and disconnect headphones; no forced restart.
- Change stations quickly; late updates must not restore the previous station.
- Temporarily disable networking while locked, then restore it during retry.
- Set/cancel the sleep timer, lock the screen, and confirm the stop time.

Force-stopping the app or device-specific battery restrictions can still stop
playback. No screen wake lock or blanket battery-optimization exemption is used.
