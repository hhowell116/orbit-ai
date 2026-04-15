// Automatic file locking via filesystem watcher
// Watches project directories for changes and auto-locks files for the active user

import { watch, statSync, readdirSync, type FSWatcher } from "fs";
import { join, relative } from "path";
import { db } from "./db";

type BroadcastFn = (event: string, data: unknown) => void;
type TerminalWarningFn = (userId: string, projectId: string, message: string) => void;

interface WatcherEntry {
  watchers: FSWatcher[]; // one per directory (recursive: true is unreliable on Linux)
  projectId: string;
  projectPath: string;
  userId: string;
  sessionId: string;
  lockedFiles: Set<string>;
}

const activeWatchers = new Map<string, WatcherEntry>(); // sessionKey → watcher
let broadcastFn: BroadcastFn = () => {};
let terminalWarningFn: TerminalWarningFn = () => {};

// Set the broadcast function (called from index.ts at startup)
export function setFilewatcherBroadcast(fn: BroadcastFn) {
  broadcastFn = fn;
}

// Set the terminal warning function (sends a warning directly to a user's terminal)
export function setTerminalWarningFn(fn: TerminalWarningFn) {
  terminalWarningFn = fn;
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
  /CLAUDE\.md$/,
];

function shouldIgnore(filePath: string): boolean {
  return IGNORED_PATTERNS.some((p) => p.test(filePath));
}

// Handle a detected file change — lock the file and log activity
function handleFileChange(
  key: string, projectId: string, projectPath: string,
  userId: string, sessionId: string, filePath: string,
) {
  const entry = activeWatchers.get(key);
  if (!entry) return;

  // Skip if already locked by this user
  if (entry.lockedFiles.has(filePath)) return;

  // Check if locked by someone else
  const existing = db
    .query("SELECT user_id FROM file_locks WHERE project_id = ? AND file_path = ?")
    .get(projectId, filePath) as { user_id: string } | null;

  if (existing && existing.user_id !== userId) {
    // Someone else has this locked — warn the user who tried to edit it
    const lockOwner = db
      .query("SELECT u.display_name FROM users u WHERE u.id = ?")
      .get(existing.user_id) as { display_name: string } | null;
    const ownerName = lockOwner?.display_name || "another user";
    const shortFile = filePath.split("/").pop() || filePath;

    console.log(`[filewatcher] CONFLICT: ${userId} edited ${filePath} locked by ${existing.user_id}`);

    terminalWarningFn(
      userId, projectId,
      `${shortFile} is locked by ${ownerName} — your edit may be overwritten. Coordinate with your team before editing this file.`
    );

    broadcastFn("lock.conflict", {
      project_id: projectId, file_path: filePath,
      locked_by: existing.user_id, locked_by_name: ownerName, edited_by: userId,
    });

    db.run(
      "INSERT INTO activity (project_id, user_id, session_id, event_type, file_path, detail) VALUES (?, ?, ?, 'lock.conflict', ?, ?)",
      [projectId, userId, sessionId, filePath, JSON.stringify({ locked_by: existing.user_id, locked_by_name: ownerName })]
    );
    return;
  }

  // Auto-lock the file
  db.run(
    `INSERT OR REPLACE INTO file_locks (project_id, file_path, user_id, session_id) VALUES (?, ?, ?, ?)`,
    [projectId, filePath, userId, sessionId]
  );
  entry.lockedFiles.add(filePath);

  const lock = db
    .query("SELECT fl.*, u.display_name as user_display_name FROM file_locks fl LEFT JOIN users u ON u.id = fl.user_id WHERE fl.project_id = ? AND fl.file_path = ?")
    .get(projectId, filePath);

  broadcastFn("lock.acquired", lock);

  db.run(
    "INSERT INTO activity (project_id, user_id, session_id, event_type, file_path) VALUES (?, ?, ?, 'file.edited', ?)",
    [projectId, userId, sessionId, filePath]
  );

  console.log(`[filewatcher] Auto-locked: ${filePath} for ${userId}`);
}

// Directories to skip when creating watchers
const WATCH_IGNORE_DIRS = new Set([
  "node_modules", ".git", "__pycache__", ".cache", ".next",
  ".nuxt", ".svelte-kit", ".turbo", "coverage", ".nyc_output",
  "dist", "build", ".output",
]);

// Start watching a project directory for a user's terminal session
// Uses per-directory watchers because recursive: true is unreliable on Linux/Bun
export function startWatching(
  projectId: string,
  projectPath: string,
  userId: string,
  sessionId: string,
): void {
  const key = `${userId}:${projectId}`;
  if (activeWatchers.has(key)) return;

  const allWatchers: FSWatcher[] = [];

  function watchDir(dirPath: string) {
    try {
      const watcher = watch(dirPath, (eventType, filename) => {
        if (!filename) return;
        if (shouldIgnore(filename)) return;

        const fullPath = join(dirPath, filename);
        const filePath = relative(projectPath, fullPath).replace(/\\/g, "/");

        // Skip directories and deleted files
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) return;
        } catch {
          return;
        }

        handleFileChange(key, projectId, projectPath, userId, sessionId, filePath);
      });
      allWatchers.push(watcher);

      // Recurse into subdirectories
      const entries = readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !WATCH_IGNORE_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          watchDir(join(dirPath, entry.name));
        }
      }
    } catch {}
  }

  watchDir(projectPath);

  activeWatchers.set(key, {
    watchers: allWatchers,
    projectId,
    projectPath,
    userId,
    sessionId,
    lockedFiles: new Set(),
  });

  console.log(`[filewatcher] Watching ${projectPath} (${allWatchers.length} dirs) for user ${userId}`);
}

// Periodic rescan: check for recently modified files and auto-lock them
// This catches edits that fs.watch missed (new directories, race conditions, etc.)
function rescanForEdits(entry: WatcherEntry, key: string) {
  const { projectId, projectPath, userId, sessionId } = entry;
  const cutoff = Date.now() - 15000; // files modified in last 15 seconds

  function scanDir(dirPath: string, depth: number) {
    if (depth > 8) return;
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          if (WATCH_IGNORE_DIRS.has(e.name) || e.name.startsWith(".")) continue;
          scanDir(join(dirPath, e.name), depth + 1);
        } else {
          if (shouldIgnore(e.name)) continue;
          try {
            const fullPath = join(dirPath, e.name);
            const stat = statSync(fullPath);
            if (stat.mtimeMs > cutoff) {
              const filePath = relative(projectPath, fullPath).replace(/\\/g, "/");
              handleFileChange(key, projectId, projectPath, userId, sessionId, filePath);
            }
          } catch {}
        }
      }
    } catch {}
  }

  scanDir(projectPath, 0);
}

// Run rescan every 3 seconds for all active watchers
setInterval(() => {
  for (const [key, entry] of activeWatchers) {
    rescanForEdits(entry, key);
  }
}, 3000);

// Stop watching and release all locks for a user's session
export function stopWatching(userId: string, projectId: string): void {
  const key = `${userId}:${projectId}`;
  const entry = activeWatchers.get(key);
  if (!entry) return;

  // Close all watchers
  for (const w of entry.watchers) {
    try { w.close(); } catch {}
  }

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
