import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useBroker } from "../hooks/useBroker";
import { OrbitalBackground } from "../components/OrbitalBackground";

interface Connection {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  connected: boolean;
  status?: string;
  onConnect: () => void;
  onDisconnect?: () => void;
}

export function ConnectionsPage() {
  const navigate = useNavigate();
  const { selectedTeam } = useAuthStore();
  const broker = useBroker();
  const [claudeConnecting, setClaudeConnecting] = useState(false);
  const [githubConnecting, setGithubConnecting] = useState(false);
  const [claudeConnected, setClaudeConnected] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);
  const [error, setError] = useState("");

  async function handleClaudeConnect() {
    setError("");
    setClaudeConnecting(true);
    try {
      // Try to initiate OpenCode OAuth flow for Anthropic
      const res = await broker.rawFetch("/opencode/auth/login", { method: "POST" });
      if (res.url) {
        // OAuth URL returned — open in popup
        const popup = window.open(res.url, "claude-auth", "width=500,height=700,popup=yes");
        // Poll for completion
        const interval = setInterval(async () => {
          try {
            const status = await broker.rawFetch("/opencode/auth/status");
            if (status.authenticated) {
              clearInterval(interval);
              setClaudeConnected(true);
              setClaudeConnecting(false);
              popup?.close();
            }
          } catch {}
        }, 2000);
        // Timeout after 2 minutes
        setTimeout(() => {
          clearInterval(interval);
          setClaudeConnecting(false);
        }, 120000);
        return;
      }
      // If no OAuth URL, check if already connected via plugin
      setClaudeConnected(true);
    } catch {
      // Check if Claude is already available via the auth plugin
      try {
        const res = await broker.rawFetch("/opencode/provider");
        const providers = Array.isArray(res) ? res : [];
        const anthropic = providers.find((p: any) => p.id?.includes("anthropic") || p.name?.includes("Anthropic"));
        if (anthropic) {
          setClaudeConnected(true);
        } else {
          setError("Claude connection requires OpenCode to be running with the claude-auth plugin on the server.");
        }
      } catch {
        setError("Could not reach OpenCode server. Make sure it's running on the VM.");
      }
    } finally {
      setClaudeConnecting(false);
    }
  }

  async function handleGithubConnect() {
    setError("");
    setGithubConnecting(true);
    try {
      // GitHub OAuth flow
      // For now, open GitHub's OAuth authorize URL
      // TODO: Create a GitHub OAuth App and use its client_id
      const clientId = "YOUR_GITHUB_CLIENT_ID"; // Replace after creating GitHub OAuth App
      const redirectUri = encodeURIComponent(window.location.origin + "/connections/github/callback");
      const scope = encodeURIComponent("repo read:user");
      window.open(
        `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}`,
        "github-auth",
        "width=500,height=700,popup=yes"
      );
      // TODO: Handle callback
      setTimeout(() => setGithubConnecting(false), 5000);
    } catch (err: any) {
      setError(err.message || "GitHub connection failed");
      setGithubConnecting(false);
    }
  }

  const connections: Connection[] = [
    {
      id: "claude",
      name: "Claude AI",
      description: claudeConnected
        ? "Connected — Claude can read, edit files, and run commands in your projects"
        : "Connect your Claude subscription to power AI coding sessions",
      icon: (
        <svg viewBox="0 0 200 200" className="w-10 h-10">
          <defs>
            <radialGradient id="claudeGrad" cx="40%" cy="38%">
              <stop offset="0%" stopColor="#D4A574" />
              <stop offset="100%" stopColor="#8B6914" />
            </radialGradient>
          </defs>
          <circle cx="100" cy="100" r="85" fill="url(#claudeGrad)" />
          <text x="100" y="120" textAnchor="middle" fill="white" fontSize="70" fontWeight="bold" fontFamily="serif">C</text>
        </svg>
      ),
      connected: claudeConnected,
      status: claudeConnected ? "Active" : undefined,
      onConnect: handleClaudeConnect,
      onDisconnect: () => setClaudeConnected(false),
    },
    {
      id: "github",
      name: "GitHub",
      description: githubConnected
        ? "Connected — Clone repos, push changes, and manage branches from Orbit AI"
        : "Connect GitHub to clone repositories and push changes directly",
      icon: (
        <svg viewBox="0 0 24 24" className="w-10 h-10" fill="var(--color-text-primary)">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
        </svg>
      ),
      connected: githubConnected,
      status: githubConnected ? "Active" : undefined,
      onConnect: handleGithubConnect,
      onDisconnect: () => setGithubConnected(false),
    },
  ];

  return (
    <div className="min-h-screen relative" style={{ background: "var(--color-bg-base)" }}>
      <OrbitalBackground />

      <header
        className="px-6 py-4 flex items-center gap-4 relative"
        style={{ zIndex: 1, borderBottom: "1px solid var(--color-border)" }}
      >
        <button
          onClick={() => navigate("/")}
          className="text-sm transition-colors"
          style={{ color: "var(--color-text-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-primary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
        >
          &larr; Dashboard
        </button>
        <div className="pl-4" style={{ borderLeft: "1px solid var(--color-border)" }}>
          <h1 className="font-medium" style={{ color: "var(--color-text-primary)" }}>Connections</h1>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Manage integrations for {selectedTeam?.name || "your team"}</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-6 relative" style={{ zIndex: 1 }}>
        {error && (
          <div
            className="mb-6 rounded-lg px-4 py-3 text-sm"
            style={{ background: "var(--color-error-muted)", color: "var(--color-error)" }}
          >
            {error}
          </div>
        )}

        <div className="space-y-4">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className="rounded-xl p-6 transition-all"
              style={{
                background: "var(--color-bg-surface)",
                border: `1px solid ${conn.connected ? "rgba(127, 216, 143, 0.3)" : "var(--color-border)"}`,
              }}
            >
              <div className="flex items-start gap-4">
                <div className="shrink-0">{conn.icon}</div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium" style={{ color: "var(--color-text-primary)" }}>
                      {conn.name}
                    </h3>
                    {conn.connected && (
                      <span
                        className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full"
                        style={{ background: "var(--color-success-muted)", color: "var(--color-success)" }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-success)" }} />
                        {conn.status}
                      </span>
                    )}
                  </div>
                  <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                    {conn.description}
                  </p>
                </div>

                <div className="shrink-0">
                  {conn.connected ? (
                    <button
                      onClick={conn.onDisconnect}
                      className="text-xs px-4 py-2 rounded-lg transition-colors"
                      style={{ background: "var(--color-bg-hover)", color: "var(--color-text-secondary)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--color-error-muted)";
                        e.currentTarget.style.color = "var(--color-error)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "var(--color-bg-hover)";
                        e.currentTarget.style.color = "var(--color-text-secondary)";
                      }}
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={conn.onConnect}
                      disabled={conn.id === "claude" ? claudeConnecting : githubConnecting}
                      className="text-xs px-4 py-2 rounded-lg transition-all font-medium"
                      style={{
                        background: "var(--color-primary)",
                        color: "var(--color-text-inverse)",
                      }}
                    >
                      {(conn.id === "claude" ? claudeConnecting : githubConnecting) ? (
                        <span className="flex items-center gap-2">
                          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          Connecting...
                        </span>
                      ) : (
                        "Connect"
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Coming soon */}
        <div className="mt-8">
          <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: "var(--color-text-muted)" }}>
            Coming Soon
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {["GitLab", "Jira", "Slack", "Linear"].map((name) => (
              <div
                key={name}
                className="rounded-lg p-4 text-center"
                style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", opacity: 0.5 }}
              >
                <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>{name}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
