import { useAuthStore } from "../stores/authStore";

// Always use relative path — broker serves the dashboard on the same origin
const BROKER_URL = "/api";

async function brokerFetch(path: string, options: RequestInit = {}) {
  const token = useAuthStore.getState().token;
  const res = await fetch(`${BROKER_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    // Auto-logout on expired/invalid token — redirect to login instead of showing error
    if (res.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = "/login";
      throw new Error("Session expired");
    }
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export function useBroker() {
  return {
    // Raw fetch (for non-standard endpoints like OpenCode proxy)
    rawFetch: (path: string, options?: RequestInit) => brokerFetch(path, options || {}),

    // Auth
    login: (username: string, password: string) =>
      brokerFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      }),
    signup: (data: { username: string; email?: string; password: string; display_name: string }) =>
      brokerFetch("/auth/signup", { method: "POST", body: JSON.stringify(data) }),
    googleAuth: (id_token: string) =>
      brokerFetch("/auth/google", { method: "POST", body: JSON.stringify({ id_token }) }),
    me: () => brokerFetch("/auth/me"),
    getMyTeams: () => brokerFetch("/auth/teams"),
    selectTeam: (teamId: string) =>
      brokerFetch("/auth/select-team", { method: "POST", body: JSON.stringify({ team_id: teamId }) }),

    // Teams
    createTeam: (name: string) =>
      brokerFetch("/teams", { method: "POST", body: JSON.stringify({ name }) }),
    joinTeam: (code: string) =>
      brokerFetch("/teams/join", { method: "POST", body: JSON.stringify({ code }) }),
    getTeam: (id: string) => brokerFetch(`/teams/${id}`),
    getTeamMembers: (id: string) => brokerFetch(`/teams/${id}/members`),
    updateTeam: (id: string, data: { name?: string }) =>
      brokerFetch(`/teams/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    removeTeamMember: (teamId: string, userId: string) =>
      brokerFetch(`/teams/${teamId}/members/${userId}`, { method: "DELETE" }),
    updateMemberRole: (teamId: string, userId: string, role: string) =>
      brokerFetch(`/teams/${teamId}/members/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) }),
    transferOwnership: (teamId: string, newOwnerId: string) =>
      brokerFetch(`/teams/${teamId}/transfer`, { method: "POST", body: JSON.stringify({ new_owner_id: newOwnerId }) }),

    // Invites
    createInvite: (teamId: string, opts?: { max_uses?: number; expires_at?: string }) =>
      brokerFetch(`/teams/${teamId}/invites`, { method: "POST", body: JSON.stringify(opts || {}) }),
    getInvites: (teamId: string) => brokerFetch(`/teams/${teamId}/invites`),
    revokeInvite: (teamId: string, inviteId: number) =>
      brokerFetch(`/teams/${teamId}/invites/${inviteId}`, { method: "DELETE" }),

    // Projects
    getProjects: () => brokerFetch("/projects"),
    getProject: (id: string) => brokerFetch(`/projects/${id}`),
    getProjectUsers: (id: string) => brokerFetch(`/projects/${id}/users`),
    getProjectActivity: (id: string, limit = 50) =>
      brokerFetch(`/projects/${id}/activity?limit=${limit}`),
    getProjectFiles: (id: string) => brokerFetch(`/projects/${id}/files`),
    getClaudeActivity: (id: string) => brokerFetch(`/projects/${id}/claude-activity`),
    createProject: (data: { name: string; git_url?: string; description?: string }) =>
      brokerFetch("/projects", { method: "POST", body: JSON.stringify(data) }),
    deleteProject: (id: string) =>
      brokerFetch(`/projects/${id}`, { method: "DELETE" }),
    uploadToProject: async (projectId: string, file: File) => {
      const token = useAuthStore.getState().token;
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${BROKER_URL}/projects/${projectId}/upload`, {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText);
      }
      return res.json();
    },
    getProjectLocks: (projectId: string) => brokerFetch(`/locks/${projectId}`),
    getProjectRules: (projectId: string) => brokerFetch(`/projects/${projectId}/rules`),
    setProjectRules: (projectId: string, rules: string) =>
      brokerFetch(`/projects/${projectId}/rules`, { method: "PUT", body: JSON.stringify({ rules }) }),
    getTeamRules: (teamId: string) => brokerFetch(`/teams/${teamId}/rules`),
    setTeamRules: (teamId: string, rules: string) =>
      brokerFetch(`/teams/${teamId}/rules`, { method: "PUT", body: JSON.stringify({ rules }) }),

    // Git operations
    getGitStatus: (projectId: string) => brokerFetch(`/projects/${projectId}/git/status`),
    gitInit: (projectId: string, remoteUrl?: string) =>
      brokerFetch(`/projects/${projectId}/git/init`, { method: "POST", body: JSON.stringify({ remote_url: remoteUrl }) }),
    gitCommit: (projectId: string, message: string) =>
      brokerFetch(`/projects/${projectId}/git/commit`, { method: "POST", body: JSON.stringify({ message }) }),
    gitPush: (projectId: string) =>
      brokerFetch(`/projects/${projectId}/git/push`, { method: "POST", body: JSON.stringify({}) }),
    gitPull: (projectId: string) =>
      brokerFetch(`/projects/${projectId}/git/pull`, { method: "POST", body: JSON.stringify({}) }),

    // Sessions
    getSessions: () => brokerFetch("/sessions"),
    createSession: (projectId: string, sessionId: string, title?: string) =>
      brokerFetch("/sessions", {
        method: "POST",
        body: JSON.stringify({ project_id: projectId, session_id: sessionId, title }),
      }),
    updateSession: (id: string, updates: { status?: string; title?: string }) =>
      brokerFetch(`/sessions/${id}`, { method: "PATCH", body: JSON.stringify(updates) }),
    deleteSession: (id: string) =>
      brokerFetch(`/sessions/${id}`, { method: "DELETE" }),

    // File Locks
    getLocks: () => brokerFetch("/locks"),
    acquireLock: (data: { project_id: string; file_path: string; user_id: string; session_id: string }) =>
      brokerFetch("/locks", { method: "POST", body: JSON.stringify(data) }),
    releaseLock: (id: number) =>
      brokerFetch(`/locks/${id}`, { method: "DELETE" }),

    // Chat
    getChatMessages: (sessionId: string) => brokerFetch(`/chat/${sessionId}/messages`),
    sendChatMessage: async (sessionId: string, message: string, onChunk: (text: string) => void): Promise<void> => {
      const token = useAuthStore.getState().token;
      const res = await fetch(`${BROKER_URL}/chat/${sessionId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText);
      }
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split("\n").filter((l) => l.startsWith("data: "));
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "text") onChunk(data.text);
            if (data.type === "error") throw new Error(data.error);
          } catch (e: any) {
            if (e.message && e.message !== "Unexpected end of JSON input") throw e;
          }
        }
      }
    },

    // Connections (per-user)
    getConnections: () => brokerFetch("/connections"),
    saveConnection: (provider: string, token: string) =>
      brokerFetch(`/connections/${provider}`, { method: "PUT", body: JSON.stringify({ token }) }),
    deleteConnection: (provider: string) =>
      brokerFetch(`/connections/${provider}`, { method: "DELETE" }),

    // Online users
    getOnlineUsers: () => brokerFetch("/online-users"),

    // Activity
    getRecentActivity: (limit = 50) => brokerFetch(`/activity/recent?limit=${limit}`),

    // Usage
    getUsage: () => brokerFetch("/usage"),

    // Admin
    restartBroker: () => brokerFetch("/admin/restart-broker", { method: "POST" }),
  };
}
