---
name: integration-coherence-qa
description: "Verify integration coherence by cross-comparing boundaries between modules. Checks API response shapes against frontend hook types, links against real routes, the state transition map against actual code, DB fields against API responses, plus RLS, key exposure, and prompt injection. Use this skill for requests about 'QA', 'verification', 'inspection', 'integration testing', 'find bugs', 'coherence check', or 'code review', and right after each module is finished."
---

# Integration Coherence QA — Verifying the Boundaries

Find defects of the form "each part is correct, but it breaks when connected." The job is boundary cross-comparison, not per-module verification.

## Why static review misses these

- **A generic is a claim, not a check.** `fetchJson<Session[]>()` compiles even when the real response is `{ sessions: [...] }`.
- **A passing build is not working software.** With casts and `any` present, the compiler stays silent.
- **Existence is not connection.** "Does the API exist?" and "does its response match what the caller expects?" are completely different questions.

## Core method: read both sides at once

Reading one side never catches it. Always open the producer and the consumer **together**.

| Subject | Left (producer) | Right (consumer) |
|---------|----------------|------------------|
| API response shape | the argument to `NextResponse.json()` in `route.ts` | the fetch type in `src/hooks/` |
| Routing | page file paths under `src/app/` | `href` / `router.push` / `redirect` values |
| State transitions | `_workspace/01_state_machine.md` | every `.update({ status })` call |
| DB → API → UI | migration column names | API response fields → frontend types |
| AI contracts | `_workspace/02_ai_contracts.md` | parsing and storage code |
| Voice states | `_workspace/03_voice_pipeline.md` | UI state branching |

## Verification procedures

### 1. API ↔ hook cross-check
```
1) Extract the shape of the object passed to NextResponse.json() in every route.ts
2) Extract the fetch type parameter of the corresponding hook
3) Compare them 1:1, including whether a wrapper is unwrapped
4) Cross-check against the contract table (_workspace/05_api_contract.md) — the doc may be stale
5) Confirm streaming endpoints are consumed as streams (no json() call)
6) Confirm no code reads final-result fields off an immediate 202 response
7) Identify endpoints with no hook (dead APIs) and hooks with no endpoint (404 calls)
```

### 2. Routing verification
```
1) Derive URL patterns from page file paths under src/app/
   - (group) is removed from the URL
   - [param] is a dynamic segment
2) Collect every href / router.push( / redirect( value in the code
3) Check each link against a real route
```

### 3. State machine verification
```
1) Extract the allowed transitions from the state machine document
2) Collect every status update in the code
3) Identify unauthorized transitions (in code but not in the document)
4) Identify dead transitions (in the document but not in code)
   → especially evaluating → evaluated. If it is missing, the user waits forever
5) Confirm the DB CHECK constraint values exactly match the strings the code writes
```

### 4. Security verification
```
- Confirm RLS is enabled with policies on every table holding user data
- Confirm no NEXT_PUBLIC_ variable holds an AI key or the service_role key
- Confirm no client component calls an AI provider directly
- Confirm no import path pulls the service_role client into the client bundle
- Confirm the system prompt contains defenses preventing user speech from being read as instructions
- Confirm Storage buckets are not configured as public
```

### 5. UI constraint verification
```
- Confirm package.json has no UI library dependency other than shadcn
- Check for hardcoded color values (bg-[#...], style={{color:'#...'}})
- Confirm the voice UI expresses every state in the pipeline document
```

### 6. Language verification
```
- Confirm _workspace/ deliverables are written in Korean
- Confirm runtime prompts under 02_prompts/ are Korean (an English prompt
  makes the interviewer conduct the interview in English)
- Confirm user-facing UI copy and error messages are Korean
- Confirm NO code identifier was translated: status enum values, column names,
  field names, route paths, hook names must all still be English
  → a translated status value passes the type checker and fails against the
    DB CHECK constraint at runtime
- Confirm the status strings in code match the DB CHECK values character for character
```

## Report format

`_workspace/07_qa_report.md`:

```markdown
## Findings

| # | Severity | Boundary | Location | Current | Expected | Owner |
|---|----------|----------|----------|---------|----------|-------|
| 1 | critical | API→hook | src/hooks/useSessions.ts:12 | expects `Session[]` | API returns `{ sessions: Session[] }` | shadcn-ui-engineer + vercel-platform-engineer |

## Passing items
...

## Unverified items
- [ ] Realtime subscription behavior — no local runtime environment available
```

**Unverified items must appear in their own section.** Reporting something as passing when you did not check it is QA's worst failure mode. If you are unsure, do not mark it passing — use `[needs confirmation]`. If a verification script failed, that is "unverified," not "passing."

## Severity criteria

| Severity | Definition |
|----------|-----------|
| critical | runtime crash, data exposure, user waits forever |
| high | major feature unusable, 404 link |
| medium | misbehaves under specific conditions, missing fallback |
| low | dead code, naming inconsistency, styling |

## Notification rules

- Send "file:line + current + expected + how to fix" to the owning teammate via SendMessage the moment you find something. Without those four, they cannot act on it.
- **Send boundary issues to both teammates.** Fixing one side alone breaks the other direction.
- Fix obvious typos and path errors with clear ownership yourself and notify the owner. Do not fix anything that requires a design judgment.

## When to run

Run **immediately after each module is finished**, not once at the end. Early boundary mismatches propagate downstream and make the cost of fixing them grow exponentially. On re-verification, read the previous report first, confirm whether findings were fixed, and mark regressions separately.

---

## Output language

Write this skill's deliverables in **Korean**. Code identifiers stay English — table and column names, status enum values, type and field names, route paths, hook names, file names. Never translate a status value or a field name; that breaks the CHECK constraints and the API contract.

This skill file is written in English because harness instruction files are English. Do not mirror that into your output — the deliverables are Korean.

Add a language check to the verification pass: confirm that `_workspace/` deliverables and user-facing strings are Korean, that runtime prompts are Korean, and — most importantly — that no status value, field name, or other code identifier was translated into Korean. A translated enum value passes the type checker and fails against the DB CHECK constraint at runtime.

---

## Where this skill sits

This skill covers one layer of the mock interview harness team. If a request spans multiple layers (spec, DB, API, UI, voice, QA), do not handle it with this skill alone — use `mock-interview-orchestrator` first and run it as a team. If the work is confined to a single layer, this skill alone is fine.
