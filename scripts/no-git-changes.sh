#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if [[ `git status --porcelain` ]]; then
  echo "GIT changes detected! Please always run all pre-commit hooks. `npm run build:docs` should help in most cases"

  git status --verbose --verbose

  exit 1
fi
