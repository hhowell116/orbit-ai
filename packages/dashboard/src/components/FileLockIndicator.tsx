import { useAuthStore } from "../stores/authStore";

interface FileLock {
  id: number;
  file_path: string;
  user_id: string;
  user_display_name: string;
  locked_at: string;
  line_start?: number;
  line_end?: number;
}

export function FileLockIndicator({ locks }: { locks: FileLock[] }) {
  const user = useAuthStore((s) => s.user);

  if (locks.length === 0) {
    return <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>No active file locks</div>;
  }

  return (
    <div className="space-y-1">
      {locks.map((lock) => {
        const isMine = lock.user_id === user?.id;
        const time = new Date(lock.locked_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        return (
          <div
            key={lock.id}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded text-xs"
            style={{
              background: isMine ? "var(--color-success-muted)" : "var(--color-warning-muted)",
              border: `1px solid ${isMine ? "rgba(127, 216, 143, 0.2)" : "rgba(245, 167, 66, 0.2)"}`,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: isMine ? "var(--color-success)" : "var(--color-warning)" }}
            />
            <span className="font-mono truncate flex-1" style={{ color: "var(--color-text-primary)" }}>
              {lock.file_path.split("/").pop()}
            </span>
            <span className="whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>
              {isMine ? "You" : lock.user_display_name} - {time}
            </span>
          </div>
        );
      })}
    </div>
  );
}
