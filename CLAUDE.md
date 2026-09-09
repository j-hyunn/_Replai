# Replai

## Harness: AI Mock Interview Service

**Goal:** Build and extend an AI mock interview service (Next.js + React + shadcn/ui + Supabase + Vercel) through an agent team that handles design, implementation, and verification.

**Trigger:** Use the `mock-interview-orchestrator` skill for any request involving the design, feature addition, implementation, modification, or QA of the mock interview service. Simple questions or single-file lookups may be answered directly.

**Fixed constraints (apply to every agent):**
- UI is **shadcn/ui only**. Do not introduce any other UI library.
- Data lives in Supabase. Every table holding user data must have RLS enabled, without exception.
- Voice is the primary modality; text chat is a first-class equal. The transcript text is the source of truth for the conversation log.
- Naming: snake_case in the DB, camelCase in API responses and frontend types. Convert exactly once, in the API route.
- Never prefix AI provider keys or the Supabase service_role key with `NEXT_PUBLIC_`.
- **Language policy.** Harness instruction files (`.claude/agents/`, `.claude/skills/`, this file, the change log) are written in English. Everything else is Korean: all work deliverables under `_workspace/` (product spec, state machine, API contract, QA report), the runtime AI prompts, all user-facing UI copy, and evaluation feedback. The service is Korean-only — the AI interviewer conducts the interview in Korean. Code identifiers stay English regardless: table and column names, status enum values, type and field names, route paths, hook names, and file names. Never translate a status value or a field name into Korean; doing so breaks the CHECK constraints and the API contract.

**Git & GitHub:** branch, commit, PR, CI, and merge conventions live in the `git-github-workflow` skill. Every teammate uses it; work reaches `main` through a PR, never by committing to `main` directly. CI (`.github/workflows/ci.yml`) validates harness integrity on every PR and runs typecheck/lint/build once the app is scaffolded.

**Change log:** harness changes are recorded in [.claude/HARNESS_CHANGELOG.md](.claude/HARNESS_CHANGELOG.md), not in this file. Read it before modifying the harness — it shows how the harness evolved and prevents reintroducing something that was already changed for a reason. Append an entry there whenever you add, remove, or modify an agent, a skill, the orchestrator, or a fixed constraint.
