#!/usr/bin/env bash
set -u
PIDF=/home/bright/abibjobs/.smoke.pid
if [ -f "$PIDF" ]; then
  kill "$(cat "$PIDF")" 2>/dev/null
  rm -f "$PIDF"
  echo "stopped"
fi
pkill -f "dist/index.cjs" 2>/dev/null
echo done