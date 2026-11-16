#!/usr/bin/env bash
set -euo pipefail
# Never enable tracing: the environment contains a signing password.
root="$(cd "$(dirname "$0")/.." && pwd)"
: "${ANDROID_KEYSTORE_PATH:?Set the path to the permanent release keystore}"
: "${ANDROID_KEYSTORE_PASSWORD:?Set the keystore password}"
: "${ANDROID_BUILD_TOOLS:?Set the Android build-tools directory}"
input="${1:?Unsigned release APK required}"
output="${2:?Output APK required}"
temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT
"$ANDROID_BUILD_TOOLS/zipalign" -f -p 4 "$input" "$temporary/aligned.apk"
"$ANDROID_BUILD_TOOLS/apksigner" sign \
  --ks "$ANDROID_KEYSTORE_PATH" --ks-key-alias solomud-radio \
  --ks-pass env:ANDROID_KEYSTORE_PASSWORD --key-pass env:ANDROID_KEYSTORE_PASSWORD \
  --out "$temporary/signed.apk" "$temporary/aligned.apk"
python3 "$root/scripts/verify_android_release.py" "$temporary/signed.apk" \
  --apksigner "$ANDROID_BUILD_TOOLS/apksigner" --aapt "$ANDROID_BUILD_TOOLS/aapt"
mkdir -p "$(dirname "$output")"
cp "$temporary/signed.apk" "$output"
