import { useAuthStore } from "../stores/authStore";

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
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export function useBroker() {
  return {
    // Auth
    login: (username: string, password: string) =>
      brokerFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      }),
    me: () => brokerFetch("/auth/me"),

    // Projects
    getProjects: () => brokerFetch("/projects"),
    getProject: (id: string) => brokerFetch(`/projects/${id}`),
    getProjectUsers: (id: string) => brokerFetch(`/projects/${id}/users`),
    getProjectActivity: (id: string, limit = 50) =>
      brokerFetch(`/projects/${id}/activity?limit=${limit}`),

    // Sessions
    getSessions: () => brokerFetch("/sessions"),
    createSession: (projectId: string, sessionId: string, title?: string) =>
      brokerFetch("/sessions", {
        method: "POST",
        body: JSON.stringify({ project_id: projectId, session_id: sessionId, title }),
      }),
    updateSession: (id: string, updates: { status?: string; title?: string }) =>
      brokerFetch(`/sessions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      }),
    deleteSession: (id: string) =>
      brokerFetch(`/sessions/${id}`, { method: "DELETE" }),

    // File Locks
    getLocks: () => brokerFetch("/locks"),
    getProjectLocks: (projectId: string) => brokerFetch(`/locks/${projectId}`),
    acquireLock: (data: {
      project_id: string;
      file_path: string;
      user_id: string;
      session_id: string;
    }) => brokerFetch("/locks", { method: "POST", body: JSON.stringify(data) }),
    releaseLock: (id: number) =>
      brokerFetch(`/locks/${id}`, { method: "DELETE" }),

    // Activity
    getRecentActivity: (limit = 50) =>
      brokerFetch(`/activity/recent?limit=${limit}`),

    // Usage
    getUsage: () => brokerFetch("/usage"),
  };
}
