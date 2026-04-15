# VM Setup Instructions — Browser Terminal

After the auto-deploy pulls the latest code, run these steps on the VM to enable the browser-based terminal.

## 1. Install build dependencies (needed for node-pty)

```bash
sudo apt-get update
sudo apt-get install -y build-essential python3
```

## 2. Install Claude Code globally

```bash
npm install -g @anthropic-ai/claude-code
```

Verify it works: `claude --version`

## 3. Create user data directory

```bash
mkdir -p /path/to/orbit-ai/user-data
```

Replace `/path/to/orbit-ai` with the actual repo path on the VM (e.g., `/home/user/orbit-ai` or `/repo`).

## 4. Install broker dependencies (compiles node-pty)

```bash
cd /path/to/orbit-ai/packages/broker
npm install
```

This will compile the native `node-pty` module. If it fails, the terminal will fall back to `Bun.spawn` (less feature-rich but functional).

## 5. Restart the broker

```bash
cd /path/to/orbit-ai
./stop.sh
./start.sh
```

Or let auto-deploy handle the restart.

## 6. Install dashboard dependencies (xterm.js)

```bash
cd /path/to/orbit-ai/packages/dashboard
npm install
npx vite build
```

## How it works

- Users open a project on orbitai.work → Terminal tab
- Browser connects via WebSocket to the broker
- Broker spawns a PTY per user with isolated Claude Code config
- Each user's setup token (from `claude setup-token`) is used for auth
- Sessions persist across browser disconnects

## Environment variables (optional)

- `USERS_DATA_DIR` — override user data directory (default: `orbit-ai/user-data/`)
- `BROKER_PORT` — broker port (default: 5000)

## Troubleshooting

**node-pty fails to install:**
- Make sure `build-essential` and `python3` are installed
- Try: `npm rebuild node-pty`

**Terminal shows "Failed to create terminal session":**
- Check broker logs: `tail -50 /tmp/orbit-broker.log`
- Verify user-data directory exists and is writable

**Claude Code not found:**
- Make sure it's installed globally: `npm install -g @anthropic-ai/claude-code`
- Verify: `which claude` should return a path
