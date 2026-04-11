interface SessionStatusProps {
  status: "idle" | "thinking" | "error";
  onAbort?: () => void;
}

export function SessionStatus({ status, onAbort }: SessionStatusProps) {
  if (status === "idle") return null;

  return (
    <div className="flex items-center gap-2 text-sm">
      {status === "thinking" && (
        <>
          <div className="flex gap-1">
            <span className="w-1 h-1 rounded-full animate-bounce" style={{ background: "var(--color-primary)", animationDelay: "0ms" }} />
            <span className="w-1 h-1 rounded-full animate-bounce" style={{ background: "var(--color-primary)", animationDelay: "150ms" }} />
            <span className="w-1 h-1 rounded-full animate-bounce" style={{ background: "var(--color-primary)", animationDelay: "300ms" }} />
          </div>
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Claude is thinking...</span>
          {onAbort && (
            <button
              onClick={onAbort}
              className="ml-auto text-xs transition-colors"
              style={{ color: "var(--color-error)" }}
            >
              Stop
            </button>
          )}
        </>
      )}
      {status === "error" && (
        <span className="text-xs" style={{ color: "var(--color-error)" }}>An error occurred</span>
      )}
    </div>
  );
}
