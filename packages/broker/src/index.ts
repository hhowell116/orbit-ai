import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { db } from "./db";
import { authMiddleware, createToken, type JWTPayload } from "./auth";

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

// --- Health check ---
app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

// --- Auth routes (no middleware) ---
app.post("/auth/login", async (c) => {
  const { username, password } = await c.req.json<{ username: string; password: string }>();

  const user = db
    .query("SELECT id, username, display_name, password_hash FROM users WHERE username = ?")
    .get(username) as { id: string; username: string; display_name: string; password_hash: string } | null;

  if (!user) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  // For MVP: plain text password comparison
  // TODO: Switch to bcrypt with Bun.password.verify() before production
  const valid = await Bun.password.verify(password, user.password_hash);
  if (!valid) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const token = await createToken(user);
  return c.json({ token, user: { id: user.id, username: user.username, display_name: user.display_name } });
});

// --- Protected routes ---
const api = new Hono();
api.use("*", authMiddleware);

// -- Auth info --
api.get("/auth/me", (c) => {
  const user = c.get("user") as JWTPayload;
  return c.json(user);
});

// -- Users --
api.get("/users", (c) => {
  const users = db
    .query("SELECT id, username, display_name, last_seen FROM users ORDER BY display_name")
    .all();
  return c.json(users);
});

api.get("/users/:id/activity", (c) => {
  const { id } = c.req.param();
  const limit = Number(c.req.query("limit") || "50");
  const activity = db
    .query(
      "SELECT * FROM activity WHERE user_id = ? ORDER BY created_at DESC LIMIT ?"
    )
    .all(id, limit);
  return c.json(activity);
});

// -- Projects --
api.get("/projects", (c) => {
  const projects = db
    .query(`
      SELECT p.*,
        (SELECT COUNT(DISTINCT s.user_id) FROM sessions s WHERE s.project_id = p.id AND s.status != 'ended') as active_users,
        (SELECT MAX(a.created_at) FROM activity a WHERE a.project_id = p.id) as last_activity
      FROM projects p
      ORDER BY p.name
    `)
    .all();
  return c.json(projects);
});

api.get("/projects/:id", (c) => {
  const { id } = c.req.param();
  const project = db.query("SELECT * FROM projects WHERE id = ?").get(id);
  if (!project) return c.json({ error: "Project not found" }, 404);
  return c.json(project);
});

api.get("/projects/:id/users", (c) => {
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

api.get("/projects/:id/activity", (c) => {
  const { id } = c.req.param();
  const limit = Number(c.req.query("limit") || "50");
  const activity = db
    .query("SELECT * FROM activity WHERE project_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(id, limit);
  return c.json(activity);
});

// -- Sessions --
api.get("/sessions", (c) => {
  const sessions = db
    .query(`
      SELECT s.*, u.display_name as user_display_name, p.name as project_name
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      JOIN projects p ON p.id = s.project_id
      WHERE s.status != 'ended'
      ORDER BY s.updated_at DESC
    `)
    .all();
  return c.json(sessions);
});

api.post("/sessions", async (c) => {
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

api.patch("/sessions/:id", async (c) => {
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

api.delete("/sessions/:id", (c) => {
  const { id } = c.req.param();
  db.run("UPDATE sessions SET status = 'ended', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
  // Release file locks for this session
  db.run("DELETE FROM file_locks WHERE session_id = ?", [id]);
  broadcast("session.ended", { id });
  return c.json({ ok: true });
});

// -- File Locks --
api.get("/locks", (c) => {
  const locks = db
    .query(`
      SELECT fl.*, u.display_name as user_display_name, p.name as project_name
      FROM file_locks fl
      JOIN users u ON u.id = fl.user_id
      JOIN projects p ON p.id = fl.project_id
      ORDER BY fl.locked_at DESC
    `)
    .all();
  return c.json(locks);
});

api.get("/locks/:projectId", (c) => {
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

api.post("/locks", async (c) => {
  const { project_id, file_path, user_id, session_id, line_start, line_end } = await c.req.json<{
    project_id: string;
    file_path: string;
    user_id: string;
    session_id: string;
    line_start?: number;
    line_end?: number;
  }>();

  // Check if already locked by someone else
  const existing = db
    .query("SELECT * FROM file_locks WHERE project_id = ? AND file_path = ?")
    .get(project_id, file_path) as { user_id: string; user_display_name?: string } | null;

  if (existing && existing.user_id !== user_id) {
    return c.json(
      { error: "File is locked by another user", lock: existing },
      409
    );
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

api.delete("/locks/:id", (c) => {
  const { id } = c.req.param();
  const lock = db.query("SELECT * FROM file_locks WHERE id = ?").get(id);
  db.run("DELETE FROM file_locks WHERE id = ?", [id]);
  if (lock) broadcast("lock.released", lock);
  return c.json({ ok: true });
});

// Release all locks for a session (used by plugin on session.idle)
api.delete("/locks/session/:sessionId", (c) => {
  const { sessionId } = c.req.param();
  const locks = db.query("SELECT * FROM file_locks WHERE session_id = ?").all(sessionId);
  db.run("DELETE FROM file_locks WHERE session_id = ?", [sessionId]);
  for (const lock of locks) {
    broadcast("lock.released", lock);
  }
  return c.json({ ok: true, released: locks.length });
});

// -- Activity --
api.get("/activity/recent", (c) => {
  const limit = Number(c.req.query("limit") || "50");
  const activity = db
    .query(`
      SELECT a.*, u.display_name as user_display_name, p.name as project_name
      FROM activity a
      JOIN users u ON u.id = a.user_id
      JOIN projects p ON p.id = a.project_id
      ORDER BY a.created_at DESC
      LIMIT ?
    `)
    .all(limit);
  return c.json(activity);
});

api.post("/activity", async (c) => {
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
api.get("/activity/stream", (c) => {
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

    // Send heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        stream.writeSSE({ event: "heartbeat", data: new Date().toISOString() });
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(client);
      }
    }, 30_000);

    // Keep stream open until client disconnects
    stream.onAbort(() => {
      clearInterval(heartbeat);
      sseClients.delete(client);
    });

    // Block to keep stream open
    await new Promise(() => {});
  });
});

// -- Token Usage --
api.get("/usage", (c) => {
  const usage = db
    .query(`
      SELECT u.display_name, p.name as project_name,
        SUM(tu.input_tokens) as total_input,
        SUM(tu.output_tokens) as total_output,
        tu.model
      FROM token_usage tu
      JOIN users u ON u.id = tu.user_id
      JOIN projects p ON p.id = tu.project_id
      GROUP BY tu.user_id, tu.project_id, tu.model
      ORDER BY total_input DESC
    `)
    .all();
  return c.json(usage);
});

// Mount protected routes under /api
app.route("/", api);

// --- Start server ---
const PORT = Number(process.env.BROKER_PORT || "5000");

export default {
  port: PORT,
  fetch: app.fetch,
};

console.log(`Broker running on http://localhost:${PORT}`);
