# Skill Registry — nexo-erp

Scanned: user-level `~/.claude/skills/`, `~/.config/opencode/skills/`, `~/.gemini/skills/`, `~/.cursor/skills/`. No project-level skill dirs found (no `.claude/skills`, `.agent/skills`, `skills/`). No `AGENTS.md`/`.cursorrules`/`GEMINI.md` in project root; project `CLAUDE.md` present (model routing + engram habits, no skill triggers).

| Skill | Path | Trigger |
|---|---|---|
| go-testing | `~/.claude/skills/go-testing/SKILL.md` | Writing Go tests, teatest, Bubbletea TUI testing |
| architect | `~/.claude/skills/architect/SKILL.md` | `/architect`, plan+scaffold a project conversationally |
| scaffold-backend | `~/.claude/skills/scaffold-backend/SKILL.md` | `/scaffold-backend`, new backend project interview |
| scaffold-frontend | `~/.claude/skills/scaffold-frontend/SKILL.md` | `/scaffold-frontend <url>`, generate frontend from REST API |
| skill-creator | `~/.claude/skills/skill-creator/SKILL.md` | Creating a new skill / agent instructions |
| react-doctor | `~/.gemini/skills/react-doctor` (also `~/.cursor/skills`) | Not present under `~/.claude/skills` — not directly invokable via this harness's Skill tool; noted for reference only |

`sdd-*` skills, `_shared`, and `skill-registry` excluded per scan rules (handled by the SDD orchestrator flow directly).
