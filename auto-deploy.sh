#!/bin/bash
# Auto-deploy script for Orbit AI
# Checks GitHub every 60 seconds for new commits, pulls, rebuilds, and restarts broker
# The Cloudflare tunnel stays running — only the broker restarts on deploy
# Run once: nohup ./auto-deploy.sh &

export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$REPO_DIR/deploy.log"
CHECK_INTERVAL=60

echo "$(date) - Auto-deploy started. Watching $REPO_DIR" | tee -a "$LOG_FILE"

while true; do
  cd "$REPO_DIR"

  # Fetch latest from GitHub
  git fetch origin main --quiet 2>/dev/null

  # Check if there are new commits
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse origin/main)

  if [ "$LOCAL" != "$REMOTE" ]; then
    echo "$(date) - New commits detected. Deploying..." | tee -a "$LOG_FILE"

    # Pull changes
    git pull origin main --quiet 2>&1 | tee -a "$LOG_FILE"

    # Install dependencies if package.json changed
    if git diff "$LOCAL" "$REMOTE" --name-only | grep -q "package.json"; then
      echo "$(date) - Dependencies changed, reinstalling..." | tee -a "$LOG_FILE"
      cd packages/broker && bun install 2>&1 | tee -a "$LOG_FILE" && cd ../..
      cd packages/dashboard && npm install 2>&1 | tee -a "$LOG_FILE" && cd ../..
    fi

    # Rebuild dashboard
    echo "$(date) - Building dashboard..." | tee -a "$LOG_FILE"
    cd packages/dashboard && npx vite build 2>&1 | tee -a "$LOG_FILE" && cd ../..

    # Restart only the broker (tunnel stays running)
    echo "$(date) - Restarting broker..." | tee -a "$LOG_FILE"
    kill $(lsof -ti:5000) 2>/dev/null || true
    sleep 1

    cd "$REPO_DIR/packages/broker"
    nohup bun run src/index.ts > /tmp/orbit-broker.log 2>&1 &
    sleep 1

    if curl -sf http://localhost:5000/health > /dev/null 2>&1; then
      echo "$(date) - Deploy complete! $(git log --oneline -1)" | tee -a "$LOG_FILE"
    else
      echo "$(date) - WARNING: Broker may have failed to start. Check /tmp/orbit-broker.log" | tee -a "$LOG_FILE"
    fi
  fi

  sleep "$CHECK_INTERVAL"
done
