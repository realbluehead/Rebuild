#!/bin/zsh
# Puja la versió, fa commit i etiqueta, i ho envia: la CI compila i publica l'APK.
# Ús: npm run release -- patch|minor|major
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -z $(git status --porcelain) ]] || { echo "Hi ha canvis sense commit." >&2; exit 1; }
npm test
npm version "${1:-patch}" -m "Versió %s"
git push --follow-tags
