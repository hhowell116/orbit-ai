// PTY worker — runs under Node.js, communicates with Bun broker via TCP socket.
// Bun's stdout pipe handling breaks with long-running processes, so we use TCP instead.

const pty = require("node-pty");
const net = require("net");

const port = parseInt(process.env.PTY_PORT || "0");
const cwd = process.env.PTY_CWD || process.cwd();
const cols = parseInt(process.env.PTY_COLS || "80");
const rows = parseInt(process.env.PTY_ROWS || "24");
const shell = process.env.SHELL || "/bin/bash";

const proc = pty.spawn(shell, [], {
  name: "xterm-256color",
  cols,
  rows,
  cwd,
  env: process.env,
});

const server = net.createServer((socket) => {
  // PTY output → socket
  proc.onData((data) => {
    try { socket.write(JSON.stringify({ t: "o", d: data }) + "\n"); } catch {}
  });

  // Socket → PTY input
  let buf = "";
  socket.on("data", (chunk) => {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.t === "i") proc.write(msg.d);
        if (msg.t === "r") proc.resize(msg.c, msg.r);
      } catch {}
    }
  });

  socket.on("error", () => {});
});

proc.onExit(({ exitCode, signal }) => {
  process.stderr.write(`PTY exited: code=${exitCode} signal=${signal}\n`);
  server.close();
  process.exit(0);
});

server.listen(port, "127.0.0.1", () => {
  const actualPort = server.address().port;
  // One-shot message to parent so it knows where to connect
  process.stdout.write(JSON.stringify({ port: actualPort, pid: proc.pid }) + "\n");
});
