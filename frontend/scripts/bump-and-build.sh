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

echo "== Bumping version: $CURRENT -> $NEW_VERSION (versionCode $VERSION_CODE) =="
echo "$NEW_VERSION" > VERSION

GRADLE_FILE="android/app/build.gradle"
sed -i -E "s/versionCode [0-9]+/versionCode $VERSION_CODE/" "$GRADLE_FILE"
sed -i -E "s/versionName \"[^\"]*\"/versionName \"$NEW_VERSION\"/" "$GRADLE_FILE"

echo "== Building Capacitor static export =="
npm run build:capacitor

echo "== Syncing into the Android project =="
npx cap sync android

echo "== Building Android debug APK + release AAB =="
(
  cd android
  export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
  ./gradlew.bat assembleDebug --no-daemon
  ./gradlew.bat bundleRelease --no-daemon
)

mkdir -p android/releases
cp "android/app/build/outputs/apk/debug/app-debug.apk" "android/releases/app-debug-v${NEW_VERSION}.apk"
cp "android/app/build/outputs/bundle/release/app-release.aab" "android/releases/app-release-v${NEW_VERSION}.aab"

echo "== Done =="
echo "  android/releases/app-debug-v${NEW_VERSION}.apk"
echo "  android/releases/app-release-v${NEW_VERSION}.aab"

git add VERSION "$GRADLE_FILE"
git commit -m "chore: bump app version to v${NEW_VERSION}"

echo ""
echo "Version bump committed locally. Run 'git push' again to include it."
