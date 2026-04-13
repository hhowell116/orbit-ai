#!/bin/bash
# Orbit AI — Stop everything
# Note: tunnel keeps running unless --all is passed

if [ "$1" = "--all" ]; then
  kill $(lsof -ti:5000) 2>/dev/null || true
  pkill -f cloudflared 2>/dev/null || true
  echo "Orbit AI stopped (broker + tunnel)."
else
  kill $(lsof -ti:5000) 2>/dev/null || true
  echo "Orbit AI broker stopped. Tunnel still running."
  echo "  Use './stop.sh --all' to also stop the tunnel."
fi
