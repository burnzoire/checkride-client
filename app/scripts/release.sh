#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: ./scripts/release.sh <version>"
  echo "Example: ./scripts/release.sh 1.2.3"
  exit 1
fi

VERSION="$1"
TAG="v${VERSION}"

npm version "$VERSION" --no-git-tag-version

git add package.json package-lock.json
if git diff --cached --quiet; then
  echo "No changes to commit."
else
  git commit -m "chore(release): v${VERSION}"
fi

git tag -a "$TAG" -m "Release $TAG"

echo "Created tag $TAG."

echo "Next: git push && git push origin $TAG"
