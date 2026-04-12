import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { useAuthStore } from "../stores/authStore";
import { useBroker } from "../hooks/useBroker";
import { OrbitalBackground } from "../components/OrbitalBackground";

export function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { login, selectTeam } = useAuthStore();
  const broker = useBroker();

  async function handlePostLogin(data: { token: string; user: any; teams: any[] }) {
    login(data.token, data.user, data.teams || []);
    if (data.teams?.length === 1) {
      try {
        const selectData = await broker.selectTeam(data.teams[0].id);
        selectTeam(selectData.token, { ...selectData.team });
        navigate("/");
      } catch {
        navigate("/teams");
      }
    } else {
      navigate("/teams");
    }
  }

  async function handleGoogleLogin() {
    setError("");
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();

      const data = await broker.googleAuth(idToken);
      await handlePostLogin(data);
    } catch (err: any) {
      if (err.code !== "auth/popup-closed-by-user") {
        setError(err.message || "Google sign-in failed");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative" style={{ background: "var(--color-bg-base)" }}>
      <OrbitalBackground />
      <div className="w-full max-w-sm relative" style={{ zIndex: 1 }}>
        <div className="rounded-xl p-10 shadow-2xl" style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)" }}>
          {/* Logo */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-24 h-24 mb-5">
              <svg viewBox="0 0 200 200" className="w-24 h-24">
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
            <h1 className="text-3xl font-semibold tracking-tight" style={{ color: "var(--color-primary)" }}>
              Orbit AI
            </h1>
            <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
              AI-Powered Team Coding Platform
            </p>
          </div>

          {/* Google Sign In */}
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-3 px-4 rounded-lg transition-all text-sm font-medium flex items-center justify-center gap-3"
            style={{
              background: loading ? "var(--color-bg-hover)" : "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
              color: loading ? "var(--color-text-muted)" : "var(--color-text-primary)",
              cursor: loading ? "wait" : "pointer",
            }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.borderColor = "var(--color-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            {loading ? "Connecting..." : "Continue with Google"}
          </button>

          {error && (
            <p className="mt-4 text-sm text-center" style={{ color: "var(--color-error)" }}>
              {error}
            </p>
          )}

          <p className="mt-6 text-center text-xs leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
            Sign in or create an account instantly with your Google account.
            <br />No separate registration needed.
          </p>
        </div>
      </div>
    </div>
  );
}
