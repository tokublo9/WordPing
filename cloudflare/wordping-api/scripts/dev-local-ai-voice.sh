#!/bin/sh
set -eu

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 20 ]; then
  echo "Node.js 20 or newer is required by Wrangler. Run: nvm use 20" >&2
  exit 1
fi

state_dir="$(mktemp -d "${TMPDIR:-/tmp}/wordping-local-ai-voice.XXXXXX")"

cleanup() {
  rm -rf "$state_dir"
}
trap cleanup EXIT HUP INT TERM

echo "Starting loopback-only Worker with disposable storage: $state_dir"
echo "The directory is removed when this command stops."

node node_modules/wrangler/bin/wrangler.js dev \
  --local \
  --ip 127.0.0.1 \
  --port 8787 \
  --persist-to "$state_dir"
