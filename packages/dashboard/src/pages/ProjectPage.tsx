import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useBroker } from "../hooks/useBroker";
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
  const broker = useBroker();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [locks, setLocks] = useState<FileLock[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<"idle" | "thinking" | "error">("idle");
  const [loadError, setLoadError] = useState("");
  const [claudeConnected, setClaudeConnected] = useState<boolean | null>(null);

  // Load project details + check Claude connection
  useEffect(() => {
    if (!projectId) return;
    broker.getProject(projectId).then(setProject).catch((err) => {
      setLoadError(err.message || "Failed to load project");
    });
    broker.rawFetch("/connections/claude/status")
      .then((data: any) => setClaudeConnected(data.connected))
      .catch(() => setClaudeConnected(false));
  }, [projectId]);

  // Create or load session
  useEffect(() => {
    if (!projectId) return;
    // Use project ID as session ID for simplicity
    const sid = `session-${projectId}`;
    setSessionId(sid);
    // Load existing messages
    broker.getChatMessages(sid).then((msgs: any[]) => {
      setMessages(msgs.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })));
    }).catch(() => {});
  }, [projectId]);

  // Poll sidebar data
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

  const handleSendMessage = useCallback(async (text: string) => {
    if (!sessionId) return;

    // Add user message immediately
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setSessionStatus("thinking");

    // Add empty assistant message for streaming
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      await broker.sendChatMessage(sessionId, text, (chunk) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === "assistant") {
            updated[updated.length - 1] = { ...last, content: last.content + chunk };
          }
          return updated;
        });
      });
      setSessionStatus("idle");
    } catch (err: any) {
      setSessionStatus("error");
      // Update the empty assistant message with the error
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last.role === "assistant" && !last.content) {
          updated[updated.length - 1] = { ...last, content: `Error: ${err.message}` };
        }
        return updated;
      });
    }
  }, [sessionId, broker]);

  const handleAbort = useCallback(async () => {
    setSessionStatus("idle");
  }, []);

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--color-bg-base)" }}>
        <div className="text-center">
          <p className="text-sm mb-3" style={{ color: "var(--color-error)" }}>{loadError}</p>
          <button onClick={() => navigate("/")} className="text-sm px-4 py-2 rounded-lg"
            style={{ background: "var(--color-bg-surface)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}>
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

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
        <button onClick={() => navigate("/")} className="text-sm transition-colors" style={{ color: "var(--color-text-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-primary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}>
          &larr; Projects
        </button>
        <div className="pl-4" style={{ borderLeft: "1px solid var(--color-border)" }}>
          <h1 className="font-medium text-sm" style={{ color: "var(--color-text-primary)" }}>{project.name}</h1>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{project.description}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {sessionStatus === "thinking" && (
            <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-secondary)" }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--color-secondary)" }} />
              thinking
            </span>
          )}
        </div>
      </header>

      {/* Main: 70/30 split */}
      <div className="flex-1 flex min-h-0">
        {/* Chat */}
        <div className="flex-[7] flex flex-col min-h-0" style={{ borderRight: "1px solid var(--color-border)" }}>
          <ChatWindow messages={messages} sessionStatus={sessionStatus} onSendMessage={handleSendMessage} onAbort={handleAbort} claudeConnected={claudeConnected} />
        </div>

        {/* Sidebar */}
        <div className="flex-[3] overflow-y-auto">
          {/* Who's here */}
          <div className="p-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: "var(--color-text-muted)" }}>Who's Here</h3>
            {activeUsers.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>No one else is here</p>
            ) : (
              <div className="space-y-2">
                {activeUsers.map((u) => (
                  <div key={u.id} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{
                      background: u.session_status === "thinking" ? "var(--color-secondary)" : u.session_status === "error" ? "var(--color-error)" : "var(--color-success)",
                    }} />
                    <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>{u.display_name}</span>
                    <span className="text-xs font-mono ml-auto" style={{ color: "var(--color-text-muted)" }}>{u.session_status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* File Locks */}
          <div className="p-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: "var(--color-text-muted)" }}>File Locks</h3>
            <FileLockIndicator locks={locks} />
          </div>

          {/* Activity */}
          <div className="p-4">
            <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: "var(--color-text-muted)" }}>Recent Activity</h3>
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
                      <> <span className="font-mono" style={{ color: "var(--color-text-secondary)" }}>{a.file_path.split("/").pop()}</span></>
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
