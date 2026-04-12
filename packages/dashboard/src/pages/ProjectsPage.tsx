import { useEffect, useState } from "react";
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
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
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
      await broker.createProject({
        name: newProject.name,
        git_url: newProject.git_url || undefined,
        description: newProject.description || undefined,
      });
      setShowNewProject(false);
      setNewProject({ name: "", git_url: "", description: "" });
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
                  Git Repository URL
                </label>
                <input
                  type="text"
                  value={newProject.git_url}
                  onChange={(e) => setNewProject((p) => ({ ...p, git_url: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                  style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
                  placeholder="https://github.com/user/repo.git (optional)"
                />
                <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                  Leave empty to create a blank project
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

      {/* Header */}
      <header
        className="px-6 py-4 flex items-center justify-between relative"
        style={{ zIndex: 1, borderBottom: "1px solid var(--color-border)" }}
      >
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold" style={{ color: "var(--color-primary)" }}>
            Orbit AI
          </h1>
          {activeTeam && (
            <>
              <span style={{ color: "var(--color-text-muted)" }}>/</span>
              <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{activeTeam.name}</span>
              <Link
                to={`/teams/${activeTeam.id}/settings`}
                className="text-xs px-1.5 py-0.5 rounded transition-colors"
                style={{ color: "var(--color-text-muted)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-primary)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
              >
                settings
              </Link>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          <kbd
            className="text-xs px-2 py-0.5 rounded font-mono cursor-pointer"
            style={{ background: "var(--color-bg-hover)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}
          >
            Ctrl+K
          </kbd>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: "var(--color-success)" }} />
            <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{user?.display_name}</span>
          </div>
          <button
            onClick={() => navigate("/teams")}
            className="text-xs transition-colors"
            style={{ color: "var(--color-text-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
          >
            Switch team
          </button>
          <button
            onClick={logout}
            className="text-xs transition-colors"
            style={{ color: "var(--color-text-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex relative" style={{ zIndex: 1 }}>
        {/* Main content */}
        <main className="flex-1 p-6 max-w-5xl mx-auto">
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-lg p-5 animate-pulse"
                  style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", height: "140px" }}
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => navigate(`/project/${project.id}`)}
                  className="text-left rounded-lg p-5 transition-all group"
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
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-medium text-sm" style={{ color: "var(--color-text-primary)" }}>
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

                  <p className="text-xs mb-4 line-clamp-2" style={{ color: "var(--color-text-secondary)" }}>
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

        {/* Right sidebar — Activity feed */}
        <aside
          className="w-72 shrink-0 p-4 overflow-y-auto"
          style={{ borderLeft: "1px solid var(--color-border)", maxHeight: "calc(100vh - 57px)" }}
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
      </div>
    </div>
  );
}
