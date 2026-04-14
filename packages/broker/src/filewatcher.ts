// Automatic file locking via filesystem watcher
// Watches project directories for changes and auto-locks files for the active user

import { watch, type FSWatcher } from "fs";
import { join, relative } from "path";
import { db } from "./db";

type BroadcastFn = (event: string, data: unknown) => void;

interface WatcherEntry {
  watcher: FSWatcher;
  projectId: string;
  projectPath: string;
  userId: string;
  sessionId: string;
  lockedFiles: Set<string>;
}

const activeWatchers = new Map<string, WatcherEntry>(); // sessionKey → watcher
let broadcastFn: BroadcastFn = () => {};

// Set the broadcast function (called from index.ts at startup)
export function setFilewatcherBroadcast(fn: BroadcastFn) {
  broadcastFn = fn;
}

// Ignored patterns — don't lock these
const IGNORED_PATTERNS = [
  /node_modules/,
  /\.git\//,
  /\.git$/,
  /\.DS_Store/,
  /__pycache__/,
  /\.pyc$/,
  /\.swp$/,
  /\.swo$/,
  /~$/,
  /\.lock$/,
  /package-lock\.json/,
  /bun\.lockb/,
  /\.env/,
];

function shouldIgnore(filePath: string): boolean {
  return IGNORED_PATTERNS.some((p) => p.test(filePath));
}

// Start watching a project directory for a user's terminal session
export function startWatching(
  projectId: string,
  projectPath: string,
  userId: string,
  sessionId: string,
): void {
  const key = `${userId}:${projectId}`;

  // Already watching for this user+project
  if (activeWatchers.has(key)) return;

  try {
    const watcher = watch(projectPath, { recursive: true }, (eventType, filename) => {
      if (!filename || eventType !== "change") return;
      if (shouldIgnore(filename)) return;

      const filePath = filename.replace(/\\/g, "/"); // Normalize Windows paths

      const entry = activeWatchers.get(key);
      if (!entry) return;

      // Skip if already locked by this user
      if (entry.lockedFiles.has(filePath)) return;

      // Check if locked by someone else
      const existing = db
        .query("SELECT user_id FROM file_locks WHERE project_id = ? AND file_path = ?")
        .get(projectId, filePath) as { user_id: string } | null;

      if (existing && existing.user_id !== userId) {
        // Someone else has this locked — don't override, just log
        console.log(`[filewatcher] ${filePath} locked by another user, skipping`);
        return;
      }

      // Auto-lock the file
      db.run(
        `INSERT OR REPLACE INTO file_locks (project_id, file_path, user_id, session_id)
         VALUES (?, ?, ?, ?)`,
        [projectId, filePath, userId, sessionId]
      );

      entry.lockedFiles.add(filePath);

      const lock = db
        .query("SELECT fl.*, u.display_name as user_display_name FROM file_locks fl LEFT JOIN users u ON u.id = fl.user_id WHERE fl.project_id = ? AND fl.file_path = ?")
        .get(projectId, filePath);

      broadcastFn("lock.acquired", lock);

      // Log file edit to activity feed
      db.run(
        "INSERT INTO activity (project_id, user_id, session_id, event_type, file_path) VALUES (?, ?, ?, 'file.edited', ?)",
        [projectId, userId, sessionId, filePath]
      );

      console.log(`[filewatcher] Auto-locked: ${filePath} for ${userId}`);
    });

    activeWatchers.set(key, {
      watcher,
      projectId,
      projectPath,
      userId,
      sessionId,
      lockedFiles: new Set(),
    });

    console.log(`[filewatcher] Watching ${projectPath} for user ${userId}`);
  } catch (err) {
    console.error(`[filewatcher] Failed to watch ${projectPath}:`, err);
  }
}

// Stop watching and release all locks for a user's session
export function stopWatching(userId: string, projectId: string): void {
  const key = `${userId}:${projectId}`;
  const entry = activeWatchers.get(key);
  if (!entry) return;

  // Close the watcher
  try { entry.watcher.close(); } catch {}

  // Release all locks held by this session
  const locks = db
    .query("SELECT * FROM file_locks WHERE project_id = ? AND user_id = ? AND session_id = ?")
    .all(entry.projectId, entry.userId, entry.sessionId);

  db.run(
    "DELETE FROM file_locks WHERE project_id = ? AND user_id = ? AND session_id = ?",
    [entry.projectId, entry.userId, entry.sessionId]
  );

  for (const lock of locks) {
    broadcastFn("lock.released", lock);
  }

  activeWatchers.delete(key);
  console.log(`[filewatcher] Stopped watching ${entry.projectPath}, released ${locks.length} locks`);
}

// Release all locks for a user across all projects
export function stopAllWatching(userId: string): void {
  for (const [key, entry] of activeWatchers) {
    if (entry.userId === userId) {
      stopWatching(userId, entry.projectId);
    }
  }
}

// Get count of active watchers (for debugging)
export function getWatcherCount(): number {
  return activeWatchers.size;
}
