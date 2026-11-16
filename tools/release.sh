#!/bin/zsh
# Bumps the version, commits and tags, and pushes: the CI builds and publishes the APK.
# Usage: npm run release -- patch|minor|major
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -z $(git status --porcelain) ]] || { echo "There are uncommitted changes." >&2; exit 1; }
npm run lint && npm run typecheck && npm test
npm version "${1:-patch}" -m "Version %s"
git push --follow-tags
