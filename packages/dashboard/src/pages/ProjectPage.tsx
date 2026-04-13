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

  // Rules state
  const [projectRules, setProjectRules] = useState("");
  const [showRulesEditor, setShowRulesEditor] = useState(false);
  const [rulesSaving, setRulesSaving] = useState(false);

  // Git state
  const [gitStatus, setGitStatus] = useState<any>(null);
  const [commitMsg, setCommitMsg] = useState("");
  const [gitLoading, setGitLoading] = useState("");
  const [gitError, setGitError] = useState("");
  const [gitSuccess, setGitSuccess] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");

  // Load project details + check Claude connection
  useEffect(() => {
    if (!projectId) return;
    broker.getProject(projectId).then(setProject).catch((err) => {
      setLoadError(err.message || "Failed to load project");
    });
    broker.rawFetch("/connections/claude/status")
      .then((data: any) => setClaudeConnected(data.connected))
      .catch(() => setClaudeConnected(false));
    broker.getProjectRules(projectId)
      .then((d: any) => setProjectRules(d.rules || ""))
      .catch(() => {});
  }, [projectId]);

  async function handleSaveProjectRules() {
    if (!projectId) return;
    setRulesSaving(true);
    try {
      await broker.setProjectRules(projectId, projectRules);
      setShowRulesEditor(false);
    } catch {} finally {
      setRulesSaving(false);
    }
  }

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
      broker.getGitStatus(projectId!).then(setGitStatus).catch(() => {});
    }
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [projectId]);

  function clearGitMessages() {
    setGitError(""); setGitSuccess("");
    setTimeout(() => { setGitError(""); setGitSuccess(""); }, 5000);
  }

  async function handleGitInit() {
    if (!projectId) return;
    setGitLoading("init");
    setGitError("");
    try {
      await broker.gitInit(projectId, remoteUrl || undefined);
      setGitSuccess("Git initialized!");
      setRemoteUrl("");
      broker.getGitStatus(projectId).then(setGitStatus).catch(() => {});
      clearGitMessages();
    } catch (err: any) { setGitError(err.message); } finally { setGitLoading(""); }
  }

  async function handleGitCommit() {
    if (!projectId || !commitMsg) return;
    setGitLoading("commit");
    setGitError("");
    try {
      await broker.gitCommit(projectId, commitMsg);
      setCommitMsg("");
      setGitSuccess("Committed!");
      broker.getGitStatus(projectId).then(setGitStatus).catch(() => {});
      clearGitMessages();
    } catch (err: any) { setGitError(err.message); } finally { setGitLoading(""); }
  }

  async function handleGitPush() {
    if (!projectId) return;
    setGitLoading("push");
    setGitError("");
    try {
      await broker.gitPush(projectId);
      setGitSuccess("Pushed!");
      broker.getGitStatus(projectId).then(setGitStatus).catch(() => {});
      clearGitMessages();
    } catch (err: any) { setGitError(err.message); } finally { setGitLoading(""); }
  }

  async function handleGitPull() {
    if (!projectId) return;
    setGitLoading("pull");
    setGitError("");
    try {
      await broker.gitPull(projectId);
      setGitSuccess("Pulled!");
      broker.getGitStatus(projectId).then(setGitStatus).catch(() => {});
      clearGitMessages();
    } catch (err: any) { setGitError(err.message); } finally { setGitLoading(""); }
  }

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

          {/* Project Rules */}
          <div className="p-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Project Rules</h3>
              <button onClick={() => setShowRulesEditor(!showRulesEditor)}
                className="text-xs px-2 py-0.5 rounded transition-colors"
                style={{ color: "var(--color-text-muted)", background: "var(--color-bg-hover)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-primary)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}>
                {showRulesEditor ? "Close" : projectRules ? "Edit" : "Add"}
              </button>
            </div>
            {showRulesEditor ? (
              <div className="space-y-2">
                <textarea
                  value={projectRules}
                  onChange={(e) => setProjectRules(e.target.value)}
                  rows={6}
                  className="w-full px-2 py-1.5 rounded text-xs font-mono focus:outline-none resize-y"
                  style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)", lineHeight: "1.5" }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
                  placeholder="# Project-specific rules for Claude&#10;&#10;- This project uses React + TypeScript&#10;- Use functional components only&#10;- Tests go in __tests__/ directories"
                />
                <button onClick={handleSaveProjectRules} disabled={rulesSaving}
                  className="w-full text-xs py-1.5 rounded-lg font-medium"
                  style={{ background: "var(--color-primary)", color: "var(--color-text-inverse)" }}>
                  {rulesSaving ? "Saving..." : "Save"}
                </button>
              </div>
            ) : projectRules ? (
              <p className="text-xs line-clamp-3 font-mono" style={{ color: "var(--color-text-muted)", whiteSpace: "pre-wrap" }}>
                {projectRules.slice(0, 150)}{projectRules.length > 150 ? "..." : ""}
              </p>
            ) : (
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>No project rules set</p>
            )}
          </div>

          {/* File Locks */}
          <div className="p-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: "var(--color-text-muted)" }}>File Locks</h3>
            <FileLockIndicator locks={locks} />
          </div>

          {/* Git */}
          <div className="p-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: "var(--color-text-muted)" }}>Git</h3>

            {gitError && <p className="text-xs mb-2 px-2 py-1 rounded" style={{ background: "var(--color-error-muted)", color: "var(--color-error)" }}>{gitError}</p>}
            {gitSuccess && <p className="text-xs mb-2 px-2 py-1 rounded" style={{ background: "var(--color-success-muted)", color: "var(--color-success)" }}>{gitSuccess}</p>}

            {!gitStatus?.initialized ? (
              <div className="space-y-2">
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Not a git repo yet</p>
                <input
                  type="text"
                  value={remoteUrl}
                  onChange={(e) => setRemoteUrl(e.target.value)}
                  className="w-full px-2 py-1.5 rounded text-xs focus:outline-none"
                  style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                  placeholder="github.com/you/repo.git (optional)"
                  onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
                />
                <button onClick={handleGitInit} disabled={gitLoading === "init"}
                  className="w-full text-xs py-1.5 rounded-lg font-medium"
                  style={{ background: "var(--color-primary)", color: "var(--color-text-inverse)" }}>
                  {gitLoading === "init" ? "Initializing..." : "Initialize Git"}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Branch + remote info */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--color-accent-muted)", color: "var(--color-accent)" }}>
                    {gitStatus.branch}
                  </span>
                  {gitStatus.changes > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--color-warning-muted)", color: "var(--color-warning)" }}>
                      {gitStatus.changes} changed
                    </span>
                  )}
                </div>

                {/* Changed files */}
                {gitStatus.changedFiles?.length > 0 && (
                  <div className="max-h-20 overflow-y-auto space-y-0.5">
                    {gitStatus.changedFiles.slice(0, 8).map((f: any, i: number) => (
                      <div key={i} className="text-xs font-mono flex items-center gap-1.5">
                        <span style={{ color: f.status === "M" ? "var(--color-warning)" : f.status === "?" ? "var(--color-success)" : "var(--color-error)" }}>
                          {f.status === "?" ? "+" : f.status}
                        </span>
                        <span style={{ color: "var(--color-text-muted)" }}>{f.file.split("/").pop()}</span>
                      </div>
                    ))}
                    {gitStatus.changedFiles.length > 8 && (
                      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>+{gitStatus.changedFiles.length - 8} more</p>
                    )}
                  </div>
                )}

                {/* Commit */}
                {gitStatus.changes > 0 && (
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={commitMsg}
                      onChange={(e) => setCommitMsg(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded text-xs focus:outline-none"
                      style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                      placeholder="Commit message..."
                      onKeyDown={(e) => { if (e.key === "Enter") handleGitCommit(); }}
                      onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                      onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
                    />
                    <button onClick={handleGitCommit} disabled={!commitMsg || gitLoading === "commit"}
                      className="text-xs px-2.5 py-1.5 rounded-lg font-medium shrink-0"
                      style={{
                        background: !commitMsg ? "var(--color-bg-hover)" : "var(--color-primary)",
                        color: !commitMsg ? "var(--color-text-muted)" : "var(--color-text-inverse)",
                      }}>
                      {gitLoading === "commit" ? "..." : "Commit"}
                    </button>
                  </div>
                )}

                {/* Push / Pull */}
                {gitStatus.remote && (
                  <div className="flex gap-1.5">
                    <button onClick={handleGitPull} disabled={!!gitLoading}
                      className="flex-1 text-xs py-1.5 rounded-lg font-medium"
                      style={{ background: "var(--color-bg-elevated)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>
                      {gitLoading === "pull" ? "Pulling..." : "Pull"}
                    </button>
                    <button onClick={handleGitPush} disabled={!!gitLoading}
                      className="flex-1 text-xs py-1.5 rounded-lg font-medium"
                      style={{ background: "var(--color-secondary)", color: "#fff" }}>
                      {gitLoading === "push" ? "Pushing..." : "Push"}
                    </button>
                  </div>
                )}

                {/* Set remote if not set */}
                {!gitStatus.remote && (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={remoteUrl}
                      onChange={(e) => setRemoteUrl(e.target.value)}
                      className="w-full px-2 py-1.5 rounded text-xs focus:outline-none"
                      style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                      placeholder="https://github.com/you/repo.git"
                      onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                      onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
                    />
                    <button onClick={handleGitInit} disabled={!remoteUrl || gitLoading === "init"}
                      className="w-full text-xs py-1.5 rounded-lg font-medium"
                      style={{ background: "var(--color-primary)", color: "var(--color-text-inverse)" }}>
                      Set Remote
                    </button>
                  </div>
                )}
              </div>
            )}
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
