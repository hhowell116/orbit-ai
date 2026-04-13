#!/bin/bash
# Orbit AI — One-time Cloudflare named tunnel setup
# Run this ONCE on the VM after buying your domain on Cloudflare
#
# Prerequisites:
#   1. cloudflared installed on the VM
#   2. orbitai.work added to your Cloudflare account
#
# Usage: ./setup-tunnel.sh

set -e

DOMAIN="orbitai.work"
TUNNEL_NAME="orbit-ai"

echo "=== Orbit AI — Tunnel Setup ==="
echo ""

# Step 1: Login to Cloudflare
echo "[1/4] Logging in to Cloudflare..."
echo "  A browser window will open. Log in and authorize cloudflared."
echo ""
cloudflared tunnel login

echo ""
echo "[2/4] Creating named tunnel '$TUNNEL_NAME'..."
cloudflared tunnel create "$TUNNEL_NAME"

# Get the tunnel UUID from the credentials file
TUNNEL_UUID=$(ls ~/.cloudflared/*.json 2>/dev/null | head -1 | xargs basename | sed 's/.json//')
CRED_FILE="$HOME/.cloudflared/${TUNNEL_UUID}.json"

if [ -z "$TUNNEL_UUID" ]; then
  echo "  ERROR: Could not find tunnel credentials. Check ~/.cloudflared/"
  exit 1
fi

echo "  Tunnel UUID: $TUNNEL_UUID"
echo "  Credentials: $CRED_FILE"

# Step 3: Create config file
echo ""
echo "[3/4] Creating tunnel config..."
cat > ~/.cloudflared/config.yml <<EOF
tunnel: $TUNNEL_UUID
credentials-file: $CRED_FILE

ingress:
  - hostname: $DOMAIN
    service: http://localhost:5000
  - hostname: www.$DOMAIN
    service: http://localhost:5000
  - service: http_status:404
EOF

echo "  Config written to ~/.cloudflared/config.yml"

# Step 4: Set up DNS
echo ""
echo "[4/4] Setting up DNS records..."
cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN"
cloudflared tunnel route dns "$TUNNEL_NAME" "www.$DOMAIN"

echo ""
echo "=========================================="
echo "  SETUP COMPLETE!"
echo ""
echo "  Domain:  https://$DOMAIN"
echo "  Tunnel:  $TUNNEL_NAME ($TUNNEL_UUID)"
echo "  Config:  ~/.cloudflared/config.yml"
echo ""
echo "  Now run: ./start.sh"
echo "=========================================="
