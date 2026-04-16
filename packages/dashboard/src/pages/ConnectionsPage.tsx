import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useBroker } from "../hooks/useBroker";
import { OrbitalBackground } from "../components/OrbitalBackground";

export function ConnectionsPage() {
  const navigate = useNavigate();
  const broker = useBroker();

  const [claudeConnected, setClaudeConnected] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  // Claude form
  const [apiKey, setApiKey] = useState("");
  const [claudeMethod, setClaudeMethod] = useState<"setup_token" | "api_key">("setup_token");
  const [claudeSaving, setClaudeSaving] = useState(false);
  const [claudeMsg, setClaudeMsg] = useState("");

  // GitHub form
  const [githubToken, setGithubToken] = useState("");
  const [githubSaving, setGithubSaving] = useState(false);
  const [githubMsg, setGithubMsg] = useState("");

  useEffect(() => {
    Promise.all([
      broker.rawFetch("/connections/claude/status").then((d: any) => setClaudeConnected(d.connected)),
      broker.rawFetch("/connections/github/status").then((d: any) => setGithubConnected(d.connected)),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleSaveClaude() {
    if (!apiKey) return;
    setClaudeSaving(true);
    setClaudeMsg("");
    try {
      await broker.saveConnection("claude", apiKey);
      setClaudeConnected(true);
      setApiKey("");
      setClaudeMsg("Connected!");
      setTimeout(() => setClaudeMsg(""), 3000);
    } catch (err: any) {
      setClaudeMsg(err.message || "Failed to save");
    } finally {
      setClaudeSaving(false);
    }
  }

  async function handleDisconnectClaude() {
    if (!confirm("Disconnect Claude? AI chat will stop working.")) return;
    try {
      await broker.deleteConnection("claude");
      setClaudeConnected(false);
    } catch {}
  }

  async function handleSaveGithub() {
    if (!githubToken) return;
    setGithubSaving(true);
    setGithubMsg("");
    try {
      await broker.saveConnection("github", githubToken);
      setGithubConnected(true);
      setGithubToken("");
      setGithubMsg("Connected!");
      setTimeout(() => setGithubMsg(""), 3000);
    } catch (err: any) {
      setGithubMsg(err.message || "Failed to save");
    } finally {
      setGithubSaving(false);
    }
  }

  async function handleDisconnectGithub() {
    if (!confirm("Disconnect GitHub?")) return;
    try {
      await broker.deleteConnection("github");
      setGithubConnected(false);
    } catch {}
  }

  const statusBadge = (connected: boolean) =>
    loading ? (
      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--color-bg-hover)", color: "var(--color-text-muted)" }}>
        Checking...
      </span>
    ) : connected ? (
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
    );

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
          <h1 className="font-medium" style={{ color: "var(--color-text-primary)" }}>My Connections</h1>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Your personal API keys and integrations</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 relative" style={{ zIndex: 1 }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">

          {/* Claude AI Connection */}
          <div className="rounded-xl overflow-hidden"
            style={{ background: "var(--color-bg-surface)", border: `1px solid ${claudeConnected ? "rgba(127,216,143,0.3)" : "var(--color-border)"}` }}>

            <div className="p-6 flex items-start gap-4">
              <div className="shrink-0">
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
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium" style={{ color: "var(--color-text-primary)" }}>Claude AI</h3>
                  {statusBadge(claudeConnected)}
                </div>
                <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  {claudeConnected
                    ? "Your Claude API key is connected — you can use AI coding sessions"
                    : "Add your Anthropic API key to power AI coding sessions"}
                </p>
              </div>
              {claudeConnected && !loading && (
                <button onClick={handleDisconnectClaude} className="shrink-0 text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: "var(--color-error-muted)", color: "var(--color-error)" }}>
                  Disconnect
                </button>
              )}
            </div>

            {/* Features */}
            <div className="px-6 pb-4">
              <div className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>
                {claudeConnected ? "Active features" : "Features when connected"}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {["Read and search project files", "Edit code with AI assistance", "Run terminal commands", "Session persistence and history", "File lock coordination across team"].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-xs" style={{ color: claudeConnected ? "var(--color-text-primary)" : "var(--color-text-muted)" }}>
                    <span style={{ color: claudeConnected ? "var(--color-success)" : "var(--color-text-muted)" }}>
                      {claudeConnected ? "+" : "\u00b7"}
                    </span>
                    {f}
                  </div>
                ))}
              </div>
            </div>

            {/* Auth setup */}
            {!claudeConnected && !loading && (
              <div className="px-6 pb-6" style={{ borderTop: "1px solid var(--color-border)", paddingTop: "16px" }}>
                {/* Method toggle */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setClaudeMethod("setup_token")}
                    className="flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: claudeMethod === "setup_token" ? "var(--color-primary-muted)" : "var(--color-bg-elevated)",
                      color: claudeMethod === "setup_token" ? "var(--color-primary)" : "var(--color-text-muted)",
                      border: `1px solid ${claudeMethod === "setup_token" ? "var(--color-primary)" : "var(--color-border)"}`,
                    }}>
                    Setup Token (Recommended)
                  </button>
                  <button
                    onClick={() => setClaudeMethod("api_key")}
                    className="flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: claudeMethod === "api_key" ? "var(--color-primary-muted)" : "var(--color-bg-elevated)",
                      color: claudeMethod === "api_key" ? "var(--color-primary)" : "var(--color-text-muted)",
                      border: `1px solid ${claudeMethod === "api_key" ? "var(--color-primary)" : "var(--color-border)"}`,
                    }}>
                    API Key
                  </button>
                </div>

                {claudeMethod === "setup_token" ? (
                  <div>
                    <div className="rounded-lg p-3 mb-3" style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}>
                      <p className="text-xs font-medium mb-2" style={{ color: "var(--color-text-primary)" }}>How to get your setup token:</p>
                      <ol className="text-xs space-y-1.5" style={{ color: "var(--color-text-secondary)", paddingLeft: "16px" }}>
                        <li>Open a terminal on your computer</li>
                        <li>Run: <code className="px-1 py-0.5 rounded text-xs" style={{ background: "var(--color-bg-hover)", color: "var(--color-primary)" }}>claude setup-token</code></li>
                        <li>Sign in when prompted (uses your Claude subscription)</li>
                        <li>Copy the token that starts with <code style={{ color: "var(--color-primary)" }}>sk-ant-oat01-...</code></li>
                        <li>Paste it below</li>
                      </ol>
                      <p className="text-xs mt-2" style={{ color: "var(--color-text-muted)" }}>
                        This uses your existing Claude Pro/Max subscription — no extra API charges.
                        Token is valid for 1 year.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg text-sm font-mono focus:outline-none"
                        style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                        onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                        onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
                        placeholder="sk-ant-oat01-..."
                      />
                      <button onClick={handleSaveClaude} disabled={claudeSaving || !apiKey}
                        className="px-4 py-2 rounded-lg text-sm font-medium"
                        style={{
                          background: claudeSaving || !apiKey ? "var(--color-bg-hover)" : "var(--color-primary)",
                          color: claudeSaving || !apiKey ? "var(--color-text-muted)" : "var(--color-text-inverse)",
                        }}>
                        {claudeSaving ? "Saving..." : "Connect"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs mb-3" style={{ color: "var(--color-text-secondary)" }}>
                      Enter your Anthropic API key. Get one at{" "}
                      <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener"
                        style={{ color: "var(--color-primary)" }}>console.anthropic.com</a>.
                      Billed per-token.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg text-sm font-mono focus:outline-none"
                        style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                        onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                        onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
                        placeholder="sk-ant-api..."
                      />
                      <button onClick={handleSaveClaude} disabled={claudeSaving || !apiKey}
                        className="px-4 py-2 rounded-lg text-sm font-medium"
                        style={{
                          background: claudeSaving || !apiKey ? "var(--color-bg-hover)" : "var(--color-primary)",
                          color: claudeSaving || !apiKey ? "var(--color-text-muted)" : "var(--color-text-inverse)",
                        }}>
                        {claudeSaving ? "Saving..." : "Connect"}
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-xs mt-2" style={{ color: "var(--color-text-muted)" }}>
                  Your token is stored securely and only used for your sessions. Other team members cannot see it.
                </p>
                {claudeMsg && (
                  <p className="text-xs mt-2" style={{ color: claudeMsg === "Connected!" ? "var(--color-success)" : "var(--color-error)" }}>{claudeMsg}</p>
                )}
              </div>
            )}
          </div>

          {/* GitHub Connection */}
          <div className="rounded-xl overflow-hidden"
            style={{ background: "var(--color-bg-surface)", border: `1px solid ${githubConnected ? "rgba(127,216,143,0.3)" : "var(--color-border)"}` }}>

            <div className="p-6 flex items-start gap-4">
              <div className="shrink-0">
                <svg viewBox="0 0 24 24" className="w-10 h-10" fill="var(--color-text-primary)">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium" style={{ color: "var(--color-text-primary)" }}>GitHub</h3>
                  {statusBadge(githubConnected)}
                </div>
                <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  {githubConnected
                    ? "Your GitHub token is connected — clone repos, push changes, manage branches"
                    : "Add your GitHub token to clone repositories and manage code"}
                </p>
              </div>
              {githubConnected && !loading && (
                <button onClick={handleDisconnectGithub} className="shrink-0 text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: "var(--color-error-muted)", color: "var(--color-error)" }}>
                  Disconnect
                </button>
              )}
            </div>

            {/* Features */}
            <div className="px-6 pb-4">
              <div className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>
                {githubConnected ? "Active features" : "Features when connected"}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {["Clone repositories into projects", "Push and pull changes", "Branch management", "Pull request integration"].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-xs" style={{ color: githubConnected ? "var(--color-text-primary)" : "var(--color-text-muted)" }}>
                    <span style={{ color: githubConnected ? "var(--color-success)" : "var(--color-text-muted)" }}>
                      {githubConnected ? "+" : "\u00b7"}
                    </span>
                    {f}
                  </div>
                ))}
              </div>
            </div>

            {/* GitHub token input */}
            {!githubConnected && !loading && (
              <div className="px-6 pb-6" style={{ borderTop: "1px solid var(--color-border)", paddingTop: "16px" }}>
                <p className="text-xs mb-3" style={{ color: "var(--color-text-secondary)" }}>
                  Enter a GitHub Personal Access Token. Create one at{" "}
                  <a href="https://github.com/settings/tokens" target="_blank" rel="noopener"
                    style={{ color: "var(--color-primary)" }}>github.com/settings/tokens</a>
                  {" "}with <span className="font-mono">repo</span> scope.
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg text-sm font-mono focus:outline-none"
                    style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                    onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                    onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
                    placeholder="ghp_..."
                  />
                  <button onClick={handleSaveGithub} disabled={githubSaving || !githubToken}
                    className="px-4 py-2 rounded-lg text-sm font-medium"
                    style={{
                      background: githubSaving || !githubToken ? "var(--color-bg-hover)" : "var(--color-primary)",
                      color: githubSaving || !githubToken ? "var(--color-text-muted)" : "var(--color-text-inverse)",
                    }}>
                    {githubSaving ? "Saving..." : "Connect"}
                  </button>
                </div>
                <p className="text-xs mt-2" style={{ color: "var(--color-text-muted)" }}>
                  Your token is stored securely and only used for your sessions. Other team members cannot see it.
                </p>
                {githubMsg && (
                  <p className="text-xs mt-2" style={{ color: githubMsg === "Connected!" ? "var(--color-success)" : "var(--color-error)" }}>{githubMsg}</p>
                )}
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
