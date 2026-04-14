// Terminal session manager — spawns per-user PTY sessions
// Each user gets isolated Claude Code with their own subscription

import { db } from "./db";
import { decrypt } from "./crypto";
import { mkdirSync, existsSync, writeFileSync } from "fs";
import { join } from "path";

const USERS_DATA_DIR = process.env.USERS_DATA_DIR || join(import.meta.dir, "..", "..", "..", "user-data");

interface TerminalSession {
  pty: any; // node-pty IPty
  userId: string;
  projectId: string | null;
  lastActivity: number;
  buffer: string[]; // last N lines for reconnection
}

const sessions = new Map<string, TerminalSession>();
const MAX_BUFFER_LINES = 500;

// Ensure user data directory exists with their Claude config
function ensureUserDir(userId: string): string {
  const userDir = join(USERS_DATA_DIR, userId);
  const claudeDir = join(userDir, ".claude-config");
  if (!existsSync(userDir)) mkdirSync(userDir, { recursive: true });
  if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });

  // Pre-populate onboarding bypass so Claude Code doesn't show the wizard
  const claudeJson = join(claudeDir, ".claude.json");
  if (!existsSync(claudeJson)) {
    writeFileSync(claudeJson, JSON.stringify({
      hasCompletedOnboarding: true,
    }));
  }

  return claudeDir;
}

// Get user's Claude token (setup token or API key)
function getUserClaudeToken(userId: string): { token: string; type: "oauth" | "apikey" } | null {
  const conn = db.query("SELECT token FROM user_connections WHERE user_id = ? AND provider = 'claude'")
    .get(userId) as { token: string } | null;
  if (!conn?.token) return null;

  try {
    const decrypted = decrypt(conn.token);
    // Setup tokens start with sk-ant-oat
    if (decrypted.startsWith("sk-ant-oat")) {
      return { token: decrypted, type: "oauth" };
    }
    // API keys start with sk-ant-api
    return { token: decrypted, type: "apikey" };
  } catch {
    return null;
  }
}

// Get the session key for a user
function sessionKey(userId: string, projectId?: string): string {
  return projectId ? `${userId}:${projectId}` : userId;
}

// Create or get a terminal session
export function createSession(
  userId: string,
  projectId: string | null,
  cols: number = 80,
  rows: number = 24,
): TerminalSession | null {
  const key = sessionKey(userId, projectId || undefined);

  // Return existing session if active
  const existing = sessions.get(key);
  if (existing) {
    existing.lastActivity = Date.now();
    return existing;
  }

  // Get user's Claude token
  const claudeAuth = getUserClaudeToken(userId);

  // Set up isolated config directory
  const claudeConfigDir = ensureUserDir(userId);

  // Determine working directory
  let cwd = USERS_DATA_DIR;
  if (projectId) {
    const project = db.query("SELECT path FROM projects WHERE id = ?").get(projectId) as { path: string } | null;
    if (project?.path && existsSync(project.path)) {
      cwd = project.path;
    }
  }

  // Build environment
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    CLAUDE_CONFIG_DIR: claudeConfigDir,
    HOME: join(USERS_DATA_DIR, userId),
  };

  // Set auth based on token type
  if (claudeAuth) {
    if (claudeAuth.type === "oauth") {
      env.CLAUDE_CODE_OAUTH_TOKEN = claudeAuth.token;
    } else {
      env.ANTHROPIC_API_KEY = claudeAuth.token;
    }
  }

  try {
    // Try to load node-pty
    let pty: any;
    try {
      const nodePty = require("node-pty");
      const shell = process.platform === "win32" ? "powershell.exe" : (process.env.SHELL || "/bin/bash");
      pty = nodePty.spawn(shell, [], {
        name: "xterm-256color",
        cols,
        rows,
        cwd,
        env,
      });
    } catch (ptyErr) {
      // Fallback: use Bun.spawn with basic pipe (no PTY, but functional)
      console.warn("[terminal] node-pty not available, falling back to Bun.spawn:", ptyErr);
      const shell = process.env.SHELL || "/bin/bash";
      const proc = Bun.spawn([shell], {
        cwd,
        env,
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });

      // Create a PTY-like interface
      pty = {
        pid: proc.pid,
        onData: (cb: (data: string) => void) => {
          // Read stdout
          const reader = proc.stdout.getReader();
          (async () => {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              cb(new TextDecoder().decode(value));
            }
          })();
          // Read stderr
          const errReader = proc.stderr.getReader();
          (async () => {
            while (true) {
              const { done, value } = await errReader.read();
              if (done) break;
              cb(new TextDecoder().decode(value));
            }
          })();
        },
        write: (data: string) => {
          proc.stdin.write(new TextEncoder().encode(data));
        },
        resize: (_cols: number, _rows: number) => {
          // No resize support in basic spawn mode
        },
        kill: () => {
          proc.kill();
        },
      };
    }

    const session: TerminalSession = {
      pty,
      userId,
      projectId,
      lastActivity: Date.now(),
      buffer: [],
    };

    // Buffer output for reconnection
    pty.onData((data: string) => {
      session.buffer.push(data);
      if (session.buffer.length > MAX_BUFFER_LINES) {
        session.buffer = session.buffer.slice(-MAX_BUFFER_LINES);
      }
      session.lastActivity = Date.now();
    });

    sessions.set(key, session);
    console.log(`[terminal] Created session for user ${userId}${projectId ? ` in project ${projectId}` : ''}`);
    return session;
  } catch (err) {
    console.error("[terminal] Failed to create session:", err);
    return null;
  }
}

// Get an existing session
export function getSession(userId: string, projectId?: string): TerminalSession | null {
  return sessions.get(sessionKey(userId, projectId)) || null;
}

// Destroy a session
export function destroySession(userId: string, projectId?: string) {
  const key = sessionKey(userId, projectId);
  const session = sessions.get(key);
  if (session) {
    try { session.pty.kill(); } catch {}
    sessions.delete(key);
    console.log(`[terminal] Destroyed session ${key}`);
  }
}

// Resize a session
export function resizeSession(userId: string, cols: number, rows: number, projectId?: string) {
  const session = sessions.get(sessionKey(userId, projectId));
  if (session) {
    try { session.pty.resize(cols, rows); } catch {}
  }
}

// Get buffered output for reconnection
export function getSessionBuffer(userId: string, projectId?: string): string[] {
  const session = sessions.get(sessionKey(userId, projectId));
  return session?.buffer || [];
}

// Clean up idle sessions (call periodically)
export function cleanupIdleSessions(maxIdleMs: number = 30 * 60 * 1000) {
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (now - session.lastActivity > maxIdleMs) {
      try { session.pty.kill(); } catch {}
      sessions.delete(key);
      console.log(`[terminal] Cleaned up idle session ${key}`);
    }
  }
}

// Start cleanup interval
setInterval(() => cleanupIdleSessions(), 5 * 60 * 1000);
