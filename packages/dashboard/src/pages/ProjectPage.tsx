import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useBroker } from "../hooks/useBroker";
import { useOpenCode } from "../hooks/useOpenCode";
import { ChatWindow } from "../components/ChatWindow";
import { FileLockIndicator } from "../components/FileLockIndicator";
import type { Message } from "../components/MessageBubble";

interface ProjectDetail {
  id: string;
  name: string;
  description: string;
  opencode_port: number;
}

interface ActiveUser {
  id: string;
  display_name: string;
  session_status: string;
}

interface FileLock {
  id: number;
  file_path: string;
  user_id: string;
  user_display_name: string;
  locked_at: string;
}

interface ActivityEntry {
  id: number;
  event_type: string;
  file_path?: string;
  user_display_name: string;
  detail?: string;
  created_at: string;
}

export function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const broker = useBroker();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [locks, setLocks] = useState<FileLock[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<"idle" | "thinking" | "error">("idle");

  const projectName = project?.name?.toLowerCase() || "";
  const opencode = useOpenCode(projectName);

  useEffect(() => {
    if (!projectId) return;
    broker.getProject(projectId).then(setProject).catch(() => {
      // Broker not available — use demo project
      const demos: Record<string, ProjectDetail> = {
        "proj-crm": { id: "proj-crm", name: "CRM", description: "Customer Relationship Management system", opencode_port: 4096 },
        "proj-helpdesk": { id: "proj-helpdesk", name: "Helpdesk", description: "IT Help Desk ticketing system", opencode_port: 4097 },
        "proj-infra": { id: "proj-infra", name: "Infrastructure", description: "Infrastructure automation and monitoring", opencode_port: 4098 },
      };
      setProject(demos[projectId] || { id: projectId, name: projectId, description: "Demo project", opencode_port: 4096 });
    });
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    function refresh() {
      broker.getProjectUsers(projectId!).then(setActiveUsers).catch(() => {});
      broker.getProjectLocks(projectId!).then(setLocks).catch(() => {});
      broker.getProjectActivity(projectId!, 20).then(setActivity).catch(() => {});
    }
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [projectId]);

  useEffect(() => {
    if (!projectName) return;
    (async () => {
      try {
        const sessions = await opencode.listSessions();
        if (sessions.length > 0) {
          const latest = sessions[0] as any;
          setSessionId(latest.id);
          const msgs = await opencode.getMessages(latest.id);
          setMessages(parseMessages(msgs));
        } else {
          const session = await opencode.createSession();
          if (session) {
            setSessionId((session as any).id);
            broker.createSession(projectId!, (session as any).id, "New Session").catch(() => {});
          }
        }
      } catch (err) {
        console.error("Failed to init OpenCode session:", err);
      }
    })();
  }, [projectName]);

  function parseMessages(raw: any): Message[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .map((m: any) => ({
        role: m.role,
        content:
          typeof m.content === "string"
            ? m.content
            : Array.isArray(m.parts)
              ? m.parts.filter((p: any) => p.type === "text").map((p: any) => p.text || p.content || "").join("")
              : JSON.stringify(m.content || ""),
        toolCalls: Array.isArray(m.parts)
          ? m.parts
              .filter((p: any) => p.type === "tool-invocation" || p.type === "tool_use")
              .map((p: any) => ({ tool: p.toolName || p.name || "unknown", args: p.args || p.input, result: p.result ? String(p.result) : undefined }))
          : undefined,
      }));
  }

  const handleSendMessage = useCallback(async (text: string) => {
    if (!sessionId) return;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setSessionStatus("thinking");
    try {
      await opencode.sendMessageAsync(sessionId, text);
      const pollInterval = setInterval(async () => {
        try {
          const msgs = await opencode.getMessages(sessionId);
          const parsed = parseMessages(msgs);
          setMessages(parsed);
          if (parsed.length > 0 && parsed[parsed.length - 1].role === "assistant") {
            setSessionStatus("idle");
            clearInterval(pollInterval);
          }
        } catch {}
      }, 1000);
      setTimeout(() => { clearInterval(pollInterval); setSessionStatus("idle"); }, 300_000);
    } catch {
      setSessionStatus("error");
    }
  }, [sessionId, opencode]);

  const handleAbort = useCallback(async () => {
    if (!sessionId) return;
    try { await opencode.abortSession(sessionId); setSessionStatus("idle"); } catch {}
  }, [sessionId, opencode]);

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--color-bg-base)", color: "var(--color-text-muted)" }}>
        <span className="flex items-center gap-2 text-sm">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--color-primary)" }} />
          Loading project...
        </span>
      </div>
    );
  }

  const eventTypeLabels: Record<string, string> = {
    "file.edited": "edited",
    "bash.ran": "ran command",
    "session.created": "started session",
    "session.compacted": "compacted",
    "file.lock.acquired": "locked",
    "file.lock.released": "unlocked",
  };

  return (
    <div className="h-screen flex flex-col" style={{ background: "var(--color-bg-base)", color: "var(--color-text-primary)" }}>
      {/* Header */}
      <header className="px-4 py-3 flex items-center gap-4 shrink-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <button
          onClick={() => navigate("/")}
          className="text-sm transition-colors"
          style={{ color: "var(--color-text-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-primary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
        >
          &larr; Projects
        </button>
        <div className="pl-4" style={{ borderLeft: "1px solid var(--color-border)" }}>
          <h1 className="font-medium text-sm" style={{ color: "var(--color-text-primary)" }}>
            {project.name}
          </h1>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{project.description}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {sessionStatus === "thinking" && (
            <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-secondary)" }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--color-secondary)" }} />
              thinking
            </span>
          )}
          {sessionId && (
            <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
              {sessionId.slice(0, 16)}
            </span>
          )}
        </div>
      </header>

      {/* Main: 70/30 split */}
      <div className="flex-1 flex min-h-0">
        {/* Chat */}
        <div className="flex-[7] flex flex-col min-h-0" style={{ borderRight: "1px solid var(--color-border)" }}>
          <ChatWindow messages={messages} sessionStatus={sessionStatus} onSendMessage={handleSendMessage} onAbort={handleAbort} />
        </div>

        {/* Sidebar */}
        <div className="flex-[3] overflow-y-auto">
          {/* Who's here */}
          <div className="p-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: "var(--color-text-muted)" }}>
              Who's Here
            </h3>
            {activeUsers.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>No one else is here</p>
            ) : (
              <div className="space-y-2">
                {activeUsers.map((u) => (
                  <div key={u.id} className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{
                        background:
                          u.session_status === "thinking" ? "var(--color-secondary)" :
                          u.session_status === "error" ? "var(--color-error)" :
                          "var(--color-success)",
                        animation: u.session_status === "thinking" ? "pulse 2s infinite" : "none",
                      }}
                    />
                    <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                      {u.display_name}
                    </span>
                    <span className="text-xs font-mono ml-auto" style={{ color: "var(--color-text-muted)" }}>
                      {u.session_status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* File Locks */}
          <div className="p-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: "var(--color-text-muted)" }}>
              File Locks
            </h3>
            <FileLockIndicator locks={locks} />
          </div>

          {/* Activity */}
          <div className="p-4">
            <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: "var(--color-text-muted)" }}>
              Recent Activity
            </h3>
            {activity.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>No recent activity</p>
            ) : (
              <div className="space-y-1.5">
                {activity.slice(0, 15).map((a) => (
                  <div key={a.id} className="text-xs leading-relaxed">
                    <span style={{ color: "var(--color-primary)" }}>{a.user_display_name}</span>
                    {" "}
                    <span style={{ color: "var(--color-text-muted)" }}>{eventTypeLabels[a.event_type] || a.event_type}</span>
                    {a.file_path && (
                      <>
                        {" "}
                        <span className="font-mono" style={{ color: "var(--color-text-secondary)" }}>
                          {a.file_path.split("/").pop()}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
