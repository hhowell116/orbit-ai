# Orbit AI — Complete Architecture & Setup Guide

## What Is This

Orbit AI is a multi-tenant, team-based AI coding platform. Teams sign up, create workspaces, add projects (via git clone or blank), and chat with Claude AI inside each project. File locks, activity feeds, and real-time presence keep team members coordinated.

---

## Infrastructure Overview

```
[Browser] --HTTPS--> [Cloudflare DNS] --> [Cloudflare Named Tunnel] --HTTP--> [Broker :5000]
                      (orbitai.work)       (persistent connection)                |
                                                                       +--------+--------+
                                                                       |                 |
                                                                 [Dashboard]       [SQLite DB]
                                                                (static files)    (team.db)
                                                                                       |
                                                                                [Anthropic API]
                                                                                 (Claude chat)
```

**Everything runs on one VM.** The Bun-based broker serves both the API and the React dashboard. A Cloudflare named tunnel exposes it to the internet with HTTPS. Firebase is used only for Google OAuth (no hosting).

---

## Why Cloudflare (Not Firebase, Vercel, etc.)

The VM sits behind a corporate firewall — no inbound connections allowed. We need a **tunnel** that reaches out from the VM to the internet. This rules out traditional hosting.

**Why not Firebase Hosting?** Firebase only serves static files (HTML/CSS/JS). Our broker is a live Bun/Hono server with a SQLite database — Firebase can't run that. Even if we hosted the dashboard on Firebase, the browser still needs to reach the broker API on the VM, which means we'd still need a tunnel. Splitting the dashboard and API across two origins adds CORS complexity for no benefit.

**Why not Vercel/Render/Deno Deploy?** These are cloud platforms that run your code on their infrastructure. Our app needs to run on the VM specifically because that's where the projects, database, and OpenCode instances live. We can't move the backend to the cloud.

**Why Cloudflare specifically?**
1. **Cloudflare Tunnel** is the only free, production-grade tunnel service that provides a permanent URL. The tunnel makes an outbound connection from the VM to Cloudflare's network, bypassing the firewall entirely.
2. **The domain must be on Cloudflare** because the tunnel routing works through Cloudflare's DNS. When someone visits `orbitai.work`, Cloudflare's DNS knows to send that traffic through the tunnel to our VM. A domain on another registrar can't do this without transferring DNS to Cloudflare first.
3. **One URL serves everything** — both the React dashboard and the API come from the same origin (`https://orbitai.work`), so there are no CORS issues, no split architecture, and no hardcoded URLs in the frontend code.

**Why not a free URL?** Free tunnel services (ngrok, trycloudflare.com) either give random/ugly URLs that change on restart, inject interstitial warning pages, or have severe bandwidth limits. A custom domain (~$6.50/yr for `.us`) gives us a permanent, clean, professional URL with zero restrictions.

---

## Domain & Tunnel Setup

**Domain:** `orbitai.work` (registered on Cloudflare Registrar, ~$6.50/yr)
**Tunnel:** Named tunnel `orbit-ai` (free, permanent, unlimited bandwidth)
**Config:** `~/.cloudflared/config.yml` on the VM

### How the tunnel works

```
1. VM runs: cloudflared tunnel run orbit-ai
2. cloudflared makes an OUTBOUND connection to Cloudflare's edge (firewall allows this)
3. Cloudflare DNS has a CNAME: orbitai.work → <tunnel-uuid>.cfargotunnel.com
4. When a browser visits https://orbitai.work:
   - Cloudflare DNS resolves it
   - Cloudflare routes the request through the existing tunnel connection
   - The request arrives at the broker on localhost:5000
   - The response flows back the same way
```

The tunnel stays running permanently. On deploys, only the broker restarts — the tunnel connection is unaffected, so there is zero downtime for DNS/URL changes.

### One-time setup (run once on the VM)

```bash
./setup-tunnel.sh
# This does:
# 1. cloudflared tunnel login (authenticates with Cloudflare)
# 2. cloudflared tunnel create orbit-ai (creates persistent tunnel)
# 3. Writes ~/.cloudflared/config.yml
# 4. cloudflared tunnel route dns orbit-ai orbitai.work (creates DNS record)
```

### Tunnel config (~/.cloudflared/config.yml)

```yaml
tunnel: <TUNNEL-UUID>
credentials-file: ~/.cloudflared/<TUNNEL-UUID>.json

ingress:
  - hostname: orbitai.work
    service: http://localhost:5000
  - hostname: www.orbitai.work
    service: http://localhost:5000
  - service: http_status:404
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime | Bun 1.3.12 | Runs broker server, SQLite, bcrypt |
| HTTP Framework | Hono 4.12 | API routes, middleware, SSE, static files |
| Database | SQLite (bun:sqlite) | All data: users, teams, projects, sessions, messages |
| Auth | jose 6.2 (JWT HS256) | Token creation/verification, 24h expiry |
| Google Auth | Firebase Auth SDK | Google OAuth popup, ID token verification |
| AI | @anthropic-ai/sdk 0.88 | Claude chat with streaming |
| Frontend | React 19 + Vite 8 + Tailwind 4 | Dashboard SPA |
| State | Zustand 5.0 | Auth state + sessionStorage persistence |
| Routing | react-router-dom 7.14 | SPA routing with auth guards |
| Tunnel | cloudflared (named tunnel) | Permanent HTTPS tunnel to VM |
| Domain | orbitai.work (Cloudflare) | Clean permanent URL |

---

## VM Server Setup

### Prerequisites
```bash
# Bun (broker runtime)
curl -fsSL https://bun.sh/install | bash

# Node 20 via NVM (for Firebase CLI and Vite)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 20

# Cloudflared (tunnel)
mkdir -p ~/.local/bin
curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -o ~/.local/bin/cloudflared && chmod +x ~/.local/bin/cloudflared
```

### First-time Install
```bash
git clone https://github.com/hhowell116/orbit-ai.git
cd orbit-ai

# Install dependencies
npm install                                    # root workspace
cd packages/broker && bun install && cd ../..  # broker deps
cd packages/dashboard && npm install && cd ../..  # dashboard deps

# Seed database (creates test users + team)
cd packages/broker && bun run src/seed.ts && cd ../..

# Build dashboard
cd packages/dashboard && npx vite build && cd ../..

# One-time tunnel setup
./setup-tunnel.sh

# Start everything
./start.sh
```

### Scripts

- `setup-tunnel.sh` — One-time: authenticates with Cloudflare, creates named tunnel, sets up DNS
- `start.sh` — Starts broker on :5000, starts tunnel if not already running. Prints `https://orbitai.work`
- `stop.sh` — Stops broker only (tunnel keeps running). Use `--all` to stop both.
- `auto-deploy.sh` — Polls GitHub every 60s, pulls new commits, rebuilds dashboard, restarts broker. Tunnel is never restarted.

### Auto-deploy flow
```
Developer pushes to main → GitHub
  ↓ (within 60 seconds)
auto-deploy.sh detects new commits
  ↓
git pull → npm/bun install (if deps changed) → vite build → restart broker
  ↓
Site is live at https://orbitai.work with new changes
Tunnel stays connected — no URL change, no downtime
```

---

## Ports

| Port | Service | Notes |
|------|---------|-------|
| 5000 | Broker (API + dashboard) | Main server, everything goes here |
| 3000 | Vite dev server | Development only, proxies to :5000 |
| 4096+ | OpenCode instances | Reserved per project, not yet active |

---

## Database Schema (SQLite — packages/broker/team.db)

### users
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | `user-{random}` |
| username | TEXT UNIQUE | Login name |
| display_name | TEXT | Shown in UI |
| password_hash | TEXT | bcrypt cost 12 |
| email | TEXT UNIQUE | Optional, used for Google auth linking |
| created_at | DATETIME | |
| last_seen | DATETIME | Updated on every authenticated request |

### teams
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | `team-{slug}-{random}` |
| name | TEXT | Team display name |
| slug | TEXT UNIQUE | URL-safe name |
| owner_id | TEXT FK→users | Team creator |
| anthropic_api_key | TEXT | DEPRECATED — connections are now per-user |
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
| path | TEXT UNIQUE | Filesystem path |
| opencode_port | INTEGER UNIQUE | Starting at 4096 |
| description | TEXT | |
| team_id | TEXT FK→teams | Scopes project to a team |
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
| line_start / line_end | INTEGER | Optional range |
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

## Security — Token Storage

API keys and tokens (Claude API key, GitHub PAT) are stored **per-user** in the `user_connections` table. Each user manages their own connections — no one else on the team can see or access them.

**Encryption at rest:** All tokens are encrypted using AES-256-GCM before being written to the database. The encryption key is derived from the `BROKER_ENCRYPTION_KEY` environment variable on the server. The database only ever contains ciphertext — even with direct access to `team.db`, tokens cannot be read without the server-side key.

**API isolation:** Connection routes (`GET/PUT/DELETE /api/connections/:provider`) are scoped to the authenticated user's ID from their JWT. There is no endpoint that returns another user's tokens. The `GET` status endpoints only return `{ connected: true/false }`, never the token itself.

---

## Auth System

### JWT Structure
- Algorithm: HS256
- Secret: `BROKER_JWT_SECRET` env var (falls back to dev default)
- Expiry: 24 hours
- Payload: `{ sub, username, display_name, team_id?, team_role? }`

### Auth Flows

**Username/Password:**
1. `POST /api/auth/signup` or `POST /api/auth/login`
2. Broker validates credentials, returns JWT + user + teams list
3. Frontend stores in Zustand + sessionStorage

**Google OAuth:**
1. Firebase `signInWithPopup()` opens Google consent
2. Firebase returns ID token
3. `POST /api/auth/google` — broker verifies token via Google JWKS
4. Creates or finds user by email
5. Returns JWT + user + teams

**Team Selection:**
1. `POST /api/auth/select-team` — issues new JWT with team_id + team_role
2. All subsequent API calls carry team context in the JWT
3. Data endpoints filter by team_id

### Middleware Chain
```
authMiddleware  → Verifies JWT, sets user on context, updates last_seen
requireTeam     → Checks team_id exists in JWT, returns 403 if not
```

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
| DELETE | /api/teams/:id/members/:userId | Remove member |
| PATCH | /api/teams/:id/members/:userId | Change role |
| POST | /api/teams/:id/invites | Generate invite code |
| GET | /api/teams/:id/invites | List invite codes |
| DELETE | /api/teams/:id/invites/:id | Revoke code |

### Auth + Team Required
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/projects | List team's projects |
| POST | /api/projects | Create project (git clone or blank) |
| GET | /api/projects/:id | Project details |
| DELETE | /api/projects/:id | Remove project |
| GET | /api/sessions | Active sessions |
| POST | /api/sessions | Create session |
| GET | /api/chat/:sessionId/messages | Chat history |
| POST | /api/chat/:sessionId | Send message to Claude (SSE stream) |
| GET | /api/locks | All file locks |
| POST | /api/locks | Acquire lock |
| GET | /api/connections | List user's connected providers |
| GET | /api/connections/claude/status | Check if user has Claude connected |
| GET | /api/connections/github/status | Check if user has GitHub connected |
| PUT | /api/connections/:provider | Save encrypted token for provider |
| DELETE | /api/connections/:provider | Remove connection |
| GET | /api/activity/recent | Activity feed |
| GET | /api/activity/stream | SSE real-time stream |
| GET | /api/usage | Token usage stats |

---

## Frontend Pages

| Route | Page | Auth | Description |
|-------|------|------|-------------|
| /login | LoginPage | Public | Username/password + Google sign-in |
| /signup | SignupPage | Public | Create account + Google sign-up |
| /teams | TeamSelectionPage | Token | Create team, join with code, select team |
| /teams/:id/settings | TeamSettingsPage | Token | Members, roles, invite codes |
| /connections | ConnectionsPage | Token+Team | Personal API keys (Claude, GitHub) |
| / | ProjectsPage | Token+Team | Dashboard: projects, stats, activity feed |
| /project/:id | ProjectPage | Token+Team | 70/30 split: Claude chat + sidebar |

### Key Components
- **ChatWindow** — Message input, streaming display, abort button
- **MessageBubble** — User/assistant messages with tool call cards
- **FileLockIndicator** — Color-coded file locks (green=yours, orange=others)
- **SessionStatus** — Thinking dots animation
- **CommandPalette** — Ctrl+K project search
- **OrbitalBackground** — Space-themed SVG background

---

## Claude Chat Flow

1. User adds their own Anthropic API key via Connections page (encrypted and stored per-user)
2. User opens a project → session created (`session-{projectId}`)
3. User sends message → saved to `messages` table
4. Broker retrieves user's encrypted API key, decrypts it, calls Anthropic API with streaming
5. Response streamed token-by-token via SSE to the browser
6. Full response saved to `messages` table
7. Model: `claude-sonnet-4-20250514`, max_tokens: 8192
8. If user has no Claude connection, chat shows warning: "Enable your Claude connection to start working!"

---

## Firebase Setup

**Project:** `orbitai-dashboard`
**Used for:** Google OAuth only (hosting disabled)

Firebase Auth must have:
- Google sign-in enabled
- `orbitai.work` added to authorized domains (one-time, permanent)

Config lives in `packages/dashboard/src/firebase.ts` with `authDomain: "orbitai.work"`.

---

## File Structure

```
orbit-ai/
├── packages/
│   ├── broker/
│   │   ├── src/
│   │   │   ├── index.ts        ← All API routes + static file serving
│   │   │   ├── auth.ts         ← JWT + middleware
│   │   │   ├── db.ts           ← SQLite schema + migrations
│   │   │   └── seed.ts         ← Test data seeder
│   │   ├── team.db             ← SQLite database (gitignored)
│   │   └── package.json
│   ├── dashboard/
│   │   ├── src/
│   │   │   ├── pages/          ← Login, Signup, Teams, Projects, Project
│   │   │   ├── components/     ← ChatWindow, MessageBubble, etc.
│   │   │   ├── hooks/          ← useBroker, useOpenCode
│   │   │   ├── stores/         ← authStore (Zustand)
│   │   │   ├── firebase.ts     ← Google Auth config (authDomain: orbitai.work)
│   │   │   ├── App.tsx         ← Router
│   │   │   ├── main.tsx        ← Entry point
│   │   │   └── index.css       ← Tailwind + theme variables
│   │   ├── dist/               ← Built static files (served by broker)
│   │   └── package.json
│   └── opencode-plugin/        ← Stub for file lock enforcement
├── projects/                   ← Cloned project repos stored here
├── setup-tunnel.sh             ← One-time: create named Cloudflare tunnel
├── start.sh                    ← Start broker + tunnel (if not running)
├── stop.sh                     ← Stop broker (tunnel keeps running)
├── auto-deploy.sh              ← Polls GitHub, rebuilds + restarts broker on new commits
├── firebase.json               ← Firebase config (OAuth only)
├── .firebaserc                 ← Firebase project: orbitai-dashboard
└── package.json                ← Workspace root
```

---

## Seed Data (Test Accounts)

| Username | Password | Email | Team | Role |
|----------|----------|-------|------|------|
| hayden | admin123 | hayden@orbitai.dev | IT Department | owner |
| alice | admin123 | alice@orbitai.dev | IT Department | member |
| bob | admin123 | bob@orbitai.dev | IT Department | member |

Seeded projects: CRM (:4096), Helpdesk (:4097), Infrastructure (:4098)

---

## Development Workflow

```bash
# Start dev servers (broker + dashboard with hot reload)
cd packages/broker && bun run --watch src/index.ts &
cd packages/dashboard && npx vite &

# After making changes to dashboard, rebuild for production
cd packages/dashboard && npx vite build

# Restart broker to pick up backend changes
kill $(lsof -ti:5000) && cd packages/broker && bun run src/index.ts &

# Or just use the scripts
./stop.sh && ./start.sh
```

### Deploy to production
```bash
# Just push to main — the VM handles the rest
git add . && git commit -m "your changes" && git push

# auto-deploy.sh on the VM will:
# 1. Detect the new commit within 60 seconds
# 2. git pull
# 3. Rebuild dashboard (npx vite build)
# 4. Restart broker
# 5. Tunnel stays connected — site is live at https://orbitai.work
```
