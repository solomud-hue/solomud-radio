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

## Release signing and updates (1.1.2 onward)

The distributed app uses application ID `md.solomud.radio` and the permanent
release certificate pinned in `release-certificate.sha256`. Never regenerate
its private key. A private recovery archive is kept separately from this repo.
Do not commit a keystore, password, or recovery archive to this public repository.

Configure these GitHub Actions repository secrets once:

- `ANDROID_KEYSTORE_BASE64`: Base64 of the permanent PKCS12 keystore.
- `ANDROID_KEYSTORE_PASSWORD`: its store/key password.

Key alias: `solomud-radio`. The workflow builds a non-debuggable release APK,
signs it, checks the pinned certificate and compares the package and version
against `downloads/solomud-radio.apk`. Missing or incorrect secrets stop the
release; there is no fallback to a generated debug key.

Download only the **solomud-radio-release-apk** artifact for installation.
The separately named unsigned artifact is for local signing/recovery only.
For local signing, set `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`
and `ANDROID_BUILD_TOOLS`, then run:

```sh
bash scripts/sign_android_release.sh app-release-unsigned.apk Solomud-Radio.apk
```

For each future update, increase `versionCode` and `versionName` in
`app/build.gradle`. Before publishing, verify against the APK currently offered
on the website. Replace that download only after successful checks.

### One-time migration from 1.1.1

Version 1.1.1 was signed with an ephemeral GitHub runner debug key, which was
not retained. The first permanent-key release (1.1.2 / code 4) therefore requires
uninstalling 1.1.1 once. Local preferences may be lost in that migration.
The verifier permits only this explicitly identified legacy signature/code
transition; it does not silently allow arbitrary signer changes.
Updates after 1.1.2 retain the same application ID and key and install in place.
Normal Android installation confirmation still applies; silent installation
and an in-app update downloader are not implemented here.

## Verification

Run `node tests/playback-recovery.cjs` and `node tests/background-playback.cjs`.
Build with Java 17, Gradle 8.13, Android SDK 35: `gradle --no-daemon assembleRelease`.

Physical-device acceptance (not covered by Node tests or an APK compile):

- Play AAC/MP3 and HLS, lock the screen for at least 15 minutes, then unlock.
- Background and reopen the app; ensure only one stream plays and controls agree.
- Pause/resume from the lock screen and disconnect headphones; no forced restart.
- Change stations quickly; late updates must not restore the previous station.
- Temporarily disable networking while locked, then restore it during retry.
- Set/cancel the sleep timer, lock the screen, and confirm the stop time.

Force-stopping the app or device-specific battery restrictions can still stop
playback. No screen wake lock or blanket battery-optimization exemption is used.
