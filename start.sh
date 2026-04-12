#!/bin/bash
# Orbit AI — Start everything
# Usage: ./start.sh

set -e

export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BROKER_DIR="$PROJECT_DIR/packages/broker"

# Kill any existing processes
kill $(lsof -ti:5000) 2>/dev/null || true
pkill -f cloudflared 2>/dev/null || true
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

# Start tunnel
echo "[2/2] Starting Cloudflare tunnel..."
nohup cloudflared tunnel --url http://localhost:5000 > /tmp/orbit-tunnel.log 2>&1 &
TUNNEL_PID=$!

# Wait for tunnel URL
for i in $(seq 1 15); do
  TUNNEL_URL=$(grep -o 'https://[^ ]*trycloudflare.com' /tmp/orbit-tunnel.log 2>/dev/null | head -1)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 1
done

echo ""
echo "=================================="
if [ -n "$TUNNEL_URL" ]; then
  echo "  LIVE AT: $TUNNEL_URL"
else
  echo "  Tunnel still starting... check /tmp/orbit-tunnel.log"
  echo "  Local: http://localhost:5000"
fi
echo "=================================="
echo ""
echo "  Login: hayden / admin123"
echo "  Broker PID: $BROKER_PID"
echo "  Tunnel PID: $TUNNEL_PID"
echo ""
echo "  Logs:"
echo "    Broker: /tmp/orbit-broker.log"
echo "    Tunnel: /tmp/orbit-tunnel.log"
echo ""
echo "  To stop: ./stop.sh"
