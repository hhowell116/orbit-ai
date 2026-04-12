import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { useAuthStore } from "../stores/authStore";
import { useBroker } from "../hooks/useBroker";
import { OrbitalBackground } from "../components/OrbitalBackground";

export function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const { login, selectTeam } = useAuthStore();
  const broker = useBroker();

  async function handlePostLogin(data: { token: string; user: any; teams: any[] }) {
    login(data.token, data.user, data.teams || []);
    if (data.teams?.length === 1) {
      const selectData = await broker.selectTeam(data.teams[0].id);
      selectTeam(selectData.token, { ...selectData.team });
      navigate("/");
    } else {
      navigate("/teams");
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !password) return;
    setError("");
    setLoading(true);
    try {
      const data = await broker.login(username, password);
      await handlePostLogin(data);
    } catch (err: any) {
      setError(err.message || "Failed to connect to server");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError("");
    setGoogleLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();

      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: idToken }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Google sign-in failed");
      }

      const data = await res.json();
      await handlePostLogin(data);
    } catch (err: any) {
      if (err.code !== "auth/popup-closed-by-user") {
        setError(err.message || "Google sign-in failed");
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative" style={{ background: "var(--color-bg-base)" }}>
      <OrbitalBackground />
      <div className="w-full max-w-sm relative" style={{ zIndex: 1 }}>
        <div className="rounded-xl p-8 shadow-2xl" style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)" }}>
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
                <ellipse cx="100" cy="100" rx="80" ry="20" fill="none" stroke="#fab283" strokeWidth="3" transform="rotate(-20 100 100)" opacity="0.7" />
                <circle cx="155" cy="60" r="8" fill="#5c9cf5" opacity="0.9" />
                <circle cx="52" cy="142" r="5" fill="#9d7cd8" opacity="0.7" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--color-primary)" }}>Orbit AI</h1>
            <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>IT Team Coding Platform</p>
          </div>

          {/* Google Sign In */}
          <button
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full py-2.5 px-4 rounded-lg transition-all text-sm font-medium flex items-center justify-center gap-3 mb-4"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-primary)",
              cursor: googleLoading ? "wait" : "pointer",
              opacity: googleLoading ? 0.7 : 1,
            }}
            onMouseEnter={(e) => { if (!googleLoading) e.currentTarget.style.borderColor = "var(--color-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
          >
            {googleLoading ? (
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            {googleLoading ? "Connecting..." : "Continue with Google"}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>or</span>
            <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
          </div>

          {/* Username/Password */}
          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none transition-colors"
                style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")} onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
                placeholder="Username" />
            </div>
            <div>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none transition-colors"
                style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")} onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
                placeholder="Password" />
            </div>

            {error && <p className="text-sm" style={{ color: "var(--color-error)" }}>{error}</p>}

            <button type="submit" disabled={loading || !username || !password}
              className="w-full py-2.5 px-4 rounded-lg transition-all text-sm font-medium"
              style={{
                background: loading || !username || !password ? "var(--color-bg-hover)" : "var(--color-primary)",
                color: loading || !username || !password ? "var(--color-text-muted)" : "var(--color-text-inverse)",
                cursor: loading || !username || !password ? "not-allowed" : "pointer",
              }}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs" style={{ color: "var(--color-text-muted)" }}>
            Don't have an account?{" "}
            <Link to="/signup" className="transition-colors" style={{ color: "var(--color-primary)" }}>Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
