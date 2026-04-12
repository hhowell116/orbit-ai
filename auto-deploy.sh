#!/bin/bash
# Auto-deploy script for Orbit AI
# Checks GitHub every 60 seconds for new commits, pulls, rebuilds, and restarts
# Run once: nohup ./auto-deploy.sh &

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

    # Restart broker
    echo "$(date) - Restarting broker..." | tee -a "$LOG_FILE"
    if [ -f "./stop.sh" ]; then
      ./stop.sh 2>&1 | tee -a "$LOG_FILE"
    fi
    if [ -f "./start.sh" ]; then
      ./start.sh 2>&1 | tee -a "$LOG_FILE"
    fi

    echo "$(date) - Deploy complete! $(git log --oneline -1)" | tee -a "$LOG_FILE"
  fi

  sleep "$CHECK_INTERVAL"
done
