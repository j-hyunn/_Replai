---
name: interview-domain-spec
description: "Write or revise the product spec, domain model, session state machine, and evaluation rubric for the AI mock interview service. Use this skill whenever requirements need organizing, scope needs deciding, a user journey needs designing, a screen/route list needs defining, session state flow needs modeling, or scoring criteria need to be set. Applies to requests like 'organize the spec', 'define features', 'state flow', 'evaluation criteria', 'rubric', 'screen list', 'domain model', and equally to revising, extending, or rewriting an existing spec."
---

# Interview Domain Spec — Writing the Mock Interview Spec

Write the spec for the AI mock interview service. This output is the single source of truth every teammate reads, so any ambiguity left in it will be guessed at differently by everyone downstream.

## Four deliverables

| File | Contents |
|------|----------|
| `_workspace/01_product_spec.md` | User journey, feature list (MVP/later), screen and route list |
| `_workspace/01_state_machine.md` | Session state list + transition table |
| `_workspace/01_domain_model.md` | Entities, relationships, fields, naming convention |
| `_workspace/01_rubric.md` | Evaluation axes, scale, how evidence is recorded |

## 1. User journey

Describe at minimum the following flow, with the input, output, and drop-off point of each stage:

```
sign up / sign in → interview setup (role, difficulty, modality, JD/résumé) → session prep (generate question set)
→ interview (question ↔ answer loop) → end → evaluation (async) → view report → retry / review
```

For every stage, answer this question: "if the user drops off here, what state is the session left in?" That question is what exposes gaps in the state machine.

## 2. State machine — the core of this spec

Enumerate session states completely, in a table with fixed columns:

| Current state | Next state | Trigger | Side effects |
|--------------|-----------|---------|--------------|
| `created` | `configuring` | user starts setup | — |
| `configuring` | `ready` | question set generated | insert question records |
| `ready` | `in_progress` | user starts the interview | record start time |
| `in_progress` | `completed` | last answer submitted or user ends session | record end time |
| `completed` | `evaluating` | evaluation job starts | enqueue async job |
| `evaluating` | `evaluated` | evaluation result stored | generate report |
| (any) | `failed` | unrecoverable error | record failure reason |

While writing, always check:
- **Is every transition from an intermediate state to a final state present?** Omitting `evaluating → evaluated` from the document means it will be omitted from the implementation too, and the user will wait for a report forever. This is the most common fatal bug in this domain.
- Are pause, resume, and mid-session abandonment represented?
- Is the screen the user sees in each state defined?
- Does the failure state have a recovery path?

## 3. Modality branching

This service is voice-first with text as an equal peer. Specify:
- Modality selection at session creation (`voice` | `text`)
- **Mid-session switching allowed** — the session and conversation log continue even after falling back to text when the microphone fails
- The principle that the conversation log's source of truth is text, with audio attached by reference

## 4. Nail down naming rules

State this explicitly in the spec. Without it, boundary mismatches are guaranteed:

```
DB (Postgres)  : snake_case      e.g. session_id, created_at, total_score
API responses  : camelCase       e.g. sessionId, createdAt, totalScore
Frontend types : camelCase (identical to API responses)
Conversion     : once, in the API route. Never in the frontend or the DB layer.
```

## 5. Evaluation rubric

Define, for each axis:

| Axis | Description | Scale | Evidence requirement |
|------|------------|-------|---------------------|
| e.g. job knowledge | accuracy and depth in the question's domain | 1–5 | verbatim quote from the answer, required |
| e.g. structure | structured delivery such as STAR | 1–5 | verbatim quote from the answer, required |
| e.g. specificity | concreteness of numbers and examples | 1–5 | verbatim quote from the answer, required |
| e.g. communication | clarity and concision | 1–5 | verbatim quote from the answer, required |

Principle: **every score comes with an evidence citation.** A score alone cannot be verified, and the user will not accept it. In voice mode you may add delivery axes such as speaking pace and silence length, but record the reliability limits since they depend on transcription quality.

## 6. MVP boundary

Tag every feature `[MVP]` or `[later]`. Without tags, every teammate tries to build everything and nobody finishes.

## Points requiring a decision

Do not fill them in arbitrarily. Leave them in this form and report them to the leader:

```
[decision needed] Number of questions per session — fixed (5 questions) vs time-based (15 minutes)
  Option A: ... / Option B: ...  Impact: question generation cost, session UI
```

## Revise, do not rewrite

If `_workspace/01_*.md` already exists, do not rewrite the whole thing. Change only the relevant section and append one line to the change log at the top. If you changed the state machine, notify `supabase-engineer` (CHECK constraints) and `qa-inspector`.

---

## Output language

Write this skill's deliverables in **Korean**. Code identifiers stay English — table and column names, status enum values, type and field names, route paths, hook names, file names. Never translate a status value or a field name; that breaks the CHECK constraints and the API contract.

This skill file is written in English because harness instruction files are English. Do not mirror that into your output — the deliverables are Korean.

State values are the trap here. Write the spec in Korean, but keep the state identifiers themselves English (`created`, `in_progress`, `evaluating`, `evaluated`) — `supabase-engineer` copies them verbatim into CHECK constraints and the code compares against them as strings. Describe each state in Korean beside its English identifier.

---

## Where this skill sits

This skill covers one layer of the mock interview harness team. If a request spans multiple layers (spec, DB, API, UI, voice, QA), do not handle it with this skill alone — use `mock-interview-orchestrator` first and run it as a team. If the work is confined to a single layer, this skill alone is fine.
