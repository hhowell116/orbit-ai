import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { OrbitalBackground } from "../components/OrbitalBackground";

const REPO = "hhowell116/orbit-ai";
const RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;

interface Asset {
  name: string;
  browser_download_url: string;
  size: number;
}

type Platform = "windows" | "mac" | "linux";

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "mac";
  return "linux";
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAssetsForPlatform(assets: Asset[], platform: Platform): Asset[] {
  switch (platform) {
    case "windows":
      return assets.filter((a) => a.name.endsWith(".exe") || a.name.endsWith(".msi"));
    case "mac":
      return assets.filter((a) => a.name.endsWith(".dmg"));
    case "linux":
      return assets.filter((a) => a.name.endsWith(".AppImage") || a.name.endsWith(".deb"));
  }
}

const platformInfo: Record<Platform, { label: string; icon: string; description: string }> = {
  windows: {
    label: "Windows",
    icon: "M0 3.5l6.5-0.9v6.3H0V3.5zm7.3-1l8.7-1.3v7.6H7.3V2.5zm0 8.1h8.7v7.6l-8.7-1.2V10.6zm-7.3 0.5h6.5v6.2L0 16.5V11.1z",
    description: "Windows 10/11 (64-bit)",
  },
  mac: {
    label: "macOS",
    icon: "M12.152 6.896c-0.948 0-2.415-1.078-3.96-1.04-2.04 0.027-3.913 1.183-4.961 3.014-2.117 3.675-0.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-0.065 2.09-0.987 3.935-0.987 1.831 0 2.35 0.987 3.96 0.948 1.637-0.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-0.039-0.013-3.182-1.221-3.22-4.857-0.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-0.156-3.675 1.09-4.61 1.09zM15.53 3.83c0.843-1.012 1.4-2.427 1.245-3.83-1.207 0.052-2.662 0.805-3.532 1.818-0.78 0.896-1.454 2.338-1.273 3.714 1.338 0.104 2.715-0.688 3.559-1.701z",
    description: "macOS (Apple Silicon & Intel)",
  },
  linux: {
    label: "Linux",
    icon: "M12.504 0c-0.155 0-0.315 0.008-0.48 0.023-4.075 0.37-3.516 5.755-3.516 5.755l0.002 0.043c-2.04 0.907-3.51 2.95-3.51 5.36v0.553c0 2.124 1.132 3.99 2.832 5.016-0.156 0.608-0.227 1.236-0.227 1.864 0 1.77 0.596 3.413 1.592 4.714l0.468 0.582c0.256 0.262 0.608 0.424 1 0.424h3.674c0.39 0 0.744-0.162 1-0.424l0.468-0.582c0.996-1.301 1.592-2.944 1.592-4.714 0-0.628-0.07-1.256-0.227-1.864 1.7-1.026 2.832-2.892 2.832-5.016v-0.553c0-2.41-1.47-4.453-3.51-5.36l0.002-0.043s0.56-5.385-3.516-5.755c-0.165-0.015-0.325-0.023-0.48-0.023z",
    description: "Ubuntu, Debian, AppImage",
  },
};

export function DownloadPage() {
  const navigate = useNavigate();
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>(detectPlatform());
  const [assets, setAssets] = useState<Asset[]>([]);
  const [version, setVersion] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(RELEASE_API)
      .then((res) => {
        if (!res.ok) throw new Error("No releases found yet");
        return res.json();
      })
      .then((data) => {
        setVersion(data.tag_name || "");
        setAssets(data.assets || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const platformAssets = getAssetsForPlatform(assets, selectedPlatform);

  return (
    <div className="min-h-screen flex items-center justify-center relative" style={{ background: "var(--color-bg-base)" }}>
      <OrbitalBackground />

      <div className="w-full max-w-lg relative" style={{ zIndex: 1 }}>
        {/* Back link */}
        <button onClick={() => window.history.length > 1 ? window.history.back() : navigate('/login')} className="mb-4 text-sm transition-colors flex items-center gap-1"
          style={{ color: "var(--color-text-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-primary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}>
          &larr; Back
        </button>

        {/* Card glow */}
        <div className="absolute -inset-1 rounded-2xl opacity-15 blur-xl" style={{
          background: "linear-gradient(135deg, rgba(139, 92, 246, 0.4), rgba(250, 178, 131, 0.3), rgba(92, 156, 245, 0.3))",
        }} />

        <div className="relative rounded-xl p-8 shadow-2xl" style={{
          background: "linear-gradient(180deg, rgba(21, 27, 35, 0.95), rgba(13, 17, 23, 0.98))",
          border: "1px solid rgba(167, 139, 250, 0.15)",
          backdropFilter: "blur(20px)",
        }}>
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold" style={{
              background: "linear-gradient(135deg, var(--color-primary), #c084fc)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              Download Orbit AI
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
              Native desktop app {version && <span className="font-mono">({version})</span>}
            </p>
          </div>

          {/* Platform tabs */}
          <div className="flex gap-2 mb-6">
            {(["windows", "mac", "linux"] as Platform[]).map((p) => (
              <button key={p} onClick={() => setSelectedPlatform(p)}
                className="flex-1 flex flex-col items-center gap-1.5 py-3 px-2 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: selectedPlatform === p ? "var(--color-primary-muted)" : "var(--color-bg-elevated)",
                  color: selectedPlatform === p ? "var(--color-primary)" : "var(--color-text-muted)",
                  border: `1px solid ${selectedPlatform === p ? "var(--color-primary)" : "var(--color-border)"}`,
                }}>
                <svg viewBox="0 0 16 16" className="w-5 h-5" fill="currentColor">
                  <path d={platformInfo[p].icon} />
                </svg>
                {platformInfo[p].label}
              </button>
            ))}
          </div>

          {/* Download area */}
          <div className="rounded-lg p-4" style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}>
            <p className="text-xs mb-3" style={{ color: "var(--color-text-muted)" }}>
              {platformInfo[selectedPlatform].description}
            </p>

            {loading ? (
              <div className="text-center py-4">
                <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>Checking for releases...</span>
              </div>
            ) : error ? (
              <div className="text-center py-4">
                <p className="text-sm mb-2" style={{ color: "var(--color-warning)" }}>No releases available yet</p>
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  The first build is in progress. Check back shortly.
                </p>
              </div>
            ) : platformAssets.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                  No {platformInfo[selectedPlatform].label} builds available in this release
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {platformAssets.map((asset) => (
                  <a key={asset.name} href={asset.browser_download_url}
                    className="flex items-center gap-3 p-3 rounded-lg transition-all"
                    style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", textDecoration: "none" }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; e.currentTarget.style.background = "var(--color-bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.background = "var(--color-bg-surface)"; }}>
                    <svg viewBox="0 0 16 16" fill="var(--color-primary)" className="w-5 h-5 shrink-0">
                      <path d="M2.75 14A1.75 1.75 0 011 12.25v-2.5a.75.75 0 011.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25v-2.5a.75.75 0 011.5 0v2.5A1.75 1.75 0 0113.25 14H2.75z"/>
                      <path d="M7.25 7.689V2a.75.75 0 011.5 0v5.689l1.97-1.969a.749.749 0 111.06 1.06l-3.25 3.25a.749.749 0 01-1.06 0L4.22 6.78a.749.749 0 111.06-1.06l1.97 1.969z"/>
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{asset.name}</p>
                      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{formatSize(asset.size)}</p>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <p className="mt-4 text-center text-xs" style={{ color: "var(--color-text-muted)" }}>
            Lightweight native app (~5-10 MB) powered by Tauri.
            <br />Uses your system's built-in browser engine.
          </p>
        </div>
      </div>
    </div>
  );
}
