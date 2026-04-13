import { useState, useRef, useEffect } from "react";
import { MessageBubble, type Message } from "./MessageBubble";
import { SessionStatus } from "./SessionStatus";

interface ChatWindowProps {
  messages: Message[];
  sessionStatus: "idle" | "thinking" | "error";
  onSendMessage: (text: string) => void;
  onAbort: () => void;
  claudeConnected?: boolean | null;
}

export function ChatWindow({ messages, sessionStatus, onSendMessage, onAbort, claudeConnected }: ChatWindowProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sessionStatus === "thinking") return;
    onSendMessage(text);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Connection warning */}
      {claudeConnected === false && (
        <div className="mx-4 mt-4 rounded-lg px-4 py-3 flex items-center gap-3"
          style={{ background: "var(--color-warning-muted)", border: "1px solid rgba(245, 167, 66, 0.3)" }}>
          <svg viewBox="0 0 20 20" fill="var(--color-warning)" className="w-5 h-5 shrink-0">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--color-warning)" }}>Enable your Claude connection to start working!</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              Go to Connections to set up your API key or Claude credentials.
            </p>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && claudeConnected !== false && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <span className="text-2xl" style={{ color: "var(--color-primary)", opacity: 0.3 }}>
              &gt;_
            </span>
            <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              Start a conversation with Claude
            </span>
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Status */}
      {sessionStatus !== "idle" && (
        <div className="px-4 pb-2">
          <SessionStatus status={sessionStatus} onAbort={onAbort} />
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3" style={{ borderTop: "1px solid var(--color-border)" }}>
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Claude..."
            rows={1}
            className="flex-1 px-3 py-2.5 rounded-lg text-sm focus:outline-none transition-colors resize-none"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-sans)",
            }}
            onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
          />
          <button
            type="submit"
            disabled={!input.trim() || sessionStatus === "thinking"}
            className="px-4 py-2.5 rounded-lg transition-all text-sm font-medium"
            style={{
              background: !input.trim() || sessionStatus === "thinking" ? "var(--color-bg-hover)" : "var(--color-primary)",
              color: !input.trim() || sessionStatus === "thinking" ? "var(--color-text-muted)" : "var(--color-text-inverse)",
              cursor: !input.trim() || sessionStatus === "thinking" ? "not-allowed" : "pointer",
            }}
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
