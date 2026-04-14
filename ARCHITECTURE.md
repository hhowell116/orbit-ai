# Orbit AI — Complete Architecture & Setup Guide

## What Is This

Orbit AI is a multi-tenant, team-based AI coding platform. Teams sign up, create workspaces, add projects (via git clone, zip upload, or blank), and work with Claude AI to build and deploy code. The primary experience is a browser-based terminal running Claude Code — no desktop app required. File locks, activity feeds, real-time presence, and git integration keep team members coordinated.

---

## Infrastructure Overview

```
[Browser]
  ├── Terminal tab (xterm.js) ──WSS──→ [Broker :5000] ──→ PTY per user ──→ Claude Code
  ├── Chat tab (API mode)     ──HTTP──→ [Broker :5000] ──→ Anthropic API
  └── Dashboard               ──HTTP──→ [Broker :5000] ──→ SQLite + Projects
                                            │
                                     [Cloudflare Tunnel]
                                            │
                                       [Internet]
```

**How users access Claude Code:**

1. **Browser terminal (primary)** — xterm.js in browser connects via WebSocket to the broker, which spawns a PTY per user running Claude Code. No install needed.
2. **API chat (fallback)** — Users provide an Anthropic API key. The broker calls the Claude API directly with prompt caching. Costs per-token, chat-only.
3. **Desktop app (optional)** — A Tauri app exists for users who prefer a native window. Not required.

The broker runs on a single VM behind a Cloudflare tunnel. It serves the React dashboard, API routes, WebSocket terminal connections, and manages project files on disk.

---

## AI Integration — How Claude Works

### Browser Terminal (Primary)

Users open a project and use the Terminal tab. The browser connects via WebSocket to the broker, which spawns an isolated PTY running Claude Code. Each user gets their own PTY session with isolated config and credentials.

**WebSocket terminal pipeline:**
```
xterm.js (browser) → WSS → Broker → node-pty (PTY per user) → Claude Code
```

**Per-user isolation:**
- `CLAUDE_CONFIG_DIR` — separate config directory per user, preventing cross-contamination
- `CLAUDE_CODE_OAUTH_TOKEN` — each user's auth token injected into their PTY environment

**Authentication methods for Claude Code:**
- **Setup token auth (recommended)** — `claude setup-token` configures the user's Claude subscription credentials. The broker injects the token via environment variable.
- **API key (fallback)** — Users can provide an Anthropic API key in Connections, used for the Chat tab's API mode.

**Session persistence:** PTY sessions survive browser disconnects. If a user closes their tab and reopens it, they reconnect to the same running PTY. The terminal state (scrollback, running processes) is preserved.

**PTY implementation:** The broker uses `node-pty` for PTY spawning, with `Bun.spawn` as a fallback if node-pty is unavailable.

### API Chat Mode (Fallback)

Users provide an Anthropic API key in Connections. The broker calls the Claude API directly with prompt caching and token optimization. Costs per-token. Available in the Chat tab.

### Why Two Modes?

The browser terminal gives users the full Claude Code experience (file editing, terminal commands, tool use) through their own subscription at no extra cost. The API chat mode is a simpler fallback for users without a Claude subscription.

| | Browser Terminal | API Chat |
|--|-----------------|----------|
| AI access | Claude Code (subscription) | Anthropic API (per-token) |
| Cost to user | $0 extra (included in Pro/Max) | Pay per token |
| Auth | Setup token (subscription) | API key in Connections |
| Capabilities | Full (file edit, terminal, tools) | Chat only |
| Requires install | No | No |

---

## Team & Project Rules System

Rules are markdown instructions that Claude must follow. They're injected as cached system prompts to minimize token usage.

### Team Rules
- Set by team owners/admins in Team Settings
- Apply to ALL projects in the team
- Great for: coding standards, token efficiency rules, behavior guidelines
- Stored in `teams.rules` column

### Project Rules
- Set by any team member in the project sidebar
- Apply only to that specific project
- Great for: tech stack, conventions, file structure, deployment notes
- Stored in `projects.rules` column

### Default Token Optimization Template
```markdown
# Token Efficiency Rules
- Be concise. Avoid unnecessary explanations.
- Only read files directly relevant to the task.
- Do not repeat back large blocks of code — reference by filename and line.
- Summarize changes rather than showing full diffs.
- Do not refactor code unrelated to the current task.
```

### How Rules Are Sent to Claude
```
[Team Rules — prompt cached, 90% cheaper after first message]
[Project Rules — prompt cached]
[Conversation history]
[User's message]
```

---

## Why Cloudflare (Not Firebase, Vercel, etc.)

The VM sits behind a corporate firewall — no inbound connections allowed. We need a **tunnel** that reaches out from the VM to the internet.

**Why Cloudflare?**
1. **Cloudflare Tunnel** is free, production-grade, and provides a permanent URL
2. The domain routes through Cloudflare's DNS to the tunnel
3. One URL serves everything — no CORS, no split architecture

---

## Domain & Tunnel Setup

**Domain:** `orbitai.work` (Cloudflare Registrar)
**Tunnel:** Named tunnel `orbit-ai` (free, permanent, unlimited bandwidth)

```
VM runs: cloudflared tunnel run orbit-ai
  → Outbound connection to Cloudflare edge
  → orbitai.work CNAME → tunnel UUID
  → Browser request → Cloudflare → tunnel → localhost:5000
```

The tunnel stays running permanently. On deploys, only the broker restarts — zero downtime.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime | Bun 1.3.12 | Broker server, SQLite, bcrypt |
| HTTP Framework | Hono 4.12 | API routes, middleware, SSE, static files |
| Database | SQLite (bun:sqlite) | All data, WAL mode, foreign keys |
| Auth | jose 6.2 (JWT HS256) | 24h token expiry |
| Google Auth | Firebase Auth SDK | Google OAuth popup |
| Encryption | AES-256-GCM (crypto.ts) | Token encryption at rest |
| AI (API mode) | @anthropic-ai/sdk 0.88 | Claude chat with streaming |
| AI (Terminal) | Claude Code CLI | Runs in per-user PTY via browser terminal |
| PTY | node-pty (fallback: Bun.spawn) | Per-user terminal process spawning |
| WebSocket | Built-in (Bun/Hono) | Browser terminal ↔ PTY communication |
| Terminal UI | xterm.js | Terminal emulator in browser |
| Frontend | React 19 + Vite 8 + Tailwind 4 | Dashboard SPA |
| State | Zustand 5.0 | Auth + sessionStorage persistence |
| Routing | react-router-dom 7.14 | SPA with auth guards |
| Desktop App | Tauri v2 (Rust) | Optional native window + embedded PTY |
| Tunnel | cloudflared (named tunnel) | HTTPS tunnel to VM |
| CI/CD | GitHub Actions | Auto-build desktop app on tag push |
| Domain | orbitai.work (Cloudflare) | Permanent URL |

---

## Database Schema (SQLite — packages/broker/team.db)

### users
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | `user-{random}` |
| username | TEXT UNIQUE | Login name |
| display_name | TEXT | Shown in UI |
| password_hash | TEXT | bcrypt cost 12 |
| email | TEXT UNIQUE | Optional, for Google auth |
| created_at | DATETIME | |
| last_seen | DATETIME | Updated on every authenticated request |

### teams
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | `team-{slug}-{random}` |
| name | TEXT | Team display name |
| slug | TEXT UNIQUE | URL-safe name |
| owner_id | TEXT FK→users | Team creator (transferable) |
| rules | TEXT | Team-wide Claude instructions (markdown) |
| created_at | DATETIME | |

### team_members
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| team_id | TEXT FK→teams | |
| user_id | TEXT FK→users | |
| role | TEXT | owner, admin, or member |
| joined_at | DATETIME | |
| UNIQUE(team_id, user_id) | | |

### team_invites
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| team_id | TEXT FK→teams | |
| code | TEXT UNIQUE | Format: XXXX-XXXX |
| created_by | TEXT FK→users | |
| max_uses | INTEGER | NULL = unlimited |
| use_count | INTEGER | Incremented on join |
| expires_at | DATETIME | NULL = never |
| created_at | DATETIME | |

### projects
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | `proj-{slug}-{random}` |
| name | TEXT UNIQUE | |
| path | TEXT UNIQUE | Filesystem path on VM |
| opencode_port | INTEGER UNIQUE | Starting at 4096 |
| description | TEXT | |
| team_id | TEXT FK→teams | Scopes project to a team |
| rules | TEXT | Project-specific Claude instructions (markdown) |
| created_at | DATETIME | |

### sessions
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| project_id | TEXT FK→projects | |
| user_id | TEXT FK→users | |
| title | TEXT | |
| status | TEXT | idle, thinking, error, ended |
| created_at / updated_at | DATETIME | |

### messages
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| session_id | TEXT | Links to session |
| role | TEXT | user or assistant |
| content | TEXT | Message text |
| created_at | DATETIME | |

### file_locks
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| project_id | TEXT FK→projects | |
| file_path | TEXT | |
| user_id | TEXT FK→users | Lock owner |
| session_id | TEXT | |
| locked_at | DATETIME | |
| UNIQUE(project_id, file_path) | | One lock per file |

### activity
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| project_id, user_id, session_id | TEXT | |
| event_type | TEXT | file.edited, bash.ran, session.created, etc. |
| file_path | TEXT | Optional |
| detail | TEXT | JSON metadata |
| created_at | DATETIME | |

### token_usage
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| session_id, user_id, project_id | TEXT | |
| input_tokens, output_tokens | INTEGER | |
| model | TEXT | |
| recorded_at | DATETIME | |

### user_connections
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| user_id | TEXT FK→users | Connection owner |
| provider | TEXT | `claude` or `github` |
| token | TEXT | Encrypted at rest (AES-256-GCM) |
| created_at | DATETIME | |
| updated_at | DATETIME | |
| UNIQUE(user_id, provider) | | One connection per provider per user |

---

## Automatic File Locking

When a user opens a project terminal, the broker starts a filesystem watcher (`fs.watch` with `recursive: true`) on the project directory. Any file change automatically locks that file for the active user.

### How it works

```
User opens project terminal
  → Broker starts fs.watch on project directory
  → Claude Code edits a file
  → fs.watch detects the change
  → Broker auto-locks the file for that user (INSERT OR REPLACE into file_locks)
  → Broadcasts "lock.acquired" to all connected clients
  → Other users see the lock in the File Locks sidebar panel
```

### Lock lifecycle

1. **Acquired automatically** — when a file changes in a watched project directory
2. **Visible in real-time** — sidebar shows "file.ts locked by Hayden" with color coding (green = yours, orange = someone else's)
3. **Conflict prevention** — if another user's terminal changes a file already locked by someone else, the lock is NOT overridden
4. **Released on disconnect** — when all of a user's browser tabs disconnect, all their locks are released and broadcast

### Ignored files

The watcher ignores: `node_modules/`, `.git/`, `.DS_Store`, `__pycache__/`, `.pyc`, `.swp`, `.lock`, `package-lock.json`, `bun.lockb`, `.env`

### Implementation

- `packages/broker/src/filewatcher.ts` — filesystem watcher module
- One watcher per user per project (keyed by `userId:projectId`)
- Started in WebSocket `open` handler, stopped in `close` handler
- Uses the existing `broadcast()` SSE system for real-time updates

---

## Security

### Token Encryption
All tokens (Claude API key, GitHub PAT) are encrypted using **AES-256-GCM** before storage. The encryption key is auto-generated on first run (saved to `packages/broker/.encryption-key`, gitignored) or read from `ENCRYPTION_KEY` env var.

Format: `iv:ciphertext:tag` (hex-encoded). Even with direct DB access, tokens are unreadable without the server-side key.

### Per-User Isolation
- Connection routes are scoped to the authenticated user's JWT
- No endpoint returns another user's tokens
- Status endpoints only return `{ connected: true/false }`
- Git push uses the current user's token, not a shared credential
- Terminal PTYs are isolated: each user gets their own `CLAUDE_CONFIG_DIR` and `CLAUDE_CODE_OAUTH_TOKEN`
- PTY processes run in the user's project directory with scoped environment variables

### Team Ownership Transfer
Team owners can transfer ownership to another member via `POST /teams/:id/transfer`. The old owner becomes admin, the new owner gets full control.

---

## Auth System

### JWT Structure
- Algorithm: HS256, Expiry: 24 hours
- Payload: `{ sub, username, display_name, team_id?, team_role? }`

### Auth Flows
- **Username/Password**: signup/login → JWT + user + teams
- **Google OAuth**: Firebase popup → ID token → broker verifies via Google JWKS → JWT
- **Team Selection**: issues new JWT with team_id + team_role baked in

---

## API Endpoints

### No Auth Required
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/signup | Create account |
| POST | /api/auth/login | Login, returns teams |
| POST | /api/auth/google | Google OAuth token exchange |

### Auth Required (no team)
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/auth/me | Current user info |
| GET | /api/auth/teams | User's team list |
| POST | /api/auth/select-team | Set active team, get new JWT |
| POST | /api/teams | Create team (+ first invite code) |
| POST | /api/teams/join | Join team with invite code |
| GET | /api/teams/:id | Team details |
| GET | /api/teams/:id/members | List members |
| PATCH | /api/teams/:id | Update team name |
| GET | /api/teams/:id/rules | Get team rules |
| PUT | /api/teams/:id/rules | Set team rules (owner/admin) |
| POST | /api/teams/:id/transfer | Transfer ownership to member |
| DELETE | /api/teams/:id/members/:userId | Remove member |
| PATCH | /api/teams/:id/members/:userId | Change role |
| POST | /api/teams/:id/invites | Generate invite code |
| GET | /api/teams/:id/invites | List invite codes |
| DELETE | /api/teams/:id/invites/:id | Revoke code |

### Auth + Team Required
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/projects | List team's projects |
| POST | /api/projects | Create project (git clone, zip, or blank) |
| GET | /api/projects/:id | Project details |
| DELETE | /api/projects/:id | Remove project |
| GET | /api/projects/:id/rules | Get project rules |
| PUT | /api/projects/:id/rules | Set project rules |
| POST | /api/projects/:id/upload | Upload zip file to project |
| GET | /api/projects/:id/git/status | Git status, branch, changed files |
| POST | /api/projects/:id/git/init | Initialize git repo, set remote |
| POST | /api/projects/:id/git/commit | Stage all + commit with user's name |
| POST | /api/projects/:id/git/push | Push using user's GitHub token |
| POST | /api/projects/:id/git/pull | Pull with rebase using user's token |
| GET | /api/sessions | Active sessions |
| POST | /api/sessions | Create session |
| GET | /api/chat/:sessionId/messages | Chat history |
| POST | /api/chat/:sessionId | Send message (SSE stream) |
| GET | /api/locks | All file locks |
| POST | /api/locks | Acquire lock |
| GET | /api/connections | List user's connected providers |
| GET | /api/connections/claude/status | Check if user has Claude connected |
| GET | /api/connections/github/status | Check if user has GitHub connected |
| PUT | /api/connections/:provider | Save encrypted token |
| DELETE | /api/connections/:provider | Remove connection |
| GET | /api/activity/recent | Activity feed |
| GET | /api/activity/stream | SSE real-time stream |

### WebSocket
| Path | Description |
|------|-------------|
| /ws/terminal | Browser terminal ↔ PTY. Authenticated via JWT query param. |

---

## Frontend Pages

| Route | Page | Auth | Description |
|-------|------|------|-------------|
| /login | LoginPage | Public | Google sign-in + username/password login |
| /signup | SignupPage | Public | Create account + Google sign-up |
| /download | DownloadPage | Public | Optional desktop app download (platform picker) |
| /teams | TeamSelectionPage | Token | Create, join, or select team |
| /teams/:id/settings#members | TeamSettingsPage | Token | Members tab: roles, invites, ownership transfer |
| /teams/:id/settings#rules | TeamSettingsPage | Token | Rules tab: multiple rule blocks, all combined for Claude |
| /connections | ConnectionsPage | Token+Team | Claude (setup token or API key) + GitHub token, side-by-side layout |
| / | ProjectsPage | Token+Team | 3-column dashboard: left nav, center projects, right activity feed |
| /project/:id | ProjectPage | Token+Team | Terminal tab + Chat tab, sidebar (rules, git, locks, activity, users) |

### Dashboard Layout (ProjectsPage)

3-column layout with symmetric sidebars:

```
┌──────────────┬────────────────────────────┬──────────────┐
│  Left Nav    │     Center Content         │  Activity    │
│  (w-60)      │     (max 900px, centered)  │  Feed (w-60) │
├──────────────┼────────────────────────────┼──────────────┤
│ + New Project│  Stats: Projects, Users,   │  user1       │
│              │  Sessions, AI Thinking     │  edited file │
│ Manage Team  │                            │              │
│ Team Rules   │  Active AI Sessions        │  user2       │
│ Connections  │                            │  created     │
│ Switch Team  │  Project cards (2-col grid) │  session     │
│ ──────────── │                            │              │
│ Team: name   │                            │              │
└──────────────┴────────────────────────────┴──────────────┘
```

### Team Settings Page

Tabbed page controlled by URL hash:
- **#members** — Member list, role management (owner/admin/member), invite code generation, ownership transfer
- **#rules** — Multiple rule blocks, each with a title and content textarea. All blocks are stored as JSON array and combined when sent to Claude. Project rules add to team rules, never replace them.

### Project Page Layout

```
┌──────────────────────────────────────────┬──────────────────┐
│  [Terminal] [Chat]  tabs                 │  Who's Here      │
├──────────────────────────────────────────│  Project Rules   │
│  Left: slash commands              Right: │  File Locks      │
│  [/login][/plan][/compact][/clear]       │  Git             │
│  [/cost][/help] | [Paste][Paste Token]   │  Recent Activity │
│  [Upload Image]    [Swap Model][Launch]  │                  │
│                                          │                  │
│  xterm.js terminal                       │                  │
│  (WebSocket → PTY on VM, Opus 4.6)      │                  │
└──────────────────────────────────────────┴──────────────────┘
```

**Launch Claude popup** — opens when clicking "Launch Claude" button:
- Standard: default Opus 4.6
- Skip Permissions: auto-approve all (--dangerously-skip-permissions)
- Plan Mode: starts Claude then enters /plan
- Resume Session: continues last conversation (--continue)

**Swap Model popup** — opens when clicking "Swap Model" button:
- Opus 4.6 (Recommended) — most capable, 1M context
- Sonnet 4.6 — fast, everyday coding
- Haiku 4.5 (Fastest) — quick edits, simple tasks

### Key Components
- **WebTerminal** — xterm.js terminal with split toolbar: slash commands + paste/upload on left, Swap Model + Launch Claude on right. Default model: Opus 4.6.
- **Chat tab** — API-mode chat with Claude (requires API key in Connections)
- **OrbitalBackground** — Animated starfield with twinkling stars, nebula gradients, shooting stars
- **CommandPalette** — Ctrl+K project search
- **Hamburger Sidebar** — Manage Team, Connections, Switch Team, Sign Out

---

## WebSocket Terminal Architecture

The browser terminal is the core of Orbit AI's Claude Code integration. Here is the full pipeline:

```
┌─────────────┐     WSS      ┌─────────────┐    stdin/stdout    ┌──────────────┐
│  Browser     │ ──────────→  │   Broker     │ ────────────────→ │  PTY Process │
│  (xterm.js)  │ ←────────── │  (WebSocket) │ ←──────────────── │  (node-pty)  │
└─────────────┘              └─────────────┘                    └──────────────┘
                                                                       │
                                                                 Claude Code CLI
                                                                 (user's subscription)
```

### Connection lifecycle:
1. User opens Terminal tab in a project
2. Browser establishes WSS connection to `/ws/terminal` with JWT auth
3. Broker spawns a PTY (node-pty, fallback to Bun.spawn) in the project directory
4. Environment is configured with `CLAUDE_CONFIG_DIR` and `CLAUDE_CODE_OAUTH_TOKEN` for isolation
5. Keystrokes flow from xterm.js → WebSocket → PTY stdin
6. PTY stdout → WebSocket → xterm.js rendering
7. If the browser disconnects, the PTY keeps running
8. On reconnect, the user resumes the same session (scrollback and state intact)

### Per-user environment variables:
| Variable | Purpose |
|----------|---------|
| `CLAUDE_CONFIG_DIR` | Isolates Claude Code config per user |
| `CLAUDE_CODE_OAUTH_TOKEN` | User's subscription auth token |

---

## Project Deployment Workflow

Orbit AI is a development environment, not a hosting platform. Users write code, then deploy through their own CI/CD.

```
1. Create project (clone repo, upload zip, or blank)
2. Work with Claude (Terminal tab for full Claude Code, Chat tab for API mode)
3. See changes in Git panel (sidebar)
4. Commit with a message
5. Push → uses YOUR GitHub token → your repo
6. Your CI/CD (GitHub Actions, Vercel, Firebase) deploys automatically
```

### Per-User Git Authentication
Each user's GitHub PAT is stored encrypted in `user_connections`. On push:
- Token is decrypted, injected as `https://x-access-token:{token}@github.com/...`
- Push happens under that user's identity
- Token is scrubbed from error messages

### Project Sources
| Method | Description |
|--------|-------------|
| Git clone | Paste a repo URL, cloned to VM |
| Zip upload | Upload .zip, extracted to project directory |
| Blank | Empty directory, init git manually |

---

## Desktop App (Tauri v2) — Optional

The desktop app is an optional alternative for users who prefer a native window. It is **not required** — the browser terminal provides the same Claude Code experience.

### Architecture

The desktop app has a **split view**:
- **Top**: iframe loading `orbitai.work` — full dashboard with all team features
- **Bottom**: embedded terminal (xterm.js + portable-pty) running the user's shell

### Building
```bash
cd packages/desktop
npm install        # Tauri CLI
npm run build      # Release binary
```

### CI/CD — GitHub Actions
The `.github/workflows/build-desktop.yml` workflow:
- Triggers on `v*` tag push or manual dispatch
- Builds for Windows (.exe/.msi), macOS (.dmg ARM+Intel), Linux (.AppImage/.deb)
- Creates a GitHub Release with all installers

```bash
git tag v0.1.0 && git push origin v0.1.0  # Triggers build + release
```

### Download Page
`/download` on the site auto-detects the user's OS and shows download links from the latest GitHub Release. The page is kept but not prominently linked — most users should use the browser terminal instead.

---

## Auto-Deploy (VM)

`auto-deploy.sh` runs in background, polls GitHub every 60s:

```
New commits on main detected
  → git reset --hard origin/main
  → npm/bun install (if deps changed)
  → vite build (dashboard)
  → restart broker
  → verify tunnel is alive (restart if dead)
  → periodic tunnel health check every cycle
```

---

## File Structure

```
orbit-ai/
├── .github/
│   └── workflows/
│       └── build-desktop.yml   ← CI: build Tauri for all platforms
├── packages/
│   ├── broker/
│   │   ├── src/
│   │   │   ├── index.ts        ← All API routes + static serving
│   │   │   ├── terminal.ts     ← WebSocket terminal + PTY management
│   │   │   ├── auth.ts         ← JWT + middleware
│   │   │   ├── crypto.ts       ← AES-256-GCM encrypt/decrypt
│   │   │   ├── db.ts           ← SQLite schema + migrations
│   │   │   └── seed.ts         ← Test data seeder
│   │   ├── .encryption-key     ← Auto-generated, gitignored
│   │   ├── team.db             ← SQLite database, gitignored
│   │   └── package.json
│   ├── dashboard/
│   │   ├── src/
│   │   │   ├── pages/          ← Login, Signup, Download, Teams, Projects, Project, Connections
│   │   │   ├── components/     ← ChatWindow, OrbitalBackground, CommandPalette, etc.
│   │   │   ├── hooks/          ← useBroker (all API methods)
│   │   │   ├── stores/         ← authStore (Zustand + sessionStorage)
│   │   │   ├── firebase.ts     ← Google Auth config
│   │   │   ├── App.tsx         ← Router with auth guards
│   │   │   └── index.css       ← Tailwind theme + animations
│   │   ├── dist/               ← Built static files (served by broker)
│   │   └── package.json
│   ├── desktop/                ← Optional Tauri desktop app
│   │   ├── package.json        ← Tauri CLI
│   │   ├── BUILD.md            ← Build instructions
│   │   ├── icon.svg            ← App icon source (planet + ring)
│   │   ├── dist/
│   │   │   └── index.html      ← Split view: iframe + xterm.js terminal
│   │   └── src-tauri/
│   │       ├── Cargo.toml      ← Rust deps (tauri, portable-pty, tokio)
│   │       ├── tauri.conf.json ← Window config, CSP, bundle settings
│   │       ├── capabilities/   ← Tauri v2 permission grants
│   │       ├── build.rs
│   │       ├── src/main.rs     ← PTY spawn, event streaming, IPC commands
│   │       └── icons/          ← Generated from icon.svg during CI build
│   └── opencode-plugin/        ← Reserved for future OpenCode integration
├── projects/                   ← Cloned project repos (on VM)
├── setup-tunnel.sh             ← One-time Cloudflare tunnel setup
├── start.sh                    ← Start broker + tunnel
├── stop.sh                     ← Stop broker (--all for tunnel too)
├── auto-deploy.sh              ← Polls GitHub, rebuilds, restarts, health checks
├── ARCHITECTURE.md             ← This file
├── firebase.json               ← Firebase config (OAuth only)
└── package.json                ← Workspace root
```

---

## Ports

| Port | Service | Notes |
|------|---------|-------|
| 5000 | Broker (API + dashboard + WebSocket) | Main server |
| 3000 | Vite dev server | Development only |
| 4096+ | Reserved for OpenCode | Per-project, future use |

---

## Firebase Setup

**Project:** `orbitai-dashboard`
**Used for:** Google OAuth only

- Google sign-in enabled
- `orbitai-dashboard.firebaseapp.com` as authDomain (not custom domain — avoids redirect loop)

---

## Development

```bash
# Dev servers with hot reload
cd packages/broker && bun run --watch src/index.ts &
cd packages/dashboard && npx vite &

# Deploy: just push to main
git push origin main
# VM auto-pulls within 60s, rebuilds dashboard, restarts broker

# Desktop app dev (optional)
cd packages/desktop && npm run dev

# Release desktop app
git tag v0.2.0 && git push origin v0.2.0
# GitHub Actions builds for all platforms, creates release
```
