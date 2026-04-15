// Syncs team and project rules to CLAUDE.md files on disk
// Claude Code reads CLAUDE.md from the project root automatically

import { db } from "./db";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// Parse team rules — handles both JSON array (new) and plain string (legacy)
function parseTeamRules(raw: string | null): string {
  if (!raw || !raw.trim()) return "";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((b: any) => b.content?.trim())
        .map((b: any) => {
          const title = b.title?.trim() ? `## ${b.title.trim()}\n` : "";
          return title + b.content.trim();
        })
        .join("\n\n");
    }
  } catch {}
  return raw.trim();
}

// Write CLAUDE.md for a specific project, combining team + project rules
export function syncProjectRules(projectId: string): void {
  const project = db.query("SELECT path, team_id, rules FROM projects WHERE id = ?").get(projectId) as any;
  if (!project?.path) return;

  const team = db.query("SELECT rules FROM teams WHERE id = ?").get(project.team_id) as any;

  const teamRulesText = parseTeamRules(team?.rules || null);
  const projectRulesText = (project.rules || "").trim();

  // Build CLAUDE.md content
  const sections: string[] = [];

  sections.push("# Orbit AI Rules");
  sections.push("# This file is auto-generated from team and project rules.");
  sections.push("# Edit rules in the Orbit AI dashboard, not this file directly.\n");

  if (teamRulesText) {
    sections.push("# ═══ Team Rules ═══");
    sections.push("# These apply to all projects in this team.\n");
    sections.push(teamRulesText);
  }

  if (projectRulesText) {
    sections.push("\n# ═══ Project Rules ═══");
    sections.push("# These are specific to this project.\n");
    sections.push(projectRulesText);
  }

  if (!teamRulesText && !projectRulesText) {
    sections.push("# No rules configured yet.");
    sections.push("# Add team rules in Team Settings → Rules tab.");
    sections.push("# Add project rules in the project sidebar.");
  }

  const content = sections.join("\n") + "\n";

  // Write to project root
  try {
    if (!existsSync(project.path)) mkdirSync(project.path, { recursive: true });
    writeFileSync(join(project.path, "CLAUDE.md"), content, "utf-8");
    console.log(`[rules-sync] Wrote CLAUDE.md for project ${projectId}`);
  } catch (err) {
    console.error(`[rules-sync] Failed to write CLAUDE.md for ${projectId}:`, err);
  }
}

// Sync rules for ALL projects in a team (called when team rules change)
export function syncTeamRules(teamId: string): void {
  const projects = db.query("SELECT id FROM projects WHERE team_id = ?").all(teamId) as { id: string }[];
  for (const p of projects) {
    syncProjectRules(p.id);
  }
  console.log(`[rules-sync] Synced CLAUDE.md for ${projects.length} projects in team ${teamId}`);
}
