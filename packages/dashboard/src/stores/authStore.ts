import { create } from "zustand";

export interface User {
  id: string;
  username: string;
  display_name: string;
  email?: string;
}

export interface Team {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  teams: Team[];
  activeTeam: Team | null;

  login: (token: string, user: User, teams: Team[]) => void;
  signup: (token: string, user: User) => void;
  selectTeam: (token: string, team: Team) => void;
  setTeams: (teams: Team[]) => void;
  logout: () => void;
}

const STORAGE_KEY = "orbit-auth";

function saveToStorage(state: { token: string; user: User; teams: Team[]; activeTeam: Team | null }) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function loadFromStorage(): { token: string; user: User; teams: Team[]; activeTeam: Team | null } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Check if a JWT is expired by decoding the payload
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    // Expire 60s early to avoid edge-case 401s
    return payload.exp * 1000 < Date.now() - 60_000;
  } catch {
    return true; // Malformed token — treat as expired
  }
}

// Hydrate initial state from sessionStorage, clear if expired
const stored = loadFromStorage();
if (stored?.token && isTokenExpired(stored.token)) {
  sessionStorage.removeItem(STORAGE_KEY);
}
const validStored = stored?.token && !isTokenExpired(stored.token) ? stored : null;

export const useAuthStore = create<AuthState>((set, get) => ({
  token: validStored?.token || null,
  user: validStored?.user || null,
  teams: validStored?.teams || [],
  activeTeam: validStored?.activeTeam || null,

  login: (token, user, teams) => {
    const state = { token, user, teams, activeTeam: null as Team | null };
    saveToStorage(state);
    set(state);
  },

  signup: (token, user) => {
    const state = { token, user, teams: [] as Team[], activeTeam: null as Team | null };
    saveToStorage(state);
    set(state);
  },

  selectTeam: (token, team) => {
    const prev = get();
    const state = { token, user: prev.user!, teams: prev.teams, activeTeam: team };
    saveToStorage(state);
    set({ token, activeTeam: team });
  },

  setTeams: (teams) => {
    set({ teams });
    const prev = loadFromStorage();
    if (prev) saveToStorage({ ...prev, teams });
  },

  logout: () => {
    sessionStorage.removeItem(STORAGE_KEY);
    set({ token: null, user: null, teams: [], activeTeam: null });
  },
}));
