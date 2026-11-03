#!/usr/bin/env bash
# Push main to origin and p2pmerc. Never force-pushes.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
branch="${1:-main}"
echo "Pushing $branch → origin "
GH_CONFIG_DIR=/workspace/.gh-zer0 git push origin "$branch"
echo "Pushing $branch → p2pmerc (p2pmerc/redline)"
GH_CONFIG_DIR=/workspace/.gh-p2pmerch git push p2pmerc "$branch"
o=$(GH_CONFIG_DIR=/workspace/.gh-zer0 git ls-remote origin "refs/heads/$branch" | awk '{print $1}')
p=$(GH_CONFIG_DIR=/workspace/.gh-p2pmerch git ls-remote p2pmerc "refs/heads/$branch" | awk '{print $1}')
h=$(git rev-parse "$branch")
echo "origin=$o"
echo "p2pmerc=$p"
echo "local=$h"
if [[ "$o" != "$p" || "$o" != "$h" ]]; then
  echo "ERROR: remotes diverged" >&2
  exit 1
fi
echo "Both remotes match $h"
