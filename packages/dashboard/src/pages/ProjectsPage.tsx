import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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

const DEMO_PROJECTS: Project[] = [
  { id: "proj-crm", name: "CRM", description: "Customer Relationship Management system", opencode_port: 4096, active_users: 1, last_activity: new Date().toISOString() },
  { id: "proj-helpdesk", name: "Helpdesk", description: "IT Help Desk ticketing system", opencode_port: 4097, active_users: 0, last_activity: null },
  { id: "proj-infra", name: "Infrastructure", description: "Infrastructure automation and monitoring", opencode_port: 4098, active_users: 2, last_activity: new Date(Date.now() - 3600000).toISOString() },
];

const DEMO_ACTIVITY: ActivityEntry[] = [
  { id: 1, event_type: "file.edited", file_path: "src/auth/session.ts", user_display_name: "Hayden", project_name: "CRM", created_at: new Date().toISOString() },
  { id: 2, event_type: "bash.ran", user_display_name: "Alice", project_name: "Infrastructure", created_at: new Date(Date.now() - 120000).toISOString() },
  { id: 3, event_type: "session.created", user_display_name: "Bob", project_name: "CRM", created_at: new Date(Date.now() - 300000).toISOString() },
  { id: 4, event_type: "file.edited", file_path: "lib/api/routes.ts", user_display_name: "Hayden", project_name: "CRM", created_at: new Date(Date.now() - 600000).toISOString() },
  { id: 5, event_type: "file.lock.acquired", file_path: "deploy.yml", user_display_name: "Alice", project_name: "Infrastructure", created_at: new Date(Date.now() - 900000).toISOString() },
];

const DEMO_SESSIONS: Session[] = [
  { id: "ses-1", project_name: "CRM", user_display_name: "Hayden", status: "thinking", title: "Refactoring auth module" },
  { id: "ses-2", project_name: "Infrastructure", user_display_name: "Alice", status: "idle", title: "Updating deploy pipeline" },
];

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const broker = useBroker();

  useEffect(() => {
    Promise.all([
      broker.getProjects().then(setProjects),
      broker.getRecentActivity(30).then(setActivity),
      broker.getSessions().then(setSessions),
    ])
      .catch(() => {
        // Broker not available — use demo data
        setProjects(DEMO_PROJECTS);
        setActivity(DEMO_ACTIVITY);
        setSessions(DEMO_SESSIONS);
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

  return (
    <div className="min-h-screen relative" style={{ background: "var(--color-bg-base)" }}>
      <OrbitalBackground />
      <CommandPalette items={commandItems} />

      {/* Header */}
      <header
        className="px-6 py-4 flex items-center justify-between relative"
        style={{ zIndex: 1, borderBottom: "1px solid var(--color-border)" }}
      >
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold" style={{ color: "var(--color-primary)" }}>
            Orbit AI
          </h1>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-mono"
            style={{ background: "var(--color-primary-muted)", color: "var(--color-primary)" }}
          >
            v0.1.0
          </span>
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
            <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
              {projects.length} total
            </span>
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
