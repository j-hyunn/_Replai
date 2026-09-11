# Harness Change Log — AI Mock Interview Service

Every change to the harness (agent definitions, skills, orchestrator, constraints) is recorded here, newest last.
`CLAUDE.md` points to this file; do not duplicate these entries there.

## How to append an entry

Add one row to the table below whenever you add, remove, or modify an agent, a skill, the orchestrator, or a fixed constraint. Record:

- **Date** — absolute date (`YYYY-MM-DD`), never "today" or "last week"
- **Change** — what actually changed, specific enough to understand without reading the diff
- **Target** — the file or component affected
- **Reason** — why the change was made (the feedback, failure, or request that prompted it)

Structural changes only. Do not log routine product work built *with* the harness — only changes *to* the harness itself.

## Entries

| Date | Change | Target | Reason |
|------|--------|--------|--------|
| 2026-09-09 | Initial setup: 7 agents + 8 skills, agent-team execution mode with two-stage team reformation | Entire harness | - |
| 2026-09-09 | Added a "where this skill sits" boundary rule directing multi-layer requests to the orchestrator | 7 specialist skills | Trigger review found multi-layer requests could bypass the orchestrator and land on a single specialist skill |
| 2026-09-09 | Rewrote CLAUDE.md in English | CLAUDE.md | User request |
| 2026-09-09 | Translated all agent definitions and skills to English | 7 agents + 8 skills | User request: unify harness language |
| 2026-09-09 | Moved the change log out of CLAUDE.md into this file; CLAUDE.md now references it | CLAUDE.md, .claude/HARNESS_CHANGELOG.md, mock-interview-orchestrator | User request: keep CLAUDE.md to pointers only |
| 2026-09-09 | Added an explicit language policy: harness instruction files stay English, all deliverables / runtime prompts / UI copy are Korean, code identifiers stay English. Added a language section to all 7 specialist skills, the orchestrator constraints template, the QA checklist, and the QA agent definition | CLAUDE.md, 7 skills, mock-interview-orchestrator, qa-inspector | Nothing specified deliverable language, so English instruction files would have pushed output — including the interviewer prompt — into English |
| 2026-09-09 | Structured the GitHub workflow: added the git-github-workflow shared skill, PR and issue templates, and a CI workflow (harness frontmatter validation + typecheck/lint/build that self-skips until the app is scaffolded). Added orchestrator Phase 4.5 to land work through a PR | .claude/skills/git-github-workflow, .github/, mock-interview-orchestrator, CLAUDE.md | The harness produced code but said nothing about how it reaches the repository, leaving branch, PR, CI, and merge-order conventions undefined |
| 2026-09-09 | Switched PR and issue language to Korean: rewrote the PR and issue templates in Korean and split the language rule so PR/issue prose is Korean while commit messages, branch names, and scopes stay English | git-github-workflow, .github/ templates, mock-interview-orchestrator, CLAUDE.md | User request. Template prompts had to be Korean too, since an English form is filled in in English |
| 2026-09-09 | Split documents into two owner-scoped roots: `docs/` (human-owned, read-only for agents) and `_workspace/` (agent-owned, rotated per run). Moved the service brief to `docs/00_brief.md`, repointed product-architect's input, added a docs-first step and read-only rule to orchestrator Phase 1, added a Documents routing table to CLAUDE.md, and added `.gitignore` keeping both roots versioned | CLAUDE.md, product-architect, mock-interview-orchestrator, docs/, .gitignore | The brief was written into `_workspace/00_input/`, which orchestrator Phase 1 moves aside on a fresh run — human-authored input would have been destroyed. Nothing distinguished human-owned from agent-owned documents, and no routing told agents which document to read when |
| 2026-09-11 | Narrowed the committed-secrets CI check to exempt `.env.example` exactly; every other `.env*` path (`.env`, `.env.local`, `.env.production`, nested) stays blocked | .github/workflows/ci.yml | The check matched any `.env.*` path, contradicting `.gitignore`'s `!.env.example`. The first scaffolded PR (#5) failed on a file that is tracked on purpose and holds only non-sensitive defaults |
