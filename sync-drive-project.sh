#!/bin/bash
# Sync a Google Drive folder into an Orbit AI local project with bi-directional
# sync every 5 minutes. Idempotent — safe to re-run.
#
# Usage:  ./sync-drive-project.sh "<Drive Folder Name>" [local-slug]
#
# The Drive folder must already exist inside Dev Projects (the rclone remote
# `gdrive:` is rooted at Dev Projects in the IT Applications shared drive).
#
# Example:
#   ./sync-drive-project.sh "RCO Launch Hub"
#   → local dir  /home/rowecasa/orbit-ai/projects/rco-launch-hub
#   → drive path gdrive:RCO Launch Hub
#   → systemd    orbit-bisync-rco-launch-hub.timer  (fires every 5 min)
#
# After running, add the local path as a project in the Orbit AI dashboard.

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 \"<Drive Folder Name>\" [local-slug]"
  echo ""
  echo "Available Drive folders in Dev Projects:"
  /home/rowecasa/.local/bin/rclone lsf --dirs-only gdrive: 2>/dev/null | sed 's|/$||; s|^|  |'
  exit 1
fi

DRIVE_FOLDER="$1"
DEFAULT_SLUG=$(echo "$DRIVE_FOLDER" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-' | sed 's/--*/-/g; s/^-//; s/-$//')
LOCAL_SLUG="${2:-$DEFAULT_SLUG}"
LOCAL_PATH="/home/rowecasa/orbit-ai/projects/$LOCAL_SLUG"
SERVICE_NAME="orbit-bisync-$LOCAL_SLUG"
SYSTEMD_DIR="/home/rowecasa/.config/systemd/user"
FILTERS="/home/rowecasa/.config/rclone/bisync-filters.txt"
RCLONE="/home/rowecasa/.local/bin/rclone"

if [ -L "$LOCAL_PATH" ]; then
  echo "ERROR: $LOCAL_PATH is a symlink."
  echo "Symlinks into the FUSE mount crash the broker. Remove it first:"
  echo "  rm $LOCAL_PATH"
  exit 1
fi

mkdir -p "$LOCAL_PATH" "$SYSTEMD_DIR"

echo "→ Validating Drive folder 'gdrive:$DRIVE_FOLDER' ..."
if ! $RCLONE lsd "gdrive:$DRIVE_FOLDER" >/dev/null 2>&1; then
  echo "ERROR: 'gdrive:$DRIVE_FOLDER' not found or inaccessible."
  echo "Available folders:"
  $RCLONE lsf --dirs-only gdrive: | sed 's|/$||; s|^|  |'
  exit 1
fi

# Detect whether this is the first sync for this project (no workdir state yet).
WORKDIR="$HOME/.cache/rclone/bisync"
STATE_PREFIX=$(echo -n "gdrive:$DRIVE_FOLDER..$LOCAL_PATH" | md5sum | awk '{print $1}')
if ls "$WORKDIR"/*"$STATE_PREFIX"* >/dev/null 2>&1; then
  FIRST_RUN=0
  echo "→ Existing bisync state found — running incremental sync."
else
  FIRST_RUN=1
  echo "→ No prior state — running initial --resync (pulls Drive → local, pushes local-only files up)."
fi

BISYNC_ARGS=(
  --filters-file "$FILTERS"
  --create-empty-src-dirs
  --conflict-resolve newer
  --conflict-loser delete
  --max-lock 15m
)
if [ "$FIRST_RUN" = "1" ]; then
  BISYNC_ARGS+=(--resync)
fi

$RCLONE bisync "${BISYNC_ARGS[@]}" "gdrive:$DRIVE_FOLDER" "$LOCAL_PATH"

echo "→ Writing systemd unit and timer ..."
cat > "$SYSTEMD_DIR/$SERVICE_NAME.service" <<EOF
[Unit]
Description=Bisync '$DRIVE_FOLDER' between Google Drive and local project
After=rclone-gdrive.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=$RCLONE bisync \\
  --filters-file $FILTERS \\
  --create-empty-src-dirs \\
  --conflict-resolve newer \\
  --conflict-loser delete \\
  --max-lock 15m \\
  "gdrive:$DRIVE_FOLDER" "$LOCAL_PATH"
Environment=HOME=/home/rowecasa
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME
EOF

cat > "$SYSTEMD_DIR/$SERVICE_NAME.timer" <<EOF
[Unit]
Description=Bisync '$DRIVE_FOLDER' every 5 minutes
After=rclone-gdrive.service

[Timer]
OnBootSec=4m
OnUnitInactiveSec=5m
AccuracySec=30s
Unit=$SERVICE_NAME.service

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now "$SERVICE_NAME.timer" >/dev/null 2>&1

cat <<EOF

✓ Synced and scheduled.

  Drive folder:    gdrive:$DRIVE_FOLDER
  Local path:      $LOCAL_PATH
  Files synced:    $(find "$LOCAL_PATH" -type f | wc -l)
  Timer:           $SERVICE_NAME.timer (fires every 5 min)

  Force sync now:  systemctl --user start $SERVICE_NAME
  View logs:       journalctl --user -u $SERVICE_NAME -f
  Disable:         systemctl --user disable --now $SERVICE_NAME.timer

Next step: add this project in the Orbit AI dashboard pointing at:
  $LOCAL_PATH
EOF
