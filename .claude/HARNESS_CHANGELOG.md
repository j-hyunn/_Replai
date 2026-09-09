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
