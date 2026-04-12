#!/bin/bash
# Orbit AI — Stop everything

kill $(lsof -ti:5000) 2>/dev/null || true
pkill -f cloudflared 2>/dev/null || true
echo "Orbit AI stopped."
