import { useEffect, useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useBroker } from "../hooks/useBroker";
import { OrbitalBackground } from "../components/OrbitalBackground";
import { CommandPalette } from "../components/CommandPalette";

interface Project {
  id: string;
  name: string;
  description: string;
  opencode_port: number;
  active_users: number;
  last_activity: string | null;
}

interface ActivityEntry {
  id: number;
  event_type: string;
  file_path?: string;
  user_display_name: string;
  project_name: string;
  created_at: string;
}

interface Session {
  id: string;
  project_name: string;
  user_display_name: string;
  status: string;
  title: string;
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProject, setNewProject] = useState({ name: "", git_url: "", description: "" });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { user, logout, activeTeam } = useAuthStore();
  const broker = useBroker();

  useEffect(() => {
    Promise.all([
      broker.getProjects().then(setProjects),
      broker.getRecentActivity(30).then(setActivity),
      broker.getSessions().then(setSessions),
    ])
      .catch((err) => {
        setError(err.message || "Failed to connect to server");
      })
      .finally(() => setLoading(false));

    const interval = setInterval(() => {
      broker.getProjects().then(setProjects).catch(() => {});
      broker.getRecentActivity(30).then(setActivity).catch(() => {});
      broker.getSessions().then(setSessions).catch(() => {});
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const totalActiveUsers = projects.reduce((sum, p) => sum + (p.active_users || 0), 0);
  const activeSessions = sessions.filter((s) => s.status !== "ended");
  const thinkingSessions = sessions.filter((s) => s.status === "thinking");

  function timeAgo(dateStr: string | null): string {
    if (!dateStr) return "Never";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  const eventIcons: Record<string, string> = {
    "file.edited": "~",
    "bash.ran": "$",
    "session.created": "+",
    "session.compacted": "z",
    "file.lock.acquired": "#",
    "file.lock.released": "-",
  };

  const commandItems = projects.map((p) => ({
    id: p.id,
    label: p.name,
    sublabel: p.description,
    action: () => navigate(`/project/${p.id}`),
  }));

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!newProject.name) return;
    setCreating(true);
    setCreateError("");
    try {
      const project = await broker.createProject({
        name: newProject.name,
        git_url: newProject.git_url || undefined,
        description: newProject.description || undefined,
      });
      // If a file was selected, upload it to the new project
      if (uploadFile && project?.id) {
        await broker.uploadToProject(project.id, uploadFile);
      }
      setShowNewProject(false);
      setNewProject({ name: "", git_url: "", description: "" });
      setUploadFile(null);
      broker.getProjects().then(setProjects).catch(() => {});
    } catch (err: any) {
      setCreateError(err.message || "Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteProject(e: React.MouseEvent, projectId: string) {
    e.stopPropagation();
    if (!confirm("Delete this project from the dashboard? (Files on disk are kept)")) return;
    try {
      await broker.deleteProject(projectId);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch {}
  }

  return (
    <div className="min-h-screen relative" style={{ background: "var(--color-bg-base)" }}>
      <OrbitalBackground />
      <CommandPalette items={commandItems} />

      {/* New Project Modal */}
      {showNewProject && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 50, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowNewProject(false)}
        >
          <div
            className="w-full max-w-md rounded-xl p-6 shadow-2xl"
            style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-bright)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--color-text-primary)" }}>
              New Project
            </h2>
            <form onSubmit={handleCreateProject} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1 uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                  Project Name *
                </label>
                <input
                  type="text"
                  value={newProject.name}
                  onChange={(e) => setNewProject((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                  style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
                  placeholder="My Project"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                  Source (optional)
                </label>
                <input
                  type="text"
                  value={newProject.git_url}
                  onChange={(e) => { setNewProject((p) => ({ ...p, git_url: e.target.value })); if (e.target.value) setUploadFile(null); }}
                  className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                  style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
                  placeholder="https://github.com/user/repo.git"
                  disabled={!!uploadFile}
                />
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>or</span>
                  <label
                    className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                    style={{ background: "var(--color-bg-elevated)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; e.currentTarget.style.color = "var(--color-primary)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}>
                    Upload .zip
                    <input
                      type="file"
                      accept=".zip"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setUploadFile(file);
                        if (file) setNewProject((p) => ({ ...p, git_url: "" }));
                      }}
                    />
                  </label>
                  {uploadFile && (
                    <div className="flex items-center gap-1.5 flex-1">
                      <span className="text-xs font-mono truncate" style={{ color: "var(--color-primary)" }}>{uploadFile.name}</span>
                      <button type="button" onClick={() => setUploadFile(null)} className="text-xs" style={{ color: "var(--color-text-muted)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-error)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}>
                        x
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                  Clone a repo, upload a zip, or leave empty for a blank project
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                  Description
                </label>
                <input
                  type="text"
                  value={newProject.description}
                  onChange={(e) => setNewProject((p) => ({ ...p, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                  style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
                  placeholder="What is this project?"
                />
              </div>

              {createError && (
                <p className="text-sm" style={{ color: "var(--color-error)" }}>{createError}</p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewProject(false)}
                  className="flex-1 py-2 px-4 rounded-lg text-sm"
                  style={{ background: "var(--color-bg-hover)", color: "var(--color-text-secondary)" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newProject.name}
                  className="flex-1 py-2 px-4 rounded-lg text-sm font-medium"
                  style={{
                    background: creating || !newProject.name ? "var(--color-bg-hover)" : "var(--color-primary)",
                    color: creating || !newProject.name ? "var(--color-text-muted)" : "var(--color-text-inverse)",
                    cursor: creating || !newProject.name ? "not-allowed" : "pointer",
                  }}
                >
                  {creating ? "Creating..." : "Create Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0" style={{ zIndex: 40, animation: "sidebarFadeIn 0.2s ease-out" }}
          onClick={() => setSidebarOpen(false)}>
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} />
          <aside className="absolute top-0 left-0 bottom-0 w-72 flex flex-col"
            style={{ background: "var(--color-bg-surface)", borderRight: "1px solid var(--color-border)", animation: "sidebarSlideIn 0.2s ease-out" }}
            onClick={(e) => e.stopPropagation()}>
            {/* Sidebar header */}
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <div>
                <h2 className="text-sm font-semibold" style={{ color: "var(--color-primary)" }}>Orbit AI</h2>
                {activeTeam && <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{activeTeam.name}</p>}
              </div>
              <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-lg transition-colors"
                style={{ color: "var(--color-text-muted)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-primary)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}>
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>

            {/* User info */}
            <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium"
                  style={{ background: "var(--color-primary-muted)", color: "var(--color-primary)" }}>
                  {user?.display_name?.charAt(0)?.toUpperCase() || "?"}
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{user?.display_name}</p>
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>@{user?.username}</p>
                </div>
              </div>
            </div>

            {/* Nav links */}
            <nav className="flex-1 py-2 px-3">
              {[
                { label: "Manage Team", icon: "M15 14s1 0 1-1-1-4-5-4-5 3-5 4 1 1 1 1h8zm-7.978-1A.261.261 0 017.002 13c.001-.246.154-.986.832-1.664C8.484 10.68 9.484 10 11 10c1.516 0 2.516.68 3.166 1.336.678.678.83 1.418.832 1.664a.261.261 0 01-.018.02H7.022zM11 7a2 2 0 100-4 2 2 0 000 4zm3-2a3 3 0 11-6 0 3 3 0 016 0zM6.936 9.28a5.88 5.88 0 00-1.23-.247A7.35 7.35 0 005 9c-4 0-5 3-5 4 0 .667.333 1 1 1h4.216A2.238 2.238 0 015 13c0-.779.357-1.85 1.084-2.828.243-.327.517-.634.852-.916zM4.92 10A5.493 5.493 0 004 13H1c0-.26.164-1.03.76-1.724.545-.636 1.492-1.256 3.16-1.275zM1.5 5.5a3 3 0 116 0 3 3 0 01-6 0zm3-2a2 2 0 100 4 2 2 0 000-4z", onClick: () => { setSidebarOpen(false); navigate(`/teams/${activeTeam?.id}/settings`); } },
                { label: "Connections", icon: "M1.5 3A1.5 1.5 0 000 4.5v1A1.5 1.5 0 001.5 7h1A1.5 1.5 0 004 5.5v-1A1.5 1.5 0 002.5 3h-1zM5 4.5a.5.5 0 01.5-.5h9a.5.5 0 010 1h-9a.5.5 0 01-.5-.5zM5.5 10a.5.5 0 000 1h9a.5.5 0 000-1h-9zM12 4.5A1.5 1.5 0 0113.5 3h1A1.5 1.5 0 0116 4.5v1A1.5 1.5 0 0114.5 7h-1A1.5 1.5 0 0112 5.5v-1zM0 10.5A1.5 1.5 0 011.5 9h1A1.5 1.5 0 014 10.5v1A1.5 1.5 0 012.5 13h-1A1.5 1.5 0 010 11.5v-1z", onClick: () => { setSidebarOpen(false); navigate("/connections"); } },
                { label: "Switch Team", icon: "M8 8a3 3 0 100-6 3 3 0 000 6zM12.735 14c.618 0 1.093-.561.872-1.139a6.002 6.002 0 00-11.215 0c-.22.578.254 1.139.872 1.139h9.47z", onClick: () => { setSidebarOpen(false); navigate("/teams"); } },
              ].map((item) => (
                <button key={item.label} onClick={item.onClick}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
                  style={{ color: "var(--color-text-secondary)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; e.currentTarget.style.color = "var(--color-text-primary)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}>
                  <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0" fill="currentColor"><path d={item.icon} /></svg>
                  {item.label}
                </button>
              ))}
            </nav>

            {/* Bottom actions */}
            <div className="px-3 py-3 space-y-1" style={{ borderTop: "1px solid var(--color-border)" }}>
              <button onClick={() => { setSidebarOpen(false); navigate("/download"); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
                style={{ color: "var(--color-text-secondary)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; e.currentTarget.style.color = "var(--color-text-primary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}>
                <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0" fill="currentColor">
                  <path d="M2.75 14A1.75 1.75 0 011 12.25v-2.5a.75.75 0 011.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25v-2.5a.75.75 0 011.5 0v2.5A1.75 1.75 0 0113.25 14H2.75z"/>
                  <path d="M7.25 7.689V2a.75.75 0 011.5 0v5.689l1.97-1.969a.749.749 0 111.06 1.06l-3.25 3.25a.749.749 0 01-1.06 0L4.22 6.78a.749.749 0 111.06-1.06l1.97 1.969z"/>
                </svg>
                Download Desktop App
              </button>
              <button onClick={() => { setSidebarOpen(false); logout(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
                style={{ color: "var(--color-text-muted)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-error-muted)"; e.currentTarget.style.color = "var(--color-error)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-text-muted)"; }}>
                <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0" fill="currentColor">
                  <path d="M6 1a1 1 0 00-1 1v1.5a.5.5 0 01-1 0V2a2 2 0 012-2h7a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2v-1.5a.5.5 0 011 0V14a1 1 0 001 1h7a1 1 0 001-1V2a1 1 0 00-1-1H6z"/>
                  <path d="M1.5 8a.5.5 0 01.5-.5h8.793L8.646 5.354a.5.5 0 01.708-.708l3 3a.5.5 0 010 .708l-3 3a.5.5 0 01-.708-.708L10.793 8.5H2a.5.5 0 01-.5-.5z"/>
                </svg>
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Header */}
      <header
        className="px-6 py-4 flex items-center justify-between relative"
        style={{ zIndex: 1, borderBottom: "1px solid var(--color-border)" }}
      >
        <div className="flex items-center gap-3">
          {/* Hamburger */}
          <button onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--color-text-muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-primary)"; e.currentTarget.style.background = "var(--color-bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-muted)"; e.currentTarget.style.background = "transparent"; }}>
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 10.5a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10z" clipRule="evenodd" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold" style={{ color: "var(--color-primary)" }}>
            Orbit AI
          </h1>
          {activeTeam && (
            <>
              <span style={{ color: "var(--color-text-muted)" }}>/</span>
              <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{activeTeam.name}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <kbd
            className="text-xs px-2 py-0.5 rounded font-mono"
            style={{ background: "var(--color-bg-hover)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}
          >
            Ctrl+K
          </kbd>
          <button
            onClick={() => navigate("/connections")}
            className="p-1.5 rounded-lg transition-colors"
            title="Connections"
            style={{ color: "var(--color-text-muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-primary)"; e.currentTarget.style.background = "var(--color-bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-muted)"; e.currentTarget.style.background = "transparent"; }}>
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor">
              <path d="M1.5 3A1.5 1.5 0 000 4.5v1A1.5 1.5 0 001.5 7h1A1.5 1.5 0 004 5.5v-1A1.5 1.5 0 002.5 3h-1zM5 4.5a.5.5 0 01.5-.5h9a.5.5 0 010 1h-9a.5.5 0 01-.5-.5zM5.5 10a.5.5 0 000 1h9a.5.5 0 000-1h-9zM12 4.5A1.5 1.5 0 0113.5 3h1A1.5 1.5 0 0116 4.5v1A1.5 1.5 0 0114.5 7h-1A1.5 1.5 0 0112 5.5v-1zM0 10.5A1.5 1.5 0 011.5 9h1A1.5 1.5 0 014 10.5v1A1.5 1.5 0 012.5 13h-1A1.5 1.5 0 010 11.5v-1z"/>
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: "var(--color-success)" }} />
            <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{user?.display_name}</span>
          </div>
        </div>
      </header>

      <div className="flex relative" style={{ zIndex: 1 }}>
        {/* Left sidebar — Activity feed */}
        <aside
          className="w-72 shrink-0 p-4 overflow-y-auto"
          style={{ borderRight: "1px solid var(--color-border)", maxHeight: "calc(100vh - 57px)" }}
        >
          <h3 className="text-xs font-medium uppercase tracking-wider mb-4" style={{ color: "var(--color-text-muted)" }}>
            Activity Feed
          </h3>
          {activity.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>No recent activity</p>
          ) : (
            <div className="space-y-3">
              {activity.map((a) => (
                <div key={a.id} className="flex gap-2">
                  <span
                    className="w-5 h-5 rounded flex items-center justify-center text-xs font-mono shrink-0 mt-0.5"
                    style={{ background: "var(--color-bg-hover)", color: "var(--color-text-muted)" }}
                  >
                    {eventIcons[a.event_type] || "?"}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs leading-relaxed">
                      <span style={{ color: "var(--color-primary)" }}>{a.user_display_name}</span>
                      {" "}
                      <span style={{ color: "var(--color-text-muted)" }}>
                        {a.event_type.replace(".", " ").replace("file ", "").replace("session ", "")}
                      </span>
                      {a.file_path && (
                        <>
                          {" "}
                          <span className="font-mono" style={{ color: "var(--color-text-secondary)" }}>
                            {a.file_path.split("/").pop()}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {a.project_name}
                      </span>
                      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {timeAgo(a.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6">
          {/* Connection error */}
          {error && (
            <div
              className="mb-6 rounded-lg px-4 py-3 text-sm"
              style={{ background: "var(--color-error-muted)", color: "var(--color-error)", border: "1px solid rgba(224, 108, 117, 0.2)" }}
            >
              {error} — Make sure the broker server is running.
            </div>
          )}

          {/* Stats bar */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: "Projects", value: projects.length, color: "var(--color-primary)" },
              { label: "Active Users", value: totalActiveUsers, color: "var(--color-success)" },
              { label: "Sessions", value: activeSessions.length, color: "var(--color-secondary)" },
              { label: "AI Thinking", value: thinkingSessions.length, color: "var(--color-accent)" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg p-4"
                style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)" }}
              >
                <div className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--color-text-muted)" }}>
                  {stat.label}
                </div>
                <div className="text-2xl font-semibold font-mono" style={{ color: stat.color }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          {/* Active AI sessions */}
          {activeSessions.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: "var(--color-text-muted)" }}>
                Active AI Sessions
              </h2>
              <div className="space-y-2">
                {activeSessions.slice(0, 5).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 rounded-lg px-4 py-3"
                    style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)" }}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        background: s.status === "thinking" ? "var(--color-secondary)" : s.status === "error" ? "var(--color-error)" : "var(--color-success)",
                        animation: s.status === "thinking" ? "pulse 2s infinite" : "none",
                      }}
                    />
                    <span className="text-sm" style={{ color: "var(--color-primary)" }}>{s.user_display_name}</span>
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>in</span>
                    <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{s.project_name}</span>
                    <span className="text-xs font-mono ml-auto" style={{ color: s.status === "thinking" ? "var(--color-secondary)" : "var(--color-text-muted)" }}>
                      {s.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Projects */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
              Projects
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
                {projects.length} total
              </span>
              <button
                onClick={() => setShowNewProject(true)}
                className="text-xs px-3 py-1.5 rounded-lg transition-all font-medium"
                style={{ background: "var(--color-primary)", color: "var(--color-text-inverse)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-primary-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--color-primary)")}
              >
                + New Project
              </button>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-xl p-6 animate-pulse"
                  style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", height: "180px" }}
                />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div
              className="rounded-lg p-8 text-center"
              style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)" }}
            >
              <p className="text-sm mb-2" style={{ color: "var(--color-text-secondary)" }}>No projects yet</p>
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                Projects will appear here once they are added to the server.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => navigate(`/project/${project.id}`)}
                  className="text-left rounded-xl p-6 transition-all group"
                  style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-primary)";
                    e.currentTarget.style.background = "var(--color-bg-elevated)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-border)";
                    e.currentTarget.style.background = "var(--color-bg-surface)";
                  }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-base" style={{ color: "var(--color-text-primary)" }}>
                      {project.name}
                    </h3>
                    <div className="flex items-center gap-2">
                      {project.active_users > 0 && (
                        <span
                          className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full"
                          style={{ background: "var(--color-success-muted)", color: "var(--color-success)" }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--color-success)" }} />
                          {project.active_users}
                        </span>
                      )}
                      <span
                        onClick={(e) => handleDeleteProject(e, project.id)}
                        className="text-xs opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer px-1"
                        style={{ color: "var(--color-text-muted)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-error)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
                      >
                        x
                      </span>
                    </div>
                  </div>

                  <p className="text-sm mb-5 line-clamp-2" style={{ color: "var(--color-text-secondary)" }}>
                    {project.description || "No description"}
                  </p>

                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
                      :{project.opencode_port}
                    </span>
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {timeAgo(project.last_activity)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </main>

      </div>
    </div>
  );
}
