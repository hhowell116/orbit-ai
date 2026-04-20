# Google Drive Rules

This is a template for a Team Rule in the Orbit AI dashboard. Copy the block
below (starting at `## Google Drive Projects`) into **Team Settings → Rules**
as a new rule titled "Google Drive Rules". It will be applied to every
project in the team via the auto-generated `CLAUDE.md`.

---

## Google Drive Projects

Projects backed by Google Drive are **bi-directionally synced every 5 min** by a systemd timer. You don't run the sync — it just happens.

### Stay in your project
- Work only inside the project directory you were opened in (`/home/rowecasa/orbit-ai/projects/<slug>/`).
- Never `ls`, `cd`, or read anything under `/home/rowecasa/gdrive/` — that's the raw FUSE mount and every access hits the Google Drive API. Expensive and slow. If you need to see Drive contents, the files are already synced into your project directory.
- Don't read files in sibling project directories (`../other-project/`) unless the user explicitly asks. Treat each project as an isolated scope.

### Don't touch the sync plumbing
- Never run `rclone sync`, `rclone copy`, or `rclone bisync` directly.
- Never create symlinks that point into `/home/rowecasa/gdrive/` — they deadlock the broker's filewatcher (known incident).
- If the user asks you to "force a sync", tell them the command (`systemctl --user start orbit-bisync-<slug>`) but don't run it yourself.

### Timing
- Saves take up to 5 min to reach Drive. Teammate edits take up to 5 min to reach you.
- Conflicts are resolved "newer wins, loser deleted" — not merged. For docs likely edited by humans in Drive, prefer small additive edits over whole-file rewrites.

### Excluded paths don't sync
`node_modules/`, `.git/`, `.cache/`, `dist/`, `build/`, `.next/`, `__pycache__/`, `CLAUDE.md` stay local-only. If you generate output that teammates need to see, write it OUTSIDE those paths.
