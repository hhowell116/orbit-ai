import { Database } from "bun:sqlite";
import { join } from "path";
import { encrypt, isEncrypted, legacyDecrypt, removeLegacyKeyFile } from "./crypto";

const DB_PATH = process.env.DB_PATH || join(import.meta.dir, "..", "team.db");

const db = new Database(DB_PATH, { create: true });

// Enable WAL mode for better concurrent read performance
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME
  );

  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    owner_id TEXT NOT NULL,
    anthropic_api_key TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS team_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(team_id, user_id),
    FOREIGN KEY (team_id) REFERENCES teams(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS team_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    created_by TEXT NOT NULL,
    max_uses INTEGER DEFAULT NULL,
    use_count INTEGER DEFAULT 0,
    expires_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    path TEXT UNIQUE NOT NULL,
    opencode_port INTEGER UNIQUE NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT,
    status TEXT DEFAULT 'idle',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS file_locks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    user_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    line_start INTEGER,
    line_end INTEGER,
    locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, file_path),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    file_path TEXT,
    line_start INTEGER,
    line_end INTEGER,
    detail TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS token_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    model TEXT,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      token TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, provider),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

// Run migrations for columns added after initial schema
function runMigrations() {
  const projectCols = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
  if (!projectCols.find((c) => c.name === "team_id")) {
    db.exec("ALTER TABLE projects ADD COLUMN team_id TEXT REFERENCES teams(id)");
  }

  const userCols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!userCols.find((c) => c.name === "email")) {
    db.exec("ALTER TABLE users ADD COLUMN email TEXT");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL");
  }

  const teamCols = db.prepare("PRAGMA table_info(teams)").all() as { name: string }[];
  if (!teamCols.find((c) => c.name === "claude_auth_method")) {
    db.exec("ALTER TABLE teams ADD COLUMN claude_auth_method TEXT DEFAULT 'api_key'");
  }
  if (!teamCols.find((c) => c.name === "github_token")) {
    db.exec("ALTER TABLE teams ADD COLUMN github_token TEXT");
  }
  if (!teamCols.find((c) => c.name === "rules")) {
    db.exec("ALTER TABLE teams ADD COLUMN rules TEXT");
  }

  // Project rules
  if (!projectCols.find((c) => c.name === "rules")) {
    db.exec("ALTER TABLE projects ADD COLUMN rules TEXT");
  }
}

runMigrations();

// Migrate tokens to per-user encryption keys.
// Handles: plaintext → per-user encrypted, and legacy global-key encrypted → per-user encrypted.
function migrateToPerUserEncryption() {
  // Check if migration already ran
  db.exec("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, ran_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  const migrated = db.query("SELECT 1 FROM _migrations WHERE name = 'per_user_encryption'").get();
  if (migrated) return;

  console.log("[crypto] Migrating to per-user encryption keys...");

  // Migrate user_connections tokens
  const conns = db.prepare("SELECT rowid, user_id, token FROM user_connections").all() as {
    rowid: number; user_id: string; token: string;
  }[];
  for (const conn of conns) {
    if (!conn.token) continue;
    let plaintext: string;
    if (!isEncrypted(conn.token)) {
      // Plaintext token — use directly
      plaintext = conn.token;
    } else {
      // Encrypted with old global key — decrypt first
      try {
        plaintext = legacyDecrypt(conn.token);
      } catch {
        console.warn(`[crypto] Could not decrypt token for user ${conn.user_id} (rowid ${conn.rowid}), skipping`);
        continue;
      }
    }
    // Re-encrypt with per-user derived key
    const reEncrypted = encrypt(plaintext, conn.user_id);
    db.run("UPDATE user_connections SET token = ? WHERE rowid = ?", [reEncrypted, conn.rowid]);
    console.log(`[crypto] Re-encrypted token for user ${conn.user_id} (${conn.rowid})`);
  }

  // Migrate legacy team-level keys (use team owner as the userId)
  const teams = db.prepare("SELECT id, owner_id, anthropic_api_key, github_token FROM teams").all() as {
    id: string; owner_id: string; anthropic_api_key: string | null; github_token: string | null;
  }[];
  for (const team of teams) {
    if (team.anthropic_api_key) {
      let plaintext: string;
      if (!isEncrypted(team.anthropic_api_key)) {
        plaintext = team.anthropic_api_key;
      } else {
        try { plaintext = legacyDecrypt(team.anthropic_api_key); } catch { continue; }
      }
      db.run("UPDATE teams SET anthropic_api_key = ? WHERE id = ?", [encrypt(plaintext, team.owner_id), team.id]);
    }
    if (team.github_token) {
      let plaintext: string;
      if (!isEncrypted(team.github_token)) {
        plaintext = team.github_token;
      } else {
        try { plaintext = legacyDecrypt(team.github_token); } catch { continue; }
      }
      db.run("UPDATE teams SET github_token = ? WHERE id = ?", [encrypt(plaintext, team.owner_id), team.id]);
    }
  }

  db.run("INSERT INTO _migrations (name) VALUES ('per_user_encryption')");
  console.log("[crypto] Per-user encryption migration complete.");

  // Clean up the legacy key file from disk
  removeLegacyKeyFile();
}
migrateToPerUserEncryption();

export { db };
export type { Database };
