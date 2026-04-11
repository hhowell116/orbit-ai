import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

interface CommandItem {
  id: string;
  label: string;
  sublabel?: string;
  action: () => void;
  icon?: string;
}

interface CommandPaletteProps {
  items: CommandItem[];
}

export function CommandPalette({ items }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const filtered = items.filter(
    (item) =>
      item.label.toLowerCase().includes(query.toLowerCase()) ||
      item.sublabel?.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 flex items-start justify-center pt-[20vh]"
      style={{ zIndex: 50, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-xl overflow-hidden shadow-2xl"
        style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-bright)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, files, commands..."
            className="flex-1 px-3 py-3.5 text-sm bg-transparent focus:outline-none"
            style={{ color: "var(--color-text-primary)" }}
          />
          <kbd
            className="text-xs px-1.5 py-0.5 rounded font-mono"
            style={{ background: "var(--color-bg-hover)", color: "var(--color-text-muted)" }}
          >
            esc
          </kbd>
        </div>

        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
              No results found
            </div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  item.action();
                  setOpen(false);
                }}
                className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
                style={{ color: "var(--color-text-primary)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span className="text-sm">{item.label}</span>
                {item.sublabel && (
                  <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
                    {item.sublabel}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
