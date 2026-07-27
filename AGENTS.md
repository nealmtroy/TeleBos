# AGENTS.md

This is a compatibility entry point for coding agents that discover `AGENTS.md` instead of `CLAUDE.md`.

## Canonical instructions

1. Read **`CLAUDE.md`** first for repository architecture, commands, engineering invariants, common workflows, and validation.
2. Read **`PRD.md`** before changing user-visible product behavior, roles, workflows, or acceptance criteria.
3. Read **`SECURITY.md`** before changing authentication, authorization, encryption, secrets, uploads, WebSockets, or deployment behavior.
4. Read **`PRODUCT.md`**, **`DESIGN.md`**, and `.impeccable/design.json` before UI work.
5. Use `/api/docs` on a running backend as the source of truth for request/response API contracts.
6. For a targeted security assessment, use `docs/security/strix-assessment-instructions.md`.

Do not duplicate these documents' detailed rules here. Follow the project knowledge-graph instructions in `CLAUDE.md` before broad codebase exploration.
