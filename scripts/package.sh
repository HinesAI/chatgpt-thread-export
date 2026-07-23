#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
VERSION="$(python3 -c "import json; print(json.load(open('$ROOT/manifest.json'))['version'])")"
OUT="$ROOT/dist/chatgpt-thread-export-v${VERSION}.zip"

mkdir -p "$ROOT/dist"
rm -f "$OUT"

(
  cd "$ROOT"
  zip -r "$OUT" \
    manifest.json \
    background.js \
    content.js \
    README.md \
    LICENSE \
    icons \
    -x '*.DS_Store'
)

echo "Created $OUT"
