#!/usr/bin/env bash
set -u
S=/home/bright/abibjobs/scripts/smoke
bash "$S/start-server.sh" || exit 1
FLOW_STATUS=1
bash "$S/flow.sh"
FLOW_STATUS=$?
bash "$S/stop-server.sh"
exit "$FLOW_STATUS"