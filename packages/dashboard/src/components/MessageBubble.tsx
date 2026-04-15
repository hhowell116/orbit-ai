import { useState } from "react";

export interface ToolCall {
  tool: string;
  args?: Record<string, unknown>;
  result?: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
}

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[85%] rounded-lg px-4 py-3 text-sm"
        style={{
          background: isUser ? "var(--color-primary-muted)" : "var(--color-bg-surface)",
          border: `1px solid ${isUser ? "rgba(250, 178, 131, 0.25)" : "var(--color-border)"}`,
          color: isUser ? "var(--color-primary)" : "var(--color-text-primary)",
        }}
      >
        {/* Role tag */}
        <div className="text-xs font-mono mb-1.5" style={{ color: isUser ? "var(--color-primary)" : "var(--color-secondary)", opacity: 0.7 }}>
          {isUser ? "you" : "claude"}
        </div>

        {/* Content */}
        <div className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</div>

        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {message.toolCalls.map((tc, i) => (
              <ToolCallCard key={i} toolCall={tc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className="w-full text-left rounded-md p-2 transition-colors"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border-subtle)",
      }}
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="font-mono font-medium" style={{ color: "var(--color-accent)" }}>
          {toolCall.tool}
        </span>
        {toolCall.args && "path" in toolCall.args && typeof toolCall.args.path === "string" && (
          <span className="font-mono truncate" style={{ color: "var(--color-text-muted)" }}>
            {toolCall.args.path}
          </span>
        )}
        <span className="ml-auto" style={{ color: "var(--color-text-muted)" }}>
          {expanded ? "^" : "v"}
        </span>
      </div>

      {expanded && toolCall.result && (
        <pre
          className="mt-2 text-xs overflow-x-auto max-h-48 whitespace-pre-wrap rounded p-2"
          style={{
            background: "var(--color-bg-base)",
            color: "var(--color-text-secondary)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {toolCall.result}
        </pre>
      )}
    </button>
  );
}
