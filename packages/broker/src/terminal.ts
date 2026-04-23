// Terminal session manager — spawns per-user PTY sessions
// Uses a Node.js worker with TCP socket because:
// 1. node-pty doesn't work under Bun (PTY gets SIGHUP'd immediately)
// 2. Bun's stdout pipes break with long-running subprocesses

import { db } from "./db";
import { decrypt } from "./crypto";
import { mkdirSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { spawn } from "bun";
import { connect } from "net";

const USERS_DATA_DIR = process.env.USERS_DATA_DIR || join(import.meta.dir, "..", "..", "..", "user-data");

interface TerminalSession {
  pty: {
    pid: number;
    onData: (cb: (data: string) => void) => void;
    write: (data: string) => void;
    resize: (cols: number, rows: number) => void;
    kill: () => void;
  };
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

  const claudeJson = join(claudeDir, ".claude.json");
  if (!existsSync(claudeJson)) {
    writeFileSync(claudeJson, JSON.stringify({ hasCompletedOnboarding: true }));
  }

  // Custom prompt so users don't see the VM hostname
  const bashrc = join(userDir, ".bashrc");
  if (!existsSync(bashrc)) {
    writeFileSync(bashrc, [
      'export PS1="\\[\\e[38;2;250;178;131m\\]orbit\\[\\e[0m\\]:\\[\\e[38;2;92;156;245m\\]\\W\\[\\e[0m\\]$ "',
      'export TERM=xterm-256color',
    ].join("\n"));
  }

  return claudeDir;
}

// Get user's Claude token (setup token or API key)
function getUserClaudeToken(userId: string): { token: string; type: "oauth" | "apikey" } | null {
  const conn = db.query("SELECT token FROM user_connections WHERE user_id = ? AND provider = 'claude'")
    .get(userId) as { token: string } | null;
  if (!conn?.token) return null;

  try {
    const decrypted = decrypt(conn.token, userId);
    if (decrypted.startsWith("sk-ant-oat")) return { token: decrypted, type: "oauth" };
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
export async function createSession(
  userId: string,
  projectId: string | null,
  cols: number = 80,
  rows: number = 24,
): Promise<TerminalSession | null> {
  const key = sessionKey(userId, projectId || undefined);

  // Return existing session if active
  const existing = sessions.get(key);
  if (existing) {
    existing.lastActivity = Date.now();
    return existing;
  }

  const claudeAuth = getUserClaudeToken(userId);
  const claudeConfigDir = ensureUserDir(userId);
  const userHome = join(USERS_DATA_DIR, userId);

  let cwd = USERS_DATA_DIR;
  if (projectId) {
    const project = db.query("SELECT path FROM projects WHERE id = ?").get(projectId) as { path: string } | null;
    if (project?.path && existsSync(project.path)) {
      cwd = project.path;
    }
  }

  // Build PTY environment — start from process.env but strip sensitive broker vars
  const SENSITIVE_VARS = [
    "ORBIT_MASTER_KEY", "ENCRYPTION_KEY", "ENCRYPTION_KEY_FILE",
    "JWT_SECRET", "DATABASE_URL", "DB_PATH",
  ];
  const baseEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !SENSITIVE_VARS.includes(k)) {
      baseEnv[k] = v;
    }
  }

  const env: Record<string, string> = {
    ...baseEnv,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    CLAUDE_CONFIG_DIR: claudeConfigDir,
    HOME: userHome,
    BASH_ENV: join(userHome, ".bashrc"),
    PTY_CWD: cwd,
    PTY_COLS: String(cols),
    PTY_ROWS: String(rows),
    PTY_PORT: "0",
    CLAUDE_SUPPRESS_INSTALLER_WARNING: "1",
    CLAUDE_CODE_SKIP_NPM_WARNING: "1",
    DISABLE_AUTOUPDATER: "1",
  };

  if (claudeAuth) {
    if (claudeAuth.type === "oauth") {
      env.CLAUDE_CODE_OAUTH_TOKEN = claudeAuth.token;
    } else {
      env.ANTHROPIC_API_KEY = claudeAuth.token;
    }
  }

  try {
    const workerPath = join(import.meta.dir, "pty-worker.cjs");
    const proc = spawn(["node", workerPath], {
      env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    // Read the single startup message to get the TCP port
    const reader = proc.stdout.getReader();
    const { value } = await reader.read();
    reader.releaseLock();
    const startupLine = new TextDecoder().decode(value).trim().split("\n")[0];
    const startupMsg = JSON.parse(startupLine);
    const tcpPort: number = startupMsg.port;
    const shellPid: number = startupMsg.pid;

    console.log(`[terminal] Worker started: tcpPort=${tcpPort} shellPid=${shellPid} cwd=${cwd}`);

    // Connect to the worker via TCP
    const dataListeners: ((data: string) => void)[] = [];

    const socket = connect({ port: tcpPort, host: "127.0.0.1" });
    socket.setKeepAlive(true, 60_000);
    socket.setNoDelay(true);

    socket.on("connect", () => {
      console.log(`[terminal] TCP connected to worker on port ${tcpPort}`);
    });

    let socketBuf = "";
    socket.on("data", (chunk: Buffer) => {
      socketBuf += chunk.toString();
      const lines = socketBuf.split("\n");
      socketBuf = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.t === "o") {
            for (const cb of dataListeners) {
              try { cb(msg.d); } catch {}
            }
          }
        } catch {}
      }
    });

    socket.on("error", (err: Error) => {
      console.error(`[terminal] TCP error for ${key}: ${err.message}`);
    });

    socket.on("close", () => {
      console.log(`[terminal] TCP closed for ${key}`);
      sessions.delete(key);
    });

    // Log worker stderr
    const errReader = proc.stderr.getReader();
    (async () => {
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value: val } = await errReader.read();
          if (done) break;
          console.error(`[terminal-worker] ${decoder.decode(val)}`);
        }
      } catch {}
    })();

    const socketWrite = (msg: string) => {
      try { socket.write(msg + "\n"); } catch {}
    };

    const session: TerminalSession = {
      pty: {
        pid: proc.pid,
        onData: (cb: (data: string) => void) => { dataListeners.push(cb); },
        write: (data: string) => { socketWrite(JSON.stringify({ t: "i", d: data })); },
        resize: (c: number, r: number) => { socketWrite(JSON.stringify({ t: "r", c, r })); },
        kill: () => { proc.kill(); },
      },
      userId,
      projectId,
      lastActivity: Date.now(),
      buffer: [],
    };

    // Buffer output for reconnection
    dataListeners.push((data: string) => {
      session.buffer.push(data);
      if (session.buffer.length > MAX_BUFFER_LINES) {
        session.buffer = session.buffer.slice(-MAX_BUFFER_LINES);
      }
      session.lastActivity = Date.now();
    });

    sessions.set(key, session);
    console.log(`[terminal] Session ready: ${key}`);
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
export function cleanupIdleSessions(maxIdleMs: number = 12 * 60 * 60 * 1000) {
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (now - session.lastActivity > maxIdleMs) {
      try { session.pty.kill(); } catch {}
      sessions.delete(key);
      console.log(`[terminal] Cleaned up idle session ${key}`);
    }
  }
}

setInterval(() => cleanupIdleSessions(), 5 * 60 * 1000);
