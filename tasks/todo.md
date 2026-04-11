# AI Dashboard — Task Tracker

## Sprint 1: Validation + Project Setup (Days 1-3)

- [x] Initialize monorepo structure (packages/broker, dashboard, opencode-plugin)
- [x] Install OpenCode 1.4.3 locally, `opencode serve` works, API responds
- [x] Install `@opencode-ai/sdk` 1.4.3, test script written
- [ ] Test 2 concurrent sessions against same OpenCode instance
- [x] Document: Bun 1.3.12 via WinGet, needs chmod in bash. Using bun:sqlite (no better-sqlite3)

## Sprint 2: Broker Server (Days 4-8)

- [x] `bun init` broker package, install deps (hono 4.12, zod 4.3, jose 6.2)
- [x] SQLite schema: users, projects, sessions, file_locks, activity, token_usage
- [x] REST API: auth endpoints (login, me) with JWT
- [x] REST API: projects + sessions endpoints
- [x] REST API: file locks (GET/POST/DELETE + session release)
- [x] REST API: activity feed (recent + SSE stream + broadcast)
- [ ] Event subscriber: connect to OpenCode SSE, write to SQLite
- [x] Test all endpoints — login, projects, locks all working
- [x] Seed script with test users (hayden, alice, bob) and projects (CRM, Helpdesk, Infrastructure)

## Sprint 3: Dashboard MVP (Days 9-16)

- [x] Vite 8 + React 19 + TS + Tailwind 4 scaffold
- [x] Zustand stores (authStore, sessionStore, lockStore)
- [x] useOpenCode hook (SDK wrapper with session mgmt, message send, SSE, abort)
- [x] useBroker hook (REST API wrapper for all broker endpoints)
- [x] LoginPage (username/password form, dark theme)
- [x] ProjectsPage (project cards grid with active user count, live status)
- [x] ProjectPage (70/30 split: chat left, who's here + locks + activity right)
- [x] ChatWindow + MessageBubble components (streaming, tool call cards)
- [x] FileLockIndicator + SessionStatus components
- [ ] Connect to real backends (need both broker + opencode running simultaneously)
- [ ] Build succeeds (verified)

## Sprint 4: Plugin + Integration (Days 17-20)

- [ ] team-coordinator.ts OpenCode plugin
- [ ] End-to-end lock enforcement test
- [ ] Fix issues, document findings

## Post-MVP: Deploy to Jumpbox

- [ ] Provision jumpbox (Ubuntu, 16GB RAM)
- [ ] Install runtimes, deploy all packages
- [ ] Nginx + SSL config
- [ ] PM2 ecosystem file
- [ ] Team onboarding

---

## Review Notes
(Added after each sprint)
