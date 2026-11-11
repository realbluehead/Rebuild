#!/bin/zsh
# Crea la clau de signatura de release (UN SOL COP) i mostra com posar-la als secrets de GitHub.
# Guarda el .jks i les contrasenyes en un lloc segur: si es perden, els mòbils no podran actualitzar.
set -euo pipefail
cd "$(dirname "$0")/.."
out=${1:-$HOME/.android-keys/rebuild.jks}
[[ -e $out ]] && { echo "Ja existeix $out" >&2; exit 1; }
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
echo "\nClau creada a $out i android/keystore.properties (ignorat per git)."
echo "Per a la CI:  gh secret set ANDROID_KEYSTORE_BASE64 < <(base64 -i \"$out\")"
echo "              gh secret set ANDROID_KEYSTORE_PASSWORD   (i ANDROID_KEY_PASSWORD, mateix valor)"
echo "              gh secret set ANDROID_KEY_ALIAS --body rebuild"
