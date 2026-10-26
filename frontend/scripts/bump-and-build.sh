#!/usr/bin/env bash
# Bumps frontend/VERSION (e.g. 0.02 -> 0.03), writes the matching versionCode/
# versionName into android/app/build.gradle, does a full rebuild (static
# export -> cap sync -> debug APK + release AAB), copies both into
# android/releases/ with the version in the filename, then commits the
# version-bump files. Invoked by .githooks/pre-push, or run by hand:
#   bash frontend/scripts/bump-and-build.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."   # -> frontend/

if [ ! -f VERSION ]; then
  echo "frontend/VERSION not found — expected a file containing e.g. 0.02" >&2
  exit 1
fi

CURRENT="$(cat VERSION | tr -d '[:space:]')"
MAJOR="${CURRENT%%.*}"
MINOR="${CURRENT##*.}"
MINOR=$((10#$MINOR + 1))
if [ "$MINOR" -ge 100 ]; then
  MINOR=0
  MAJOR=$((MAJOR + 1))
fi
NEW_VERSION="$(printf "%d.%02d" "$MAJOR" "$MINOR")"
VERSION_CODE=$((MAJOR * 100 + MINOR))

NEW_RELEASE_DATE="$(date +'%d %b %Y')"

echo "== Bumping version: $CURRENT -> $NEW_VERSION (versionCode $VERSION_CODE), released $NEW_RELEASE_DATE =="
echo "$NEW_VERSION" > VERSION
echo "$NEW_RELEASE_DATE" > RELEASE_DATE

GRADLE_FILE="android/app/build.gradle"
sed -i -E "s/versionCode [0-9]+/versionCode $VERSION_CODE/" "$GRADLE_FILE"
sed -i -E "s/versionName \"[^\"]*\"/versionName \"$NEW_VERSION\"/" "$GRADLE_FILE"

echo "== Syncing notification sounds into Android raw resources =="
mkdir -p android/app/src/main/res/raw
cp public/sounds/*.mp3 android/app/src/main/res/raw/

echo "== Building Capacitor static export =="
npm run build:capacitor

echo "== Syncing into the Android project =="
npx cap sync android

echo "== Building Android debug APK + release AAB =="
(
  cd android
  # This project's Capacitor/AGP version needs Java 21 specifically —
  # not older (compileDebugJavaWithJavac fails: "invalid source release:
  # 21") and not newer (Gradle 8.14.3 can't parse build scripts on a
  # Java 25 JBR: "Unsupported class file major version 69"). A single
  # hardcoded path here silently broke twice already — once when
  # Android Studio's bundled JBR auto-updated past 21 to 25 without any
  # warning, producing a real "BUILD FAILED" that went undetected because
  # it was being piped through `| tail` elsewhere (not here — this script
  # already has set -eu top, so it does fail loudly on its own — but the
  # broken path itself needs to actually resolve to something that works).
  # Try a short list of known-good install locations before giving up.
  for candidate in \
    "/c/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot" \
    "/c/Program Files/Android/Android Studio/jbr" \
    "/c/Program Files/Android/Android Studio1/jbr"
  do
    if [ -f "$candidate/bin/java.exe" ] && "$candidate/bin/java" -version 2>&1 | grep -q '"21\.'; then
      export JAVA_HOME="$candidate"
      break
    fi
  done
  if [ -z "${JAVA_HOME:-}" ]; then
    echo "No working Java 21 install found in the known candidate paths." >&2
    echo "Install one (e.g. 'winget install EclipseAdoptium.Temurin.21.JDK') or update the candidate list above." >&2
    exit 1
  fi
  echo "Using JAVA_HOME=$JAVA_HOME"
  ./gradlew.bat assembleDebug --no-daemon
  ./gradlew.bat bundleRelease --no-daemon
)

# Trust but verify — a build that silently reused stale cached output
# instead of actually rebuilding would still exit 0 above; this is what
# let v0.12-v0.14 ship as secretly-still-v0.10 binaries for 3 version
# bumps in a row before anyone noticed (AndroidManifest.xml inside the
# APK is binary XML, not plain text — a `grep`-based check on it can't
# reliably confirm this, aapt2 is the real tool for it).
AAPT2="$(find "${ANDROID_HOME:-$LOCALAPPDATA/Android/Sdk}/build-tools" -maxdepth 2 -iname "aapt2.exe" 2>/dev/null | sort -V | tail -1)"
if [ -n "$AAPT2" ] && [ -x "$AAPT2" ]; then
  BUILT="$("$AAPT2" dump badging "android/app/build/outputs/apk/debug/app-debug.apk" 2>/dev/null | head -1)"
  echo "Built APK reports: $BUILT"
  if ! echo "$BUILT" | grep -q "versionCode='$VERSION_CODE'"; then
    echo "ERROR: the built APK's versionCode doesn't match what was just set ($VERSION_CODE) — the build silently used stale output. Run 'cd android && ./gradlew.bat clean' and retry." >&2
    exit 1
  fi
else
  echo "aapt2 not found — skipping the built-APK version verification. To check manually:" >&2
  echo "  aapt2 dump badging android/app/build/outputs/apk/debug/app-debug.apk" >&2
fi

mkdir -p android/releases
cp "android/app/build/outputs/apk/debug/app-debug.apk" "android/releases/app-debug-v${NEW_VERSION}.apk"
cp "android/app/build/outputs/bundle/release/app-release.aab" "android/releases/app-release-v${NEW_VERSION}.aab"

echo "== Done =="
echo "  android/releases/app-debug-v${NEW_VERSION}.apk"
echo "  android/releases/app-release-v${NEW_VERSION}.aab"

git add VERSION RELEASE_DATE "$GRADLE_FILE"
git commit -m "chore: bump app version to v${NEW_VERSION}"

echo ""
echo "Version bump committed locally. Run 'git push' again to include it."
