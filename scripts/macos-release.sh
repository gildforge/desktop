#!/bin/zsh
# Signs, notarizes and staples the macOS builds of a release, then replaces the
# CI's ad-hoc signed .dmg files on that GitHub release.
#   scripts/macos-release.sh v0.1.0
# Needs, on a Mac with the Developer ID certificate in the keychain:
#   APPLE_SIGNING_IDENTITY   "Developer ID Application: <name> (<team>)"
#   APPLE_API_KEY, APPLE_API_ISSUER, APPLE_API_KEY_PATH   an App Store Connect API key
# The .dmg is made with hdiutil: Tauri's dmg step scripts Finder, which fails
# (and opens windows) on a machine nobody is watching.
set -euo pipefail
tag=${1:?usage: scripts/macos-release.sh <tag>}
version=${tag#v}
cd "$(dirname "$0")/.."
: ${APPLE_SIGNING_IDENTITY:?} ${APPLE_API_KEY:?} ${APPLE_API_ISSUER:?} ${APPLE_API_KEY_PATH:?}
export PATH=$HOME/.cargo/bin:$PATH
out=.tmp/release; mkdir -p $out
git fetch -q origin tag $tag && git -c advice.detachedHead=false checkout -q $tag
npm ci
for target arch in aarch64-apple-darwin aarch64 x86_64-apple-darwin x64; do
  npx tauri build --target $target --bundles app \
    --config "{\"bundle\":{\"macOS\":{\"signingIdentity\":\"$APPLE_SIGNING_IDENTITY\"}}}"
  app=src-tauri/target/$target/release/bundle/macos/gild.app
  stage=.tmp/dmg-$arch; rm -rf $stage; mkdir -p $stage
  ditto $app $stage/gild.app; ln -s /Applications $stage/Applications
  dmg=$out/gild_${version}_$arch.dmg; rm -f $dmg
  hdiutil create -volname gild -srcfolder $stage -fs HFS+ -format UDZO -ov $dmg >/dev/null
  codesign --sign "$APPLE_SIGNING_IDENTITY" --timestamp $dmg
  xcrun notarytool submit $dmg --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER" --wait
  xcrun stapler staple $dmg
  spctl -a -t open --context context:primary-signature $dmg
  tar -czf $out/gild_$arch.app.tar.gz -C $(dirname $app) gild.app
  rm -rf $stage
done
gh release upload $tag $out/gild_${version}_aarch64.dmg $out/gild_${version}_x64.dmg $out/gild_aarch64.app.tar.gz $out/gild_x64.app.tar.gz --clobber
