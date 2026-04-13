#!/bin/bash
# Orbit AI — Start everything
# Usage: ./start.sh

set -e

export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BROKER_DIR="$PROJECT_DIR/packages/broker"
DOMAIN="orbitai.work"

# Kill any existing broker
kill $(lsof -ti:5000) 2>/dev/null || true
sleep 1

echo "=== Orbit AI ==="
echo ""

# Start broker
echo "[1/2] Starting broker..."
cd "$BROKER_DIR"
nohup bun run src/index.ts > /tmp/orbit-broker.log 2>&1 &
BROKER_PID=$!
sleep 1

# Verify broker
if curl -sf http://localhost:5000/health > /dev/null 2>&1; then
  echo "  Broker running on :5000 (PID $BROKER_PID)"
else
  echo "  ERROR: Broker failed to start. Check /tmp/orbit-broker.log"
  exit 1
fi

# Start tunnel (only if not already running)
if pgrep -f "cloudflared tunnel run" > /dev/null 2>&1; then
  echo "[2/2] Tunnel already running"
else
  echo "[2/2] Starting Cloudflare tunnel..."
  nohup cloudflared tunnel run orbit-ai > /tmp/orbit-tunnel.log 2>&1 &
  TUNNEL_PID=$!
  sleep 2
  echo "  Tunnel started (PID $TUNNEL_PID)"
fi

echo ""
echo "=================================="
echo "  LIVE AT: https://$DOMAIN"
echo "=================================="
echo ""
echo "  Login: hayden / admin123"
echo "  Broker PID: $BROKER_PID"
echo ""
echo "  Logs:"
echo "    Broker: /tmp/orbit-broker.log"
echo "    Tunnel: /tmp/orbit-tunnel.log"
echo ""
echo "  To stop: ./stop.sh"
