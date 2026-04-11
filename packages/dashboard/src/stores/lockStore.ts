import { create } from "zustand";

interface FileLock {
  id: number;
  project_id: string;
  file_path: string;
  user_id: string;
  session_id: string;
  user_display_name: string;
  line_start?: number;
  line_end?: number;
  locked_at: string;
}

interface LockState {
  locks: FileLock[];
  setLocks: (locks: FileLock[]) => void;
  addLock: (lock: FileLock) => void;
  removeLock: (id: number) => void;
  isLockedByOther: (projectId: string, filePath: string, userId: string) => boolean;
  getLocksForProject: (projectId: string) => FileLock[];
}

export const useLockStore = create<LockState>((set, get) => ({
  locks: [],
  setLocks: (locks) => set({ locks }),
  addLock: (lock) =>
    set((state) => ({
      locks: [
        ...state.locks.filter(
          (l) =>
            !(l.project_id === lock.project_id && l.file_path === lock.file_path)
        ),
        lock,
      ],
    })),
  removeLock: (id) =>
    set((state) => ({ locks: state.locks.filter((l) => l.id !== id) })),
  isLockedByOther: (projectId, filePath, userId) => {
    const lock = get().locks.find(
      (l) => l.project_id === projectId && l.file_path === filePath
    );
    return lock ? lock.user_id !== userId : false;
  },
  getLocksForProject: (projectId) =>
    get().locks.filter((l) => l.project_id === projectId),
}));
