import { useState, useMemo, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileNode {
  name: string;
  type: "file" | "dir";
  path: string;
  children?: FileNode[];
}

interface FileLock {
  file_path: string;
  user_id: string;
  user_display_name: string;
}

interface FileTreeProps {
  files: FileNode[];
  locks: FileLock[];
  activity: { file: string; action: string }[]; // "reading" or "editing"
  currentUserId: string;
}

// ---------------------------------------------------------------------------
// Extension color map
// ---------------------------------------------------------------------------

const EXT_COLORS: Record<string, string> = {
  ts: "#3b82f6",
  tsx: "#3b82f6",
  js: "#eab308",
  jsx: "#eab308",
  json: "#22c55e",
  css: "#a855f7",
  scss: "#a855f7",
  html: "#f97316",
  py: "#3b82f6",
  md: "#9ca3af",
  txt: "#9ca3af",
  yaml: "#22c55e",
  yml: "#22c55e",
  toml: "#22c55e",
  rs: "#f97316",
  go: "#06b6d4",
  sh: "#9ca3af",
  sql: "#eab308",
  svg: "#f97316",
};

const DEFAULT_DOT_COLOR = "#6b7280";

function extColor(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_COLORS[ext] ?? DEFAULT_DOT_COLOR;
}

// ---------------------------------------------------------------------------
// Styles (inline, using CSS variables per project convention)
// ---------------------------------------------------------------------------

const styles = {
  root: {
    fontSize: 12,
    lineHeight: "20px",
    color: "var(--color-text-primary)",
    userSelect: "none" as const,
  },

  empty: {
    padding: "12px 8px",
    fontSize: 12,
    color: "var(--color-text-muted)",
  },

  row: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "1px 6px",
    borderRadius: 4,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },

  rowHover: {
    background: "var(--color-bg-hover)",
  },

  arrow: {
    width: 14,
    textAlign: "center" as const,
    fontSize: 10,
    color: "var(--color-text-muted)",
    flexShrink: 0,
  },

  arrowPlaceholder: {
    width: 14,
    flexShrink: 0,
  },

  dot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    flexShrink: 0,
  },

  name: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    flex: 1,
    minWidth: 0,
  },

  lockBadge: (isOwn: boolean) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    marginLeft: "auto",
    flexShrink: 0,
    fontSize: 10,
    lineHeight: "16px",
    padding: "0 5px",
    borderRadius: 3,
    background: isOwn ? "var(--color-success-muted)" : "var(--color-warning-muted)",
    color: isOwn ? "var(--color-success)" : "var(--color-warning)",
  }),

  lockIcon: {
    fontSize: 9,
    fontWeight: 700 as const,
  },

  editIndicator: {
    width: 5,
    height: 5,
    borderRadius: "50%",
    background: "var(--color-primary)",
    flexShrink: 0,
    animation: "filetree-pulse 1.8s ease-in-out infinite",
  },

  editLabel: {
    fontSize: 10,
    color: "var(--color-primary)",
    flexShrink: 0,
    marginLeft: 2,
  },

  children: {
    paddingLeft: 12,
    borderLeft: "1px solid var(--color-border)",
    marginLeft: 7,
  },
};

// Keyframe injection (runs once)
const KEYFRAME_ID = "filetree-pulse-keyframes";
function ensureKeyframes() {
  if (typeof document === "undefined") return;
  if (document.getElementById(KEYFRAME_ID)) return;
  const sheet = document.createElement("style");
  sheet.id = KEYFRAME_ID;
  sheet.textContent = `@keyframes filetree-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`;
  document.head.appendChild(sheet);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface FileRowProps {
  node: FileNode;
  depth: number;
  locks: Map<string, FileLock>;
  activityMap: Map<string, string>;
  currentUserId: string;
  expanded: Set<string>;
  toggleExpanded: (path: string) => void;
}

function FileRow({
  node,
  depth,
  locks,
  activityMap,
  currentUserId,
  expanded,
  toggleExpanded,
}: FileRowProps) {
  const [hovered, setHovered] = useState(false);

  const isDir = node.type === "dir";
  const isOpen = expanded.has(node.path);
  const lock = locks.get(node.path);
  const fileAction = activityMap.get(node.path);
  const isReading = fileAction === "reading";
  const isEditing = fileAction === "editing";
  const isActive = isReading || isEditing;
  const isOwnLock = lock ? lock.user_id === currentUserId : false;

  const handleClick = () => {
    if (isDir) {
      toggleExpanded(node.path);
    }
  };

  return (
    <div>
      {/* Row */}
      <div
        style={{
          ...styles.row,
          ...(hovered ? styles.rowHover : {}),
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={handleClick}
        role={isDir ? "button" : undefined}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        {/* Expand / collapse arrow or spacer */}
        {isDir ? (
          <span style={styles.arrow}>{isOpen ? "\u25BC" : "\u25B6"}</span>
        ) : (
          <span style={styles.arrowPlaceholder} />
        )}

        {/* File type dot / dir indicator */}
        {isDir ? (
          <span style={{ ...styles.dot, background: "var(--color-text-muted)" }} />
        ) : (
          <span style={{ ...styles.dot, background: extColor(node.name) }} />
        )}

        {/* Name */}
        <span
          style={{
            ...styles.name,
            fontWeight: isDir ? 500 : 400,
            color: isReading ? "var(--color-accent)" : isEditing ? "var(--color-primary)" : "var(--color-text-primary)",
          }}
        >
          {node.name}
        </span>

        {/* Activity indicator */}
        {isActive && (
          <>
            <span style={{
              ...styles.editIndicator,
              background: isReading ? "var(--color-accent)" : "var(--color-primary)",
            }} />
            <span style={{
              ...styles.editLabel,
              color: isReading ? "var(--color-accent)" : "var(--color-primary)",
            }}>
              {isReading ? "reading" : "editing"}
            </span>
          </>
        )}

        {/* Lock badge */}
        {lock && (
          <span style={styles.lockBadge(isOwnLock)}>
            <span style={styles.lockIcon}>[L]</span>
            {isOwnLock ? "You" : lock.user_display_name}
          </span>
        )}
      </div>

      {/* Children (directories only, when expanded) */}
      {isDir && isOpen && node.children && node.children.length > 0 && (
        <div style={styles.children}>
          {sortNodes(node.children).map((child) => (
            <FileRow
              key={child.path}
              node={child}
              depth={depth + 1}
              locks={locks}
              activityMap={activityMap}
              currentUserId={currentUserId}
              expanded={expanded}
              toggleExpanded={toggleExpanded}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sort nodes: directories first, then alphabetical by name (case-insensitive). */
function sortNodes(nodes: FileNode[]): FileNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

/** Collect the paths of all top-level directories so they start expanded. */
function collectFirstLevelDirs(nodes: FileNode[]): string[] {
  return nodes.filter((n) => n.type === "dir").map((n) => n.path);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FileTree({ files, locks, activity, currentUserId }: FileTreeProps) {
  ensureKeyframes();

  // Auto-expand first level on mount
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(collectFirstLevelDirs(files)),
  );

  const toggleExpanded = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Index locks by file_path for O(1) lookups
  const lockMap = useMemo(() => {
    const map = new Map<string, FileLock>();
    for (const lock of locks) {
      map.set(lock.file_path, lock);
    }
    return map;
  }, [locks]);

  const activityMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of activity) map.set(a.file, a.action);
    return map;
  }, [activity]);

  if (files.length === 0) {
    return <div style={styles.empty}>No files found</div>;
  }

  return (
    <div style={styles.root}>
      {sortNodes(files).map((node) => (
        <FileRow
          key={node.path}
          node={node}
          depth={0}
          locks={lockMap}
          activityMap={activityMap}
          currentUserId={currentUserId}
          expanded={expanded}
          toggleExpanded={toggleExpanded}
        />
      ))}
    </div>
  );
}
