#!/bin/bash
# My-project dev-server launcher — survives the tool-call reaper.
#
# Usage (single tool call!):
#   bash scripts/dev-server.sh; sleep 12; curl -sf localhost:3000/api/test-results >/dev/null && echo UP
cd /home/z/my-project || exit 1
# already up? then do nothing
if curl -sf -o /dev/null --max-time 3 http://localhost:3000/api/test-results; then
  echo "already running"
  exit 0
fi
# stale lock/socket cleanup: kill leftovers from a crashed run
pkill -f "next dev -p 3000" 2>/dev/null
pkill -f "next-server" 2>/dev/null
sleep 1
setsid bun run dev > /dev/null 2>&1 < /dev/null &
# this script exits immediately → server re-parents to init → survives
