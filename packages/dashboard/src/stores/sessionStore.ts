import { create } from "zustand";

interface Session {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  status: "idle" | "thinking" | "error" | "ended";
  user_display_name?: string;
  project_name?: string;
  created_at: string;
  updated_at: string;
}

interface SessionState {
  sessions: Session[];
  activeSessionId: string | null;
  setSessions: (sessions: Session[]) => void;
  setActiveSession: (id: string | null) => void;
  updateSession: (id: string, updates: Partial<Session>) => void;
  addSession: (session: Session) => void;
  removeSession: (id: string) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  activeSessionId: null,
  setSessions: (sessions) => set({ sessions }),
  setActiveSession: (id) => set({ activeSessionId: id }),
  updateSession: (id, updates) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    })),
  addSession: (session) =>
    set((state) => ({ sessions: [...state.sessions, session] })),
  removeSession: (id) =>
    set((state) => ({ sessions: state.sessions.filter((s) => s.id !== id) })),
}));
