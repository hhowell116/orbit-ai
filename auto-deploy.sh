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
CLAUDE_UPDATE_STAMP="$REPO_DIR/.claude-update-stamp"

echo "$(date) - Auto-deploy started. Watching $REPO_DIR" | tee -a "$LOG_FILE"

while true; do
  cd "$REPO_DIR"

  # Fetch latest from GitHub
  git fetch origin main --quiet 2>/dev/null

  # Only deploy when remote has commits we don't have
  BEHIND=$(git rev-list HEAD..origin/main --count 2>/dev/null || echo 0)

  if [ "$BEHIND" -gt 0 ]; then
    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse origin/main)
    echo "$(date) - $BEHIND new commit(s) detected. Deploying..." | tee -a "$LOG_FILE"

    # Hard-reset to match GitHub exactly (this VM is a deploy target)
    git reset --hard origin/main 2>&1 | tee -a "$LOG_FILE"

    # Install dependencies if package.json changed
    if git diff "$LOCAL" "$REMOTE" --name-only | grep -q "package.json"; then
      echo "$(date) - Dependencies changed, reinstalling..." | tee -a "$LOG_FILE"
      cd packages/broker && bun install 2>&1 | tee -a "$LOG_FILE" && cd ../..
      cd packages/dashboard && npm install 2>&1 | tee -a "$LOG_FILE" && cd ../..
    fi

    # Rebuild dashboard
    echo "$(date) - Building dashboard..." | tee -a "$LOG_FILE"
    cd packages/dashboard && npx vite build 2>&1 | tee -a "$LOG_FILE" && cd ../..

    # Restart broker via systemd (tunnel is also managed by systemd)
    echo "$(date) - Restarting broker via systemd..." | tee -a "$LOG_FILE"
    systemctl --user restart orbit-broker.service
    sleep 2

    if curl -sf http://localhost:5000/health > /dev/null 2>&1; then
      echo "$(date) - Deploy complete! $(git log --oneline -1)" | tee -a "$LOG_FILE"
    else
      echo "$(date) - WARNING: Broker may have failed to start. Check: journalctl --user -u orbit-broker -n 50" | tee -a "$LOG_FILE"
    fi

    # Force Claude Code update on next cycle after deploy (migration to native installer)
    rm -f "$CLAUDE_UPDATE_STAMP"
  fi

  # Periodic tunnel health check via systemd (every poll cycle)
  if ! systemctl --user is-active --quiet cloudflared-tunnel.service; then
    echo "$(date) - Tunnel not running, restarting via systemd..." | tee -a "$LOG_FILE"
    systemctl --user restart cloudflared-tunnel.service
    sleep 2
    echo "$(date) - Tunnel restarted via systemd" | tee -a "$LOG_FILE"
  fi

  # Daily Claude Code auto-update — runs once every 24 hours
  NEED_UPDATE=false
  if [ ! -f "$CLAUDE_UPDATE_STAMP" ]; then
    NEED_UPDATE=true
  else
    LAST_UPDATE=$(cat "$CLAUDE_UPDATE_STAMP" 2>/dev/null || echo 0)
    NOW=$(date +%s)
    ELAPSED=$(( NOW - LAST_UPDATE ))
    if [ "$ELAPSED" -ge 86400 ]; then
      NEED_UPDATE=true
    fi
  fi

  if [ "$NEED_UPDATE" = true ]; then
    echo "$(date) - Running daily Claude Code update..." | tee -a "$LOG_FILE"
    # Use native installer instead of npm (suppresses deprecation warning)
    if command -v claude &>/dev/null && claude --version &>/dev/null; then
      claude update 2>&1 | tee -a "$LOG_FILE" || true
    else
      # First-time migration: uninstall npm version, install native
      npm uninstall -g @anthropic-ai/claude-code 2>&1 | tee -a "$LOG_FILE" || true
      curl -fsSL https://cli.anthropic.com/install.sh | sh 2>&1 | tee -a "$LOG_FILE"
    fi
    date +%s > "$CLAUDE_UPDATE_STAMP"
    echo "$(date) - Claude Code update complete." | tee -a "$LOG_FILE"
  fi

  sleep "$CHECK_INTERVAL"
done
