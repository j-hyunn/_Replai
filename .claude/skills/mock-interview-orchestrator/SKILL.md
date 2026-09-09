---
name: mock-interview-orchestrator
description: "Orchestrator that coordinates the agent team for the AI mock interview service. Use it whenever service design, feature additions, screen implementation, API construction, database schema, the voice pipeline, AI interviewer logic, or QA should be run as a team. Applies to initial requests like 'build the mock interview service', 'add an interview feature', 'implement this feature', and equally to follow-up work — rerun, run again, update, revise, extend, improve, 'redo just the evaluation part', 'fix the voice side', 'based on the previous result', 'run QA again'. Simple questions or reading a single file may be answered directly."
---

# Mock Interview Orchestrator

The integrated skill for building and extending the AI mock interview service (Next.js + React + shadcn/ui + Supabase + Vercel) with an agent team.

## Execution mode: agent team

The team is reformed per phase. Only one team can be active per session, so delete the previous team with `TeamDelete` before creating the next. Deliverables persist in `_workspace/`, so the new team picks them up with Read.

## Team composition

| Member | Type | Role | Skill | Main output |
|--------|------|------|-------|-------------|
| product-architect | general-purpose | spec, state machine, rubric | interview-domain-spec | `01_*.md` |
| ai-interview-architect | general-purpose | runtime AI agent design | ai-agent-architecture | `02_*.md`, `02_prompts/` |
| voice-pipeline-engineer | general-purpose | voice/text pipeline | voice-text-dual-modality | `03_voice_pipeline.md` |
| supabase-engineer | general-purpose | schema, RLS, Auth, Storage | supabase-schema-rls | `04_data_layer.md`, migrations |
| vercel-platform-engineer | general-purpose | API, streaming, deployment | nextjs-vercel-ai-api | `05_api_contract.md`, API code |
| shadcn-ui-engineer | general-purpose | screens, components, hooks | shadcn-only-ui | `06_ui_plan.md`, UI code |
| qa-inspector | general-purpose | integration coherence QA | integration-coherence-qa | `07_qa_report.md` |

**Specify `model: "opus"` on every Agent and TeamCreate call.**

`git-github-workflow` is a **shared skill every member uses** — it is not owned by one teammate. Name it in every member prompt, because whoever produces a change that should land in the repository follows those conventions.

QA uses `general-purpose` rather than `Explore`, because it needs Grep-based cross-extraction and the ability to run verification scripts.

## Workflow

### Phase 0: Context check

1. Check whether `_workspace/` exists
2. Determine the execution mode:

| Situation | Mode | Action |
|-----------|------|--------|
| no `_workspace/` | **initial run** | proceed from Phase 1 |
| exists + partial revision request | **partial rerun** | re-invoke only the relevant members; run only the needed parts of Phase 2/3 |
| exists + new project input | **fresh run** | move `_workspace/` to `_workspace_{YYYYMMDD_HHMMSS}/`, then Phase 1 |
| exists + QA only | **QA only** | run Phase 4 alone |

3. On a partial rerun, always include the **previous deliverable paths** in the agent prompt so they read the existing result and modify only that part.
4. If the change touches a boundary (schema, API shape, AI schema, state machine), re-invoke the downstream members as well. Fixing only upstream leaves the contract broken.

**Propagation table:**

| Changed | Also re-invoke |
|---------|---------------|
| state machine | supabase-engineer (CHECK constraints), vercel-platform-engineer, shadcn-ui-engineer, qa-inspector |
| AI contract schema | supabase-engineer, vercel-platform-engineer, qa-inspector |
| DB schema | vercel-platform-engineer, shadcn-ui-engineer, qa-inspector |
| API response shape | shadcn-ui-engineer, qa-inspector |
| voice state list | shadcn-ui-engineer, qa-inspector |

### Phase 1: Preparation

1. Analyze the user's input — target features, scope, constraints, how far this run should go
2. Create `_workspace/` (on a fresh run, right after moving the old directory)
3. Save input material to `_workspace/00_input/`
4. Record the fixed constraints in `_workspace/00_input/constraints.md` so every member reads them:

```markdown
- Framework: Next.js (App Router) + React
- UI: shadcn/ui only. Introducing another UI library is prohibited
- Data: Supabase (Postgres + Auth + Storage + Realtime). RLS required on every user table
- Deployment: Vercel
- Modality: voice-first with text chat as an equal peer. The conversation log's source of truth is text
- Naming: snake_case in the DB, camelCase in API and frontend; convert once, in the API route
- Secrets: never prefix AI keys or the service_role key with NEXT_PUBLIC_
- Language: write every deliverable in this workspace in Korean. Runtime AI prompts, UI copy,
  and evaluation feedback are Korean — the interview is conducted in Korean.
  Code identifiers stay English: table/column names, status enum values, type and field names,
  route paths, hook names, file names. Never translate a status value or field name.
  (Only the harness instruction files under .claude/ are in English.)
```

> The language line is the constraint most often forgotten, because these skill files are themselves written in English and agents tend to mirror the language of their instructions. Restate it in every member prompt, not only in constraints.md.

### Phase 2: Design team (design-team)

**Execution mode:** agent team (3 members)

```
TeamCreate(
  team_name: "design-team",
  members: [
    { name: "product-architect",      agent_type: "product-architect",      model: "opus", prompt: "..." },
    { name: "ai-interview-architect",  agent_type: "ai-interview-architect", model: "opus", prompt: "..." },
    { name: "supabase-engineer",       agent_type: "supabase-engineer",      model: "opus", prompt: "..." }
  ]
)
```

Every prompt must include: read `_workspace/00_input/constraints.md` first, the name of the member's skill, the output file paths, and who they collaborate with.

```
TaskCreate(tasks: [
  { title: "Write product spec and screen list",   assignee: "product-architect" },
  { title: "Define session state machine",          assignee: "product-architect" },
  { title: "Define evaluation rubric",              assignee: "product-architect" },
  { title: "Design runtime AI agents",              assignee: "ai-interview-architect", depends_on: ["Define session state machine"] },
  { title: "Write full AI prompts",                 assignee: "ai-interview-architect", depends_on: ["Define evaluation rubric"] },
  { title: "Define AI I/O JSON schemas",            assignee: "ai-interview-architect" },
  { title: "Design DB schema and RLS",              assignee: "supabase-engineer", depends_on: ["Define session state machine"] },
  { title: "Design Storage and Realtime",           assignee: "supabase-engineer" }
])
```

**Communication rules:**
- When product-architect finalizes the state machine and rubric, SendMessage to the other two
- When ai-interview-architect finalizes the JSON schemas, SendMessage to supabase-engineer (input for storage structure)
- supabase-engineer maps the state list 1:1 onto CHECK constraints and immediately queries product-architect on any mismatch

**Gate:** at the end of Phase 2 the leader personally verifies that the state list in `01_state_machine.md` and the CHECK constraint values in `04_data_layer.md` match character for character. A divergence here breaks everything that follows.

Delete the team with `TeamDelete` when Phase 2 completes.

### Phase 3: Build team (build-team)

**Execution mode:** agent team (5 members)

```
TeamCreate(
  team_name: "build-team",
  members: [
    { name: "supabase-engineer",        agent_type: "supabase-engineer",        model: "opus", prompt: "..." },
    { name: "voice-pipeline-engineer",  agent_type: "voice-pipeline-engineer",  model: "opus", prompt: "..." },
    { name: "vercel-platform-engineer", agent_type: "vercel-platform-engineer", model: "opus", prompt: "..." },
    { name: "shadcn-ui-engineer",       agent_type: "shadcn-ui-engineer",       model: "opus", prompt: "..." },
    { name: "qa-inspector",             agent_type: "qa-inspector",             model: "opus", prompt: "..." }
  ]
)
```

Each prompt must name the Phase 2 deliverable paths (`_workspace/01_*` through `04_*`) and require reading them before starting.

```
TaskCreate(tasks: [
  { title: "Scaffold project (Next.js + shadcn + Supabase clients)", assignee: "vercel-platform-engineer" },
  { title: "Write and apply migrations, generate types",  assignee: "supabase-engineer" },
  { title: "Implement auth and middleware",               assignee: "vercel-platform-engineer", depends_on: ["Write and apply migrations, generate types"] },
  { title: "Session CRUD API",                            assignee: "vercel-platform-engineer", depends_on: ["Write and apply migrations, generate types"] },
  { title: "Interviewer streaming API",                   assignee: "vercel-platform-engineer" },
  { title: "Async evaluation API + result retrieval",     assignee: "vercel-platform-engineer" },
  { title: "Audio capture, STT, TTS pipeline",            assignee: "voice-pipeline-engineer" },
  { title: "Modality switching and fallback",             assignee: "voice-pipeline-engineer" },
  { title: "Interview session screen (voice + text)",     assignee: "shadcn-ui-engineer",  depends_on: ["Interviewer streaming API"] },
  { title: "Setup and dashboard screens",                 assignee: "shadcn-ui-engineer",  depends_on: ["Session CRUD API"] },
  { title: "Evaluation report screen",                    assignee: "shadcn-ui-engineer",  depends_on: ["Async evaluation API + result retrieval"] },
  { title: "Incremental QA: API↔hook boundary",           assignee: "qa-inspector" },
  { title: "Incremental QA: routing and state machine",   assignee: "qa-inspector" },
  { title: "Incremental QA: security (RLS, keys, injection)", assignee: "qa-inspector" }
])
```

**Communication rules (protecting the boundaries is the point):**
- `vercel-platform-engineer` sends the full response shape to `shadcn-ui-engineer` and a verification request to `qa-inspector` **the moment** each endpoint is finished. No waiting for everything to be done.
- `shadcn-ui-engineer` never invents missing data in the frontend — it registers an API task on the shared list instead.
- `voice-pipeline-engineer` passes the UI state list to `shadcn-ui-engineer` and both keep the state names identical.
- `qa-inspector` reports boundary issues to **both** teammates involved.
- `supabase-engineer` broadcasts every schema change to everyone.

**Incremental QA:** QA cross-checks each module as it is completed. The leader watches that QA tasks are not all piling up at the end and, if they are, directs QA to verify ahead.

### Phase 4: Integration verification

1. Confirm all implementation tasks are complete (TaskGet)
2. Direct `qa-inspector` to run full integration verification — re-check even items that passed incremental QA, now in their final state
3. Run the build and type check. **Do not paper over errors with casts**
4. Send critical and high findings from the QA report to their owners for fixes, then re-verify (**at most 2 rounds**, to avoid an infinite loop)
5. After 2 rounds, list anything still outstanding as unresolved in `_workspace/07_qa_report.md` and report it to the user

### Phase 4.5: Land the work in the repository

Run this whenever the phase produced code, not just documents. Skip it for a
documentation-only run.

1. Confirm QA is green, or that the remaining findings are explicitly accepted
2. Follow `git-github-workflow`: commit at working boundaries, push the branch,
   open a PR using `.github/pull_request_template.md`
3. **Fill in the PR's boundary impact section from the QA report**, not from memory.
   The propagation table in Phase 0 and that PR section describe the same risk:
   a change that crosses a boundary and leaves the other side stale
4. Wait for CI. A red `app-check` is usually a real contract mismatch — fix the
   contract rather than casting past it
5. Check the Vercel preview for anything touching the session screen, voice, or auth.
   None of those failures are visible in a diff
6. Squash merge, delete the branch

### Phase 5: Cleanup and feedback

1. Ask teammates to finish, then `TeamDelete`
2. Preserve `_workspace/` (for post-hoc verification and audit trail — do not delete it)
3. Report a summary to the user: what was built / what remains / unresolved QA items / the list of `[decision needed]` items
4. **Ask for feedback** — "Is there anything you'd like improved in the result? Anything you'd change about the team composition or workflow?" Do not push, but always offer the opportunity
5. When feedback arrives, apply it by type and append an entry to `.claude/HARNESS_CHANGELOG.md` (not `CLAUDE.md`, which holds pointers only):

| Feedback type | What to change |
|--------------|----------------|
| output quality | the relevant skill |
| missing role | a new agent definition |
| ordering problem | the phase structure of this orchestrator |
| trigger gap | the skill's description |

## Data flow

```
00_input/constraints.md
        │
        ▼
[design-team]  product-architect ──01_spec/state_machine/domain/rubric──┐
                      │ SendMessage                                      │
                      ▼                                                  ▼
              ai-interview-architect ──02_ai_architecture/prompts/contracts──┐
                      │ SendMessage                                          │
                      ▼                                                      ▼
               supabase-engineer ──────04_data_layer.md──────────────────────┤
                                                                             │
        ┌────────────────────── TeamDelete → TeamCreate ──────────────────────┘
        ▼
[build-team]  supabase-engineer ─ migrations, types
              vercel-platform-engineer ─ 05_api_contract.md + API code
                      │ response shape sent immediately
                      ▼
              shadcn-ui-engineer ─ 06_ui_plan.md + UI code
              voice-pipeline-engineer ─ 03_voice_pipeline.md + voice code
                      │
                      ▼
              qa-inspector ─ 07_qa_report.md (incremental + final)
                      │ boundary issues go to both sides
                      ▼
                  [leader: integrated report]
```

## Deliverable path convention

```
_workspace/
├── 00_input/constraints.md
├── 01_product_spec.md / 01_state_machine.md / 01_domain_model.md / 01_rubric.md
├── 02_ai_architecture.md / 02_ai_contracts.md / 02_prompts/{interviewer,evaluator,coach,planner}.md
├── 03_voice_pipeline.md
├── 04_data_layer.md
├── 05_api_contract.md / 05_deploy.md
├── 06_ui_plan.md
└── 07_qa_report.md
```

## Error handling

| Situation | Strategy |
|-----------|----------|
| one member fails or stops | idle notification received → check status via SendMessage → restart once. If it fails again, reassign the work to an adjacent member and note it in the report |
| majority of members fail | stop, report the situation to the user, and ask whether to continue |
| timeout | proceed with the partial results collected; state the incomplete areas in the final report |
| boundary contract conflict | never change one side arbitrarily. The upstream contract owner decides, and the decision propagates to both sides |
| conflicting spec | do not delete either; present both and have the leader ask the user to decide |
| infinite QA fix loop | stop after at most 2 rounds and mark the rest unresolved |
| a member introduces a non-shadcn library | reject immediately. Re-send the constraints document and direct a rebuild with Radix + Tailwind |
| migration failure | do not leave a partially applied state. Determine the current schema state and report it |
| CI fails on the PR | read the failing step's log first. Never disable a check or cast past a type error to get a merge through |
| branches conflict at merge | merge in dependency order — migration, then API, then UI. If that order is impossible, make the change backward compatible for one cycle |

## Test scenarios

### Normal flow
1. User: "Build the AI mock interview service"
2. Phase 0: no `_workspace/` → initial run
3. Phase 1: create constraints.md
4. Phase 2: design-team of 3 with 8 tasks → produces `01_*` through `04_*`. The gate confirms the state list matches the CHECK constraints
5. Phase 3: build-team of 5 with 14 tasks → code plus contract documents, with incremental QA
6. Phase 4: integration verification, fix critical findings, re-verify
7. Phase 5: team cleanup, summary report plus feedback request
8. Expected result: the full set of `_workspace/` documents, working code, and a QA report

### Error flow: boundary mismatch
1. During Phase 3, QA finds that `useSessions` expects `Session[]` while the API returns `{ sessions: [...] }`
2. QA sends file:line + current + expected + how to fix to **both** teammates
3. The contract owner (vercel-platform-engineer) finalizes the contract table, and shadcn-ui-engineer updates the hook type to match
4. QA re-verifies → passes
5. The report registers that boundary as a standing check to prevent regressions

### Error flow: partial rerun
1. User: "Change the evaluation rubric and reflect it in the report screen too"
2. Phase 0: `_workspace/` exists + partial revision → partial rerun
3. Following the propagation table, re-invoke in order: product-architect (rubric) → ai-interview-architect (evaluation prompt and schema) → supabase-engineer (storage structure) → vercel-platform-engineer (response) → shadcn-ui-engineer (report screen) → qa-inspector
4. Pass each agent the previous deliverable paths so they modify only the relevant sections
5. QA re-verifies the changed boundaries
