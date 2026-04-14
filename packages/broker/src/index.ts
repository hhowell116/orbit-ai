import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { stream } from "hono/streaming";
import { serveStatic } from "hono/bun";
import { db } from "./db";
import { authMiddleware, requireTeam, createToken, type JWTPayload } from "./auth";
import { join } from "path";
import { randomBytes } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { encrypt, decrypt } from "./crypto";

const DASHBOARD_DIR = join(import.meta.dir, "..", "..", "dashboard", "dist");

const app = new Hono();

// --- Middleware ---
app.use("*", cors());

// SSE client tracking for real-time broadcasts
type SSEClient = {
  send: (event: string, data: string) => void;
  close: () => void;
};
const sseClients = new Set<SSEClient>();

function broadcast(event: string, data: unknown) {
  const json = JSON.stringify(data);
  for (const client of sseClients) {
    try {
      client.send(event, json);
    } catch {
      sseClients.delete(client);
    }
  }
}

function generateInviteCode(): string {
  const bytes = randomBytes(4).toString("hex").toUpperCase();
  return `${bytes.slice(0, 4)}-${bytes.slice(4)}`;
}

function generateId(prefix: string, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${prefix}-${slug}-${randomBytes(3).toString("hex")}`;
}

// --- Health check ---
app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

// =============================================
// API ROUTES
// =============================================
const api = new Hono();

// --- Auth routes (no middleware) ---

api.post("/auth/signup", async (c) => {
  const { username, email, password, display_name } = await c.req.json<{
    username: string;
    email?: string;
    password: string;
    display_name: string;
  }>();

  if (!username || !password || !display_name) {
    return c.json({ error: "username, password, and display_name are required" }, 400);
  }

  // Check if username or email already exists
  const existing = db.query("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    return c.json({ error: "Username already taken" }, 409);
  }
  if (email) {
    const existingEmail = db.query("SELECT id FROM users WHERE email = ?").get(email);
    if (existingEmail) {
      return c.json({ error: "Email already registered" }, 409);
    }
  }

  const id = `user-${randomBytes(6).toString("hex")}`;
  const hash = await Bun.password.hash(password, { algorithm: "bcrypt", cost: 12 });

  db.run(
    "INSERT INTO users (id, username, display_name, password_hash, email) VALUES (?, ?, ?, ?, ?)",
    [id, username, display_name, hash, email || null]
  );

  const user = { id, username, display_name };
  const token = await createToken(user);
  return c.json({ token, user, teams: [] }, 201);
});

api.post("/auth/google", async (c) => {
  const { id_token } = await c.req.json<{ id_token: string }>();

  if (!id_token) return c.json({ error: "id_token is required" }, 400);

  // Verify the Firebase ID token using Google's public keys
  const { createRemoteJWKSet, jwtVerify } = await import("jose");
  const GOOGLE_JWKS = createRemoteJWKSet(
    new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
  );

  let payload: any;
  try {
    const result = await jwtVerify(id_token, GOOGLE_JWKS, {
      issuer: "https://securetoken.google.com/orbitai-dashboard",
      audience: "orbitai-dashboard",
    });
    payload = result.payload;
  } catch {
    return c.json({ error: "Invalid or expired Google token" }, 401);
  }

  const googleEmail = payload.email as string;
  const googleName = payload.name as string || googleEmail.split("@")[0];
  const googleUid = payload.sub as string;

  if (!googleEmail) return c.json({ error: "No email in Google token" }, 400);

  // Find or create user by email
  let user = db
    .query("SELECT id, username, display_name FROM users WHERE email = ?")
    .get(googleEmail) as { id: string; username: string; display_name: string } | null;

  if (!user) {
    // Create new user from Google profile
    const id = `user-${randomBytes(6).toString("hex")}`;
    const username = googleEmail.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "") + randomBytes(2).toString("hex");
    const hash = await Bun.password.hash(googleUid, { algorithm: "bcrypt", cost: 12 });

    db.run(
      "INSERT INTO users (id, username, display_name, password_hash, email) VALUES (?, ?, ?, ?, ?)",
      [id, username, googleName, hash, googleEmail]
    );

    user = { id, username, display_name: googleName };
  }

  // Get user's teams
  const teams = db
    .query(`
      SELECT t.id, t.name, t.slug, tm.role
      FROM teams t
      JOIN team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = ?
      ORDER BY t.name
    `)
    .all(user.id);

  const token = await createToken(user);
  return c.json({ token, user, teams });
});

api.post("/auth/login", async (c) => {
  const { username, password } = await c.req.json<{ username: string; password: string }>();

  const user = db
    .query("SELECT id, username, display_name, password_hash FROM users WHERE username = ?")
    .get(username) as { id: string; username: string; display_name: string; password_hash: string } | null;

  if (!user) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const valid = await Bun.password.verify(password, user.password_hash);
  if (!valid) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  // Get user's teams
  const teams = db
    .query(`
      SELECT t.id, t.name, t.slug, tm.role
      FROM teams t
      JOIN team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = ?
      ORDER BY t.name
    `)
    .all(user.id);

  const token = await createToken(user);
  return c.json({
    token,
    user: { id: user.id, username: user.username, display_name: user.display_name },
    teams,
  });
});

// --- Auth routes (require auth, no team needed) ---

api.get("/auth/me", authMiddleware, (c) => {
  const user = c.get("user") as JWTPayload;
  return c.json(user);
});

api.get("/auth/teams", authMiddleware, (c) => {
  const user = c.get("user") as JWTPayload;
  const teams = db
    .query(`
      SELECT t.id, t.name, t.slug, tm.role
      FROM teams t
      JOIN team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = ?
      ORDER BY t.name
    `)
    .all(user.sub);
  return c.json(teams);
});

api.post("/auth/select-team", authMiddleware, async (c) => {
  const user = c.get("user") as JWTPayload;
  const { team_id } = await c.req.json<{ team_id: string }>();

  const membership = db
    .query("SELECT role FROM team_members WHERE team_id = ? AND user_id = ?")
    .get(team_id, user.sub) as { role: string } | null;

  if (!membership) {
    return c.json({ error: "You are not a member of this team" }, 403);
  }

  const team = db.query("SELECT id, name, slug FROM teams WHERE id = ?").get(team_id) as { id: string; name: string; slug: string } | null;
  if (!team) {
    return c.json({ error: "Team not found" }, 404);
  }

  const token = await createToken(
    { id: user.sub, username: user.username, display_name: user.display_name },
    { id: team_id, role: membership.role }
  );

  return c.json({ token, team: { ...team, role: membership.role } });
});

// --- Team routes (require auth, no team needed) ---

api.post("/teams", authMiddleware, async (c) => {
  const user = c.get("user") as JWTPayload;
  const { name } = await c.req.json<{ name: string }>();

  if (!name) return c.json({ error: "Team name is required" }, 400);

  const id = generateId("team", name);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  db.run(
    "INSERT INTO teams (id, name, slug, owner_id) VALUES (?, ?, ?, ?)",
    [id, name, slug, user.sub]
  );

  db.run(
    "INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, 'owner')",
    [id, user.sub]
  );

  // Auto-generate first invite code
  const code = generateInviteCode();
  db.run(
    "INSERT INTO team_invites (team_id, code, created_by) VALUES (?, ?, ?)",
    [id, code, user.sub]
  );

  const team = db.query("SELECT * FROM teams WHERE id = ?").get(id);
  return c.json({ team, invite_code: code }, 201);
});

api.post("/teams/join", authMiddleware, async (c) => {
  const user = c.get("user") as JWTPayload;
  const { code } = await c.req.json<{ code: string }>();

  if (!code) return c.json({ error: "Invite code is required" }, 400);

  const invite = db
    .query("SELECT * FROM team_invites WHERE code = ?")
    .get(code.toUpperCase().trim()) as {
      id: number; team_id: string; max_uses: number | null; use_count: number; expires_at: string | null;
    } | null;

  if (!invite) {
    return c.json({ error: "Invalid invite code" }, 404);
  }

  if (invite.max_uses !== null && invite.use_count >= invite.max_uses) {
    return c.json({ error: "Invite code has reached its maximum uses" }, 410);
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return c.json({ error: "Invite code has expired" }, 410);
  }

  // Check if already a member
  const existing = db
    .query("SELECT id FROM team_members WHERE team_id = ? AND user_id = ?")
    .get(invite.team_id, user.sub);

  if (existing) {
    return c.json({ error: "You are already a member of this team" }, 409);
  }

  db.run(
    "INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, 'member')",
    [invite.team_id, user.sub]
  );

  db.run("UPDATE team_invites SET use_count = use_count + 1 WHERE id = ?", [invite.id]);

  const team = db
    .query("SELECT t.id, t.name, t.slug FROM teams t WHERE t.id = ?")
    .get(invite.team_id);

  return c.json({ team, role: "member" }, 201);
});

// --- Team management routes (require auth + team) ---

api.get("/teams/:id", authMiddleware, (c) => {
  const { id } = c.req.param();
  const team = db.query("SELECT id, name, slug, owner_id, created_at FROM teams WHERE id = ?").get(id) as any;
  if (!team) return c.json({ error: "Team not found" }, 404);
  return c.json(team);
});

api.get("/teams/:id/members", authMiddleware, (c) => {
  const { id } = c.req.param();
  const members = db
    .query(`
      SELECT u.id, u.username, u.display_name, u.last_seen, tm.role, tm.joined_at
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = ?
      ORDER BY tm.role, u.display_name
    `)
    .all(id);
  return c.json(members);
});

api.patch("/teams/:id", authMiddleware, async (c) => {
  const user = c.get("user") as JWTPayload;
  const { id } = c.req.param();
  const { name } = await c.req.json<{ name?: string }>();

  const membership = db
    .query("SELECT role FROM team_members WHERE team_id = ? AND user_id = ?")
    .get(id, user.sub) as { role: string } | null;

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return c.json({ error: "Only team owners and admins can update the team" }, 403);
  }

  if (name) db.run("UPDATE teams SET name = ? WHERE id = ?", [name, id]);

  const updated = db.query("SELECT id, name, slug, owner_id, created_at FROM teams WHERE id = ?").get(id);
  return c.json(updated);
});

// Team rules
api.get("/teams/:id/rules", authMiddleware, (c) => {
  const { id } = c.req.param();
  const team = db.query("SELECT rules FROM teams WHERE id = ?").get(id) as any;
  if (!team) return c.json({ error: "Team not found" }, 404);
  return c.json({ rules: team.rules || "" });
});

api.put("/teams/:id/rules", authMiddleware, async (c) => {
  const user = c.get("user") as JWTPayload;
  const { id } = c.req.param();
  const { rules } = await c.req.json<{ rules: string }>();

  const membership = db
    .query("SELECT role FROM team_members WHERE team_id = ? AND user_id = ?")
    .get(id, user.sub) as { role: string } | null;

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return c.json({ error: "Only team owners and admins can edit team rules" }, 403);
  }

  db.run("UPDATE teams SET rules = ? WHERE id = ?", [rules, id]);
  return c.json({ ok: true });
});

api.delete("/teams/:id/members/:userId", authMiddleware, (c) => {
  const user = c.get("user") as JWTPayload;
  const { id, userId } = c.req.param();

  const membership = db
    .query("SELECT role FROM team_members WHERE team_id = ? AND user_id = ?")
    .get(id, user.sub) as { role: string } | null;

  // Allow self-removal or owner/admin removal
  if (userId !== user.sub) {
    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      return c.json({ error: "Only team owners and admins can remove members" }, 403);
    }
  }

  db.run("DELETE FROM team_members WHERE team_id = ? AND user_id = ?", [id, userId]);
  return c.json({ ok: true });
});

api.patch("/teams/:id/members/:userId", authMiddleware, async (c) => {
  const user = c.get("user") as JWTPayload;
  const { id, userId } = c.req.param();
  const { role } = await c.req.json<{ role: string }>();

  const membership = db
    .query("SELECT role FROM team_members WHERE team_id = ? AND user_id = ?")
    .get(id, user.sub) as { role: string } | null;

  if (!membership || membership.role !== "owner") {
    return c.json({ error: "Only the team owner can change roles" }, 403);
  }

  db.run("UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?", [role, id, userId]);
  return c.json({ ok: true });
});

// Transfer team ownership
api.post("/teams/:id/transfer", authMiddleware, async (c) => {
  const user = c.get("user") as JWTPayload;
  const { id } = c.req.param();
  const { new_owner_id } = await c.req.json<{ new_owner_id: string }>();

  if (!new_owner_id) return c.json({ error: "new_owner_id is required" }, 400);

  // Verify requester is the current owner
  const membership = db
    .query("SELECT role FROM team_members WHERE team_id = ? AND user_id = ?")
    .get(id, user.sub) as { role: string } | null;

  if (!membership || membership.role !== "owner") {
    return c.json({ error: "Only the team owner can transfer ownership" }, 403);
  }

  // Verify target is a member of the team
  const target = db
    .query("SELECT role FROM team_members WHERE team_id = ? AND user_id = ?")
    .get(id, new_owner_id) as { role: string } | null;

  if (!target) {
    return c.json({ error: "Target user is not a member of this team" }, 400);
  }

  // Transfer: new owner becomes owner, old owner becomes admin
  db.run("UPDATE team_members SET role = 'owner' WHERE team_id = ? AND user_id = ?", [id, new_owner_id]);
  db.run("UPDATE team_members SET role = 'admin' WHERE team_id = ? AND user_id = ?", [id, user.sub]);
  db.run("UPDATE teams SET owner_id = ? WHERE id = ?", [new_owner_id, id]);

  return c.json({ ok: true });
});

// --- Invite routes ---

api.post("/teams/:id/invites", authMiddleware, async (c) => {
  const user = c.get("user") as JWTPayload;
  const { id } = c.req.param();
  const body = await c.req.json<{ max_uses?: number; expires_at?: string }>().catch(() => ({}));

  const membership = db
    .query("SELECT role FROM team_members WHERE team_id = ? AND user_id = ?")
    .get(id, user.sub) as { role: string } | null;

  if (!membership || membership.role === "member") {
    return c.json({ error: "Only team owners and admins can create invites" }, 403);
  }

  const code = generateInviteCode();
  db.run(
    "INSERT INTO team_invites (team_id, code, created_by, max_uses, expires_at) VALUES (?, ?, ?, ?, ?)",
    [id, code, user.sub, body.max_uses || null, body.expires_at || null]
  );

  const invite = db.query("SELECT * FROM team_invites WHERE code = ?").get(code);
  return c.json(invite, 201);
});

api.get("/teams/:id/invites", authMiddleware, (c) => {
  const { id } = c.req.param();
  const invites = db
    .query("SELECT * FROM team_invites WHERE team_id = ? ORDER BY created_at DESC")
    .all(id);
  return c.json(invites);
});

api.delete("/teams/:id/invites/:inviteId", authMiddleware, (c) => {
  const user = c.get("user") as JWTPayload;
  const { id, inviteId } = c.req.param();

  const membership = db
    .query("SELECT role FROM team_members WHERE team_id = ? AND user_id = ?")
    .get(id, user.sub) as { role: string } | null;

  if (!membership || membership.role === "member") {
    return c.json({ error: "Only team owners and admins can revoke invites" }, 403);
  }

  db.run("DELETE FROM team_invites WHERE id = ? AND team_id = ?", [inviteId, id]);
  return c.json({ ok: true });
});

// =============================================
// TEAM-SCOPED DATA ROUTES (require auth + team)
// =============================================
const teamApi = new Hono();
teamApi.use("*", authMiddleware);
teamApi.use("*", requireTeam);

// -- Users (scoped to team) --
teamApi.get("/users", (c) => {
  const user = c.get("user") as JWTPayload;
  const users = db
    .query(`
      SELECT u.id, u.username, u.display_name, u.last_seen, tm.role
      FROM users u
      JOIN team_members tm ON tm.user_id = u.id
      WHERE tm.team_id = ?
      ORDER BY u.display_name
    `)
    .all(user.team_id);
  return c.json(users);
});

teamApi.get("/users/:id/activity", (c) => {
  const user = c.get("user") as JWTPayload;
  const { id } = c.req.param();
  const limit = Number(c.req.query("limit") || "50");
  const activity = db
    .query(`
      SELECT a.* FROM activity a
      JOIN projects p ON p.id = a.project_id
      WHERE a.user_id = ? AND p.team_id = ?
      ORDER BY a.created_at DESC LIMIT ?
    `)
    .all(id, user.team_id, limit);
  return c.json(activity);
});

// -- Projects (scoped to team) --
teamApi.get("/projects", (c) => {
  const user = c.get("user") as JWTPayload;
  const projects = db
    .query(`
      SELECT p.*,
        (SELECT COUNT(DISTINCT s.user_id) FROM sessions s WHERE s.project_id = p.id AND s.status != 'ended') as active_users,
        (SELECT MAX(a.created_at) FROM activity a WHERE a.project_id = p.id) as last_activity
      FROM projects p
      WHERE p.team_id = ?
      ORDER BY p.name
    `)
    .all(user.team_id);
  return c.json(projects);
});

teamApi.post("/projects", async (c) => {
  const user = c.get("user") as JWTPayload;
  const { name, git_url, description } = await c.req.json<{
    name: string;
    git_url?: string;
    description?: string;
  }>();

  if (!name) return c.json({ error: "Project name is required" }, 400);

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const id = `proj-${slug}-${randomBytes(3).toString("hex")}`;
  const projectsDir = join(import.meta.dir, "..", "..", "..", "projects");
  const projectPath = join(projectsDir, slug);

  const maxPort = db.query("SELECT MAX(opencode_port) as max_port FROM projects").get() as { max_port: number | null };
  const opencode_port = (maxPort?.max_port || 4095) + 1;

  const { mkdirSync, existsSync, rmSync } = await import("fs");
  if (!existsSync(projectsDir)) mkdirSync(projectsDir, { recursive: true });

  // If directory exists, check if it's an orphan (deleted from DB but files remain)
  if (existsSync(projectPath)) {
    const existing = db.query("SELECT id FROM projects WHERE path = ?").get(projectPath) as any;
    if (existing) {
      return c.json({ error: "A project with this name already exists" }, 409);
    }
    // Orphan directory — clean it up so we can recreate
    rmSync(projectPath, { recursive: true, force: true });
  }

  if (git_url) {
    const proc = Bun.spawnSync(["git", "clone", "--depth", "1", git_url, projectPath]);
    if (proc.exitCode !== 0) {
      return c.json({ error: `Git clone failed: ${proc.stderr.toString().trim()}` }, 400);
    }
  } else {
    mkdirSync(projectPath, { recursive: true });
  }

  db.run(
    "INSERT INTO projects (id, name, path, opencode_port, description, team_id) VALUES (?, ?, ?, ?, ?, ?)",
    [id, name, projectPath, opencode_port, description || null, user.team_id]
  );

  const project = db.query("SELECT * FROM projects WHERE id = ?").get(id);
  broadcast("project.created", project);
  return c.json(project, 201);
});

// Upload a zip file to an existing project
teamApi.post("/projects/:id/upload", async (c) => {
  const user = c.get("user") as JWTPayload;
  const { id } = c.req.param();

  const project = db.query("SELECT * FROM projects WHERE id = ? AND team_id = ?").get(id, user.team_id) as any;
  if (!project) return c.json({ error: "Project not found" }, 404);

  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return c.json({ error: "No file uploaded" }, 400);

  const { mkdirSync, existsSync, writeFileSync } = await import("fs");
  if (!existsSync(project.path)) mkdirSync(project.path, { recursive: true });

  if (file.name.endsWith(".zip")) {
    // Save zip to temp, then extract
    const zipPath = join(project.path, "__upload.zip");
    const bytes = await file.arrayBuffer();
    writeFileSync(zipPath, Buffer.from(bytes));

    const proc = Bun.spawnSync(["unzip", "-o", zipPath, "-d", project.path]);
    // Clean up zip file
    const { unlinkSync } = await import("fs");
    try { unlinkSync(zipPath); } catch {}

    if (proc.exitCode !== 0) {
      return c.json({ error: `Unzip failed: ${proc.stderr.toString().trim()}` }, 400);
    }
    return c.json({ ok: true, message: "Zip extracted successfully" });
  } else {
    // Single file upload — save directly
    const bytes = await file.arrayBuffer();
    writeFileSync(join(project.path, file.name), Buffer.from(bytes));
    return c.json({ ok: true, message: `File ${file.name} uploaded` });
  }
});

// --- Git operations (per-user GitHub token) ---

// Helper to get project + verify access
function getProjectForGit(c: any) {
  const user = c.get("user") as JWTPayload;
  const { id } = c.req.param();
  const project = db.query("SELECT * FROM projects WHERE id = ? AND team_id = ?").get(id, user.team_id) as any;
  return { user, project };
}

// Helper to get user's decrypted GitHub token
function getUserGitHubToken(userId: string): string | null {
  const conn = db.query("SELECT token FROM user_connections WHERE user_id = ? AND provider = 'github'").get(userId) as any;
  if (!conn?.token) return null;
  try { return decrypt(conn.token); } catch { return null; }
}

teamApi.get("/projects/:id/git/status", (c) => {
  const { project } = getProjectForGit(c);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const { existsSync } = require("fs");
  if (!existsSync(join(project.path, ".git"))) {
    return c.json({ initialized: false, message: "Not a git repository" });
  }

  const status = Bun.spawnSync(["git", "status", "--porcelain"], { cwd: project.path });
  const branch = Bun.spawnSync(["git", "branch", "--show-current"], { cwd: project.path });
  const remote = Bun.spawnSync(["git", "remote", "get-url", "origin"], { cwd: project.path });
  const log = Bun.spawnSync(["git", "log", "--oneline", "-5"], { cwd: project.path });

  const changes = status.stdout.toString().trim().split("\n").filter(Boolean);

  return c.json({
    initialized: true,
    branch: branch.stdout.toString().trim() || "main",
    remote: remote.stdout.toString().trim() || null,
    changes: changes.length,
    changedFiles: changes.map((line: string) => ({
      status: line.substring(0, 2).trim(),
      file: line.substring(3),
    })),
    recentCommits: log.stdout.toString().trim().split("\n").filter(Boolean),
  });
});

teamApi.post("/projects/:id/git/init", async (c) => {
  const { project } = getProjectForGit(c);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const { remote_url } = await c.req.json<{ remote_url?: string }>();

  const { existsSync } = require("fs");
  if (!existsSync(join(project.path, ".git"))) {
    Bun.spawnSync(["git", "init"], { cwd: project.path });
    Bun.spawnSync(["git", "checkout", "-b", "main"], { cwd: project.path });
  }

  if (remote_url) {
    // Remove existing origin if any, then add new
    Bun.spawnSync(["git", "remote", "remove", "origin"], { cwd: project.path });
    const add = Bun.spawnSync(["git", "remote", "add", "origin", remote_url], { cwd: project.path });
    if (add.exitCode !== 0) {
      return c.json({ error: `Failed to add remote: ${add.stderr.toString().trim()}` }, 400);
    }
  }

  return c.json({ ok: true });
});

teamApi.post("/projects/:id/git/commit", async (c) => {
  const { user, project } = getProjectForGit(c);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const { message } = await c.req.json<{ message: string }>();
  if (!message) return c.json({ error: "Commit message is required" }, 400);

  // Stage all changes
  const add = Bun.spawnSync(["git", "add", "-A"], { cwd: project.path });
  if (add.exitCode !== 0) {
    return c.json({ error: `Git add failed: ${add.stderr.toString().trim()}` }, 400);
  }

  // Check if there's anything to commit
  const diff = Bun.spawnSync(["git", "diff", "--cached", "--quiet"], { cwd: project.path });
  if (diff.exitCode === 0) {
    return c.json({ error: "No changes to commit" }, 400);
  }

  // Commit with user info
  const displayName = (user as any).display_name || (user as any).username || "Orbit AI User";
  const commit = Bun.spawnSync([
    "git", "commit", "-m", message,
    "--author", `${displayName} <${(user as any).username}@orbitai.work>`,
  ], { cwd: project.path });

  if (commit.exitCode !== 0) {
    return c.json({ error: `Commit failed: ${commit.stderr.toString().trim()}` }, 400);
  }

  return c.json({ ok: true, output: commit.stdout.toString().trim() });
});

teamApi.post("/projects/:id/git/push", async (c) => {
  const { user, project } = getProjectForGit(c);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const token = getUserGitHubToken(user.sub);
  if (!token) {
    return c.json({ error: "No GitHub token configured. Add one in Connections." }, 403);
  }

  // Get the remote URL
  const remoteProc = Bun.spawnSync(["git", "remote", "get-url", "origin"], { cwd: project.path });
  let remoteUrl = remoteProc.stdout.toString().trim();
  if (!remoteUrl) {
    return c.json({ error: "No remote origin set. Initialize git with a remote URL first." }, 400);
  }

  // Inject token into the URL for auth: https://x-access-token:{token}@github.com/...
  const authedUrl = remoteUrl.replace(
    /https:\/\/(.*@)?github\.com/,
    `https://x-access-token:${token}@github.com`
  );

  const branch = Bun.spawnSync(["git", "branch", "--show-current"], { cwd: project.path });
  const branchName = branch.stdout.toString().trim() || "main";

  const push = Bun.spawnSync(["git", "push", authedUrl, branchName], { cwd: project.path });

  if (push.exitCode !== 0) {
    const errMsg = push.stderr.toString().trim();
    // Don't leak the token in error messages
    const safeErr = errMsg.replace(token, "***");
    return c.json({ error: `Push failed: ${safeErr}` }, 400);
  }

  return c.json({ ok: true, branch: branchName });
});

teamApi.post("/projects/:id/git/pull", async (c) => {
  const { user, project } = getProjectForGit(c);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const token = getUserGitHubToken(user.sub);

  // Get remote URL
  const remoteProc = Bun.spawnSync(["git", "remote", "get-url", "origin"], { cwd: project.path });
  let remoteUrl = remoteProc.stdout.toString().trim();
  if (!remoteUrl) {
    return c.json({ error: "No remote origin set" }, 400);
  }

  // If user has a token, use authenticated URL
  let pullUrl = remoteUrl;
  if (token) {
    pullUrl = remoteUrl.replace(
      /https:\/\/(.*@)?github\.com/,
      `https://x-access-token:${token}@github.com`
    );
  }

  const pull = Bun.spawnSync(["git", "pull", pullUrl, "--rebase"], { cwd: project.path });

  if (pull.exitCode !== 0) {
    const errMsg = pull.stderr.toString().trim();
    const safeErr = token ? errMsg.replace(token, "***") : errMsg;
    return c.json({ error: `Pull failed: ${safeErr}` }, 400);
  }

  return c.json({ ok: true, output: pull.stdout.toString().trim() });
});

teamApi.get("/projects/:id", (c) => {
  const user = c.get("user") as JWTPayload;
  const { id } = c.req.param();
  const project = db.query("SELECT * FROM projects WHERE id = ? AND team_id = ?").get(id, user.team_id);
  if (!project) return c.json({ error: "Project not found" }, 404);
  return c.json(project);
});

// Project rules
teamApi.get("/projects/:id/rules", (c) => {
  const user = c.get("user") as JWTPayload;
  const { id } = c.req.param();
  const project = db.query("SELECT rules FROM projects WHERE id = ? AND team_id = ?").get(id, user.team_id) as any;
  if (!project) return c.json({ error: "Project not found" }, 404);
  return c.json({ rules: project.rules || "" });
});

teamApi.put("/projects/:id/rules", async (c) => {
  const user = c.get("user") as JWTPayload;
  const { id } = c.req.param();
  const { rules } = await c.req.json<{ rules: string }>();

  const project = db.query("SELECT id FROM projects WHERE id = ? AND team_id = ?").get(id, user.team_id);
  if (!project) return c.json({ error: "Project not found" }, 404);

  db.run("UPDATE projects SET rules = ? WHERE id = ?", [rules, id]);
  return c.json({ ok: true });
});

teamApi.delete("/projects/:id", (c) => {
  const user = c.get("user") as JWTPayload;
  const { id } = c.req.param();
  const project = db.query("SELECT * FROM projects WHERE id = ? AND team_id = ?").get(id, user.team_id);
  if (!project) return c.json({ error: "Project not found" }, 404);

  db.run("DELETE FROM file_locks WHERE project_id = ?", [id]);
  db.run("DELETE FROM activity WHERE project_id = ?", [id]);
  db.run("DELETE FROM sessions WHERE project_id = ?", [id]);
  db.run("DELETE FROM projects WHERE id = ?", [id]);

  broadcast("project.deleted", { id });
  return c.json({ ok: true });
});

teamApi.get("/projects/:id/users", (c) => {
  const { id } = c.req.param();
  const users = db
    .query(`
      SELECT DISTINCT u.id, u.username, u.display_name, u.last_seen, s.status as session_status
      FROM users u
      JOIN sessions s ON s.user_id = u.id
      WHERE s.project_id = ? AND s.status != 'ended'
      ORDER BY u.display_name
    `)
    .all(id);
  return c.json(users);
});

teamApi.get("/projects/:id/activity", (c) => {
  const { id } = c.req.param();
  const limit = Number(c.req.query("limit") || "50");
  const activity = db
    .query("SELECT * FROM activity WHERE project_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(id, limit);
  return c.json(activity);
});

// -- Sessions (scoped to team via projects) --
teamApi.get("/sessions", (c) => {
  const user = c.get("user") as JWTPayload;
  const sessions = db
    .query(`
      SELECT s.*, u.display_name as user_display_name, p.name as project_name
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      JOIN projects p ON p.id = s.project_id
      WHERE s.status != 'ended' AND p.team_id = ?
      ORDER BY s.updated_at DESC
    `)
    .all(user.team_id);
  return c.json(sessions);
});

teamApi.post("/sessions", async (c) => {
  const user = c.get("user") as JWTPayload;
  const { project_id, session_id, title } = await c.req.json<{
    project_id: string;
    session_id: string;
    title?: string;
  }>();

  db.run(
    "INSERT OR REPLACE INTO sessions (id, project_id, user_id, title, status) VALUES (?, ?, ?, ?, 'idle')",
    [session_id, project_id, user.sub, title || "New Session"]
  );

  const session = db.query("SELECT * FROM sessions WHERE id = ?").get(session_id);
  broadcast("session.created", session);
  return c.json(session, 201);
});

teamApi.patch("/sessions/:id", async (c) => {
  const { id } = c.req.param();
  const { status, title } = await c.req.json<{ status?: string; title?: string }>();

  if (status) {
    db.run("UPDATE sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [status, id]);
  }
  if (title) {
    db.run("UPDATE sessions SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [title, id]);
  }

  const session = db.query("SELECT * FROM sessions WHERE id = ?").get(id);
  broadcast("session.updated", session);
  return c.json(session);
});

teamApi.delete("/sessions/:id", (c) => {
  const { id } = c.req.param();
  db.run("UPDATE sessions SET status = 'ended', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
  db.run("DELETE FROM file_locks WHERE session_id = ?", [id]);
  broadcast("session.ended", { id });
  return c.json({ ok: true });
});

// -- Chat (Claude via Anthropic SDK) --
teamApi.get("/chat/:sessionId/messages", (c) => {
  const { sessionId } = c.req.param();
  const messages = db
    .query("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC")
    .all(sessionId);
  return c.json(messages);
});

// --- User Connections (per-user, not per-team) ---

teamApi.get("/connections/claude/status", (c) => {
  const user = c.get("user") as JWTPayload;
  const conn = db.query("SELECT token FROM user_connections WHERE user_id = ? AND provider = 'claude'").get(user.sub) as any;
  if (conn?.token) {
    return c.json({ connected: true });
  }
  return c.json({ connected: false, reason: "No Claude API key configured" });
});

teamApi.get("/connections/github/status", (c) => {
  const user = c.get("user") as JWTPayload;
  const conn = db.query("SELECT token FROM user_connections WHERE user_id = ? AND provider = 'github'").get(user.sub) as any;
  if (conn?.token) {
    return c.json({ connected: true });
  }
  return c.json({ connected: false, reason: "No GitHub token configured" });
});

teamApi.get("/connections", (c) => {
  const user = c.get("user") as JWTPayload;
  const connections = db.query("SELECT provider, created_at, updated_at FROM user_connections WHERE user_id = ?").all(user.sub);
  return c.json(connections);
});

teamApi.put("/connections/:provider", async (c) => {
  const user = c.get("user") as JWTPayload;
  const { provider } = c.req.param();
  const { token } = await c.req.json<{ token: string }>();

  if (!["claude", "github"].includes(provider)) {
    return c.json({ error: "Invalid provider. Must be 'claude' or 'github'" }, 400);
  }
  if (!token) {
    return c.json({ error: "Token is required" }, 400);
  }

  const encryptedToken = encrypt(token);
  db.run(`
    INSERT INTO user_connections (user_id, provider, token, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, provider) DO UPDATE SET token = ?, updated_at = CURRENT_TIMESTAMP
  `, [user.sub, provider, encryptedToken, encryptedToken]);

  return c.json({ ok: true, provider });
});

teamApi.delete("/connections/:provider", (c) => {
  const user = c.get("user") as JWTPayload;
  const { provider } = c.req.param();
  db.run("DELETE FROM user_connections WHERE user_id = ? AND provider = ?", [user.sub, provider]);
  return c.json({ ok: true });
});

teamApi.post("/chat/:sessionId", async (c) => {
  const user = c.get("user") as JWTPayload;
  const { sessionId } = c.req.param();
  const { message } = await c.req.json<{ message: string }>();

  if (!message) return c.json({ error: "message is required" }, 400);

  // Find the session's project and its OpenCode port
  const session = db.query(`
    SELECT s.*, p.opencode_port, p.name as project_name
    FROM sessions s JOIN projects p ON p.id = s.project_id
    WHERE s.id = ?
  `).get(sessionId) as any;

  // If no session exists yet, try to find a project to use
  let openCodePort: number;
  if (session?.opencode_port) {
    openCodePort = session.opencode_port;
  } else {
    // Use the first project's port as fallback
    const proj = db.query("SELECT opencode_port FROM projects WHERE team_id = ? LIMIT 1").get(user.team_id) as any;
    if (!proj) return c.json({ error: "No projects found" }, 400);
    openCodePort = proj.opencode_port;
  }

  // Save user message
  db.run("INSERT INTO messages (session_id, role, content) VALUES (?, 'user', ?)", [sessionId, message]);

  const password = process.env.OPENCODE_SERVER_PASSWORD || "testpass123";
  const openCodeUrl = `http://localhost:${openCodePort}`;

  // Stream the response via OpenCode
  return stream(c, async (s) => {
    try {
      // First, ensure a session exists in OpenCode
      let ocSessionId = sessionId;
      try {
        const listRes = await fetch(`${openCodeUrl}/session`, {
          headers: { "Authorization": "Basic " + btoa(`opencode:${password}`) },
        });
        const sessions = await listRes.json() as any[];
        if (!sessions.find((sess: any) => sess.id === sessionId)) {
          // Create a new session in OpenCode
          const createRes = await fetch(`${openCodeUrl}/session`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Basic " + btoa(`opencode:${password}`),
            },
            body: JSON.stringify({}),
          });
          const newSession = await createRes.json() as any;
          ocSessionId = newSession.id;
        }
      } catch {}

      // Send message to OpenCode
      const res = await fetch(`${openCodeUrl}/session/${ocSessionId}/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Basic " + btoa(`opencode:${password}`),
        },
        body: JSON.stringify({ parts: [{ type: "text", text: message }] }),
      });

      if (!res.ok) {
        const errText = await res.text();
        await s.write(`data: ${JSON.stringify({ type: "error", error: `OpenCode error (${res.status}): ${errText}` })}\n\n`);
        return;
      }

      const data = await res.json() as any;

      // Extract text from response
      let fullResponse = "";
      if (data.parts) {
        for (const part of data.parts) {
          if (part.type === "text" && part.text) {
            fullResponse += part.text;
            await s.write(`data: ${JSON.stringify({ type: "text", text: part.text })}\n\n`);
          }
          if (part.type === "tool-invocation" || part.type === "tool_use") {
            const toolInfo = `[Tool: ${part.toolName || part.name} → ${part.result ? "done" : "running"}]`;
            await s.write(`data: ${JSON.stringify({ type: "tool", tool: part.toolName || part.name, args: part.args || part.input, result: part.result })}\n\n`);
          }
        }
      } else if (typeof data.content === "string") {
        fullResponse = data.content;
        await s.write(`data: ${JSON.stringify({ type: "text", text: data.content })}\n\n`);
      }

      // Save assistant response
      if (fullResponse) {
        db.run("INSERT INTO messages (session_id, role, content) VALUES (?, 'assistant', ?)", [sessionId, fullResponse]);
      }

      await s.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    } catch (err: any) {
      await s.write(`data: ${JSON.stringify({ type: "error", error: err.message || "Failed to reach OpenCode" })}\n\n`);
    }
  });
});

// -- File Locks (scoped to team via projects) --
teamApi.get("/locks", (c) => {
  const user = c.get("user") as JWTPayload;
  const locks = db
    .query(`
      SELECT fl.*, u.display_name as user_display_name, p.name as project_name
      FROM file_locks fl
      JOIN users u ON u.id = fl.user_id
      JOIN projects p ON p.id = fl.project_id
      WHERE p.team_id = ?
      ORDER BY fl.locked_at DESC
    `)
    .all(user.team_id);
  return c.json(locks);
});

teamApi.get("/locks/:projectId", (c) => {
  const { projectId } = c.req.param();
  const locks = db
    .query(`
      SELECT fl.*, u.display_name as user_display_name
      FROM file_locks fl
      JOIN users u ON u.id = fl.user_id
      WHERE fl.project_id = ?
      ORDER BY fl.locked_at DESC
    `)
    .all(projectId);
  return c.json(locks);
});

teamApi.post("/locks", async (c) => {
  const { project_id, file_path, user_id, session_id, line_start, line_end } = await c.req.json<{
    project_id: string;
    file_path: string;
    user_id: string;
    session_id: string;
    line_start?: number;
    line_end?: number;
  }>();

  const existing = db
    .query("SELECT * FROM file_locks WHERE project_id = ? AND file_path = ?")
    .get(project_id, file_path) as { user_id: string } | null;

  if (existing && existing.user_id !== user_id) {
    return c.json({ error: "File is locked by another user", lock: existing }, 409);
  }

  db.run(
    `INSERT OR REPLACE INTO file_locks (project_id, file_path, user_id, session_id, line_start, line_end)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [project_id, file_path, user_id, session_id, line_start || null, line_end || null]
  );

  const lock = db
    .query("SELECT * FROM file_locks WHERE project_id = ? AND file_path = ?")
    .get(project_id, file_path);

  broadcast("lock.acquired", lock);
  return c.json(lock, 201);
});

teamApi.delete("/locks/:id", (c) => {
  const { id } = c.req.param();
  const lock = db.query("SELECT * FROM file_locks WHERE id = ?").get(id);
  db.run("DELETE FROM file_locks WHERE id = ?", [id]);
  if (lock) broadcast("lock.released", lock);
  return c.json({ ok: true });
});

teamApi.delete("/locks/session/:sessionId", (c) => {
  const { sessionId } = c.req.param();
  const locks = db.query("SELECT * FROM file_locks WHERE session_id = ?").all(sessionId);
  db.run("DELETE FROM file_locks WHERE session_id = ?", [sessionId]);
  for (const lock of locks) {
    broadcast("lock.released", lock);
  }
  return c.json({ ok: true, released: locks.length });
});

// -- Activity (scoped to team) --
teamApi.get("/activity/recent", (c) => {
  const user = c.get("user") as JWTPayload;
  const limit = Number(c.req.query("limit") || "50");
  const activity = db
    .query(`
      SELECT a.*, u.display_name as user_display_name, p.name as project_name
      FROM activity a
      JOIN users u ON u.id = a.user_id
      JOIN projects p ON p.id = a.project_id
      WHERE p.team_id = ?
      ORDER BY a.created_at DESC
      LIMIT ?
    `)
    .all(user.team_id, limit);
  return c.json(activity);
});

teamApi.post("/activity", async (c) => {
  const { project_id, user_id, session_id, event_type, file_path, line_start, line_end, detail } =
    await c.req.json<{
      project_id: string;
      user_id: string;
      session_id: string;
      event_type: string;
      file_path?: string;
      line_start?: number;
      line_end?: number;
      detail?: string;
    }>();

  db.run(
    `INSERT INTO activity (project_id, user_id, session_id, event_type, file_path, line_start, line_end, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [project_id, user_id, session_id, event_type, file_path || null, line_start || null, line_end || null, detail || null]
  );

  const entry = db.query("SELECT * FROM activity ORDER BY id DESC LIMIT 1").get();
  broadcast("activity", entry);
  return c.json(entry, 201);
});

// -- SSE Stream --
teamApi.get("/activity/stream", (c) => {
  return streamSSE(c, async (stream) => {
    const client: SSEClient = {
      send: (event, data) => {
        stream.writeSSE({ event, data });
      },
      close: () => {
        sseClients.delete(client);
      },
    };
    sseClients.add(client);

    const heartbeat = setInterval(() => {
      try {
        stream.writeSSE({ event: "heartbeat", data: new Date().toISOString() });
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(client);
      }
    }, 30_000);

    stream.onAbort(() => {
      clearInterval(heartbeat);
      sseClients.delete(client);
    });

    await new Promise(() => {});
  });
});

// -- Token Usage --
teamApi.get("/usage", (c) => {
  const user = c.get("user") as JWTPayload;
  const usage = db
    .query(`
      SELECT u.display_name, p.name as project_name,
        SUM(tu.input_tokens) as total_input,
        SUM(tu.output_tokens) as total_output,
        tu.model
      FROM token_usage tu
      JOIN users u ON u.id = tu.user_id
      JOIN projects p ON p.id = tu.project_id
      WHERE p.team_id = ?
      GROUP BY tu.user_id, tu.project_id, tu.model
      ORDER BY total_input DESC
    `)
    .all(user.team_id);
  return c.json(usage);
});

// =============================================
// MOUNT ROUTES
// =============================================
app.route("/api", api);
app.route("/api", teamApi);

// --- Serve dashboard static files ---
app.use("*", serveStatic({ root: DASHBOARD_DIR }));
app.get("*", serveStatic({ root: DASHBOARD_DIR, path: "index.html" }));

// --- Start server with WebSocket terminal support ---
const PORT = Number(process.env.BROKER_PORT || "5000");

import { createSession, getSession, destroySession, resizeSession, getSessionBuffer } from "./terminal";
import { startWatching, stopWatching, setFilewatcherBroadcast } from "./filewatcher";

// Give the filewatcher access to the broadcast function
setFilewatcherBroadcast(broadcast);

const wsClients = new Map<string, Set<any>>(); // sessionKey → Set of WebSocket clients

// Wire PTY output to all WebSocket clients for a session (called once per session)
const wiredSessions = new Set<string>();
function wireSessionOutput(sessionKey: string, session: any) {
  if (wiredSessions.has(sessionKey)) return; // Already wired
  wiredSessions.add(sessionKey);
  session.pty.onData((data: string) => {
    const clients = wsClients.get(sessionKey);
    if (clients) {
      for (const client of clients) {
        try { client.send(JSON.stringify({ type: "output", data })); } catch {}
      }
    }
  });
}

export default {
  port: PORT,
  async fetch(req: Request, server: any) {
    const url = new URL(req.url);

    // WebSocket upgrade for terminal — verify JWT BEFORE upgrading
    if (url.pathname === "/ws/terminal") {
      const token = url.searchParams.get("token");
      const projectId = url.searchParams.get("project") || null;
      if (!token) return new Response("Missing token", { status: 401 });

      // Verify JWT synchronously before upgrade
      let user: any;
      try {
        const secret = new TextEncoder().encode(process.env.BROKER_JWT_SECRET || "dev-secret-change-in-production");
        const { jwtVerify } = await import("jose");
        const { payload } = await jwtVerify(token, secret);
        user = payload;
      } catch {
        return new Response("Invalid token", { status: 401 });
      }

      const upgraded = server.upgrade(req, {
        data: { userId: user.sub, username: user.username, projectId }
      });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // All other requests go to Hono
    return app.fetch(req, server);
  },
  websocket: {
    async open(ws: any) {
      const { userId, username, projectId } = ws.data;
      const sessionKey = projectId ? `${userId}:${projectId}` : userId;

      // Create or get terminal session
      const session = await createSession(userId, projectId);
      if (!session) {
        ws.send(JSON.stringify({ type: "error", message: "Failed to create terminal session. Check server logs." }));
        ws.close();
        return;
      }

      // Track this client
      if (!wsClients.has(sessionKey)) wsClients.set(sessionKey, new Set());
      wsClients.get(sessionKey)!.add(ws);

      // Register presence — create/update a DB session so other users see this person
      if (projectId) {
        const dbSessionId = `terminal-${userId}-${projectId}`;

        // Check if this is a new session or a reconnect
        const existingSession = db.query("SELECT id, status FROM sessions WHERE id = ?").get(dbSessionId) as any;
        const isNewSession = !existingSession || existingSession.status === "ended";

        db.run(
          "INSERT OR REPLACE INTO sessions (id, project_id, user_id, title, status, updated_at) VALUES (?, ?, ?, 'Terminal', 'idle', CURRENT_TIMESTAMP)",
          [dbSessionId, projectId, userId]
        );
        const dbSession = db.query("SELECT s.*, u.display_name as user_display_name, p.name as project_name FROM sessions s LEFT JOIN users u ON u.id = s.user_id LEFT JOIN projects p ON p.id = s.project_id WHERE s.id = ?").get(dbSessionId);
        broadcast("session.created", dbSession);
        ws.data.dbSessionId = dbSessionId;

        // Only log activity for genuinely new sessions, not reconnects
        if (isNewSession) {
          db.run(
            "INSERT INTO activity (project_id, user_id, session_id, event_type, detail) VALUES (?, ?, ?, 'session.created', ?)",
            [projectId, userId, dbSessionId, JSON.stringify({ title: "Terminal" })]
          );
          const activityEntry = db.query(
            "SELECT a.*, u.display_name as user_display_name, p.name as project_name FROM activity a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN projects p ON p.id = a.project_id WHERE a.id = last_insert_rowid()"
          ).get();
          if (activityEntry) broadcast("activity", activityEntry);
        }

        // Start file watcher for auto-locking
        const projectData = db.query("SELECT path FROM projects WHERE id = ?").get(projectId) as { path: string } | null;
        if (projectData?.path) {
          startWatching(projectId, projectData.path, userId, dbSessionId);
        }
      }

      // Wire PTY output to WebSocket clients (once per session, not per client)
      wireSessionOutput(sessionKey, session);

      // Send buffered output for reconnection
      const buffer = getSessionBuffer(userId, projectId || undefined);
      if (buffer.length > 0) {
        ws.send(JSON.stringify({ type: "output", data: buffer.join("") }));
      }

      ws.send(JSON.stringify({ type: "connected", userId }));
      console.log(`[ws] Terminal connected: ${username} (${sessionKey})`);
    },

    message(ws: any, message: string | Buffer) {
      try {
        const msg = JSON.parse(typeof message === "string" ? message : message.toString());
        const { userId, projectId } = ws.data;

        switch (msg.type) {
          case "input":
            const session = getSession(userId, projectId || undefined);
            if (session) {
              session.pty.write(msg.data);
            }
            break;
          case "resize":
            resizeSession(userId, msg.cols, msg.rows, projectId || undefined);
            break;
          case "ping":
            ws.send(JSON.stringify({ type: "pong" }));
            break;
        }
      } catch (err) {
        console.error("[ws] Message error:", err);
      }
    },

    close(ws: any) {
      const { userId, projectId, dbSessionId } = ws.data;
      if (!userId) return;
      const sessionKey = projectId ? `${userId}:${projectId}` : userId;
      const clients = wsClients.get(sessionKey);
      if (clients) {
        clients.delete(ws);
        if (clients.size === 0) {
          console.log(`[ws] All clients disconnected from ${sessionKey} — session persists`);
          // Update presence — mark session as ended so other users see them leave
          if (dbSessionId) {
            // Only log ended if session was actually active (not already ended)
            const wasActive = db.query("SELECT status FROM sessions WHERE id = ? AND status != 'ended'").get(dbSessionId);

            db.run("UPDATE sessions SET status = 'ended', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [dbSessionId]);
            broadcast("session.ended", { id: dbSessionId });

            // Stop file watcher and release all locks
            if (projectId) {
              stopWatching(userId, projectId);

              // Only log to activity if it was a real session end, not a brief reconnect blip
              if (wasActive) {
                db.run(
                  "INSERT INTO activity (project_id, user_id, session_id, event_type, detail) VALUES (?, ?, ?, 'session.ended', ?)",
                  [projectId, userId, dbSessionId, JSON.stringify({ title: "Terminal" })]
                );
              }
            }
          }
        }
      }
    },
  },
};

console.log(`Broker running on http://localhost:${PORT} (WebSocket terminal enabled)`);
