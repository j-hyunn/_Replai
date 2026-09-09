---
name: supabase-schema-rls
description: "Design and build the Supabase data layer. Covers the Postgres schema and migrations, RLS policies, Auth integration, Storage buckets and policies, Realtime, and TypeScript type generation. Use this skill for any design, implementation, or revision request involving 'database schema', 'table design', 'migration', 'RLS', 'security policy', 'authentication', 'sign-in', 'file storage', 'Storage', 'realtime subscription', or 'Supabase'."
---

# Supabase Schema & RLS — Building the Data Layer

Build the Postgres schema, security policies, and storage for the AI mock interview service.

## Iron rule: a table without RLS does not exist

Supabase's anon key is exposed in the browser. Without RLS, a table is effectively published to the world. Interview answers and evaluation results are highly sensitive personal data.

**Put table creation, RLS enablement, and policy creation in the same migration file.** A plan to add policies later is always forgotten.

```sql
create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'created'
    check (status in ('created','configuring','ready','in_progress',
                      'paused','completed','evaluating','evaluated','failed')),
  modality text not null default 'voice' check (modality in ('voice','text')),
  created_at timestamptz not null default now()
);

alter table public.interview_sessions enable row level security;

create policy "own sessions: select" on public.interview_sessions
  for select using ((select auth.uid()) = user_id);
create policy "own sessions: insert" on public.interview_sessions
  for insert with check ((select auth.uid()) = user_id);
create policy "own sessions: update" on public.interview_sessions
  for update using ((select auth.uid()) = user_id)
             with check ((select auth.uid()) = user_id);
```

Key points:
- `status` is not free text — a **CHECK constraint** enforces the state machine at the database level. A value outside the state machine must fail immediately. Keep the state list character-for-character identical to `_workspace/01_state_machine.md`.
- Wrapping `auth.uid()` as `(select auth.uid())` avoids re-evaluating it per row, which improves large reads.
- `on delete cascade` ensures no data survives a user deletion (needed for deletion requests).
- Policies on child tables (turns, evaluations) check ownership through the parent session with an `exists` subquery. Without an index on the join column this gets slow.

## Key separation

| Key | Location | Purpose |
|-----|----------|---------|
| anon / publishable | client (`NEXT_PUBLIC_`) | RLS-scoped access in the user's context |
| service_role / secret | **server only** | bypasses RLS. Never use `NEXT_PUBLIC_` |

The service_role key ignores RLS entirely. If it reaches the browser, the whole database is exposed. Read it only in server code, and never place it in a module that a client component imports.

## Client separation

```
src/lib/supabase/client.ts   → browser (anon key)
src/lib/supabase/server.ts   → server components / routes (cookie-based session)
src/lib/supabase/admin.ts    → service_role. Server only. Minimize usage and comment why
```

Use `@supabase/ssr` cookie handling. If the server does not refresh cookies, sessions expire silently and produce the "I signed in but I'm signed out" bug.

## Schema design guidance

Core entities (follow the domain model document first; this is the minimum set):

| Table | Role | Watch out for |
|-------|------|--------------|
| `profiles` | user profile | extends `auth.users`. Auto-create on sign-up via trigger |
| `interview_sessions` | session | status CHECK constraint, modality |
| `interview_questions` | question set | ordering within a session (`order_index`) |
| `interview_turns` | utterance log | role (interviewer/candidate), **transcript (canonical)**, audio_path (nullable) |
| `evaluations` | evaluation result | per-axis scores as jsonb, total score promoted to its own column |

Principles:
- **Never store AI output as one blob of text.** Store it as `jsonb` matching the schema from `ai-interview-architect`, and promote frequently filtered or sorted values (total score, session ID) to columns with indexes.
- `transcript` on the conversation log is **NOT NULL**. Whether voice or text, the canonical record is text.
- `audio_path` is nullable — text mode has no audio.
- Index frequently queried foreign keys (`session_id`, `user_id`). RLS policies add conditions to every query, so a missing index is expensive.

## Storage

```
bucket: interview-audio (private)
path:   {user_id}/{session_id}/{turn_id}.webm
```

- **Do not make it a public bucket.** That would let anyone with the URL listen to interview recordings.
- Apply RLS-style policies to the bucket too — allow access only when the first path segment matches `auth.uid()`.
- If direct client uploads are needed, issue a signed upload URL from the server.

## Realtime

Evaluation is asynchronous, so the user waits. Pushing `interview_sessions.status` changes through a Realtime subscription instead of polling improves the experience substantially. Note in the document that this requires replica identity configuration and publication registration, and that subscriptions also respect RLS.

## Type generation

Generate TypeScript types from the schema and **regenerate them on every migration.** Types that lag behind the schema compile fine and produce `undefined` at runtime. Record the generation command and output path in `_workspace/04_data_layer.md` so others can reproduce it.

## Migration discipline

- **Never edit an already-applied migration file.** Add changes as new files. Editing existing ones makes environments diverge.
- Confirm destructive changes (dropping columns or tables, changing types) with the leader before running them.
- Do not leave a failed migration alone. Determine the current applied state and report it.

## Deliverables

`_workspace/04_data_layer.md`:
- ERD (a text diagram is fine)
- Per-table columns, types, constraints, indexes
- **RLS policy table**: table / operation / target / USING / WITH CHECK
- Storage buckets, paths, policies
- Type generation command and path
- Realtime subscription targets

Implementation output: `supabase/migrations/*.sql`, `src/lib/supabase/*.ts`

Announce every schema decision and change to the whole team. A silent schema change breaks everything downstream.

---

## Output language

Write this skill's deliverables in **Korean**. Code identifiers stay English — table and column names, status enum values, type and field names, route paths, hook names, file names. Never translate a status value or a field name; that breaks the CHECK constraints and the API contract.

This skill file is written in English because harness instruction files are English. Do not mirror that into your output — the deliverables are Korean.

---

## Where this skill sits

This skill covers one layer of the mock interview harness team. If a request spans multiple layers (spec, DB, API, UI, voice, QA), do not handle it with this skill alone — use `mock-interview-orchestrator` first and run it as a team. If the work is confined to a single layer, this skill alone is fine.
