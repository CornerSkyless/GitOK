#!/bin/bash
# Executed only on a fresh GitHub-hosted runner after apple-release approval.
set -euo pipefail
set +x
umask 077

for name in APPLE_CERTIFICATE_P12_BASE64 APPLE_CERTIFICATE_PASSWORD APPLE_ID APPLE_TEAM_ID APPLE_APP_SPECIFIC_PASSWORD; do
  if [ -z "${!name:-}" ]; then
    echo "::error::Missing apple-release environment secret: $name"
    exit 1
  fi
done

keychain_path="$RUNNER_TEMP/gitok-signing.keychain-db"
certificate_path="$RUNNER_TEMP/gitok-signing.p12"
work_path="$RUNNER_TEMP/gitok-signing-work"
output_path="$RUNNER_TEMP/signed-release"
keychain_password="$(openssl rand -hex 32)"
echo "::add-mask::$keychain_password"
cleanup() {
  security delete-keychain "$keychain_path" >/dev/null 2>&1 || true
  rm -f "$certificate_path"
}
trap cleanup EXIT

printf '%s' "$APPLE_CERTIFICATE_P12_BASE64" | /usr/bin/base64 --decode > "$certificate_path"
security create-keychain -p "$keychain_password" "$keychain_path"
security set-keychain-settings -lut 10800 "$keychain_path"
security unlock-keychain -p "$keychain_password" "$keychain_path"
security import "$certificate_path" -P "$APPLE_CERTIFICATE_PASSWORD" -k "$keychain_path" -T /usr/bin/codesign -T /usr/bin/security >/dev/null
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$keychain_password" "$keychain_path" >/dev/null
rm -f "$certificate_path"
unset APPLE_CERTIFICATE_P12_BASE64 APPLE_CERTIFICATE_PASSWORD keychain_password

# Store notarization credentials only in the temporary keychain, then remove them
# from the environment before loading the signing library or inspecting artifacts.
xcrun notarytool store-credentials gitok-notary --keychain "$keychain_path" \
  --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD" >/dev/null
unset APPLE_ID APPLE_APP_SPECIFIC_PASSWORD

mkdir -p "$work_path" "$output_path"
version="${GITHUB_REF_NAME#v}"
notarize() {
  local file="$1"
  local receipt="$2"
  xcrun notarytool submit "$file" --keychain "$keychain_path" \
    --keychain-profile gitok-notary --wait --timeout 30m --output-format json > "$receipt"
  node -e 'const r = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); if (r.status !== "Accepted") { console.error("Apple notarization failed:", r.status, "submission:", r.id); process.exit(1); } console.log("Apple notarization accepted:", r.id)' "$receipt"
}

for arch in arm64 x64; do
  arch_path="$work_path/$arch"
  mkdir -p "$arch_path"
  ditto -x -k "$RUNNER_TEMP/unsigned-artifacts/unsigned-${arch}.zip" "$arch_path"
  app_path="$arch_path/GitOK.app"
  binary_arch="$arch"
  if [ "$arch" = x64 ]; then binary_arch=x86_64; fi
  lipo -verify_arch "$binary_arch" "$app_path/Contents/MacOS/GitOK"
  test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app_path/Contents/Info.plist")" = com.geestack.gitok
  test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app_path/Contents/Info.plist")" = "$version"

  identity="$(node .github/signing/sign-app.cjs "$app_path" "$keychain_path" "$APPLE_TEAM_ID")"
  codesign --verify --deep --strict --verbose=2 "$app_path"
  codesign --verify -R "anchor apple generic and certificate leaf[subject.OU] = \"$APPLE_TEAM_ID\"" "$app_path"
  ditto -c -k --sequesterRsrc --keepParent "$app_path" "$arch_path/notarization.zip"
  notarize "$arch_path/notarization.zip" "$arch_path/app-notarization.json"
  xcrun stapler staple "$app_path"
  xcrun stapler validate "$app_path"
  spctl --assess --type execute --verbose=2 "$app_path"

  # ZIP must be recreated after stapling; it cannot itself carry a stapled ticket.
  ditto -c -k --sequesterRsrc --keepParent "$app_path" "$output_path/gitok-${version}-${arch}.zip"
  image_source="$arch_path/image"
  mkdir "$image_source"
  ditto "$app_path" "$image_source/GitOK.app"
  ln -s /Applications "$image_source/Applications"
  dmg_path="$output_path/gitok-${version}-${arch}.dmg"
  hdiutil create -volname GitOK -srcfolder "$image_source" -format UDZO "$dmg_path"
  codesign --force --sign "$identity" --keychain "$keychain_path" --timestamp "$dmg_path"
  notarize "$dmg_path" "$arch_path/dmg-notarization.json"
  xcrun stapler staple "$dmg_path"
  xcrun stapler validate "$dmg_path"
  codesign --verify --strict "$dmg_path"
  spctl --assess --type open --context context:primary-signature --verbose=2 "$dmg_path"

  # Check the final ZIP after a fresh extraction, not only its pre-archive source.
  mkdir "$arch_path/verify"
  ditto -x -k "$output_path/gitok-${version}-${arch}.zip" "$arch_path/verify"
  codesign --verify --deep --strict "$arch_path/verify/GitOK.app"
  xcrun stapler validate "$arch_path/verify/GitOK.app"
  spctl --assess --type execute "$arch_path/verify/GitOK.app"
done

cd "$output_path"
shasum -a 256 ./*.zip ./*.dmg > SHA256SUMS
