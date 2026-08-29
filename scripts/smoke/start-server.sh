#!/usr/bin/env bash
set -u
LOG=/home/bright/abibjobs/.smoke.log
PIDF=/home/bright/abibjobs/.smoke.pid
: > "$LOG"
cd /home/bright/abibjobs
nohup env PORT=5123 JOB_POSTING_FEE_PERCENT=0 \
  /home/bright/.nvm/versions/node/v20.20.2/bin/node \
  --env-file=/home/bright/abibjobs/.env \
  /home/bright/abibjobs/dist/index.cjs >> "$LOG" 2>&1 < /dev/null &
echo $! > "$PIDF"
echo "pid=$(cat "$PIDF")"
for i in $(seq 1 30); do
  if grep -q "serving on port 5123" "$LOG" 2>/dev/null; then
    echo "UP after ${i}s"
    break
  fi
  if ! kill -0 "$(cat "$PIDF")" 2>/dev/null; then
    echo "DIED"
    break
  fi
  sleep 1
done
tail -n 30 "$LOG"