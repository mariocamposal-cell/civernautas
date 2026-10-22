#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/web"
PORT="${1:-8081}"

echo "NOCHE · demo local"
echo "Servidor: http://localhost:${PORT}"
echo "Pulsa Ctrl+C para parar."

python3 -m http.server "$PORT" &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

sleep 1
xdg-open "http://localhost:${PORT}" >/dev/null 2>&1 || true

wait "$SERVER_PID"
