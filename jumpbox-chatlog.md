# Jumpbox Setup Chatlog — April 11-12, 2026

Session with Claude Code on Ubuntu VM (rowecasa@172.26.158.246, public IP: 139.180.41.90)

---

## Session Start — Project Setup

**User:** Running Claude Code on an Ubuntu VM. Has a project called Orbit AI on GitHub that was copied from local machine. Asked Claude to clone it and get up to speed.

**Actions:**
- Cloned `github.com/hhowell116/orbit-ai` to `/home/rowecasa/orbit-ai/`
- Read every file in the project: projectplan.txt, claudeworkfloworchestration.txt, all broker source, all dashboard source, all configs
- Saved memory notes about the user (Hayden Howell, IT team lead) and project status

**Project state at start:**
- Monorepo with 3 packages: broker, dashboard, opencode-plugin
- Broker: Hono + SQLite, JWT auth, REST API built
- Dashboard: React + Vite + Tailwind, UI scaffolded with demo data fallbacks
- Sprint 1-3 mostly done, Sprint 4+ not started
- Key lesson: Anthropic killed third-party OAuth (Feb 2026), need API keys

---

## Phase 1 — VM Prerequisites

**User:** "Set everything up and let me know if you get stuck"

**Actions:**
1. Checked existing tools: Node 18 found, no Bun, no Firebase CLI
2. Installed Bun 1.3.12 via `curl -fsSL https://bun.sh/install | bash`
3. No sudo access — installed Node 20 via NVM (nvm install 20)
4. Installed Firebase CLI under Node 20: `npm install -g firebase-tools`
5. Verified all tools: Node 20.20.2, npm 10.8.2, Bun 1.3.12, Firebase 15.14.0

---

## Phase 2 — Dependencies & Broker

**Actions:**
1. `npm install` at root (monorepo workspaces)
2. `bun install` in packages/broker
3. `npm install` in packages/dashboard
4. Seeded broker database: 3 users (hayden, alice, bob), 3 projects (CRM, Helpdesk, Infrastructure)
5. Started broker on port 5000, tested health + login + projects endpoints — all working

---

## Phase 3 — Dashboard Build

**Issues found and fixed:**
1. `CommandPalette.tsx` — unused import `useNavigate` → removed
2. `useOpenCode.ts` — `client.session.chat` doesn't exist in SDK → changed to `client.session.prompt`
3. `ProjectPage.tsx` — unused variable `user` → prefixed with underscore

**Result:** TypeScript clean, Vite build successful (344KB JS, 17KB CSS)

---

## Phase 4 — First Firebase Deploy

- Deployed to `orbitai-hub` project (was the default in .firebaserc)
- Live at https://orbitai-hub.web.app
- Dashboard loaded but showed demo data (broker not reachable from Firebase hosting)

---

## Phase 5 — VM Screen Timeout Fix

**User:** Asked to prevent VM from timing out to login screen

**Actions:**
```bash
gsettings set org.gnome.desktop.session idle-delay 0
gsettings set org.gnome.desktop.screensaver lock-enabled false
gsettings set org.gnome.desktop.screensaver idle-activation-enabled false
```

---

## Phase 6 — Making It Real (No Demo Data)

**User:** "I want the actual auth to work, no demo data, ability to upload projects"

**Actions:**
1. Installed OpenCode 1.4.3 globally: `npm install -g opencode-ai@1.4.3`
2. Installed cloudflared binary to `~/.local/bin/cloudflared`
3. Rewrote LoginPage — removed Claude OAuth attempt, clean username/password form
4. Stripped all DEMO_PROJECTS, DEMO_ACTIVITY, DEMO_SESSIONS from ProjectsPage and ProjectPage
5. Made broker URL configurable via `VITE_BROKER_URL` env var
6. Added project creation endpoint to broker (POST /projects with git clone support)
7. Started Cloudflare quick tunnel → got random trycloudflare.com URL
8. Set .env.production with tunnel URL, rebuilt, redeployed

**Tested:** Login through tunnel URL worked end-to-end with real data from broker

---

## Phase 7 — Serving Everything From Broker

**User:** "I don't want to pay for anything" (re: Cloudflare named tunnel needing a domain)

**Decision:** Serve dashboard static files directly through the broker, use one tunnel URL for everything.

**Actions:**
1. Added `serveStatic` from hono/bun to broker — serves dashboard dist files
2. Moved API routes under `/api` prefix
3. Fixed auth route ordering (login must be outside auth middleware)
4. Dashboard now uses relative `/api` URLs — no VITE_BROKER_URL needed
5. Created `start.sh` and `stop.sh` scripts
6. Added "New Project" modal to ProjectsPage (name, git URL, description)
7. Added delete project button on project cards
8. Broker creates projects by cloning git repos to `/orbit-ai/projects/`

---

## Phase 8 — Multi-Tenant Team System

**User:** "If I were to advertise this site and make money off it, how would we do multiple team sessions?"

**Discussion:** Covered auth options (Firebase Auth free up to 10K users, BYOK model for Claude). User wanted: create team → generate invite code → teammates join with code.

**Entered Plan Mode.** Designed full multi-tenant architecture:

**Database changes:**
- Added `teams` table (id, name, slug, owner_id, anthropic_api_key)
- Added `team_members` table (team_id, user_id, role)
- Added `team_invites` table (team_id, code, max_uses, use_count, expires_at)
- Added `team_id` column to projects (migration)
- Added `email` column to users (migration)

**Auth changes:**
- JWT payload extended with `team_id` + `team_role`
- `createToken()` accepts optional team parameter
- New `requireTeam` middleware
- Routes split: auth-only vs auth+team

**New API endpoints:**
- POST /api/auth/signup — self-service registration
- POST /api/auth/google — Google OAuth token exchange
- GET /api/auth/teams — user's team list
- POST /api/auth/select-team — set active team, get new JWT
- POST /api/teams — create team (auto-generates invite code)
- POST /api/teams/join — join with invite code
- GET/PATCH /api/teams/:id — team details/update
- Full invite CRUD
- All data endpoints scoped by team_id

**New frontend pages:**
- SignupPage — display name, username, email, password
- TeamSelectionPage — tabs: Your Teams / Create Team / Join Team
- TeamSettingsPage — members, roles, invite codes, API key

**Modified pages:**
- LoginPage — added signup link, post-login routes to team selection
- ProjectsPage — shows team name in header, settings link, switch team button
- App.tsx — new router with AuthOnlyLayout + ProtectedLayout

**Auth store rewrite:**
- Added teams[], activeTeam, sessionStorage persistence
- No more logout on page refresh

**Seed script updated:** Creates default "IT Department" team, assigns all users, generates invite code

---

## Phase 9 — Google Auth via Firebase

**User:** "Let's turn on Google auth in Firebase"

**Actions:**
1. Initially used `orbitai-hub` project, then user asked to switch to `orbitai-dashboard`
2. Created web app in orbitai-dashboard Firebase project
3. Installed Firebase SDK: `npm install firebase`
4. Created `firebase.ts` with project config and GoogleAuthProvider
5. Added `POST /api/auth/google` endpoint to broker:
   - Verifies Firebase ID token using Google JWKS (jose library)
   - Creates or finds user by email
   - Returns broker JWT + teams
6. Added "Continue with Google" button to LoginPage and SignupPage
7. User enabled Google sign-in provider in Firebase console
8. User added tunnel domain to Firebase Auth authorized domains

---

## Phase 10 — Firebase Hosting Cleanup

**User:** "Why can't we use the Firebase URL? Do we even need Firebase hosting?"

**Explanation:** Firebase hosting is just static files — can't reach the broker. The broker already serves the dashboard. Firebase is only needed for Google Auth SDK.

**Action:** Disabled Firebase hosting: `firebase hosting:disable --project orbitai-dashboard --force`

**Result:** One URL only (tunnel URL), no confusion.

---

## Phase 11 — Claude Chat Integration

**User:** "We need a connect to Claude button so we can actually start using it"

**Actions:**
1. Installed `@anthropic-ai/sdk` in broker
2. Added `messages` table to SQLite (session_id, role, content)
3. Added "Connect to Claude" section in TeamSettingsPage:
   - Shows connected/disconnected status
   - API key input (owner/admin only)
   - Saves to teams.anthropic_api_key
4. Added chat endpoints:
   - GET /api/chat/:sessionId/messages — conversation history
   - POST /api/chat/:sessionId — send message, stream Claude response via SSE
5. Rewrote ProjectPage to use broker chat instead of OpenCode:
   - Messages saved in SQLite
   - Streaming responses displayed token-by-token
   - Session per project (session-{projectId})
6. Added streaming handler in useBroker hook (ReadableStream + SSE parsing)

**User clarification:** "People should authenticate with Claude credentials, not just API key"
**Response:** Anthropic killed third-party OAuth. API key is the only way currently. User insisted credentials work — left both options in settings for now.

---

## Phase 12 — Push to GitHub

**User:** "Create a massive summary and push to GitHub"

**Actions:**
1. Wrote comprehensive ARCHITECTURE.md (full setup guide, all endpoints, schemas, auth flows)
2. Updated .gitignore (added *.db-shm, *.db-wal, .firebase/, .env.production)
3. Installed gh CLI binary
4. User authenticated with GitHub (already logged in as hhowell116)
5. Committed all changes (23 files, 2486 insertions, 459 deletions)
6. Pushed to github.com/hhowell116/orbit-ai

---

## Final State

**Running on jumpbox:**
- Broker on port 5000 (Bun process)
- Cloudflare tunnel → `spaces-run-viii-relying.trycloudflare.com`
- SQLite database with seeded data

**Infrastructure:**
- VM: Ubuntu, public IP 139.180.41.90, user rowecasa
- Bun 1.3.12, Node 20.20.2, Firebase CLI 15.14.0
- Cloudflared 2026.3.0

**What works:**
- Sign up (username/password or Google)
- Login (username/password or Google)
- Create team → generates invite code
- Join team with invite code
- Team selection (auto-select if only one team)
- Team settings (members, roles, invite codes, Claude API key)
- Create projects (blank or git clone)
- Delete projects
- Project dashboard with stats, activity feed
- Claude chat with streaming (requires API key in team settings)
- File lock UI (display, not yet enforced)
- Session persistence (survives page refresh)
- Command palette (Ctrl+K)

**What's not done yet:**
- OpenCode integration (file editing, bash commands via Claude)
- File lock enforcement (plugin not built)
- OpenCode event subscriber

---

## Session 2 — April 10-12, 2026 (Local Machine + VM)

Session with Claude Code on Hayden's local Windows machine, refining the dashboard and connecting to the VM.

### What was done:

**1. Deep dive & planning**
- Read full project plan (projectplan.txt) — all 8 phases
- Researched OpenCode auth: discovered `opencode-claude-auth` plugin that uses Claude Code's local OAuth credentials (no API key needed)
- Researched competing platforms (Replit, Vercel, CodeSandbox, Linear) for dashboard feature ideas
- Created detailed implementation plan merging architecture doc with OpenCode

**2. OpenCode validation**
- Installed OpenCode 1.4.3 on local machine
- Tested `opencode serve` — API responds, sessions create/list/delete
- Installed `@opencode-ai/sdk` 1.4.3 — mapped full API shape
- Tested Claude responding through OpenCode with subscription auth (no API key)
- Confirmed: Dashboard → Broker → OpenCode → Claude flow works

**3. Dashboard UI overhaul**
- Restyled entire dashboard to match OpenCode's design system:
  - Colors: primary #fab283, secondary #5c9cf5, accent #9d7cd8, bg #0d1117
  - Dark mode first, JetBrains Mono for code, clean borders
- Added planetary/orbital SVG background theme (planets, rings, stars, moons)
- Added stats bar (projects, active users, sessions, AI thinking)
- Added activity feed sidebar with event icons
- Added Command Palette (Ctrl+K) for instant navigation
- Added active AI sessions section
- Changed branding from "AI Dashboard" to "Orbit AI"
- Planet favicon in browser tab

**4. Firebase deployment**
- Created Firebase project `orbitai-hub`
- Deployed dashboard to `orbitai-hub.web.app`
- Fixed: process/global polyfills for OpenCode SDK in browser
- Fixed: React Router v7 API changes (createBrowserRouter)
- Fixed: catch-all route for /login redirect

**5. VM connection**
- Confirmed broker running on VM at `spaces-run-viii-relying.trycloudflare.com`
- Updated useBroker hook to route to tunnel URL in production
- Login tested end-to-end through tunnel

**6. Google-only login**
- Simplified login page to single "Continue with Google" button
- Removed username/password form from login (kept signup)
- Firebase Auth handles Google OAuth popup

**7. Connections page**
- New `/connections` route with Claude AI and GitHub cards
- Live status check — pings OpenCode on VM to show connected/disconnected
- Feature lists for each integration
- Claude info: "No API key needed — uses your Claude subscription"
- Coming soon section: GitLab, Jira, Slack, Linear
- Prominent "Connections" button in dashboard header

**8. Chat endpoint rewrite — OpenCode proxy**
- Replaced Anthropic SDK direct calls with OpenCode proxy
- Chat flow: user message → broker saves to SQLite → forwards to OpenCode → OpenCode talks to Claude → response streamed back
- OpenCode handles file editing, bash, permissions, sessions, tools
- Tool call events (file edits, bash commands) included in response stream

**9. Auto-deploy script**
- `auto-deploy.sh` — checks GitHub every 60 seconds
- If new commits: git pull → rebuild dashboard → restart broker
- Logs to deploy.log

**10. GitHub repo**
- Made repo public: github.com/hhowell116/orbit-ai
- Multiple commits pushed with all changes

### Current architecture:
```
[Browser] → [Cloudflare Tunnel] → [Broker :5000 on VM]
                                      ├── Serves dashboard (static files)
                                      ├── API endpoints (auth, teams, projects, chat)
                                      ├── SQLite database
                                      └── Proxies chat to [OpenCode :4096+]
                                              └── Claude (via subscription auth plugin)
```

### What works now:
- Google sign-in via Firebase Auth
- Team creation, invite codes, member management
- Project creation (git clone or blank)
- Connections page showing live Claude/GitHub status
- Chat through OpenCode (when running on VM)
- Planetary theme, command palette, activity feed
- Auto-deploy from GitHub

### Still needed:
- OpenCode instances actually running per project on VM
- File lock enforcement plugin
- GitHub OAuth connection
- Chat streaming improvements (token-by-token display)
- Permission approval UI in browser
- Permanent domain/URL (using free random tunnel)
- Claude credential auth (blocked by Anthropic)
- Nginx reverse proxy
- PM2 process management
- SSL certificates
