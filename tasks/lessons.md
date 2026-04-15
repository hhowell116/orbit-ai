# AI Dashboard — Lessons Learned

## Session: 2026-04-10 (Project Kickoff)

### Auth Model
- Anthropic banned third-party OAuth to Claude subscriptions (Feb 2026)
- OpenCode requires explicit Anthropic API keys (pay-per-token)
- Plan originally assumed OAuth would work — always validate auth assumptions early

### Server Sizing
- Original plan said 8GB RAM — research showed this is too small
- Each OpenCode instance can consume 1-2GB with active sessions
- Recommendation: 16GB minimum for 2-4 devs, 2-3 projects
