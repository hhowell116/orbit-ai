import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useBroker } from "../hooks/useBroker";
import { OrbitalBackground } from "../components/OrbitalBackground";

export function ConnectionsPage() {
  const navigate = useNavigate();
  const { selectedTeam, activeTeam } = useAuthStore();
  const team = selectedTeam || activeTeam;
  const broker = useBroker();
  const [claudeStatus, setClaudeStatus] = useState<{ connected: boolean; reason?: string; loading: boolean }>({ connected: false, loading: true });
  const [githubStatus, setGithubStatus] = useState<{ connected: boolean; reason?: string; loading: boolean }>({ connected: false, loading: true });
  const [error, setError] = useState("");

  useEffect(() => {
    // Check connection statuses
    broker.rawFetch("/connections/claude/status")
      .then((data: any) => setClaudeStatus({ connected: data.connected, reason: data.reason, loading: false }))
      .catch(() => setClaudeStatus({ connected: false, reason: "Could not reach server", loading: false }));

    broker.rawFetch("/connections/github/status")
      .then((data: any) => setGithubStatus({ connected: data.connected, reason: data.reason, loading: false }))
      .catch(() => setGithubStatus({ connected: false, reason: "Could not reach server", loading: false }));
  }, []);

  function handleGithubConnect() {
    setError("GitHub OAuth coming soon — need to create a GitHub OAuth App first.");
  }

  const connections = [
    {
      id: "claude",
      name: "Claude AI",
      description: claudeStatus.connected
        ? "Connected via OpenCode — Claude can read, edit files, and run commands in your projects"
        : claudeStatus.reason || "Connect Claude to power AI coding sessions",
      icon: (
        <svg viewBox="0 0 200 200" className="w-10 h-10">
          <defs>
            <radialGradient id="cg" cx="40%" cy="38%">
              <stop offset="0%" stopColor="#D4A574" />
              <stop offset="100%" stopColor="#8B6914" />
            </radialGradient>
          </defs>
          <circle cx="100" cy="100" r="85" fill="url(#cg)" />
          <text x="100" y="120" textAnchor="middle" fill="white" fontSize="70" fontWeight="bold" fontFamily="serif">C</text>
        </svg>
      ),
      connected: claudeStatus.connected,
      loading: claudeStatus.loading,
      features: [
        "Read and search project files",
        "Edit code with AI assistance",
        "Run terminal commands",
        "Session persistence and history",
        "File lock coordination across team",
      ],
    },
    {
      id: "github",
      name: "GitHub",
      description: githubStatus.connected
        ? "Connected — clone repos, push changes, manage branches"
        : "Connect GitHub to clone repositories and manage code",
      icon: (
        <svg viewBox="0 0 24 24" className="w-10 h-10" fill="var(--color-text-primary)">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
        </svg>
      ),
      connected: githubStatus.connected,
      loading: githubStatus.loading,
      features: [
        "Clone repositories into projects",
        "Push and pull changes",
        "Branch management",
        "Pull request integration",
      ],
      onConnect: handleGithubConnect,
    },
  ];

  return (
    <div className="min-h-screen relative" style={{ background: "var(--color-bg-base)" }}>
      <OrbitalBackground />

      <header className="px-6 py-4 flex items-center gap-4 relative"
        style={{ zIndex: 1, borderBottom: "1px solid var(--color-border)" }}>
        <button onClick={() => navigate("/")} className="text-sm transition-colors" style={{ color: "var(--color-text-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-primary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}>
          &larr; Dashboard
        </button>
        <div className="pl-4" style={{ borderLeft: "1px solid var(--color-border)" }}>
          <h1 className="font-medium" style={{ color: "var(--color-text-primary)" }}>Connections</h1>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Manage integrations for {team?.name || "your team"}</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-6 relative" style={{ zIndex: 1 }}>
        {error && (
          <div className="mb-6 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--color-warning-muted)", color: "var(--color-warning)" }}>
            {error}
          </div>
        )}

        <div className="space-y-4">
          {connections.map((conn) => (
            <div key={conn.id} className="rounded-xl overflow-hidden"
              style={{ background: "var(--color-bg-surface)", border: `1px solid ${conn.connected ? "rgba(127,216,143,0.3)" : "var(--color-border)"}` }}>

              {/* Header */}
              <div className="p-6 flex items-start gap-4">
                <div className="shrink-0">{conn.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium" style={{ color: "var(--color-text-primary)" }}>{conn.name}</h3>
                    {conn.loading ? (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--color-bg-hover)", color: "var(--color-text-muted)" }}>
                        Checking...
                      </span>
                    ) : conn.connected ? (
                      <span className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full"
                        style={{ background: "var(--color-success-muted)", color: "var(--color-success)" }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-success)" }} />
                        Connected
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: "var(--color-warning-muted)", color: "var(--color-warning)" }}>
                        Not connected
                      </span>
                    )}
                  </div>
                  <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{conn.description}</p>
                </div>
                {!conn.connected && !conn.loading && conn.onConnect && (
                  <button onClick={conn.onConnect} className="shrink-0 text-xs px-4 py-2 rounded-lg font-medium"
                    style={{ background: "var(--color-primary)", color: "var(--color-text-inverse)" }}>
                    Connect
                  </button>
                )}
              </div>

              {/* Features */}
              <div className="px-6 pb-5">
                <div className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>
                  {conn.connected ? "Active features" : "Features when connected"}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {conn.features.map((f) => (
                    <div key={f} className="flex items-center gap-2 text-xs" style={{ color: conn.connected ? "var(--color-text-primary)" : "var(--color-text-muted)" }}>
                      <span style={{ color: conn.connected ? "var(--color-success)" : "var(--color-text-muted)" }}>
                        {conn.connected ? "+" : "·"}
                      </span>
                      {f}
                    </div>
                  ))}
                </div>
              </div>

              {/* Info bar */}
              {conn.id === "claude" && !conn.connected && !conn.loading && (
                <div className="px-6 py-3 text-xs" style={{ borderTop: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                  Claude connects automatically via OpenCode when the server is running. No API key needed — uses your Claude subscription.
                </div>
              )}
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
              <div key={name} className="rounded-lg p-4 text-center"
                style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", opacity: 0.5 }}>
                <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>{name}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
