import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useBroker } from "../hooks/useBroker";
import { OrbitalBackground } from "../components/OrbitalBackground";

interface Member {
  id: string;
  username: string;
  display_name: string;
  role: string;
  joined_at: string;
}

interface Invite {
  id: number;
  code: string;
  use_count: number;
  max_uses: number | null;
  expires_at: string | null;
  created_at: string;
}

export function TeamSettingsPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, activeTeam } = useAuthStore();
  const broker = useBroker();

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [transferTarget, setTransferTarget] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [teamRules, setTeamRules] = useState("");
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesMsg, setRulesMsg] = useState("");

  // Tab from URL hash
  const tab = location.hash === "#rules" ? "rules" : "members";

  const isOwnerOrAdmin = activeTeam?.role === "owner" || activeTeam?.role === "admin";
  const isOwner = activeTeam?.role === "owner";

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      broker.getTeamMembers(teamId).then(setMembers),
      broker.getTeamRules(teamId).then((d: any) => setTeamRules(d.rules || "")),
      isOwnerOrAdmin ? broker.getInvites(teamId).then(setInvites) : Promise.resolve(),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [teamId]);

  async function handleSaveRules() {
    if (!teamId) return;
    setRulesSaving(true);
    setRulesMsg("");
    try {
      await broker.setTeamRules(teamId, teamRules);
      setRulesMsg("Saved!");
      setTimeout(() => setRulesMsg(""), 3000);
    } catch (err: any) {
      setRulesMsg(err.message || "Failed to save");
    } finally {
      setRulesSaving(false);
    }
  }

  async function handleGenerateInvite() {
    if (!teamId) return;
    const invite = await broker.createInvite(teamId);
    setInvites((prev) => [invite, ...prev]);
  }

  async function handleRevokeInvite(inviteId: number) {
    if (!teamId) return;
    await broker.revokeInvite(teamId, inviteId);
    setInvites((prev) => prev.filter((i) => i.id !== inviteId));
  }

  async function handleRemoveMember(userId: string) {
    if (!teamId || !confirm("Remove this member from the team?")) return;
    await broker.removeTeamMember(teamId, userId);
    setMembers((prev) => prev.filter((m) => m.id !== userId));
  }

  async function handleChangeRole(userId: string, role: string) {
    if (!teamId) return;
    await broker.updateMemberRole(teamId, userId, role);
    setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, role } : m)));
  }

  async function handleTransferOwnership() {
    if (!teamId || !transferTarget) return;
    const target = members.find((m) => m.id === transferTarget);
    if (!target) return;
    if (!confirm(`Transfer ownership to ${target.display_name}? You will become an admin.`)) return;
    setTransferring(true);
    try {
      await broker.transferOwnership(teamId, transferTarget);
      const updated = await broker.getTeamMembers(teamId);
      setMembers(updated);
      setTransferTarget("");
      alert("Ownership transferred successfully. You are now an admin.");
    } catch (err: any) {
      alert(err.message || "Failed to transfer ownership");
    } finally {
      setTransferring(false);
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="min-h-screen relative" style={{ background: "var(--color-bg-base)" }}>
      <OrbitalBackground />
      <div className={`mx-auto pt-10 px-4 pb-20 relative ${tab === "rules" ? "max-w-5xl" : "max-w-2xl"}`} style={{ zIndex: 1 }}>
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate("/")} className="text-sm" style={{ color: "var(--color-text-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}>
            &larr; Dashboard
          </button>
          <div className="pl-4" style={{ borderLeft: "1px solid var(--color-border)" }}>
            <h1 className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{activeTeam?.name}</h1>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Team Settings</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 rounded-lg p-1" style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)" }}>
          <button onClick={() => navigate(`#members`, { replace: true })}
            className="flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all"
            style={{
              background: tab === "members" ? "var(--color-bg-elevated)" : "transparent",
              color: tab === "members" ? "var(--color-text-primary)" : "var(--color-text-muted)",
              border: tab === "members" ? "1px solid var(--color-border)" : "1px solid transparent",
            }}>
            Members
          </button>
          <button onClick={() => navigate(`#rules`, { replace: true })}
            className="flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all"
            style={{
              background: tab === "rules" ? "var(--color-bg-elevated)" : "transparent",
              color: tab === "rules" ? "var(--color-text-primary)" : "var(--color-text-muted)",
              border: tab === "rules" ? "1px solid var(--color-border)" : "1px solid transparent",
            }}>
            Rules
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-sm" style={{ color: "var(--color-text-muted)" }}>Loading...</div>
        ) : tab === "members" ? (
          /* ═══ MEMBERS TAB ═══ */
          <div className="space-y-6">
            {/* Members */}
            <div className="rounded-lg p-5" style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)" }}>
              <h2 className="text-xs font-medium uppercase tracking-wider mb-4" style={{ color: "var(--color-text-muted)" }}>
                Members ({members.length})
              </h2>
              <div className="space-y-2">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ background: "var(--color-bg-elevated)" }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: "var(--color-success)" }} />
                    <span className="text-sm flex-1" style={{ color: "var(--color-text-primary)" }}>{m.display_name}</span>
                    <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>@{m.username}</span>
                    {isOwner && m.id !== user?.id ? (
                      <select value={m.role} onChange={(e) => handleChangeRole(m.id, e.target.value)}
                        className="text-xs px-2 py-1 rounded focus:outline-none"
                        style={{ background: "var(--color-bg-base)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>
                        <option value="member">member</option>
                        <option value="admin">admin</option>
                        <option value="owner">owner</option>
                      </select>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{
                        background: m.role === "owner" ? "var(--color-primary-muted)" : "var(--color-bg-hover)",
                        color: m.role === "owner" ? "var(--color-primary)" : "var(--color-text-muted)",
                      }}>{m.role}</span>
                    )}
                    {isOwnerOrAdmin && m.id !== user?.id && m.role !== "owner" && (
                      <button onClick={() => handleRemoveMember(m.id)} className="text-xs px-1" style={{ color: "var(--color-text-muted)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-error)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}>
                        x
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Invite Codes */}
            {isOwnerOrAdmin && (
              <div className="rounded-lg p-5" style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)" }}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                    Invite Codes
                  </h2>
                  <button onClick={handleGenerateInvite}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium"
                    style={{ background: "var(--color-primary)", color: "var(--color-text-inverse)" }}>
                    + Generate Code
                  </button>
                </div>
                {invites.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>No invite codes yet</p>
                ) : (
                  <div className="space-y-2">
                    {invites.map((inv) => (
                      <div key={inv.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ background: "var(--color-bg-elevated)" }}>
                        <span className="font-mono text-sm tracking-wider flex-1" style={{ color: "var(--color-primary)" }}>{inv.code}</span>
                        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          {inv.use_count} uses{inv.max_uses ? ` / ${inv.max_uses}` : ""}
                        </span>
                        <button onClick={() => copyCode(inv.code)} className="text-xs px-2 py-1 rounded" style={{ background: "var(--color-bg-hover)", color: "var(--color-text-secondary)" }}>
                          {copied === inv.code ? "Copied!" : "Copy"}
                        </button>
                        <button onClick={() => handleRevokeInvite(inv.id)} className="text-xs px-1" style={{ color: "var(--color-text-muted)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-error)")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}>
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Transfer Ownership */}
            {isOwner && members.filter((m) => m.id !== user?.id).length > 0 && (
              <div className="rounded-lg p-5" style={{ background: "var(--color-bg-surface)", border: "1px solid rgba(224, 108, 117, 0.2)" }}>
                <h2 className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: "var(--color-error)" }}>
                  Transfer Ownership
                </h2>
                <p className="text-xs mb-4" style={{ color: "var(--color-text-muted)" }}>
                  Transfer team ownership to another member. You will become an admin.
                </p>
                <div className="flex gap-2">
                  <select value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none"
                    style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>
                    <option value="">Select a member...</option>
                    {members.filter((m) => m.id !== user?.id).map((m) => (
                      <option key={m.id} value={m.id}>{m.display_name} (@{m.username})</option>
                    ))}
                  </select>
                  <button onClick={handleTransferOwnership} disabled={transferring || !transferTarget}
                    className="px-4 py-2 rounded-lg text-sm font-medium"
                    style={{
                      background: transferring || !transferTarget ? "var(--color-bg-hover)" : "var(--color-error)",
                      color: transferring || !transferTarget ? "var(--color-text-muted)" : "#fff",
                    }}>
                    {transferring ? "Transferring..." : "Transfer"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ═══ RULES TAB ═══ */
          <div className="space-y-4">
            {/* Main rules editor */}
            <div className="rounded-lg p-5" style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)" }}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                    Team Rules
                  </h2>
                  <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                    Instructions Claude must follow for all projects. Sent as a system prompt with prompt caching.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {rulesMsg && (
                    <span className="text-xs" style={{ color: rulesMsg === "Saved!" ? "var(--color-success)" : "var(--color-error)" }}>{rulesMsg}</span>
                  )}
                  {isOwnerOrAdmin && (
                    <button onClick={handleSaveRules} disabled={rulesSaving}
                      className="text-xs px-4 py-2 rounded-lg font-medium"
                      style={{ background: "var(--color-primary)", color: "var(--color-text-inverse)" }}>
                      {rulesSaving ? "Saving..." : "Save Rules"}
                    </button>
                  )}
                </div>
              </div>
              <textarea
                value={teamRules}
                onChange={(e) => setTeamRules(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm font-mono focus:outline-none resize-y"
                style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)", lineHeight: "1.6", height: "calc(75vh - 200px)", minHeight: "300px" }}
                onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
                placeholder={`# Team Rules for Claude

## Token Efficiency
- Be concise. Avoid unnecessary explanations.
- Only read files that are directly relevant to the task.
- Do not repeat back large blocks of code — reference by filename and line numbers.
- Summarize changes rather than showing full diffs.

## Code Standards
- Follow existing code style and conventions.
- Do not add comments unless the logic is non-obvious.
- Do not refactor code that isn't related to the current task.

## Behavior
- Ask clarifying questions before making large changes.
- Always explain what you changed and why in 1-2 sentences.`}
                disabled={!isOwnerOrAdmin}
              />
            </div>

            {/* Quick add rule templates */}
            {isOwnerOrAdmin && (
              <div className="rounded-lg p-5" style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)" }}>
                <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: "var(--color-text-muted)" }}>
                  Add a Rule
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Token Efficiency", rule: "\n## Token Efficiency\n- Be concise. Avoid unnecessary explanations.\n- Only read files directly relevant to the task.\n- Do not repeat back large blocks of code.\n- Summarize changes rather than showing full diffs.\n" },
                    { label: "Code Standards", rule: "\n## Code Standards\n- Follow existing code style and conventions.\n- Do not add comments unless the logic is non-obvious.\n- Do not refactor code unrelated to the current task.\n- Match the indentation and naming patterns in the file.\n" },
                    { label: "Behavior", rule: "\n## Behavior\n- Ask clarifying questions before making large changes.\n- Always explain what you changed and why in 1-2 sentences.\n- Do not make assumptions about user intent.\n" },
                    { label: "Security", rule: "\n## Security\n- Never expose API keys, tokens, or secrets in code.\n- Sanitize all user input before use.\n- Use parameterized queries for database access.\n- Follow OWASP top 10 guidelines.\n" },
                    { label: "Testing", rule: "\n## Testing\n- Write tests for new features and bug fixes.\n- Do not remove or skip existing tests.\n- Test edge cases and error paths.\n" },
                    { label: "Git", rule: "\n## Git\n- Write clear, concise commit messages.\n- One logical change per commit.\n- Do not commit generated files or dependencies.\n" },
                  ].map((t) => (
                    <button key={t.label} onClick={() => setTeamRules((prev) => prev + t.rule)}
                      className="flex items-center gap-2 p-2.5 rounded-lg text-left text-xs transition-colors"
                      style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; e.currentTarget.style.color = "var(--color-primary)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}>
                      <span style={{ color: "var(--color-primary)" }}>+</span>
                      {t.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs mt-3" style={{ color: "var(--color-text-muted)" }}>
                  Click to append a rule template. Edit the text above, then save.
                </p>
              </div>
            )}

            <p className="text-xs text-center" style={{ color: "var(--color-text-muted)" }}>
              These rules apply to all projects in this team. Individual projects can add their own rules in the project sidebar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
