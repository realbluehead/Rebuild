#!/bin/zsh
# Creates the release signing key (ONCE) and shows how to put it in the GitHub secrets.
# Keep the .jks and the passwords somewhere safe: if they are lost, phones cannot update.
set -euo pipefail
cd "$(dirname "$0")/.."
out=${1:-$HOME/.android-keys/rebuild.jks}
[[ -e $out ]] && { echo "$out already exists" >&2; exit 1; }
mkdir -p "$(dirname "$out")"
pass=$(openssl rand -base64 24)
keytool -genkeypair -v -keystore "$out" -alias rebuild -keyalg RSA -keysize 4096 -validity 10000 \
  -storepass "$pass" -keypass "$pass" -dname "CN=Rebuild"
cat > android/keystore.properties <<PROPS
storeFile=$out
storePassword=$pass
keyAlias=rebuild
keyPassword=$pass
PROPS
echo "\nKey created at $out and android/keystore.properties (ignored by git)."
echo "For the CI:  gh secret set ANDROID_KEYSTORE_BASE64 < <(base64 -i \"$out\")"
echo "              gh secret set ANDROID_KEYSTORE_PASSWORD   (and ANDROID_KEY_PASSWORD, same value)"
echo "              gh secret set ANDROID_KEY_ALIAS --body rebuild"
