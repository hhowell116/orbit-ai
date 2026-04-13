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
        {/* Card glow effect */}
        <div className="absolute -inset-1 rounded-2xl opacity-20 blur-xl" style={{
          background: "linear-gradient(135deg, rgba(139, 92, 246, 0.4), rgba(250, 178, 131, 0.3), rgba(92, 156, 245, 0.3))",
        }} />

        <div className="relative rounded-xl p-10 shadow-2xl" style={{
          background: "linear-gradient(180deg, rgba(21, 27, 35, 0.95), rgba(13, 17, 23, 0.98))",
          border: "1px solid rgba(167, 139, 250, 0.15)",
          backdropFilter: "blur(20px)",
        }}>
          {/* Logo */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-28 h-28 mb-5 relative">
              {/* Logo glow */}
              <div className="absolute inset-0 rounded-full" style={{
                background: "radial-gradient(circle, rgba(250, 178, 131, 0.15) 0%, transparent 70%)",
                filter: "blur(10px)",
              }} />
              <svg viewBox="0 0 200 200" className="w-28 h-28 relative">
                <defs>
                  <radialGradient id="loginPlanet" cx="35%" cy="35%">
                    <stop offset="0%" stopColor="#fbc4a0" />
                    <stop offset="50%" stopColor="#fab283" />
                    <stop offset="100%" stopColor="#9d7cd8" />
                  </radialGradient>
                  <radialGradient id="loginShine" cx="30%" cy="30%">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
                    <stop offset="100%" stopColor="transparent" />
                  </radialGradient>
                </defs>
                <circle cx="100" cy="100" r="45" fill="url(#loginPlanet)" />
                <circle cx="100" cy="100" r="45" fill="url(#loginShine)" />
                {/* Ring */}
                <ellipse cx="100" cy="100" rx="75" ry="18" fill="none" stroke="rgba(250,178,131,0.5)" strokeWidth="2.5" transform="rotate(-20 100 100)" />
                <ellipse cx="100" cy="100" rx="75" ry="18" fill="none" stroke="rgba(250,178,131,0.15)" strokeWidth="6" transform="rotate(-20 100 100)" />
                {/* Moons */}
                <circle cx="155" cy="58" r="7" fill="#7dd3fc" opacity="0.8" />
                <circle cx="155" cy="58" r="3" fill="rgba(255,255,255,0.3)" />
                <circle cx="50" cy="140" r="5" fill="#a78bfa" opacity="0.6" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold tracking-tight" style={{
              background: "linear-gradient(135deg, var(--color-primary), #c084fc)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
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
            className="w-full py-3.5 px-4 rounded-lg transition-all text-sm font-medium flex items-center justify-center gap-3"
            style={{
              background: loading ? "var(--color-bg-hover)" : "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
              color: loading ? "var(--color-text-muted)" : "var(--color-text-primary)",
            }}
            onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.borderColor = "rgba(167, 139, 250, 0.4)"; e.currentTarget.style.boxShadow = "0 0 20px rgba(139, 92, 246, 0.1)"; } }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.boxShadow = "none"; }}
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

        {/* Download desktop app */}
        <div className="mt-4 text-center">
          <a
            href="https://github.com/hhowell116/orbit-ai/releases/latest"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 text-xs px-4 py-2 rounded-lg transition-all"
            style={{ color: "var(--color-text-muted)", border: "1px solid var(--color-border)", background: "rgba(21, 27, 35, 0.6)", backdropFilter: "blur(10px)" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(167, 139, 250, 0.3)"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.color = "var(--color-text-muted)"; }}
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M2.75 14A1.75 1.75 0 011 12.25v-2.5a.75.75 0 011.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25v-2.5a.75.75 0 011.5 0v2.5A1.75 1.75 0 0113.25 14H2.75z"/>
              <path d="M7.25 7.689V2a.75.75 0 011.5 0v5.689l1.97-1.969a.749.749 0 111.06 1.06l-3.25 3.25a.749.749 0 01-1.06 0L4.22 6.78a.749.749 0 111.06-1.06l1.97 1.969z"/>
            </svg>
            Download Desktop App
          </a>
        </div>
      </div>
    </div>
  );
}
