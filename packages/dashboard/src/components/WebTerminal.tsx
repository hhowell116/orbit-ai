import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { useAuthStore } from "../stores/authStore";

interface WebTerminalProps {
  projectId?: string;
}

export function WebTerminal({ projectId }: WebTerminalProps) {
  const termRef = useRef<HTMLDivElement>(null);
  const termInstance = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("connecting");
  const [errorMsg, setErrorMsg] = useState("");
  const token = useAuthStore((s) => s.token);
  const reconnectTimer = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!termRef.current || !token) return;

    // Initialize xterm.js
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      bracketedPasteMode: false, // Disable bracket paste so tokens paste cleanly in password prompts
      fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
      theme: {
        background: "#0d1117",
        foreground: "#e6edf3",
        cursor: "#fab283",
        cursorAccent: "#0d1117",
        selectionBackground: "rgba(250, 178, 131, 0.2)",
        black: "#0d1117",
        red: "#e06c75",
        green: "#7fd88f",
        yellow: "#f5a742",
        blue: "#5c9cf5",
        magenta: "#9d7cd8",
        cyan: "#56d4dd",
        white: "#e6edf3",
        brightBlack: "#5a6370",
        brightRed: "#e06c75",
        brightGreen: "#7fd88f",
        brightYellow: "#fab283",
        brightBlue: "#79b0f7",
        brightMagenta: "#b294e0",
        brightCyan: "#56d4dd",
        brightWhite: "#ffffff",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(termRef.current);
    fitAddon.fit();

    termInstance.current = term;
    fitAddonRef.current = fitAddon;

    // Welcome message
    term.writeln("\x1b[38;2;250;178;131m  Orbit AI Terminal\x1b[0m");
    term.writeln("\x1b[38;2;139;148;158m  Type \"claude\" to start Claude Code with your subscription.\x1b[0m");
    term.writeln("");

    // Connect WebSocket
    function connect() {
      setStatus("connecting");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/terminal?token=${encodeURIComponent(token!)}&project=${projectId || ""}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
        setErrorMsg("");
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case "output":
              term.write(msg.data);
              break;
            case "connected":
              // Session established
              break;
            case "error":
              setErrorMsg(msg.message);
              setStatus("error");
              term.writeln(`\r\n\x1b[31m${msg.message}\x1b[0m`);
              break;
            case "pong":
              break;
          }
        } catch {
          // Raw data
          term.write(event.data);
        }
      };

      ws.onclose = () => {
        setStatus("disconnected");
        term.writeln("\r\n\x1b[33mDisconnected. Reconnecting...\x1b[0m");
        reconnectTimer.current = window.setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        setStatus("error");
      };
    }

    connect();

    // Send terminal input to server
    term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "input", data }));
      }
    });

    // Handle Ctrl+V paste and Ctrl+C copy
    term.attachCustomKeyEventHandler((e) => {
      if (e.type === "keydown" && e.ctrlKey && e.key === "v") {
        navigator.clipboard.readText().then((text) => {
          if (text && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "input", data: text }));
          }
        }).catch(() => {});
        return false; // Prevent default
      }
      if (e.type === "keydown" && e.ctrlKey && e.key === "c") {
        const selection = term.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection).catch(() => {});
          return false;
        }
        // If no selection, let Ctrl+C through as SIGINT
        return true;
      }
      return true;
    });

    // Handle paste event (right-click paste, etc.)
    termRef.current.addEventListener("paste", (e: ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData?.getData("text");
      if (text && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "input", data: text }));
      }
    });

    // Handle resize
    const ro = new ResizeObserver(() => {
      fitAddon.fit();
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "resize",
          cols: term.cols,
          rows: term.rows,
        }));
      }
    });
    ro.observe(termRef.current);

    // Ping to keep connection alive
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);

    return () => {
      clearInterval(pingInterval);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      ro.disconnect();
      wsRef.current?.close();
      term.dispose();
    };
  }, [token, projectId]);

  function sendCommand(cmd: string) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "input", data: cmd + "\r" }));
    }
  }

  async function handleImageUpload(file: File) {
    if (!file.type.startsWith("image/")) return;
    // Upload image to the project directory on the VM via the broker
    const token = useAuthStore.getState().token;
    if (!token || !projectId) return;

    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`/api/projects/${projectId}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        // Type the file path into the terminal so Claude can reference it
        sendCommand(`# Image uploaded: ${file.name}`);
      }
    } catch {}
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleImageUpload(file);
  }

  function handlePasteImage(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) handleImageUpload(file);
        return;
      }
    }
  }

  const claudeCommands = [
    { label: "claude", cmd: "claude", desc: "Start Claude Code", color: "var(--color-primary)" },
    { label: "Swap Model", cmd: "/model", desc: "Switch Claude model", color: "var(--color-secondary)" },
    { label: "Skip Perms", cmd: "claude --dangerously-skip-permissions", desc: "Start with auto-approve", color: "var(--color-warning)" },
    { label: "/login", cmd: "/login", desc: "Log in to Claude", color: "var(--color-success)" },
    { label: "/plan", cmd: "/plan", desc: "Enter plan mode", color: "var(--color-accent)" },
    { label: "/compact", cmd: "/compact", desc: "Compact context", color: "var(--color-secondary)" },
    { label: "/clear", cmd: "/clear", desc: "Clear conversation", color: "var(--color-text-secondary)" },
    { label: "/cost", cmd: "/cost", desc: "Show token usage", color: "var(--color-text-secondary)" },
    { label: "/help", cmd: "/help", desc: "Show help", color: "var(--color-text-muted)" },
  ];

  return (
    <div className="flex flex-col h-full" style={{ background: "#0d1117" }}>
      {/* Terminal header + Claude buttons */}
      <div className="shrink-0" style={{ background: "var(--color-bg-surface)", borderBottom: "1px solid var(--color-border)" }}>
        <div className="flex items-center justify-between px-3 py-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
              Terminal
            </span>
            <span className={`w-1.5 h-1.5 rounded-full ${status === "connected" ? "animate-none" : "animate-pulse"}`}
              style={{
                background: status === "connected" ? "var(--color-success)"
                  : status === "connecting" ? "var(--color-warning)"
                  : "var(--color-error)"
              }} />
            <span className="text-xs" style={{
              color: status === "connected" ? "var(--color-success)"
                : status === "connecting" ? "var(--color-warning)"
                : "var(--color-error)"
            }}>
              {status === "connected" ? "Connected" : status === "connecting" ? "Connecting..." : "Disconnected"}
            </span>
          </div>
          {errorMsg && (
            <span className="text-xs" style={{ color: "var(--color-error)" }}>{errorMsg}</span>
          )}
        </div>

        {/* Claude Code quick buttons */}
        <div className="flex items-center gap-1.5 px-3 pb-2 flex-wrap">
          {claudeCommands.map((c) => (
            <button key={c.cmd} onClick={() => sendCommand(c.cmd)} title={c.desc}
              className="text-xs px-2.5 py-1 rounded-md transition-all font-medium"
              style={{ background: "var(--color-bg-elevated)", color: c.color, border: "1px solid var(--color-border)" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.color; e.currentTarget.style.background = "var(--color-bg-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.background = "var(--color-bg-elevated)"; }}>
              {c.label}
            </button>
          ))}
          {/* Paste + Token Paste + Upload buttons */}
          <span style={{ width: "1px", height: "16px", background: "var(--color-border)", margin: "0 2px" }} />
          <button onClick={async () => {
            try {
              const text = await navigator.clipboard.readText();
              if (text && wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: "input", data: text }));
              }
            } catch {}
          }} title="Paste text from clipboard"
            className="text-xs px-2.5 py-1 rounded-md transition-all font-medium"
            style={{ background: "var(--color-bg-elevated)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-text-secondary)"; e.currentTarget.style.background = "var(--color-bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.background = "var(--color-bg-elevated)"; }}>
            Paste
          </button>
          <button onClick={async () => {
            try {
              const text = await navigator.clipboard.readText();
              if (text && wsRef.current?.readyState === WebSocket.OPEN) {
                // Send raw text + Enter — designed for password/token prompts
                const cleaned = text.trim();
                wsRef.current.send(JSON.stringify({ type: "input", data: cleaned + "\r" }));
              }
            } catch {}
          }} title="Paste token/password and press Enter (for login prompts)"
            className="text-xs px-2.5 py-1 rounded-md transition-all font-medium"
            style={{ background: "var(--color-bg-elevated)", color: "var(--color-success)", border: "1px solid var(--color-border)" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-success)"; e.currentTarget.style.background = "var(--color-bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.background = "var(--color-bg-elevated)"; }}>
            Paste Token
          </button>
          <label title="Upload image to project" className="text-xs px-2.5 py-1 rounded-md transition-all font-medium"
            style={{ background: "var(--color-bg-elevated)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-text-secondary)"; e.currentTarget.style.background = "var(--color-bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.background = "var(--color-bg-elevated)"; }}>
            Upload Image
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ""; }} />
          </label>
        </div>
      </div>

      {/* Terminal — with drag & paste image support */}
      <div ref={termRef} className="flex-1 min-h-0"
        style={{ padding: "4px" }}
        onDrop={handleFileDrop}
        onDragOver={(e) => e.preventDefault()}
        onPaste={handlePasteImage} />
    </div>
  );
}
