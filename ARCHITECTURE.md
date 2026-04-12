# Orbit AI — Complete Architecture & Setup Guide

## What Is This

Orbit AI is a multi-tenant, team-based AI coding platform. Teams sign up, create workspaces, add projects (via git clone or blank), and chat with Claude AI inside each project. File locks, activity feeds, and real-time presence keep team members coordinated.

---

## Infrastructure Overview

```
[Browser] --HTTPS--> [Cloudflare Tunnel] --HTTP--> [Broker :5000]
                                                     |
                                            +--------+--------+
                                            |                 |
                                      [Dashboard]       [SQLite DB]
                                     (static files)    (team.db)
                                                            |
                                                     [Anthropic API]
                                                      (Claude chat)
```

**Everything runs on one VM.** The Bun-based broker serves both the API and the React dashboard. A Cloudflare tunnel exposes it to the internet with HTTPS. Firebase is used only for Google OAuth (no hosting).

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
| Tunnel | cloudflared | Free HTTPS tunnel to VM |

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

### Install & Run
```bash
git clone https://github.com/hhowell116/orbit-ai.git
cd orbit-ai

# Install dependencies
npm install                                    # root workspace
cd packages/broker && bun install && cd ../..  # broker deps
cd packages/dashboard && npm install && cd ../.  # dashboard deps

# Seed database (creates test users + team)
cd packages/broker && bun run src/seed.ts && cd ../..

# Build dashboard
cd packages/dashboard && npx vite build && cd ../..

# Start everything
./start.sh
```

### start.sh / stop.sh
- `start.sh` — Kills old processes, starts broker on :5000, starts Cloudflare tunnel, prints the public URL
- `stop.sh` — Kills broker and tunnel

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
| anthropic_api_key | TEXT | Claude API key for the team |
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
| GET | /api/teams/:id | Team details (has_api_key boolean) |
| GET | /api/teams/:id/members | List members |
| PATCH | /api/teams/:id | Update team name/API key |
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
| /teams/:id/settings | TeamSettingsPage | Token | Members, invites, Claude API key |
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

1. Team admin adds Anthropic API key in Team Settings
2. User opens a project → session created (`session-{projectId}`)
3. User sends message → saved to `messages` table
4. Broker loads conversation history, calls Anthropic API with streaming
5. Response streamed token-by-token via SSE to the browser
6. Full response saved to `messages` table
7. Model: `claude-sonnet-4-20250514`, max_tokens: 8192

---

## Firebase Setup

**Project:** `orbitai-dashboard`
**Used for:** Google OAuth only (hosting disabled)

Firebase Auth must have Google sign-in enabled and the tunnel domain added to authorized domains.

Config lives in `packages/dashboard/src/firebase.ts`.

---

## Cloudflare Tunnel

**Type:** Ad-hoc (free, no domain required)
**Command:** `cloudflared tunnel --url http://localhost:5000`
**URL:** Random `*.trycloudflare.com` subdomain (changes on restart)

The tunnel URL must be added to Firebase Auth authorized domains each time it changes.

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
│   │   │   ├── firebase.ts     ← Google Auth config
│   │   │   ├── App.tsx         ← Router
│   │   │   ├── main.tsx        ← Entry point
│   │   │   └── index.css       ← Tailwind + theme variables
│   │   ├── dist/               ← Built static files (served by broker)
│   │   └── package.json
│   └── opencode-plugin/        ← Stub for file lock enforcement
├── projects/                   ← Cloned project repos stored here
├── start.sh                    ← Start broker + tunnel
├── stop.sh                     ← Stop everything
├── firebase.json               ← Firebase hosting config
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
