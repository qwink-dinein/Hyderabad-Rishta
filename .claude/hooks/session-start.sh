#!/bin/bash
# Cloud sessions start from a fresh container: install the npm packages and graphify, then rebuild the
# graphify code map (graphify-out/, not in git) so `graphify query` works from the first message.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"
GRAPHIFY_VERSION=0.9.103

# Which event started this run (startup, resume, clear, compact). Only startup/resume rebuild the map.
source_event="$(python3 -I -c 'import json,sys; print(json.load(sys.stdin).get("source",""))' 2>/dev/null || true)"

# graphify (with SQL support, so the 70+ migrations are mapped), installed into the system Python.
pyhashes="$(python3 -I -c 'import sysconfig; print(sysconfig.get_path("purelib"))')/.session-start.sha256"
pins="graphifyy[sql]==${GRAPHIFY_VERSION}"
if ! { command -v graphify >/dev/null && [ -f "$pyhashes" ] && [ "$(cat "$pyhashes")" = "$pins" ]; }; then
  rm -f "$pyhashes"
  python3 -m pip install --quiet --root-user-action=ignore "$pins" >&2
  echo "$pins" > "$pyhashes"
fi

# npm packages, only when package.json / package-lock.json (or this script) changed since the last install.
hashes=node_modules/.session-start.sha256
if ! sha256sum --check --status "$hashes" 2>/dev/null; then
  rm -f "$hashes"
  npm install --no-audit --no-fund >&2
  sha256sum .claude/hooks/session-start.sh package.json package-lock.json > "$hashes" || rm -f "$hashes"
fi

# Code-only map (no AI calls, ~10 s on a fresh container; later runs reuse the AST cache).
case "$source_event" in
  clear|compact) ;;
  *) graphify update . >&2 || echo "graphify update failed; the session continues without a fresh map" >&2 ;;
esac
