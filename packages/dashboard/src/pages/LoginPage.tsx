import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { OrbitalBackground } from "../components/OrbitalBackground";

export function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const { login } = useAuthStore();

  async function handleClaudeLogin() {
    setError("");
    setLoading(true);

    try {
      // Try OpenCode OAuth flow (when backend is running)
      const res = await fetch("/opencode/crm/provider/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "anthropic" }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.open(data.url, "_blank", "width=500,height=700");
          return;
        }
      }

      // Fallback: try broker login
      const brokerRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "hayden", password: "admin123" }),
      });

      if (brokerRes.ok) {
        const data = await brokerRes.json();
        if (data.token) {
          login(data.token, data.user);
          navigate("/");
          return;
        }
      }

      // No backend — show manual login
      setShowManual(true);
    } catch {
      setShowManual(true);
    } finally {
      setLoading(false);
    }
  }

  function handleManualLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError("");

    // Simulate auth — in production this would validate against Anthropic
    setTimeout(() => {
      const name = email.split("@")[0];
      const displayName = name.charAt(0).toUpperCase() + name.slice(1);
      login("claude-session-token", {
        id: `user-${name}`,
        username: name,
        display_name: displayName,
      });
      setLoading(false);
      navigate("/");
    }, 1200);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative"
      style={{ background: "var(--color-bg-base)" }}
    >
      <OrbitalBackground />
      <div className="w-full max-w-sm relative" style={{ zIndex: 1 }}>
        <div
          className="rounded-xl p-8 shadow-2xl"
          style={{
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 mb-4">
              <svg viewBox="0 0 200 200" className="w-20 h-20">
                <defs>
                  <radialGradient id="loginPlanet" cx="40%" cy="38%">
                    <stop offset="0%" stopColor="#fab283" />
                    <stop offset="100%" stopColor="#9d7cd8" />
                  </radialGradient>
                </defs>
                <circle cx="100" cy="100" r="50" fill="url(#loginPlanet)" />
                <ellipse
                  cx="100" cy="100" rx="80" ry="20"
                  fill="none" stroke="#fab283" strokeWidth="3"
                  transform="rotate(-20 100 100)" opacity="0.7"
                />
                <circle cx="155" cy="60" r="8" fill="#5c9cf5" opacity="0.9" />
                <circle cx="52" cy="142" r="5" fill="#9d7cd8" opacity="0.7" />
              </svg>
            </div>
            <h1
              className="text-2xl font-semibold tracking-tight"
              style={{ color: "var(--color-primary)" }}
            >
              Orbit AI
            </h1>
            <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
              IT Team Coding Platform
            </p>
          </div>

          {!showManual ? (
            <>
              {/* Claude Sign In button */}
              <button
                onClick={handleClaudeLogin}
                disabled={loading}
                className="w-full py-3 px-4 rounded-lg transition-all text-sm font-medium flex items-center justify-center gap-3"
                style={{
                  background: "var(--color-primary)",
                  color: "var(--color-text-inverse)",
                  cursor: loading ? "wait" : "pointer",
                  opacity: loading ? 0.7 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.background = "var(--color-primary-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--color-primary)";
                }}
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                    </svg>
                    Sign in with Claude
                  </>
                )}
              </button>

              <div className="mt-6 text-center">
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  Uses your Claude Pro/Max subscription
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Manual credential entry */}
              <form onSubmit={handleManualLogin} className="space-y-4">
                <div>
                  <label
                    className="block text-xs font-medium mb-1.5 uppercase tracking-wider"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Claude Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none transition-colors"
                    style={{
                      background: "var(--color-bg-elevated)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-text-primary)",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                    onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
                    placeholder="you@company.com"
                    autoFocus
                  />
                </div>

                <div>
                  <label
                    className="block text-xs font-medium mb-1.5 uppercase tracking-wider"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none transition-colors"
                    style={{
                      background: "var(--color-bg-elevated)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-text-primary)",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                    onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
                    placeholder="Your Claude password"
                  />
                </div>

                {error && (
                  <p className="text-sm" style={{ color: "var(--color-error)" }}>{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading || !email || !password}
                  className="w-full py-2.5 px-4 rounded-lg transition-all text-sm font-medium"
                  style={{
                    background: loading || !email || !password ? "var(--color-bg-hover)" : "var(--color-primary)",
                    color: loading || !email || !password ? "var(--color-text-muted)" : "var(--color-text-inverse)",
                    cursor: loading || !email || !password ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Authenticating...
                    </span>
                  ) : (
                    "Sign In"
                  )}
                </button>
              </form>

              <button
                onClick={() => setShowManual(false)}
                className="w-full mt-3 text-xs text-center transition-colors"
                style={{ color: "var(--color-text-muted)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-primary)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
              >
                &larr; Back to OAuth sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
