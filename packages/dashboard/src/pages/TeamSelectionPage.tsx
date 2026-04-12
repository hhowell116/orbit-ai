import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore, type Team } from "../stores/authStore";
import { useBroker } from "../hooks/useBroker";
import { OrbitalBackground } from "../components/OrbitalBackground";

export function TeamSelectionPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"select" | "create" | "join">("select");
  const [teamName, setTeamName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdCode, setCreatedCode] = useState("");
  const navigate = useNavigate();
  const { user, selectTeam, setTeams: storeSetTeams, logout } = useAuthStore();
  const broker = useBroker();

  useEffect(() => {
    broker.getMyTeams()
      .then((t: Team[]) => { setTeams(t); storeSetTeams(t); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSelectTeam(team: Team) {
    setActionLoading(true);
    try {
      const data = await broker.selectTeam(team.id);
      selectTeam(data.token, { ...data.team });
      navigate("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!teamName) return;
    setActionLoading(true);
    setError("");
    setCreatedCode("");
    try {
      const data = await broker.createTeam(teamName);
      setCreatedCode(data.invite_code);
      // Refresh teams and auto-select the new one
      const updatedTeams = await broker.getMyTeams();
      setTeams(updatedTeams);
      storeSetTeams(updatedTeams);
      // Auto-select
      const selectData = await broker.selectTeam(data.team.id);
      selectTeam(selectData.token, { ...selectData.team });
      // Don't navigate yet — show the invite code first
    } catch (err: any) {
      setError(err.message || "Failed to create team");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleJoinTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteCode) return;
    setActionLoading(true);
    setError("");
    try {
      const data = await broker.joinTeam(inviteCode);
      const updatedTeams = await broker.getMyTeams();
      setTeams(updatedTeams);
      storeSetTeams(updatedTeams);
      // Auto-select the joined team
      const joinedTeam = updatedTeams.find((t: Team) => t.id === data.team.id);
      if (joinedTeam) {
        const selectData = await broker.selectTeam(joinedTeam.id);
        selectTeam(selectData.token, { ...selectData.team });
        navigate("/");
      }
    } catch (err: any) {
      setError(err.message || "Failed to join team");
    } finally {
      setActionLoading(false);
    }
  }

  const inputStyle = {
    background: "var(--color-bg-elevated)",
    border: "1px solid var(--color-border)",
    color: "var(--color-text-primary)",
  };

  return (
    <div className="min-h-screen relative" style={{ background: "var(--color-bg-base)" }}>
      <OrbitalBackground />
      <div className="max-w-lg mx-auto pt-20 px-4 relative" style={{ zIndex: 1 }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "var(--color-primary)" }}>Orbit AI</h1>
            <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
              Welcome, {user?.display_name}
            </p>
          </div>
          <button onClick={logout} className="text-xs" style={{ color: "var(--color-text-muted)" }}>Sign out</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 rounded-lg" style={{ background: "var(--color-bg-surface)" }}>
          {(["select", "create", "join"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(""); setCreatedCode(""); }}
              className="flex-1 py-2 px-3 rounded-md text-xs font-medium transition-colors"
              style={{
                background: tab === t ? "var(--color-bg-elevated)" : "transparent",
                color: tab === t ? "var(--color-text-primary)" : "var(--color-text-muted)",
              }}
            >
              {t === "select" ? "Your Teams" : t === "create" ? "Create Team" : "Join Team"}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--color-error-muted)", color: "var(--color-error)" }}>
            {error}
          </div>
        )}

        {/* Your Teams */}
        {tab === "select" && (
          <div className="space-y-2">
            {loading ? (
              <div className="text-center py-8 text-sm" style={{ color: "var(--color-text-muted)" }}>Loading teams...</div>
            ) : teams.length === 0 ? (
              <div className="rounded-lg p-8 text-center" style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)" }}>
                <p className="text-sm mb-2" style={{ color: "var(--color-text-secondary)" }}>You're not in any teams yet</p>
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Create a new team or join one with an invite code</p>
              </div>
            ) : (
              teams.map((team) => (
                <button
                  key={team.id}
                  onClick={() => handleSelectTeam(team)}
                  disabled={actionLoading}
                  className="w-full text-left rounded-lg px-5 py-4 transition-all"
                  style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; e.currentTarget.style.background = "var(--color-bg-elevated)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.background = "var(--color-bg-surface)"; }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{team.name}</div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{team.role}</div>
                    </div>
                    <span className="text-xs" style={{ color: "var(--color-primary)" }}>Enter &rarr;</span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {/* Create Team */}
        {tab === "create" && (
          <div className="rounded-lg p-6" style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)" }}>
            {createdCode ? (
              <div className="text-center">
                <p className="text-sm mb-3" style={{ color: "var(--color-success)" }}>Team created!</p>
                <p className="text-xs mb-4" style={{ color: "var(--color-text-secondary)" }}>Share this invite code with your team:</p>
                <div className="inline-block px-6 py-3 rounded-lg font-mono text-lg tracking-widest mb-4"
                  style={{ background: "var(--color-bg-elevated)", color: "var(--color-primary)", border: "1px solid var(--color-border)" }}>
                  {createdCode}
                </div>
                <div>
                  <button
                    onClick={() => { navigator.clipboard.writeText(createdCode); }}
                    className="text-xs mr-3 px-3 py-1.5 rounded-lg"
                    style={{ background: "var(--color-bg-hover)", color: "var(--color-text-secondary)" }}
                  >
                    Copy Code
                  </button>
                  <button
                    onClick={() => navigate("/")}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium"
                    style={{ background: "var(--color-primary)", color: "var(--color-text-inverse)" }}
                  >
                    Go to Dashboard
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateTeam} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                    Team Name
                  </label>
                  <input type="text" value={teamName} onChange={(e) => setTeamName(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none" style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                    onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
                    placeholder="e.g. Acme IT Department" autoFocus />
                </div>
                <button type="submit" disabled={actionLoading || !teamName}
                  className="w-full py-2.5 rounded-lg text-sm font-medium"
                  style={{
                    background: actionLoading || !teamName ? "var(--color-bg-hover)" : "var(--color-primary)",
                    color: actionLoading || !teamName ? "var(--color-text-muted)" : "var(--color-text-inverse)",
                    cursor: actionLoading || !teamName ? "not-allowed" : "pointer",
                  }}>
                  {actionLoading ? "Creating..." : "Create Team"}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Join Team */}
        {tab === "join" && (
          <div className="rounded-lg p-6" style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)" }}>
            <form onSubmit={handleJoinTeam} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                  Invite Code
                </label>
                <input type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none font-mono tracking-wider text-center"
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
                  placeholder="XXXX-XXXX" autoFocus />
                <p className="text-xs mt-1.5" style={{ color: "var(--color-text-muted)" }}>
                  Ask your team admin for an invite code
                </p>
              </div>
              <button type="submit" disabled={actionLoading || !inviteCode}
                className="w-full py-2.5 rounded-lg text-sm font-medium"
                style={{
                  background: actionLoading || !inviteCode ? "var(--color-bg-hover)" : "var(--color-primary)",
                  color: actionLoading || !inviteCode ? "var(--color-text-muted)" : "var(--color-text-inverse)",
                  cursor: actionLoading || !inviteCode ? "not-allowed" : "pointer",
                }}>
                {actionLoading ? "Joining..." : "Join Team"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
